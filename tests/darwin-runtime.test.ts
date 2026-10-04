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
