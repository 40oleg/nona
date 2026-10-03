import type {FunctionIR,Operation} from './model.js';

/**
 * Number type inference (roadmap item 15, first step): a forward
 * must-analysis of the slots that hold a Number at each point. An
 * arithmetic, comparison or update operation whose operands are all such
 * slots is marked `numeric`; the code generator then emits it without tag
 * checks and without the generic runtime fallback, and since it cannot reach
 * the runtime, without clearing dead slots before it.
 *
 * Numbers come from number constants, from + - * / on Numbers, and from the
 * numeric/increment/decrement/negation unary operators on Numbers. BigInt
 * operands never qualify (their arithmetic allocates), and nothing read
 * from a global, a cell, a property or a call is assumed to be a Number.
 */
const arithmetic=new Set(['+','-','*','/']);
const relation=new Set(['<','<=','>','>=','==','===','!=','!==']);
const numericUnary=new Set(['numeric','increment','decrement','-','+']);

type State=Set<number>|null;
function intersect(a:State,b:ReadonlySet<number>):Set<number> {
 if(a===null)return new Set(b);
 for(const slot of a)if(!b.has(slot))a.delete(slot);
 return a;
}
function isNumericOperation(operation:Operation,state:ReadonlySet<number>):boolean {
 if(operation.kind==='binary')return (arithmetic.has(operation.operator)||relation.has(operation.operator))&&state.has(operation.left)&&state.has(operation.right);
 if(operation.kind==='unary')return numericUnary.has(operation.operator)&&state.has(operation.argument);
 return false;
}
function step(operation:Operation,state:Set<number>):void {
 if(operation.kind==='constant'){if(typeof operation.value==='number')state.add(operation.dest);else state.delete(operation.dest);return;}
 if(operation.kind==='copy'){if(state.has(operation.source))state.add(operation.dest);else state.delete(operation.dest);return;}
 if(operation.kind==='binary'||operation.kind==='unary'){
  if(isNumericOperation(operation,state)&&(operation.kind==='unary'||arithmetic.has(operation.operator)))state.add(operation.dest);else state.delete(operation.dest);
  return;
 }
 if(operation.kind==='getIterator'){state.delete(operation.iterator);state.delete(operation.next);}
 if(operation.kind==='iteratorStep')state.delete(operation.done);
 if(operation.kind==='yieldDelegated')state.delete(operation.mode);
 if('dest' in operation)state.delete(operation.dest);
}

export function markNumericOperations(fn:FunctionIR):FunctionIR {
 if(!fn.blocks.some(block=>block.operations.some(op=>op.kind==='binary'||op.kind==='unary')))return fn;
 const index=new Map(fn.blocks.map((block,i)=>[block.id,i]));
 const entry:State[]=fn.blocks.map((_,i)=>i===0?new Set<number>():null);
 const successors=(i:number):number[]=>{const t=fn.blocks[i]!.terminator;return t.kind==='jump'?[t.target]:t.kind==='branch'?[t.yes,t.no]:[];};
 let changed=true;
 while(changed){
  changed=false;
  fn.blocks.forEach((block,i)=>{
   const start=entry[i];if(start===null)return;
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
  const start=entry[i];if(start===null)return block;
  const state=new Set(start);let marked=false;
  const operations=block.operations.map(operation=>{
   const numeric=isNumericOperation(operation,state);step(operation,state);
   if(!numeric)return operation;
   marked=true;
   // ToNumeric of a Number is the Number itself.
   if(operation.kind==='unary'&&operation.operator==='numeric')return {kind:'copy',dest:operation.dest,source:operation.argument} as Operation;
   return {...operation,numeric:true} as Operation;
  });
  return marked?{...block,operations}:block;
 })};
}
