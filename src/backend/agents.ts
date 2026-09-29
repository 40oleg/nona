import type {NativeProgram,NamedFragment,UnwindFunction,ImportSymbol} from './pe/model.js';

export const agentSymbol=(agent:number,name:string):string=>`A${agent}$${name}`;
const shared=(name:string):boolean=>name.startsWith('agent.');

/**
 * Link separately generated agent programs into the main image. Each agent keeps
 * its own runtime copy (heap state, intrinsics, prelude) under a prefix; the
 * shared "agent." state and the imports are common to all of them.
 */
export function mergeAgentPrograms(fragments:NamedFragment[],functions:UnwindFunction[],imports:ImportSymbol[],agents:NativeProgram[]):void {
 agents.forEach((program,agent)=>{
  const defined=new Set<string>();
  for(const fragment of program.fragments){defined.add(fragment.name);for(const symbol of Object.keys(fragment.symbols))defined.add(symbol);}
  const rename=(name:string):string=>defined.has(name)&&!shared(name)?agentSymbol(agent,name):name;
  for(const fragment of program.fragments){
   if(shared(fragment.name))continue;
   fragments.push({...fragment,name:rename(fragment.name),
    symbols:Object.fromEntries(Object.entries(fragment.symbols).map(([symbol,offset])=>[rename(symbol),offset])),
    fixups:fragment.fixups.map(fixup=>({...fixup,target:rename(fixup.target)}))});
  }
  for(const fn of program.functions)functions.push({...fn,begin:rename(fn.begin),end:rename(fn.end)});
  for(const symbol of program.imports)if(!imports.some(existing=>existing.symbol===symbol.symbol))imports.push(symbol);
 });
}
