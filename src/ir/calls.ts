import type {FunctionIR,ModuleIR,Operation} from './model.js';

/**
 * Direct calls (roadmap item 16): a call whose callee is a function
 * declaration known at compile time is annotated with the declaration's code
 * label. The code generator then checks that the callee really is a function
 * running that code (a global can be reassigned at any time, so the check is
 * made on every call) and calls the code directly, skipping rt.invoke's
 * general dispatch; any other callee takes the usual path.
 *
 * A callee is known when it is the result of `newFunction` in the same
 * block, or a read of a global binding that every store in the program
 * fills with the same function declaration. Arrow functions (lexical this),
 * generators, async functions and class constructors are never annotated.
 */
type Target={target:string;strict:boolean};

export function annotateDirectCalls(module:ModuleIR):ModuleIR {
 const callable=new Map<string,Target|null>();
 const definitions=(fn:FunctionIR,visit:(op:Operation,fromFunction:Map<number,string>)=>void)=>{
  for(const block of fn.blocks){
   const fromFunction=new Map<number,string>();
   for(const op of block.operations){
    visit(op,fromFunction);
    if('dest' in op)fromFunction.delete(op.dest);
    if(op.kind==='newFunction')fromFunction.set(op.dest,op.target);
    else if(op.kind==='copy'&&fromFunction.has(op.source))fromFunction.set(op.dest,fromFunction.get(op.source)!);
   }
  }
 };
 for(const fn of module.functions)for(const block of fn.blocks)for(const op of block.operations)if(op.kind==='newFunction'){
  const plain=!op.arrow&&!op.generator&&!op.async&&!op.classConstructor;
  callable.set(op.target,plain?{target:op.target,strict:!!op.strict}:null);
 }
 // Global index -> the one declaration every store puts there (null: anything else).
 const globals=new Map<number,string|null>();
 for(const fn of module.functions)definitions(fn,(op,fromFunction)=>{
  if(op.kind!=='storeGlobal'||op.prelude)return;
  const target=fromFunction.get(op.source)??null,known=globals.get(op.index);
  globals.set(op.index,known===undefined?target:known===target?known:null);
 });
 let changed=false;
 const functions=module.functions.map(fn=>{
  let marked=false;
  const blocks=fn.blocks.map(block=>{
   const known=new Map<number,string>();let blockChanged=false;
   const operations=block.operations.map(op=>{
    let result=op;
    if(op.kind==='invoke'&&!op.construct&&!op.tail&&op.newTarget===undefined){
     const target=known.get(op.callee),info=target===undefined?undefined:callable.get(target);
     if(info){result={...op,direct:info.target,directStrict:info.strict};blockChanged=true;}
    }
    if('dest' in op)known.delete(op.dest);
    if(op.kind==='newFunction')known.set(op.dest,op.target);
    else if(op.kind==='loadGlobal'&&!op.prelude){const target=globals.get(op.index);if(target)known.set(op.dest,target);}
    else if(op.kind==='copy'&&known.has(op.source))known.set(op.dest,known.get(op.source)!);
    return result;
   });
   if(!blockChanged)return block;
   marked=true;return {...block,operations};
  });
  if(!marked)return fn;
  changed=true;return {...fn,blocks};
 });
 return changed?{...module,functions}:module;
}
