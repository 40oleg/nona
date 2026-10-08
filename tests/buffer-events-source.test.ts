import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {encodingPreludeSource} from '../src/runtime/encoding-source.js';
import {bufferPreludeSource} from '../src/runtime/buffer-source.js';
import {eventsPreludeSource} from '../src/runtime/events-source.js';
import {runOracle} from './helpers/oracle.js';
import {bufferCancellationProbeSource} from './probes/event-probes.js';

test('Blob piping protects native AbortSignal cancellation against stopped propagation',async()=>{
 let stdout='';
 await runInNewContext(encodingPreludeSource+bufferPreludeSource+eventsPreludeSource+bufferCancellationProbeSource,{__nonaRegexpVm:{},performance,console:{log:(...args:unknown[])=>{stdout+=args.map(String).join(' ')+'\n'}}});
 assert.equal(stdout,runOracle(bufferCancellationProbeSource).stdout);
});
