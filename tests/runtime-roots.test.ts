import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeBuilder,slot} from '../src/runtime/abi.js';
import {rootedFn} from '../src/runtime/root-scope.js';
import {emitRuntime} from '../src/runtime/index.js';
import {linkHost} from './helpers/program.js';
import type {Assembler} from '../src/backend/x64/assembler.js';
import {runNative} from './helpers/native.js';

function equal(a:Assembler,symbol:string,value:number):void {
 a.load('rax',{rip:symbol});a.cmp('rax',value);a.jcc('ne','test.fail');
}
function native(helpers:(b:RuntimeBuilder)=>void,body:(a:Assembler)=>void):void {
 const b=new RuntimeBuilder();helpers(b);
 b.fn('entry',104,a=>{
  a.call('rt.init');body(a);
  equal(a,'rt.gcRoots',0);a.call('rt.collect');equal(a,'rt.liveBytes',0);
  a.call('rt.dispose');a.mov('rcx',0);a.callImport('ExitProcess');
  a.label('test.fail');a.mov('rcx',42);a.callImport('ExitProcess');
 });
 const runtime=emitRuntime();
 const result=runNative(linkHost({entry:'entry',fragments:[...runtime.fragments,...b.bundle.fragments],imports:runtime.imports,functions:[...runtime.functions,...b.bundle.functions]}));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
}

test('runtime roots retain a snapshot and its heap container after input mutation',()=>native(b=>{
 rootedFn(b,'test.scope',56,[{kind:'value',register:'rdx'}],a=>{
  a.mov('rax',0);a.store({base:'rdx'},'rax');a.store({base:'rdx',disp:8},'rax');
  a.call('rt.collect');equal(a,'rt.liveBytes',128); // Two 16-byte blocks: 64-byte cells with their headers.
 });
},a=>{
 a.mov('rcx',16);a.call('rt.alloc');a.store(slot(40),'rax');
 a.mov('rcx',16);a.call('rt.alloc');a.mov('rdx','rax');
 a.load('rax',slot(40));a.store({base:'rdx',disp:8},'rax');a.mov('rax',4);a.store({base:'rdx'},'rax');
 a.call('test.scope');
}));

test('runtime output roots retain container without retaining its old contents',()=>native(b=>{
 rootedFn(b,'test.scope',56,[{kind:'output',register:'rcx'}],a=>{
  a.store(slot(40),'rcx');a.call('rt.collect');equal(a,'rt.liveBytes',64);
  a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
},a=>{
 a.mov('rcx',16);a.call('rt.alloc');a.store(slot(40),'rax');
 a.mov('rcx',16);a.call('rt.alloc');a.mov('rcx','rax');
 a.load('rax',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',4);a.store({base:'rcx'},'rax');
 a.call('test.scope');
}));

test('nested runtime roots preserve locals, managed ranges, pointers and return registers',()=>native(b=>{
 rootedFn(b,'test.inner',56,[{kind:'pointer',register:'r9'}],a=>{
  a.call('rt.collect');equal(a,'rt.liveBytes',192);a.mov('rax',123);a.movqToXmm('xmm0','rax');
 });
 rootedFn(b,'test.outer',88,[{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:48,count:2}],a=>{
  // The second local must be initialized before the first collection.
  a.call('rt.collect');equal(a,'rt.liveBytes',64);
  a.mov('rcx',16);a.call('rt.alloc');a.store(slot(56),'rax');a.mov('rax',4);a.store(slot(48),'rax');
  a.mov('rcx',16);a.call('rt.alloc');a.mov('r9','rax');a.call('test.inner');
  a.cmp('rax',123);a.jcc('ne','test.fail');a.movqFromXmm('rax','xmm0');a.cmp('rax',123);a.jcc('ne','test.fail');
  a.call('rt.collect');equal(a,'rt.liveBytes',128);
 });
},a=>{
 a.mov('rcx',16);a.call('rt.alloc');a.mov('r8','rax');a.mov('rdx',1);
 a.mov('rax',0);a.store({base:'r8'},'rax');a.store({base:'r8',disp:8},'rax');a.call('test.outer');
}));

test('enlarged runtime frames locate incoming stack arguments and fixed ranges',()=>native(b=>{
 rootedFn(b,'test.scope',56,[{kind:'range',register:'r8',count:1}],(a,frame)=>{
  a.load('rax',slot(frame+40));a.cmp('rax',987);a.jcc('ne','test.fail');
  a.call('rt.collect');equal(a,'rt.liveBytes',64);
 });
},a=>{
 a.mov('rcx',16);a.call('rt.alloc');a.mov('r8','rax');
 a.mov('rax',0);a.store({base:'r8'},'rax');a.store({base:'r8',disp:8},'rax');
 a.mov('rax',987);a.store(slot(32),'rax');a.call('test.scope');
}));
