import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
test('oracle preserves script directive prologue and global this',()=>{
 assert.equal(runOracle('"use strict";function f(){return this;}console.log(f()===undefined,this===globalThis);').stdout,'true true\n');
 assert.equal(runOracle('var x=7;function f(){return this;}console.log(globalThis.x,f()===globalThis);').stdout,'7 true\n');
});
test('oracle can select the UTC policy independently of the parent timezone',()=>{
 const previous=process.env.TZ;
 try{
  process.env.TZ='America/Los_Angeles';
  const source='console.log(new Date(0).getTimezoneOffset(),new Date(Date.UTC(1900,0,1)).getYear());';
  assert.equal(runOracle(source).stdout,'480 -1\n');
  assert.equal(runOracle(source,{timezone:'Etc/UTC'}).stdout,'0 0\n');
 }finally{
  if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;
 }
});
