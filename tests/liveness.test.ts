import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLiveness} from '../src/ir/liveness.js';
import type {BlockIR,FunctionIR} from '../src/ir/model.js';

function analyze(blocks:BlockIR[]) {
 const fn:FunctionIR={id:'test',name:'test',parameterCount:0,localCount:0,slotCount:12,maxArguments:4,blocks};
 return analyzeLiveness(fn);
}
function slots(actual:ReadonlySet<number>,expected:number[]) {
 assert.deepEqual([...actual].sort((a,b)=>a-b),expected);
}
test('liveness kills overwritten destinations and preserves returned values',()=>{
 const result=analyze([{id:0,operations:[
  {kind:'constant',dest:0,value:1},
  {kind:'copy',dest:1,source:0},
  {kind:'constant',dest:0,value:2},
 ],terminator:{kind:'return',value:1}}]).get(0)!;
 slots(result.liveIn,[]);slots(result.before[0]!,[]);
 slots(result.before[1]!,[0]);slots(result.before[2]!,[1]);
 slots(result.beforeTerminator,[1]);slots(result.liveOut,[]);
});
test('branch liveness unions both successors and includes its condition',()=>{
 const result=analyze([
  {id:0,operations:[],terminator:{kind:'branch',condition:0,yes:1,no:2}},
  {id:1,operations:[],terminator:{kind:'return',value:1}},
  {id:2,operations:[],terminator:{kind:'return',value:2}},
 ]);
 slots(result.get(0)!.liveIn,[0,1,2]);slots(result.get(0)!.liveOut,[1,2]);
});
test('back edges require a fixed point across multiple blocks',()=>{
 const result=analyze([
  {id:0,operations:[],terminator:{kind:'jump',target:1}},
  {id:1,operations:[{kind:'binary',dest:1,operator:'+',left:1,right:2}],terminator:{kind:'jump',target:2}},
  {id:2,operations:[],terminator:{kind:'branch',condition:0,yes:1,no:3}},
  {id:3,operations:[],terminator:{kind:'return',value:1}},
 ]);
 slots(result.get(0)!.liveIn,[0,1,2]);
 slots(result.get(1)!.before[0]!,[0,1,2]);
 slots(result.get(2)!.liveOut,[0,1,2]);
});
test('calls keep argument roots and later values but kill previous result',()=>{
 const result=analyze([{id:0,operations:[
  {kind:'call',dest:3,target:'js.fn.0',arguments:[1,2,1]},
  {kind:'binary',dest:5,operator:'+',left:3,right:4},
 ],terminator:{kind:'return',value:5}}]).get(0)!;
 slots(result.before[0]!,[1,2,4]);slots(result.before[1]!,[3,4]);
});
test('property mutation preserves base key and source including self-aliasing',()=>{
 const result=analyze([{id:0,operations:[
  {kind:'property',operation:'get',dest:2,object:0,key:1},
  {kind:'setProperty',object:0,key:1,source:2,define:false},
  {kind:'setPrototype',object:0,prototype:3},
 ],terminator:{kind:'return',value:0}}]).get(0)!;
 slots(result.before[0]!,[0,1,3]);slots(result.before[1]!,[0,1,2,3]);slots(result.before[2]!,[0,3]);
});
test('global stores and initialization checks are reads, global loads are definitions',()=>{
 const result=analyze([{id:0,operations:[
  {kind:'loadGlobal',dest:0,index:0},
  {kind:'checkInitialized',slot:0},
  {kind:'storeGlobal',source:0,index:1},
  {kind:'uninitialized',dest:0},
  {kind:'immutableWrite'},
 ],terminator:{kind:'return',value:-1}}]).get(0)!;
 slots(result.liveIn,[]);slots(result.before[1]!,[0]);slots(result.before[2]!,[0]);
 slots(result.before[3]!,[]);slots(result.beforeTerminator,[]);
});
test('new objects define destinations and unary reads survive until use',()=>{
 const result=analyze([{id:0,operations:[
  {kind:'newObject',dest:0,array:false,length:0},
  {kind:'unary',dest:1,operator:'typeof',argument:0},
 ],terminator:{kind:'return',value:1}}]).get(0)!;
 slots(result.liveIn,[]);slots(result.before[1]!,[0]);
});
test('indirect calls keep callee, receiver and arguments alive even when overwriting callee slot',()=>{
 const result=analyze([{id:0,operations:[
  {kind:'newFunction',dest:0,target:'js.fn.0'},
  {kind:'invoke',dest:0,callee:0,arguments:[1,2],receiver:3},
 ],terminator:{kind:'return',value:0}}]).get(0)!;
 slots(result.liveIn,[1,2,3]);slots(result.before[1]!,[0,1,2,3]);
});
