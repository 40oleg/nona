import type {FunctionIR,Operation} from './model.js';
import {liveFloor,type BlockLiveness} from './liveness.js';

/** Frame locations of a function's IR slots: slots with disjoint live ranges share one. */
export interface SlotLocations {
 /** Location of every slot, indexed by slot number. */
 readonly location:readonly number[];
 /** Number of distinct locations. */
 readonly count:number;
}

/** Slots an operation writes. */
export function destinations(operation:Operation):number[] {
 const dests:number[]=[];
 if('dest' in operation)dests.push(operation.dest);
 if(operation.kind==='getIterator')dests.push(operation.iterator,operation.next);
 if(operation.kind==='iteratorStep')dests.push(operation.done);
 if(operation.kind==='yieldDelegated')dests.push(operation.mode);
 return dests;
}

/** Assign frame locations to the slots of a function.
 *
 * The lowering gives every temporary a fresh slot, so a function's frame
 * holds one 16-byte Value per expression it ever evaluates and the prologue
 * zeroes all of them on every call. Most of those slots are dead the moment
 * the next operation runs. Two slots interfere when one is written while the
 * other is live; slots that never interfere can share a frame location. The
 * written slot interferes with every slot live before the operation as well,
 * so a destination never aliases an operand of the same operation and the
 * runtime may write its result before it finishes reading its inputs.
 *
 * Parameters and the error slots of exception handlers are written by the
 * prologue or by the runtime's unwinder rather than by an operation, so they
 * keep locations of their own. */
export function assignLocations(fn:FunctionIR,liveness:ReadonlyMap<number,BlockLiveness>):SlotLocations {
 const n=fn.slotCount,edges:Set<number>[]=Array.from({length:n},()=>new Set<number>());
 const link=(x:number,y:number)=>{if(x!==y){edges[x]!.add(y);edges[y]!.add(x);}};
 // Parameters, and every local of a function whose locals are always live
 // (liveness.ts liveFloor), keep locations of their own.
 const pinned=new Set<number>(),floor=liveFloor(fn);
 for(let i=0;i<Math.max(fn.parameterCount,floor);i++)pinned.add(i);
 const order:number[]=[];
 for(const block of fn.blocks){
  const before=liveness.get(block.id)!.before;
  for(const [index,op] of block.operations.entries()){
   if(op.kind==='pushHandler')pinned.add(op.error);
   const dests=destinations(op);
   for(const d of dests){
    if(d<floor)continue;
    order.push(d);
    for(const s of before[index]!)link(d,s);
    for(const e of dests)link(d,e);
   }
  }
 }
 const location:number[]=new Array(n).fill(-1);
 let count=0;
 // Pinned slots first, each at its own location that no other slot may take.
 const reserved=new Set<number>();
 for(const slot of pinned){location[slot]=count;reserved.add(count);count++;}
 const seen=new Set<number>();
 const ordered=[...order.filter(slot=>!seen.has(slot)&&(seen.add(slot),true)),...Array.from({length:n},(_,i)=>i)];
 // Reserved locations are 0..count-1: shared locations start after them.
 const firstShared=count;
 for(const slot of ordered){
  if(location[slot]!>=0)continue;
  const taken=new Set<number>();
  for(const other of edges[slot]!)if(location[other]!>=0)taken.add(location[other]!);
  let candidate=firstShared;while(taken.has(candidate))candidate++;
  location[slot]=candidate;if(candidate>=count)count=candidate+1;
 }
 return {location,count};
}
