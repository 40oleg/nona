import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runOracle} from './helpers/oracle.js';

test('oracle console adapter survives script declarations shadowing process', () => {
 const run = runOracle(`function process(value) { return value.trim(); } console.log(process(' ok '));`);
 assert.equal(run.stdout, 'ok\n');
});
test('oracle console adapter keeps its string conversion when a script shadows String', () => {
 const run = runOracle(`function String() { return 'shadow'; } console.log(12, true);`);
 assert.equal(run.stdout, '12 true\n');
});
