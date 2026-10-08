import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {eventProbeSources,eventProbes} from './probes/event-probes.js';

for(const probe of eventProbeSources)test('event platform probe Node oracle: '+probe.name,()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',probe.source],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,probe.expected);
});
for(const target of ['win32-x64','win32-arm64','linux-x64','linux-arm64','darwin-x64','darwin-arm64','freebsd-x64','openbsd-x64'] as const)test('event platform probes compile with gcStress: '+target,()=>{
 const probes=eventProbes(target);assert.deepEqual(probes.map(probe=>probe.name),eventProbeSources.map(probe=>probe.name));for(const probe of probes)assert.ok(probe.image.length>0);
});
