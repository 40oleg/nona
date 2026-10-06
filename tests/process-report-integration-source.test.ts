import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processReportPlatformProbes} from '../src/backend/process-report-platform-probes.js';
import {supportedNativeTargets} from '../src/target.js';

for(const target of supportedNativeTargets)test('real report fixtures compile and link for '+target,()=>{
 const probes=processReportPlatformProbes(target);
 assert.equal(probes.length,6);
 for(const probe of probes){assert.ok(probe.image.length>0,probe.name);assert.equal(probe.minimalEnvironment,true)}
 assert.equal(probes.find(probe=>probe.name==='process-report-uncaught')!.status,1);
});
