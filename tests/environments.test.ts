import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FunctionIR,ModuleIR,Operation} from '../src/ir/model.js';
import {generate} from '../src/backend/x64/codegen.js';
import {Assembler} from '../src/backend/x64/assembler.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

function fn(id:string,operations:Operation[],value:number,slotCount=12):FunctionIR {
 return {id,name:id,parameterCount:0,localCount:0,slotCount,maxArguments:4,
  blocks:[{id:0,operations,terminator:{kind:'return',value}}]};
}
const increment=()=>fn('js.increment',[
 {kind:'loadCapture',dest:0,index:0},
 {kind:'readCell',dest:1,cell:0},
 {kind:'constant',dest:2,value:1},
 {kind:'binary',dest:3,operator:'+',left:1,right:2},
 {kind:'writeCell',cell:0,source:3},
],3);

function check(module:ModuleIR,expected:string):void {
 const program=generate(module,{gcStress:true});
 // No globals in these IR fixtures. After main, every closure/cell/environment,
 // including cycles, must be reclaimable; also verify runtime root unwinding.
 const a=new Assembler('test.cleanup');a.sub('rsp',40);const prologSize=a.offset;
 a.load('rax',{rip:'rt.gcRoots'});a.test('rax','rax');a.jcc('ne','test.cleanup.fail');
 a.call('rt.collect');a.load('rax',{rip:'rt.liveBytes'});a.test('rax','rax');a.jcc('ne','test.cleanup.fail');
 a.call('rt.dispose');a.add('rsp',40);a.ret();
 a.label('test.cleanup.fail');a.mov('rcx',42);a.callImport('ExitProcess');a.label('test.cleanup.end');
 program.fragments.find(f=>f.name==='entry')!.fixups.find(f=>f.target==='rt.dispose')!.target='test.cleanup';
 program.fragments.push({...a.finish(),name:'test.cleanup',section:'.text'});
 program.functions.push({begin:'test.cleanup',end:'test.cleanup.end',prologSize,stackAllocation:40,savedRegisters:[]});
 const run=runNative(linkHost(program));assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),expected);
}

for(const shared of [true,false])test(`native IR environments ${shared?'share':'isolate'} captured cells`,()=>{
 check({globalCount:0,functions:[fn('js.main',[
  {kind:'constant',dest:0,value:10},{kind:'newCell',dest:1,source:0},
  {kind:'constant',dest:7,value:20},{kind:'newCell',dest:8,source:7},
  {kind:'newFunction',dest:2,target:'js.increment',captures:[1]},
  {kind:'newFunction',dest:3,target:'js.increment',captures:[shared?1:8]},
  {kind:'invoke',dest:4,callee:2,arguments:[]},{kind:'invoke',dest:5,callee:3,arguments:[]},
  {kind:'call',dest:6,target:'rt.log',arguments:[4,5]},
 ],-1),increment()]},shared?'11 12\n':'11 21\n');
});
test('native IR forwards capture cells through an escaping nested function',()=>{
 check({globalCount:0,functions:[fn('js.main',[
  {kind:'constant',dest:0,value:30},{kind:'newCell',dest:1,source:0},
  {kind:'newFunction',dest:2,target:'js.factory',captures:[1]},
  {kind:'invoke',dest:3,callee:2,arguments:[]},{kind:'invoke',dest:4,callee:3,arguments:[]},
  {kind:'call',dest:5,target:'rt.log',arguments:[4]},
 ],-1),fn('js.factory',[
  {kind:'loadCapture',dest:0,index:0},{kind:'newFunction',dest:1,target:'js.increment',captures:[0]},
 ],1),increment()]},'31\n');
});
test('native IR closure-cell cycles are reclaimable',()=>{
 check({globalCount:0,functions:[fn('js.main',[
  {kind:'constant',dest:0,value:undefined},{kind:'newCell',dest:1,source:0},
  {kind:'newFunction',dest:2,target:'js.self',captures:[1]},
  {kind:'writeCell',cell:1,source:2},{kind:'invoke',dest:3,callee:2,arguments:[]},
  {kind:'binary',dest:4,operator:'===',left:2,right:3},{kind:'call',dest:5,target:'rt.log',arguments:[4]},
 ],-1),fn('js.self',[{kind:'loadCapture',dest:0,index:0},{kind:'readCell',dest:1,cell:0}],1)]},'true\n');
});
test('native IR reserves capture storage beyond ordinary argument capacity',()=>{
 const operations:Operation[]=[];
 for(let i=0;i<7;i++)operations.push({kind:'constant',dest:2*i,value:i},{kind:'newCell',dest:2*i+1,source:2*i});
 operations.push({kind:'newFunction',dest:14,target:'js.last',captures:[1,3,5,7,9,11,13]},
  {kind:'invoke',dest:15,callee:14,arguments:[]},{kind:'call',dest:16,target:'rt.log',arguments:[15]});
 check({globalCount:0,functions:[fn('js.main',operations,-1,24),
  fn('js.last',[{kind:'loadCapture',dest:0,index:6},{kind:'readCell',dest:1,cell:0}],1)]},'6\n');
});
test('native IR can box a binding in place and read a cell into its old slot',()=>{
 check({globalCount:0,functions:[fn('js.main',[
  {kind:'constant',dest:0,value:'retained'},{kind:'newCell',dest:0,source:0},
  {kind:'readCell',dest:0,cell:0},{kind:'call',dest:1,target:'rt.log',arguments:[0]},
 ],-1)]},'retained\n');
});
