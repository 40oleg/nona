import type {FunctionIR,Operation,Terminator} from './model.js';
import {analyzeLiveness} from './liveness.js';

/**
 * Block-local copy propagation and dead-move elimination. Lowering reads a
 * binding by copying its slot into a temporary (`copy t, x`) and uses the
 * temporary; every such copy is a 16-byte move in the generated code. A read
 * of `t` later in the block becomes a read of `x` while neither is
 * redefined, and moves (copies, constants, dead-zone markers) whose
 * destination is dead are dropped.
 *
 * Only operands of the operations below are rewritten; any other use keeps
 * its temporary alive, so the result is always equivalent. Functions with a
 * mapped `arguments` object are left alone: it aliases parameter slots.
 */
type Map_=Map<number,number>;
const resolve=(alias:Map_,slot:number)=>alias.get(slot)??slot;

function rewriteUses(op:Operation,alias:Map_):Operation {
 if(!alias.size)return op;
 const r=(slot:number)=>resolve(alias,slot);
 switch(op.kind){
  case 'binary':return {...op,left:r(op.left),right:r(op.right)};
  case 'unary':return {...op,argument:r(op.argument)};
  case 'copy':return {...op,source:r(op.source)};
  case 'storeGlobal':return {...op,source:r(op.source)};
  case 'property':return {...op,object:r(op.object),key:r(op.key)};
  case 'setProperty':return {...op,object:r(op.object),key:r(op.key),source:r(op.source)};
  case 'invoke':return {...op,callee:r(op.callee),arguments:op.arguments.map(r),...(op.receiver!==undefined?{receiver:r(op.receiver)}:{}),...(op.newTarget!==undefined?{newTarget:r(op.newTarget)}:{})};
  default:return op;
 }
}
function rewriteTerminator(t:Terminator,alias:Map_):Terminator {
 if(t.kind==='branch')return {...t,condition:resolve(alias,t.condition)};
 if(t.kind==='return'&&t.value>=0)return {...t,value:resolve(alias,t.value)};
 if(t.kind==='throw')return {...t,value:resolve(alias,t.value)};
 return t;
}
function definitions(op:Operation):number[] {
 const out:number[]=[];
 if('dest' in op)out.push(op.dest);
 if(op.kind==='getIterator')out.push(op.iterator,op.next);
 if(op.kind==='iteratorStep')out.push(op.done);
 if(op.kind==='yieldDelegated')out.push(op.mode);
 return out;
}
const removable=new Set<Operation['kind']>(['copy','constant','uninitialized']);

export function propagateCopies(fn:FunctionIR):FunctionIR {
 if(fn.blocks.some(block=>block.operations.some(op=>op.kind==='newArguments')))return fn;
 let changed=false;
 const blocks=fn.blocks.map(block=>{
  const alias:Map_=new Map(),operations:Operation[]=[];
  for(const original of block.operations){
   const op=rewriteUses(original,alias);if(op!==original)changed=true;
   for(const d of definitions(op)){alias.delete(d);for(const [k,v] of alias)if(v===d)alias.delete(k);}
   if(op.kind==='copy'&&op.dest!==op.source)alias.set(op.dest,op.source);
   operations.push(op);
  }
  const terminator=rewriteTerminator(block.terminator,alias);if(terminator!==block.terminator)changed=true;
  return {...block,operations,terminator};
 });
 let result:FunctionIR={...fn,blocks};
 // Drop dead moves until none is left (removing one can kill another).
 for(let round=0;round<4;round++){
  const liveness=analyzeLiveness(result);let removed=false;
  result={...result,blocks:result.blocks.map(block=>{
   const before=liveness.get(block.id)!.before,operations:Operation[]=[];
   block.operations.forEach((op,i)=>{
    const after=i+1<block.operations.length?before[i+1]!:liveness.get(block.id)!.beforeTerminator;
    if(removable.has(op.kind)&&'dest' in op&&!after.has(op.dest)){removed=true;return;}
    operations.push(op);
   });
   return operations.length===block.operations.length?block:{...block,operations};
  })};
  if(!removed)break;changed=true;
 }
 return changed?result:fn;
}

/**
 * `t = op …; x = t` with t dead afterwards becomes `x = op …` when op is a
 * constant or an inline Number operation (marked numeric by numbers.ts):
 * their code reads every operand before it writes the destination, so x may
 * also be an operand (`s = s + i`). Runs after markNumericOperations.
 */
export function coalesceMoves(fn:FunctionIR):FunctionIR {
 const target=(op:Operation)=>op.kind==='constant'||(op.kind==='binary'||op.kind==='unary')&&op.numeric===true;
 if(!fn.blocks.some(block=>block.operations.some(target)))return fn;
 const liveness=analyzeLiveness(fn);let changed=false;
 const blocks=fn.blocks.map(block=>{
  const before=liveness.get(block.id)!.before,ops=block.operations,operations:Operation[]=[];
  for(let i=0;i<ops.length;i++){
   const op=ops[i]!,next=ops[i+1];
   if(next&&next.kind==='copy'&&target(op)&&'dest' in op&&next.source===op.dest&&next.dest!==op.dest){
    const after=i+2<ops.length?before[i+2]!:liveness.get(block.id)!.beforeTerminator;
    if(!after.has(op.dest)){operations.push({...op,dest:next.dest} as Operation);i++;changed=true;continue;}
   }
   operations.push(op);
  }
  return operations.length===ops.length?block:{...block,operations};
 });
 return changed?{...fn,blocks}:fn;
}
