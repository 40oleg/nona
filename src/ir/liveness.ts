import type {FunctionIR,Operation,Terminator} from './model.js';

export interface BlockLiveness {
 readonly liveIn:ReadonlySet<number>;
 readonly liveOut:ReadonlySet<number>;
 readonly before:readonly ReadonlySet<number>[];
 readonly beforeTerminator:ReadonlySet<number>;
}

function unreachable(value:never):never {
 throw new Error(`Unknown IR variant: ${JSON.stringify(value)}`);
}

function transfer(operation:Operation,live:Set<number>):void {
 // Kill before adding uses: an operation may read its own destination.
 if('dest' in operation)live.delete(operation.dest);
 if(operation.kind==='getIterator')live.delete(operation.iterator),live.delete(operation.next);
  if(operation.kind==='iteratorStep')live.delete(operation.done);
 if(operation.kind==='yieldDelegated')live.delete(operation.mode);
 if(operation.kind==='superConstructor'&&operation.func!==undefined)live.add(operation.func);
 switch(operation.kind){
  case 'pushHandler':case 'popHandler':case 'generatorInitialSuspend':return;
  case 'newTarget':case 'superBase':case 'superConstructor':case 'superReceiver':case 'currentThis':case 'currentFunction':case 'loadCapture':case 'newObject':case 'newRestArray':case 'uninitialized':case 'immutableWrite':
  case 'constant':case 'loadGlobal':case 'globalObject':case 'readGlobalProperty':return;
  case 'superGet':live.add(operation.object);live.add(operation.key);live.add(operation.receiver);return;
  case 'superSet':live.add(operation.object);live.add(operation.key);live.add(operation.receiver);live.add(operation.source);return;
  case 'property':live.add(operation.object);live.add(operation.key);return;
  case 'newInstance':live.add(operation.callee);return;
  case 'forInKeys':live.add(operation.object);return;
  case 'forInHas':live.add(operation.object);live.add(operation.key);return;
  case 'getIterator':live.add(operation.object);return;
  case 'iteratorStep':live.add(operation.iterator);live.add(operation.next);return;
  case 'iteratorClose':live.add(operation.iterator);return;
  case 'requireIterable':live.add(operation.object);return;
  case 'forOfValue':live.add(operation.iterable);live.add(operation.index);return;
  case 'newArguments':for(const parameter of operation.parameters)if(parameter>=0)live.add(parameter);return;
  case 'constructorResult':live.add(operation.result);live.add(operation.instance);return;
  case 'derivedReturn':live.add(operation.source);return;
  case 'defineAccessor':case 'setProperty':case 'defineDataProperty':live.add(operation.object);live.add(operation.key);live.add(operation.source);return;
  case 'setPrototype':live.add(operation.object);live.add(operation.prototype);return;
  case 'setFunctionHomeObject':live.add(operation.func);live.add(operation.homeObject);return;
  case 'setCurrentThis':live.add(operation.source);return;
  case 'validateClassHeritage':live.add(operation.base);return;
  case 'validateClassPrototype':live.add(operation.prototype);return;
  case 'checkInitialized':case 'checkResolvable':live.add(operation.slot);return;
  case 'copy':case 'storeGlobal':case 'newCell':live.add(operation.source);return;
  case 'newFunction':if(operation.homeObject!==undefined)live.add(operation.homeObject);for(const capture of operation.captures??[])live.add(capture);if(operation.nameSlot!==undefined)live.add(operation.nameSlot);return;
  case 'readCell':live.add(operation.cell);return;
  case 'writeCell':live.add(operation.cell);live.add(operation.source);return;
  case 'unary':live.add(operation.argument);return;
  case 'binary':live.add(operation.left);live.add(operation.right);return;
  case 'call':for(const argument of operation.arguments)live.add(argument);return;
  case 'invoke':live.add(operation.callee);if(operation.receiver!==undefined)live.add(operation.receiver);if(operation.newTarget!==undefined)live.add(operation.newTarget);for(const argument of operation.arguments)live.add(argument);return;
  case 'invokeArray':live.add(operation.callee);live.add(operation.array);if(operation.receiver!==undefined)live.add(operation.receiver);if(operation.newTarget!==undefined)live.add(operation.newTarget);return;
  case 'yield':case 'await':live.add(operation.source);return;
  case 'yieldDelegated':live.add(operation.source);return;
  case 'requireObject':live.add(operation.source);return;
  default:unreachable(operation);
 }
}

function successors(terminator:Terminator):number[] {
 switch(terminator.kind){
  case 'jump':return [terminator.target];
  case 'branch':return [terminator.yes,terminator.no];
  case 'throw':case 'return':return [];
  default:return unreachable(terminator);
 }
}

function readTerminator(terminator:Terminator,live:Set<number>):void {
 switch(terminator.kind){
  case 'jump':return;
  case 'branch':live.add(terminator.condition);return;
  case 'throw':case 'return':if(terminator.value>=0)live.add(terminator.value);return;
  default:unreachable(terminator);
 }
}

function equal(a:ReadonlySet<number>,b:ReadonlySet<number>):boolean {
 return a.size===b.size&&[...a].every(slot=>b.has(slot));
}

/** Backward may-liveness over the complete CFG, including loop back edges.
 * Globals are roots independently; only local Value slots are represented here.
 * Returned sets are separate snapshots, never aliases of the mutable work set. */
export function analyzeLiveness(fn:FunctionIR):ReadonlyMap<number,BlockLiveness> {
 const entries=new Map<number,Set<number>>();
 const exits=new Map<number,Set<number>>();
 for(const block of fn.blocks){
  if(entries.has(block.id))throw new Error(`Duplicate IR block ${block.id}`);
  entries.set(block.id,new Set());exits.set(block.id,new Set());
 }
 let changed:boolean;
 do {
  changed=false;
  for(let index=fn.blocks.length-1;index>=0;index--){
   const block=fn.blocks[index]!,out=new Set<number>();
   for(const target of [...successors(block.terminator),...(block.exceptionTarget===undefined?[]:[block.exceptionTarget])]){
    const next=entries.get(target);
    if(!next)throw new Error(`Missing IR successor ${target}`);
    for(const slot of next)out.add(slot);
   }
   const live=new Set(out);readTerminator(block.terminator,live);
   for(let i=block.operations.length-1;i>=0;i--){transfer(block.operations[i]!,live);if(block.exceptionTarget!==undefined)for(const slot of entries.get(block.exceptionTarget)!)live.add(slot);}
   if(!equal(live,entries.get(block.id)!)){entries.set(block.id,live);changed=true;}
   exits.set(block.id,out);
  }
 }while(changed);

 const result=new Map<number,BlockLiveness>();
 for(const block of fn.blocks){
  const liveOut=exits.get(block.id)!,live=new Set(liveOut);
  readTerminator(block.terminator,live);
  const beforeTerminator=new Set(live),before:Set<number>[]=[];
  for(let i=block.operations.length-1;i>=0;i--){
   transfer(block.operations[i]!,live);if(block.exceptionTarget!==undefined)for(const slot of entries.get(block.exceptionTarget)!)live.add(slot);before[i]=new Set(live);
  }
  result.set(block.id,{liveIn:entries.get(block.id)!,liveOut,before,beforeTerminator});
 }
 return result;
}
