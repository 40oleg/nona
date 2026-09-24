import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
test('oracle preserves script directive prologue and global this',()=>{
 assert.equal(runOracle('"use strict";function f(){return this;}console.log(f()===undefined,this===globalThis);').stdout,'true true\n');
 assert.equal(runOracle('var x=7;function f(){return this;}console.log(globalThis.x,f()===globalThis);').stdout,'7 true\n');
});
