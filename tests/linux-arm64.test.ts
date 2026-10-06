import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runtimeProbes,runtimeProbeSources} from '../src/backend/platform-probes.js';

test('Linux ARM64 compiles the language runtime into an AArch64 ELF image',()=>{
  const result=compile('console.log(6*7,"a"+"b",Math.sin(.5))',{fileName:'probe.js',target:'linux-arm64'});
  assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));if(!result.ok)return;
  assert.equal(new DataView(result.image.buffer).getUint16(18,true),183);
});
test('Linux ARM64 builds runtime, forced GC and concurrent agent probes',()=>{
  const probes=runtimeProbes('linux-arm64');
  const expected=[...runtimeProbeSources.map(probe=>probe.name),'path-lazy-startup','gc-stress','agents','atomic-contention','process','filesystem','ffi-syscall'];
  assert.equal(probes.length,expected.length);
  assert.deepEqual(probes.map(probe=>probe.name),expected);
  assert.ok(probes.some(probe=>probe.name==='path'));
  for(const p of probes)assert.equal(new DataView(p.image.buffer).getUint16(18,true),183,p.name);
});
