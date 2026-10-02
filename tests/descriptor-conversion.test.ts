import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {installAccessorFixture,oracleInstaller} from './helpers/accessors.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {RuntimeBuilder,slot} from '../src/runtime/abi.js';
import {rootedFn} from '../src/runtime/root-scope.js';
import {prependFunctionBuiltin} from '../src/runtime/function-builtin.js';

const oracleRoundTrip='globalThis.roundTrip=function(d){let o={};Object.defineProperty(o,"x",d);return Object.getOwnPropertyDescriptor(o,"x");};';
const prefix='function show(d){console.log("value" in d,d.value,"writable" in d,d.writable,"get" in d,typeof d.get,"set" in d,typeof d.set,d.enumerable,d.configurable);}';
function native(source:string,presenceOverride?:number){
 const program=generate(lower(bind(parse(lex(prefix+source)))),{gcStress:true});
 const b=new RuntimeBuilder();b.bundle={fragments:program.fragments,functions:program.functions,imports:program.imports};installAccessorFixture(b);
 prependFunctionBuiltin(b,'test.roundTrip','roundTrip',1,'rt.globalObject');
 rootedFn(b,'test.roundTrip.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:6}],a=>{
  a.store(slot(40),'rcx');a.lea('rcx',slot(64));a.mov('rdx','r8');a.call('rt.toPropertyDescriptor');
  // Exercise a valid partial record whose masked-out storage was previously
  // used. Completion must use presence, not stale initialized field contents.
  if(presenceOverride!==undefined){a.mov('rax',presenceOverride);a.store(slot(160),'rax');}
  a.lea('rcx',slot(64));a.call('rt.completePropertyDescriptor');
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.fromPropertyDescriptor');
 });
 return runNative(linkHost(program));
}
for(const [mask,descriptor,expected] of [
 [0,'{value:7,writable:true,enumerable:true,configurable:true}','{value:undefined,writable:false,enumerable:false,configurable:false}'],
 [16,'{get:undefined,set:function(){}}','{get:undefined,set:undefined,enumerable:false,configurable:false}'],
 [32,'{get:function(){},set:undefined}','{get:undefined,set:undefined,enumerable:false,configurable:false}'],
] as const)test('descriptor completion clears absent storage: '+mask,()=>{
 const run=native('show(globalThis.roundTrip('+descriptor+'));',mask);assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(prefix+'show('+expected+');').stdout);
});
const cases:[string,string][]=[
 ['defaults and presence','show(globalThis.roundTrip({}));show(globalThis.roundTrip({value:undefined}));show(globalThis.roundTrip({writable:undefined}));show(globalThis.roundTrip({get:undefined}));show(globalThis.roundTrip({set:undefined}));'],
 ['inherited descriptor fields','show(globalThis.roundTrip({__proto__:{value:3,writable:1,enumerable:"yes",configurable:null}}));'],
 ['boolean conversion never invokes user coercion','let b={valueOf:function(){console.log("unexpected");return 0;}};show(globalThis.roundTrip({value:7,writable:b,enumerable:NaN,configurable:""}));'],
 ['accessor methods preserve identity including bound functions','function g(){return 7;}let s=function(v){}.bind(null),d=globalThis.roundTrip({get:g,set:s});show(d);console.log(d.get===g,d.set===s,d.get());'],
 ['ordered field access and mutation','let d={};globalThis.installAccessor(d,"enumerable",function(){console.log("enumerable");this.configurable=1;return true;},undefined);globalThis.installAccessor(d,"value",function(){console.log("value");this.writable=1;return 7;},undefined);show(globalThis.roundTrip(d));'],
 ['earlier data survives later getter GC','let d={};globalThis.installAccessor(d,"value",function(){delete this.value;return {text:""+42};},undefined);globalThis.installAccessor(d,"writable",function(){d=null;for(let i=0;i<30;i++){({text:""+i});}return true;},undefined);let r=globalThis.roundTrip(d);console.log(r.value.text,r.writable);'],
 ['earlier closure survives later getter GC','let d={};globalThis.installAccessor(d,"get",function(){delete this.get;let x=""+42;return function(){return x;};},undefined);globalThis.installAccessor(d,"set",function(){d=null;for(let i=0;i<30;i++){({text:""+i});}return undefined;},undefined);let r=globalThis.roundTrip(d);console.log(r.get(),r.set);'],
 ['absent fields are checked after earlier getters','let p={writable:true},d={__proto__:p};globalThis.installAccessor(d,"value",function(){delete p.writable;return 8;},undefined);show(globalThis.roundTrip(d));'],
];
for(const [name,source] of cases)test('descriptor conversion: '+name,()=>{
 const run=native(source);assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(oracleInstaller+oracleRoundTrip+prefix+source).stdout);
});
for(const [name,source] of [
 ['primitive','globalThis.roundTrip(3);'],['null','globalThis.roundTrip(null);'],['undefined','globalThis.roundTrip(undefined);'],
 ['noncallable getter','globalThis.roundTrip({get:{}});'],['null setter','globalThis.roundTrip({set:null});'],
 ['mixed undefined fields','globalThis.roundTrip({value:undefined,get:undefined});'],['mixed false writable','globalThis.roundTrip({writable:false,set:undefined});'],
 ['bad get fails before reading set','let d={get:3};globalThis.installAccessor(d,"set",function(){console.log("unexpected");return undefined;},undefined);globalThis.roundTrip(d);'],
 ['mixed descriptor reads set before rejecting','let d={value:3,get:undefined};globalThis.installAccessor(d,"set",function(){console.log("set read");return undefined;},undefined);globalThis.roundTrip(d);'],
])test('descriptor conversion error: '+name,()=>{
 const run=native(source!);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
 const oracle=spawnSync(process.execPath,['-e',oracleInstaller+oracleRoundTrip+source],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(oracle.status,1);assert.equal(run.stdout.toString(),oracle.stdout);
});
