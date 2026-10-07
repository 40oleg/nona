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
type Target={target:string;strict:boolean;arrow:boolean;ignoresThis:boolean};

/**
 * What a function's prologue has to set up from its caller's registers and
 * stack arguments: the frame slots of this, new.target and the super
 * receiver are filled (and rooted) only when an operation reads them, the
 * argument count and vector are kept only for the operations that read them
 * after the parameters are in place, and the function object only when
 * something reads it. Shared by the code generator and the direct-call
 * annotation (a caller skips passing what the callee never reads).
 */
export function frameUses(fn:FunctionIR):{this:boolean;newTarget:boolean;superReceiver:boolean;fn:boolean;args:boolean} {
 const uses={this:!!fn.derivedConstructor,newTarget:false,superReceiver:false,fn:false,args:false};
 for(const block of fn.blocks)for(const op of block.operations)switch(op.kind){
  case 'currentThis':case 'setCurrentThis':case 'derivedReturn':uses.this=true;break;
  case 'superReceiver':uses.superReceiver=true;break;
  case 'newTarget':uses.newTarget=true;break;
  case 'newFunction':if(op.arrow){uses.this=true;uses.newTarget=true;uses.fn=true;}break;
  case 'loadCapture':case 'superBase':case 'currentFunction':uses.fn=true;break;
  case 'superConstructor':if(op.func===undefined)uses.fn=true;break;
  case 'newArguments':uses.fn=true;uses.args=true;break;
  case 'newRestArray':case 'constructForward':uses.args=true;break;
 }
 return uses;
}

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
 const byId=new Map(module.functions.map(fn=>[fn.id,fn]));
 for(const fn of module.functions)for(const block of fn.blocks)for(const op of block.operations)if(op.kind==='newFunction'){
  // Arrows take the direct path too: their lexical this and new.target are
  // read from the function object.
  const plain=!op.generator&&!op.async&&!op.classConstructor,target=byId.get(op.target);
  const uses=target?frameUses(target):undefined,ignoresThis=!!uses&&!uses.this&&!uses.newTarget&&!uses.superReceiver;
  callable.set(op.target,plain?{target:op.target,strict:!!op.strict||!!op.arrow,arrow:!!op.arrow,ignoresThis}:null);
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
     if(info){result={...op,direct:info.target,directStrict:info.strict,...(info.arrow?{directArrow:true}:{}),...(info.ignoresThis?{directIgnoresThis:true}:{})};blockChanged=true;}
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
