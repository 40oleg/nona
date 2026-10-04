import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runtimeProbes} from '../src/backend/platform-probes.js';

test('Linux ARM64 compiles the language runtime into an AArch64 ELF image',()=>{
  const result=compile('console.log(6*7,"a"+"b",Math.sin(.5))',{fileName:'probe.js',target:'linux-arm64'});
  assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));if(!result.ok)return;
  assert.equal(new DataView(result.image.buffer).getUint16(18,true),183);
});
test('Linux ARM64 builds runtime, forced GC and concurrent agent probes',()=>{
  const probes=runtimeProbes('linux-arm64');
  assert.equal(probes.length,10);
  assert.ok(probes.some(p=>p.name==='gc-stress'));
  assert.ok(probes.some(p=>p.name==='agents'));
  for(const p of probes)assert.equal(new DataView(p.image.buffer).getUint16(18,true),183,p.name);
});
