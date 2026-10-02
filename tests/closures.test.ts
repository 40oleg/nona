import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compile} from '../src/compiler.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {Assembler} from '../src/backend/x64/assembler.js';

const cases:[string,string][]=[
 ['function expressions and IIFE','let f=function(x){return x*2;};console.log(f(3),(function(x){return x+1;})(8));'],
 ['counter factories are independent','function counter(n){return function(){return ++n;};}let a=counter(2),b=counter(10);console.log(a(),a(),b(),a());'],
 ['closures share writes through one binding','function pair(){let x=1;return {get:function(){return x;},set:function(n){x=n;}};}let p=pair();p.set(8);console.log(p.get());'],
 ['capture forwarded across unused intermediate scope','function outer(x){return function(){return function(){return ++x;};};}let middle=outer(4),a=middle(),b=middle();console.log(a(),b(),a());'],
 ['nested function declarations are hoisted','function outer(x){return inner(2);function inner(y){return x+y;}}console.log(outer(5));'],
 ['nested mutually recursive closures','function make(x){function even(n){return n?odd(n-1):x;}function odd(n){return n?even(n-1):!x;}return even;}console.log(make(true)(8),make(true)(9));'],
 ['named expression self binding survives outer replacement','let f=function fact(n){return n<2?1:n*fact(n-1);};let g=f;f=0;console.log(g(6),typeof fact);'],
 ['named expression assignment is ignored in sloppy mode','let f=function self(){self=3;return typeof self;};console.log(f());'],
 ['parameter shadows named expression self binding','let f=function self(self){return self;};console.log(f(7));'],
 ['block captures escape their source scopes','let f;{let x=3;f=function(){return x;};x=9;}console.log(f());'],
 ['for let cells are separate per iteration','let a=[];for(let i=0;i<3;i++){a[i]=function(){return i;};}console.log(a[0](),a[1](),a[2]());'],
 ['for var cells are shared','function make(){let a=[];for(var i=0;i<3;i++){a[i]=function(){return i;};}return a;}let a=make();console.log(a[0](),a[1](),a[2]());'],
 ['for initial environment differs from iteration environment','let start,a=[];for(let i=(start=function(){return i;},0);i<3;i++){a[i]=function(){return i;};}console.log(start(),a[0](),a[2]());'],
 ['loop continue preserves iteration captures','let a=[];for(let i=0;i<4;i++){if(i===1)continue;let x=i*2;a[i]=function(){return x+i;};}console.log(a[0](),a[2](),a[3]());'],
 ['captured hoisted var starts undefined','function make(){return function(){return x;};var x=2;}console.log(make()());'],
 ['capture created before lexical initialization','function make(){let f=function(){return x;};let x=6;return f;}console.log(make()());'],
 ['fresh function expression identity','function make(){return function(){return 1;};}console.log(make()===make());'],
 ['last hoisted function declaration wins','console.log(f());function f(){return 1;}function f(){return 2;}'],
 ['named expression local var shadows self name','let f=function self(){var self;return self;};console.log(f());'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of [
 'function f(){let g=function(){return x;};g();let x=1;}f();',
 'function f(){const x=1;return function(){x=2;};}f()();',
])test(`captured binding runtime error: ${source}`,()=>{
 const result=compile(source,{fileName:'capture-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
test('source closures survive stress GC after their factory returned',()=>{
 const source='function factory(n){let text=""+n;return {inc:function(){return ++n;},get:function(){return text+n;}};}let p=factory(10);console.log(p.inc(),p.get(),p.inc());';
 const image=linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true}));
 const run=runNative(image);assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
for(const [name,source] of [
 ['unrelated factory objects','function factory(){let junk=null;for(let i=0;i<3000;i++){junk={next:junk};}let x=42;return function(){return x;};}let f=factory();console.log(f());'],
 ['unreachable recursive closures','function factory(){function self(){return self;}return self;}for(let i=0;i<1000;i++){factory();}console.log("collected");'],
] as const)test(`source closure GC releases ${name}`,()=>{
 const program=generate(lower(bind(parse(lex(source)))));
 const a=new Assembler('test.retention');a.sub('rsp',40);const prologSize=a.offset;
 a.call('rt.collect');a.load('rax',{rip:'rt.liveBytes'});a.cmp('rax',4096);a.jcc('a','test.retention.fail');
 // Global function bindings remain, but the unreachable graphs must be reclaimed.
 a.test('rax','rax');a.jcc('e','test.retention.fail');a.call('rt.dispose');a.add('rsp',40);a.ret();
 a.label('test.retention.fail');a.mov('rcx',42);a.callImport('ExitProcess');a.label('test.retention.end');
 program.fragments.find(f=>f.name==='entry')!.fixups.find(f=>f.target==='rt.dispose')!.target='test.retention';
 program.fragments.push({...a.finish(),name:'test.retention',section:'.text'});
 program.functions.push({begin:'test.retention',end:'test.retention.end',prologSize,stackAllocation:40,savedRegisters:[]});
 const run=runNative(linkHost(program));assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
