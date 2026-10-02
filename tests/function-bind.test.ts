import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {Assembler} from '../src/backend/x64/assembler.js';

const cases:[string,string][]=[
 ['bind captures receiver and prepends arguments','function f(a,b,c){return this.x+a+b+c;}let g=f.bind({x:1},2);console.log(g(3,4),g.call({x:9},3,4),g.apply(null,[3,4]));'],
 ['rebinding keeps earliest receiver and argument order','function f(a,b,c){return this.x+a*100+b*10+c;}let g=f.bind({x:1},2).bind({x:9},3);console.log(g(4),g.name,g.length);'],
 ['bind snapshots values but shares objects','function f(a,b){return a+b.x+this.x;}let a=2,b={x:3},o={x:4};let g=f.bind(o,a,b);a=9;b.x=5;o.x=6;console.log(g());'],
 ['bound primitive this is freshly boxed on every call','function f(){return this;}let g=f.bind(3),a=g(),b=g();console.log(typeof a,a+1,a===b);'],
 ['bound missing and nullish receiver use target sloppy rules','let global=this;function f(){return this===global;}console.log(f.bind()(),f.bind(null)(),f.bind(undefined)());'],
 ['bound metadata is readonly configurable with no own prototype','function f(a,b,c){}let g=f.bind(null,1);console.log(g.name,g.length,typeof g,"prototype" in g,g.__proto__===f.__proto__);g.name="x";g.length=9;console.log(g.name,g.length,delete g.name,delete g.length,g.name,g.length);'],
 ['bound length uses own numeric property only','function f(a,b){}let bind=f.bind;delete f.length;f.__proto__={length:9};console.log(bind.call(f,null).length);f.length="8";console.log(bind.call(f,null).length);delete f.length;f.length=3.9;console.log(bind.call(f,null,1).length);delete f.length;f.length=Infinity;console.log(bind.call(f,null,1).length);'],
 ['bound name accepts only strings and reads inherited name','function f(){}let bind=f.bind;delete f.name;f.__proto__={name:"inherited"};f.name=3;console.log(bind.call(f).name);delete f.name;console.log(bind.call(f).name);'],
 ['bind copies target internal prototype at creation','function f(){}let bind=f.bind,p={x:7};f.__proto__=p;let g=bind.call(f);console.log(g.__proto__===p,g.x);f.__proto__=null;console.log(g.__proto__===p);'],
 ['bound construction ignores bound receiver and uses target prototype','function C(a,b){this.sum=a+b;}let recv={sum:0};let B=C.bind(recv,4);let o=new B(5);console.log(o.sum,recv.sum,o instanceof B,o instanceof C,o.constructor===C);'],
 ['nested bound construction and custom bound prototype','function C(a,b){this.sum=a+b;}let B=C.bind({x:1},2).bind(null,3);B.prototype={wrong:9};C.prototype={right:7};let o=new B;console.log(o.sum,o.right,o.wrong,o instanceof B,o instanceof C);'],
 ['bound constructor return override','function C(){return {x:8};}function D(){this.x=9;return 3;}console.log((new (C.bind(null))).x,(new (D.bind(null))).x);'],
 ['bound instanceof follows target even with own prototype','function C(){}let B=C.bind(null),o=new C;B.prototype={};console.log(o instanceof B,3 instanceof B,{} instanceof B);C.prototype={};console.log(o instanceof B);'],
 ['binding native call and apply keeps raw target receiver','function f(a,b){return this.x+a+b;}let c=f.call.bind(f,{x:2},3),a=f.apply.bind(f,{x:4},[5,6]);console.log(c(7),a());'],
 ['bind method metadata','function f(){}console.log(f.bind.name,f.bind.length,"prototype" in f.bind);'],
 ['bound length handles zero NaN negative fractional and huge values','function f(){}let bind=f.bind;delete f.length;f.__proto__=null;let values=[NaN,-Infinity,-3,0,0.9,2.9,1e30];for(let i=0;i<values.length;i++){f.length=values[i];console.log(bind.call(f,null,1).length);}'],
 ['bound constructor reads target prototype after caller arguments','function C(a,b){this.sum=a+b;}let B=C.bind(null,2);function arg(){C.prototype={x:8};return 3;}let o=new B(arg());console.log(o.sum,o.x);'],
 ['Reflect.construct with nested and unrelated bound newTarget','function A(){this.seen=new.target;}function B(){}let C=A.bind(null),D=C.bind(null),E=B.bind(null);let x=Reflect.construct(D,[],C),y=Reflect.construct(A,[],E);console.log(x.seen===A,Object.getPrototypeOf(x)===A.prototype,y.seen===E,Object.getPrototypeOf(y)===Object.prototype);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of ['function f(){}let b=f.bind;b();','function f(){}f.bind.call(3);','function f(){}new f.bind();','function f(){}let B=f.call.bind(f);new B();','function f(){}f.bind(null,1).apply(null,{length:65536});'])test('bind protocol or resource error: '+source,()=>{
 const result=compile(source,{fileName:'bind-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});

test('bound cycles buffers and root scopes are released after calls and construction',()=>{
 const source='{let recv={};let f=function(x){this.x=x;};let b=f.bind(recv,{text:""+42});recv.b=b;b();let c=new b();b=null;c=null;recv=null;}';
 const program=generate(lower(bind(parse(lex(source)))),{gcStress:true});
 const a=new Assembler('test.boundCleanup');a.sub('rsp',40);const prologSize=a.offset;
 a.call('rt.collect');a.load('rax',{rip:'rt.liveBytes'});a.test('rax','rax');a.jcc('ne','test.boundCleanup.fail');
 a.load('rax',{rip:'rt.gcRoots'});a.test('rax','rax');a.jcc('ne','test.boundCleanup.fail');
 a.call('rt.dispose');a.add('rsp',40);a.ret();a.label('test.boundCleanup.fail');a.mov('rcx',42);a.callImport('ExitProcess');a.label('test.boundCleanup.end');
 program.fragments.find(f=>f.name==='entry')!.fixups.find(f=>f.target==='rt.dispose')!.target='test.boundCleanup';
 program.fragments.push({...a.finish(),name:'test.boundCleanup',section:'.text'});
 program.functions.push({begin:'test.boundCleanup',end:'test.boundCleanup.end',prologSize,stackAllocation:40,savedRegisters:[]});
 const run=runNative(linkHost(program));assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
});
for(const source of [
 'function make(){let x=""+42;return function(a){for(let i=0;i<30;i++){({i:i});}return x+a.text+this.text;}.bind({text:""+57},{text:""+68});}let f=make();console.log(f(),f());',
 'function C(a,b){for(let i=0;i<40;i++){({i:i});}this.text=a.text+b.text;}let B=C.bind(null,{text:""+42}).bind(null,{text:""+57});let o=new B;B=null;C=null;console.log(o.text);',
 'function f(n,a){if(n)return f.bind(this,n-1,a)();return a.text+this.text;}console.log(f.bind({text:""+42},12,{text:""+57})());',
])test('bound data and combined argv survive GC: '+source,()=>{
 const run=runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
