import type {BlockIR,Constant,FunctionIR,Terminator} from './model.js';
import {definitions} from './copies.js';
import {reachable} from './constants.js';

/**
 * Control-flow clean-up (#146 items 3 and 14). Lowering materializes every
 * condition as a value and gives every statement its own blocks; this pass
 * removes what that costs without changing which operations run:
 *
 * - A branch on `!x` branches on x with its targets swapped (ToBoolean has
 *   no effects, so `!x` is falsy exactly when x is truthy); `!!x` twice.
 * - An edge to an empty block that only jumps goes to that jump's target.
 * - An edge to an empty block that branches on a value whose truthiness is
 *   known on that edge goes to the target it would take: the source block
 *   branched on the same value (or a copy of it), or defined it by a
 *   constant. This removes the second test of a short-circuit condition
 *   (`if (a || b)` materializes a || b and branches on it again).
 * - Blocks no longer reachable are removed, and a block that jumps to a block
 *   with no other predecessor (not an exception handler, same handler) is
 *   merged with it.
 */
type Fact={slot:number;truthy:boolean};

/** The slot a block's last definition of slot copies from, through chains of copies (block-local). */
function aliases(block:BlockIR):Map<number,number> {
 const root=new Map<number,number>();
 for(const op of block.operations){
  for(const d of definitions(op)){root.delete(d);for(const [k,v] of root)if(v===d)root.delete(k);}
  if(op.kind==='copy'&&op.dest!==op.source)root.set(op.dest,root.get(op.source)??op.source);
 }
 return root;
}
/** Slots a block leaves holding a constant it defined (block-local). */
function constants(block:BlockIR):Map<number,Constant> {
 const known=new Map<number,Constant>();
 for(const op of block.operations){
  for(const d of definitions(op))known.delete(d);
  if(op.kind==='constant')known.set(op.dest,op.value);
  else if(op.kind==='copy'&&known.has(op.source))known.set(op.dest,known.get(op.source)!);
 }
 return known;
}

/** Branches on `!x` (defined in the same block, x unchanged since) branch on x with swapped targets. */
function invertNegations(block:BlockIR):BlockIR {
 let t=block.terminator;
 for(let round=0;round<4&&t.kind==='branch';round++){
  const condition=t.condition;let found=-1;
  for(let i=block.operations.length-1;i>=0;i--)if(definitions(block.operations[i]!).includes(condition)){found=i;break;}
  const op=found<0?undefined:block.operations[found];
  if(!op||op.kind!=='unary'||op.operator!=='!'||op.argument===op.dest)break;
  const argument=op.argument;
  if(block.operations.slice(found+1).some(later=>definitions(later).includes(argument)))break;
  t={kind:'branch',condition:argument,yes:t.no,no:t.yes};
 }
 return t===block.terminator?block:{...block,terminator:t};
}

export function simplifyControlFlow(fn:FunctionIR):FunctionIR {
 let blocks=fn.blocks.map(invertNegations);
 const byId=new Map(blocks.map(block=>[block.id,block]));
 // Where an edge from `from` to `target` really leads (bounded: cycles of empty blocks stop).
 const follow=(target:number,facts:readonly Fact[],from:BlockIR):number=>{
  // Computed only when an empty branch block is reached (most targets are not empty).
  let aliasOf:Map<number,number>|undefined,known:Map<number,Constant>|undefined;
  const truthiness=(slot:number):boolean|undefined=>{
   const alias=aliasOf??=aliases(from),values=known??=constants(from);
   if(values.has(slot))return !!values.get(slot);
   const root=alias.get(slot)??slot;
   return facts.find(f=>(alias.get(f.slot)??f.slot)===root)?.truthy;
  };
  for(let steps=0;steps<16;steps++){
   const next=byId.get(target);
   if(!next||next.operations.length||next===from)return target;
   const t=next.terminator;
   if(t.kind==='jump'){if(t.target===target)return target;target=t.target;continue;}
   if(t.kind!=='branch')return target;
   const truthy=truthiness(t.condition);
   if(truthy===undefined)return target;
   target=truthy?t.yes:t.no;
  }
  return target;
 };
 const retarget=(block:BlockIR):BlockIR=>{
  const t=block.terminator;let next:Terminator=t;
  if(t.kind==='jump'){const target=follow(t.target,[],block);if(target!==t.target)next={kind:'jump',target};}
  else if(t.kind==='branch'){
   const yes=follow(t.yes,[{slot:t.condition,truthy:true}],block),no=follow(t.no,[{slot:t.condition,truthy:false}],block);
   if(yes===no)next={kind:'jump',target:yes};else if(yes!==t.yes||no!==t.no)next={...t,yes,no};
  }
  return next===t?block:{...block,terminator:next};
 };
 blocks=reachable(blocks.map(retarget));
 return mergeBlocks(blocks===fn.blocks?fn:{...fn,blocks});
}

/** Merges a block into its only predecessor when that predecessor jumps to it. */
function mergeBlocks(fn:FunctionIR):FunctionIR {
 const predecessors=new Map<number,number>(),pinned=new Set<number>([fn.blocks[0]!.id]);
 const count=(id:number)=>predecessors.set(id,(predecessors.get(id)??0)+1);
 for(const block of fn.blocks){
  const t=block.terminator;
  if(t.kind==='jump')count(t.target);else if(t.kind==='branch'){count(t.yes);count(t.no);}
  if(block.exceptionTarget!==undefined)pinned.add(block.exceptionTarget);
  for(const op of block.operations)if(op.kind==='pushHandler')pinned.add(op.target);
 }
 const byId=new Map(fn.blocks.map(block=>[block.id,block]));
 // A block is absorbed by the block that jumps to it when nothing else can reach it.
 const absorbed=new Set<number>();
 for(const block of fn.blocks){
  const t=block.terminator;
  if(t.kind!=='jump'||t.target===block.id||pinned.has(t.target)||predecessors.get(t.target)!==1)continue;
  if(byId.get(t.target)!.exceptionTarget===block.exceptionTarget)absorbed.add(t.target);
 }
 if(!absorbed.size)return fn;
 const blocks:BlockIR[]=[];
 for(const original of fn.blocks){
  if(absorbed.has(original.id))continue;
  let block=original;
  for(let t=block.terminator;t.kind==='jump'&&absorbed.has(t.target)&&t.target!==original.id;t=block.terminator){
   const next=byId.get(t.target)!;
   block={...block,operations:[...block.operations,...next.operations],terminator:next.terminator};
  }
  blocks.push(block);
 }
 return {...fn,blocks};
}
