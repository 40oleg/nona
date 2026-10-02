import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {RuntimeBuilder,slot} from '../src/runtime/abi.js';
import {FunctionLayout as F} from '../src/runtime/functions.js';
import {runNative} from './helpers/native.js';

// Supply a native construct entry to a source function in test composition.
// Public JS has no access to this header field. Ordinary calls still execute
// the original source body, while new must follow the separate builtin ABI.
for(const [name,source,expected] of [
 ['ordinary and constructor dispatch','function N(){return "call";}console.log(N(),new N(7).length);','call 7\n'],
 ['bound constructor dispatch','function N(){return "call";}let B=N.bind({length:99},8).bind(null,9);console.log(B(),new B().length);','call 8\n'],
 ['prepared receiver prototype','function N(){return "call";}N.prototype={x:42};let o=new N(3);console.log(o.x,o.length,o instanceof N);','42 3 true\n'],
] as const)test('native construct entry: '+name,()=>{
 const program=generate(lower(bind(parse(lex(source)))),{gcStress:true});
 const builder=new RuntimeBuilder();
 // Rename only the allocator entry, keeping its local labels/fixups intact.
 const original=program.fragments.find(f=>f.name==='rt.newFunction')!;
 original.name='test.originalNewFunction';
 original.symbols['test.originalNewFunction.end']=original.symbols['rt.newFunction.end']!;
 delete original.symbols['rt.newFunction.end'];
 const unwind=program.functions.find(f=>f.begin==='rt.newFunction')!;
 unwind.begin='test.originalNewFunction';
 unwind.end='test.originalNewFunction.end';
 builder.fn('rt.newFunction',56,a=>{
  a.store(slot(40),'rcx');a.call('test.originalNewFunction');
  a.load('rcx',slot(40));a.load('rcx',{base:'rcx',disp:8});
  a.lea('rax',{rip:'test.construct'});a.store({base:'rcx',disp:F.constructCode},'rax');
 });
 builder.fn('test.construct',72,a=>{
  a.store(slot(40),'rcx');a.load('rax',slot(112));a.store(slot(48),'rax');
  // Native ABI: argc in RDX, argv in R8, header in R9, receiver on stack.
  a.cmp('rdx',1);a.jcc('b','test.bad');
  a.load('r10',{base:'r9',disp:F.constructCode});a.lea('rax',{rip:'test.construct'});a.cmp('r10','rax');a.jcc('ne','test.bad');
  a.load('rcx',slot(48));a.lea('rdx',{rip:'rt.key.length'});a.mov('r9',0);a.call('rt.setProperty');
  a.load('rcx',slot(40));a.load('rdx',slot(48));
  for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'rcx',disp:offset},'rax');}
  const done=a.unique('done');a.jmp(done);a.label('test.bad');a.call('rt.fail');a.label(done);
 });
 program.fragments.push(...builder.bundle.fragments);program.functions.push(...builder.bundle.functions);
 const result=runNative(linkHost(program));assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.toString(),expected);
});
