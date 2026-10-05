import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile,compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {linkHost} from './helpers/program.js';
import {runtimeProbes} from '../src/backend/platform-probes.js';
test('host-link helper preserves the Darwin ARM64 CPU for native oracle suites',()=>{
 const program=withNativeTarget('darwin-arm64',()=>generate(compileToIR('console.log(42)',undefined,undefined,'darwin-arm64')));
 const image=linkHost(program,'darwin-arm64');assert.equal(new DataView(image.buffer).getUint32(4,true),0x100000c);
});
test('Darwin ARM64 compiles the complete runtime and native service probes',()=>{
 const result=compile('console.log(6*7,"a"+"b")',{fileName:'darwin-arm.js',target:'darwin-arm64'});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));if(!result.ok)return;
 assert.equal(new DataView(result.image.buffer).getUint32(4,true),0x100000c);
 const probes=runtimeProbes('darwin-arm64');assert.ok(probes.some(probe=>probe.name==='process-core'));
});
test('Darwin x64 compiles JavaScript and native service probes without imports',()=>{
 const result=compile('console.log(6*7,"a"+"b")',{fileName:'darwin.js',target:'darwin-x64'});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));if(!result.ok)return;
 assert.equal(new DataView(result.image.buffer).getUint32(0,true),0xfeedfacf);assert.deepEqual(result.imports,[]);
 const probes=runtimeProbes('darwin-x64');assert.ok(probes.some(probe=>probe.name==='process-core'));
});
test('reflection and process metadata compile on Darwin and BSD',()=>{
 for(const target of ['darwin-x64','freebsd-x64','openbsd-x64'] as const){
  const result=compile('console.log(Object.getOwnPropertyNames(Reflect).join("|"));',{fileName:'reflection.js',target});
  assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
  for(const source of ['console.log(process.pid);','console.log(globalThis["process"].pid);',
   'console.log(Object.getOwnPropertyNames(globalThis),process.pid);',
   'console.log(eval("Object.getOwnPropertyNames(globalThis); process.pid"));']){
   const supported=compile(source,{fileName:'process.js',target});
   assert.ok(supported.ok,supported.ok?'':JSON.stringify(supported.diagnostics));
  }
 }
});
