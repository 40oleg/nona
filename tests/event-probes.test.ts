import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireHostTarget} from '../src/target.js';
import {eventProbes} from './probes/event-probes.js';
import {runNative} from './helpers/native.js';

test('event platform probes execute on the native host under gcStress',()=>{
 for(const probe of eventProbes(requireHostTarget())){
  const result=runNative(probe.image);assert.equal(result.error,undefined,probe.name);assert.equal(result.status,0,probe.name+': '+result.stderr.toString());assert.equal(result.stdout.toString(),probe.expected,probe.name);
 }
});
