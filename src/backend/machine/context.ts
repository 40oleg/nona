import {Assembler} from '../x64/assembler.js';
import {detectHostTarget,getTarget,type Target} from '../../target.js';

let activeTarget=detectHostTarget();
export function currentNativeTarget():Target|undefined {return activeTarget;}
/** Compilation is synchronous; nested compilations and errors restore the scope. */
export function withNativeTarget<T>(target:Target,body:()=>T):T {
  if(!getTarget(target))throw new Error(`Unsupported native target ${target}`);
  const previous=activeTarget;activeTarget=target;
  try{return body();}finally{activeTarget=previous;}
}
export function createAssembler(name=''):Assembler {
  const target=activeTarget===undefined?undefined:getTarget(activeTarget);
  if(!target)throw new Error('Unsupported native host; choose an explicit emission target');
  if(target.arch==='arm64')throw new Error('ARM64 machine-code emission is not implemented yet');
  return new Assembler(name);
}
