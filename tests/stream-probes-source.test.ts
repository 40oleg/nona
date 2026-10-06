import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {streamProbeCases} from '../src/backend/stream-probes.js';
import {supportedNativeTargets} from '../src/target.js';

const cases=streamProbeCases('win32-x64');
test('Stream native cases retain unique names and identical host-independent expectations',()=>{
 assert.equal(new Set(cases.map(probe=>probe.name)).size,cases.length);
 assert.equal(cases.length,11);
 for(const target of supportedNativeTargets)assert.deepEqual(streamProbeCases(target),cases);
});
for(const probe of cases)test('Stream native case matches actual Node26 module oracle: '+probe.name,()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',probe.source],{encoding:'utf8',timeout:5000,windowsHide:true});
 if(result.error)throw result.error;
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout,probe.expected);
});
