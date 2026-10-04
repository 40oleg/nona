import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runtimeProbes} from '../src/backend/platform-probes.js';
test('Darwin x64 compiles JavaScript and native service probes without imports',()=>{
 const result=compile('console.log(6*7,"a"+"b")',{fileName:'darwin.js',target:'darwin-x64'});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));if(!result.ok)return;
 assert.equal(new DataView(result.image.buffer).getUint32(0,true),0xfeedfacf);assert.deepEqual(result.imports,[]);
 const probes=runtimeProbes('darwin-x64');assert.equal(probes.length,12);
});
test('reflection does not require an unavailable process adapter',()=>{
 for(const target of ['darwin-x64','freebsd-x64','openbsd-x64'] as const){
  const result=compile('console.log(Object.getOwnPropertyNames(Reflect).join("|"));',{fileName:'reflection.js',target});
  assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
  for(const source of ['console.log(process.pid);','console.log(globalThis["process"].pid);',
   'console.log(Object.getOwnPropertyNames(globalThis),process.pid);',
   'console.log(eval("Object.getOwnPropertyNames(globalThis); process.pid"));']){
   const unsupported=compile(source,{fileName:'process.js',target});
   assert.ok(!unsupported.ok);if(!unsupported.ok)assert.equal(unsupported.diagnostics[0]?.code,'E_HOST_MODULE');
  }
 }
});
