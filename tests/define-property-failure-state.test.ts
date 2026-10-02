import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {RuntimeBuilder,slot} from '../src/runtime/abi.js';
import {rootedFn} from '../src/runtime/root-scope.js';
import {prependFunctionBuiltin} from '../src/runtime/function-builtin.js';

const cases:[string,string][]=[
 ['failed length shrink applies readonly after restoring length','let a=[0,1,2,3,4,5];Object.defineProperty(a,2,{configurable:false});Object.defineProperty(a,4,{configurable:false});console.log(globalThis.tryDefine(a,"length",{value:1,writable:false}),a.length,Object.getOwnPropertyDescriptor(a,"length").writable,a.hasOwnProperty(5),a.hasOwnProperty(3));a.length=8;console.log(a.length);'],
 ['invalid ordinary descriptor is atomic','let o={};Object.defineProperty(o,"x",{value:1,writable:true});console.log(globalThis.tryDefine(o,"x",{value:7,enumerable:true,writable:false}));let d=Object.getOwnPropertyDescriptor(o,"x");console.log(o.x,d.writable,d.enumerable);'],
 ['invalid mapped descriptor does not write or disconnect parameter','function f(a){Object.defineProperty(arguments,0,{configurable:false});console.log(globalThis.tryDefine(arguments,0,{value:7,enumerable:false,writable:false}),a);a=9;console.log(arguments[0],Object.getOwnPropertyDescriptor(arguments,0).writable);}f(1);'],
 ['length conversion sees reentrant readonly and still coerces twice','let a=[1,2],calls=0,n={valueOf:function(){calls++;Object.defineProperty(a,"length",{writable:false});return 3;}};console.log(globalThis.tryDefine(a,"length",{value:n}),calls,a.length);'],
 ['SameValue distinctions leave immutable values unchanged','let o={};Object.defineProperty(o,"x",{value:0});console.log(globalThis.tryDefine(o,"x",{value:-0}),Object.is(o.x,0));Object.defineProperty(o,"n",{value:NaN});console.log(globalThis.tryDefine(o,"n",{value:NaN}));'],
 ['array length attributes reject before deleting entries','let a=[1,2,3];console.log(globalThis.tryDefine(a,"length",{value:1,enumerable:true}),a.length,a[2]);'],
];
for(const [name,source] of cases)test('DefineOwnProperty failure state: '+name,()=>{
 const program=generate(lower(bind(parse(lex(source)))),{gcStress:true});
 const b=new RuntimeBuilder();b.bundle={fragments:program.fragments,functions:program.functions,imports:program.imports};
 // Surface only the Boolean completion of the internal operation. JS exception
 // handling/Reflect globals are separate features; Node uses real Reflect here.
 prependFunctionBuiltin(b,'test.tryDefine','tryDefine',3,'rt.globalObject');
 rootedFn(b,'test.tryDefine.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:10}],a=>{
  a.store(slot(40),'rcx');for(let i=0;i<6;i++){a.load('rax',{base:'r8',disp:8*i});a.store(slot(64+8*i),'rax');}
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.call('rt.toString');a.lea('rcx',slot(128));a.lea('rdx',slot(96));a.call('rt.toPropertyDescriptor');
  a.lea('rcx',slot(64));a.lea('rdx',slot(112));a.lea('r8',slot(128));a.call('rt.defineOwnProperty');a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',2);a.store({base:'rcx'},'rax');
 });
 const run=runNative(linkHost(program));assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle('globalThis.tryDefine=Reflect.defineProperty;'+source).stdout);
});
