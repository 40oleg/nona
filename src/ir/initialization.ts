import type {FunctionIR,Operation} from './model.js';

/**
 * Removes checkInitialized operations whose slot is definitely initialized
 * (a forward must-analysis over the control-flow graph). Lowering checks
 * every read of a let/const binding for the temporal dead zone; in a loop
 * that is a compare and branch per read although the binding was
 * initialized before the loop.
 *
 * A slot is initialized after an operation that cannot produce the
 * uninitialized marker (constants, arithmetic, calls, object creation, …),
 * after a copy from an initialized slot, and after checkInitialized itself
 * (which throws otherwise). A global binding read is initialized after this
 * function initialized the binding; reads of cells and captures may observe
 * the marker and initialize nothing. An exception handler starts
 * with what holds at every point of the blocks it protects.
 */
const producesValue=new Set<Operation['kind']>(['constant','binary','unary','newFunction','realmFunction','newObject','newArguments','newRestArray',
 'invoke','invokeArray','constructForward','property','newInstance','constructorResult','forInKeys','forInHas','forOfValue','globalObject','currentFunction',
 'newCell','superGet','newTarget','iteratorStep','call']);

type State=Set<number>|null; // null: every slot (not yet reached)

function intersect(a:State,b:ReadonlySet<number>):Set<number> {
 if(a===null)return new Set(b);
 for(const slot of a)if(!b.has(slot))a.delete(slot);
 return a;
}

// Global bindings are tracked as -1-index: once initialized, a binding never
// returns to its dead zone, so a later read in this function is initialized.
const global=(index:number)=>-1-index;
function step(operation:Operation,state:Set<number>):void {
 if(operation.kind==='checkInitialized'){state.add(operation.slot);return;}
 if(operation.kind==='storeGlobal'&&!operation.prelude){if(state.has(operation.source))state.add(global(operation.index));else state.delete(global(operation.index));return;}
 if(operation.kind==='loadGlobal'&&!operation.prelude){if(state.has(global(operation.index)))state.add(operation.dest);else state.delete(operation.dest);return;}
 if(operation.kind==='copy'){if(state.has(operation.source))state.add(operation.dest);else state.delete(operation.dest);return;}
 if(operation.kind==='getIterator'){state.add(operation.iterator);state.add(operation.next);return;}
 if(operation.kind==='iteratorStep')state.add(operation.done);
 if(operation.kind==='yieldDelegated')state.delete(operation.mode);
 if('dest' in operation){if(producesValue.has(operation.kind))state.add(operation.dest);else state.delete(operation.dest);}
}

export function removeRedundantInitializationChecks(fn:FunctionIR):FunctionIR {
 if(!fn.blocks.some(block=>block.operations.some(op=>op.kind==='checkInitialized')))return fn;
 const index=new Map(fn.blocks.map((block,i)=>[block.id,i]));
 const entry:State[]=fn.blocks.map((_,i)=>i===0?new Set<number>():null);
 const successors=(i:number):number[]=>{
  const t=fn.blocks[i]!.terminator;
  return t.kind==='jump'?[t.target]:t.kind==='branch'?[t.yes,t.no]:[];
 };
 // Iterate to a fixed point; states only shrink.
 let changed=true;
 while(changed){
  changed=false;
  fn.blocks.forEach((block,i)=>{
   const start=entry[i];
   if(start===null)return;
   const state=new Set(start);let everywhere=new Set(start);
   for(const operation of block.operations){step(operation,state);everywhere=intersect(everywhere,state);}
   const flow=(target:number,out:ReadonlySet<number>)=>{
    const j=index.get(target);if(j===undefined)return;
    const before=entry[j]===null?-1:entry[j]!.size,next=intersect(entry[j]===null?null:new Set(entry[j]!),out);
    if(entry[j]===null||next.size!==before){entry[j]=next;changed=true;}
   };
   for(const target of successors(i))flow(target,state);
   if(block.exceptionTarget!==undefined)flow(block.exceptionTarget,everywhere);
  });
 }
 return {...fn,blocks:fn.blocks.map((block,i)=>{
  const start=entry[i];
  if(start===null)return block;
  const state=new Set(start),operations:Operation[]=[];
  for(const operation of block.operations){
   if(operation.kind==='checkInitialized'&&state.has(operation.slot))continue;
   operations.push(operation);step(operation,state);
  }
  return operations.length===block.operations.length?block:{...block,operations};
 })};
}
