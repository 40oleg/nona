import type {NamedFragment,UnwindFunction} from './pe/model.js';

/**
 * Agent-wide state shared by every realm: the heap, GC and exception/generator
 * bookkeeping, the Symbol.for registry and the well-known symbols.
 */
const sharedData=new Set(['rt.heap','rt.blocks','rt.liveBytes','rt.exceptionHandler','rt.cleanupHead','rt.contextChain','rt.currentGenerator',
 'rt.symbolRegistry','rt.tailPending','rt.sharedJobQueue','rt.Math.random.state','rt.gcIndex','rt.gcIndexCount','rt.gcRoots','rt.gcGrey','rt.gcCount','rt.callStatsTable','rt.exitHook','rt.gcThreshold',
 'rt.collect','entry','rt.hashSeed','rt.gcPoison']);
const isShared=(name:string):boolean=>sharedData.has(name)||/^rt\.Symbol\.[A-Za-z]+\.value$/.test(name)||name.startsWith('realm.')||name.startsWith('host.')||name.startsWith('agent.')
 ||name==='js.main'||name.startsWith('js.fn.')||name.startsWith('js.module.');

export const realmSymbol=(realm:number,name:string):string=>`R${realm}$${name}`;
const FunctionKindByte=2,objectKindOffset=0;

/**
 * Clone every realm-specific fragment (intrinsic objects, their property nodes,
 * runtime code and the prelude) once per extra realm. References to shared
 * state keep their names, so all realms use one heap and one collector.
 */
export function cloneRealms(fragments:NamedFragment[],functions:UnwindFunction[],realms:number,functionSize:number,functionRealmOffset:number):void {
 if(realms<=0)return;
 const owner=new Map<string,NamedFragment>();
 for(const fragment of fragments){owner.set(fragment.name,fragment);for(const symbol of Object.keys(fragment.symbols))owner.set(symbol,fragment);}
 const cloned=new Set<NamedFragment>();
 for(const fragment of fragments)if(fragment.section!=='.rdata'&&!isShared(fragment.name))cloned.add(fragment);
 // Read-only data that points at a realm-specific object belongs to the realm too.
 for(let changed=true;changed;){
  changed=false;
  for(const fragment of fragments)if(!cloned.has(fragment)&&fragment.section==='.rdata'&&!isShared(fragment.name)
   &&fragment.fixups.some(fixup=>{const target=owner.get(fixup.target);return !!target&&cloned.has(target);})){cloned.add(fragment);changed=true;}
 }
 const originals=[...cloned];
 const functionByBegin=new Map(functions.map(fn=>[fn.begin,fn]));
 for(let realm=1;realm<=realms;realm++){
  const rename=(name:string):string=>{const target=owner.get(name);return target&&cloned.has(target)?realmSymbol(realm,name):name;};
  for(const fragment of originals){
   const bytes=fragment.bytes.slice();
   // Record the realm in this copy's realm index and its static function objects.
   if(fragment.name==='rt.realmIndex')bytes[0]=realm;
   else if(fragment.section==='.data'&&bytes.length===functionSize&&bytes[objectKindOffset]===FunctionKindByte)bytes[functionRealmOffset]=realm;
   fragments.push({...fragment,name:realmSymbol(realm,fragment.name),bytes,
    symbols:Object.fromEntries(Object.entries(fragment.symbols).map(([symbol,offset])=>[realmSymbol(realm,symbol),offset])),
    fixups:fragment.fixups.map(fixup=>({...fixup,target:rename(fixup.target)}))});
   const unwind=functionByBegin.get(fragment.name);
   if(unwind)functions.push({...unwind,begin:rename(unwind.begin),end:rename(unwind.end)});
  }
 }
}
