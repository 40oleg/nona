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
import {linkPe} from '../src/backend/pe/writer.js';
import {Assembler} from '../src/backend/x64/assembler.js';

const cases:[string,string][]=[
 ['call passes receiver and arguments','function f(a,b){return this.x+a+b;}console.log(f.call({x:8},2,3));'],
 ['call substitutes global only in target sloppy function','let global=this;function f(){return this===global;}console.log(f.call(),f.call(null),f.call(undefined));'],
 ['call can call itself','function f(a){return this.x+a;}console.log(f.call.call(f,{x:7},3));'],
 ['call metadata and prototype','function f(){}let c=f.call;console.log(c.name,c.length,typeof c,c.__proto__===f.__proto__,"prototype" in c);'],
 ['numeric and boolean receiver boxes','function f(){return this;}let a=f.call(3),b=f.call(true);console.log(typeof a,a+2,typeof b,b+2,a===f.call(3));'],
 ['boxed string length and indices','function f(){return this;}let s=f.call("ab");console.log(typeof s,s.length,s[0],s[1],0 in s,2 in s,""+s);s[0]="x";s.length=9;console.log(s[0],s.length,delete s[0],delete s.length);'],
 ['primitive prototypes participate in member lookup','function f(){return this+1;}let p=(3).__proto__;p.extra=f;console.log((8).extra(),(9).__proto__===p);delete p.extra;'],
 ['string and boolean primitive prototypes','let sp="x".__proto__,bp=true.__proto__;sp.extra=function(){return this.length;};bp.extra=function(){return +this;};console.log("abc".extra(),true.extra(),false.extra());'],
 ['boxing is fresh and object receiver stays identical','function f(){return this;}let o={};let n=f.call(3);n.x=8;console.log(f.call(o)===o,n.x,f.call(3).x,n.__proto__===(3).__proto__);'],
 ['call argument order preserves method and target','let trace="";function f(a){return this.x+a;}let o={x:4};function arg(){trace+="a";f.call=0;return 2;}console.log(f.call(o,arg()),trace);'],
 ['call passes extras to arguments object','function f(a){return arguments.length+arguments[2]+this.x;}console.log(f.call({x:1},2,3,4));'],
 ['inherited boxed string indices and length stay readonly','function f(){return this;}let p=f.call("ab"),o={__proto__:p};console.log(o[0],o.length,0 in o);o[0]="x";o.length=9;console.log(o[0],o.length,delete o[0]);'],
 ['boxed number and boolean convert to string in keys and arrays','function f(){return this;}let n=f.call(3),b=f.call(true),o={};o[n]=8;o[b]=9;console.log(o[3],o.true,""+[n,b],n,b);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of ['function f(){}let c=f.call;c();','function f(){}f.call.call(3);','function f(){}new f.call();'])test('call protocol error: '+source,()=>{
 const result=compile(source,{fileName:'call-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
test('deleted static call property does not retain its former heap value',()=>{
 const source='{let f=function(){};let p=f.__proto__;p.call={x:1};delete p.call;}';
 const program=generate(lower(bind(parse(lex(source)))));
 const a=new Assembler('test.deletedStatic');a.sub('rsp',40);const prologSize=a.offset;
 a.call('rt.collect');a.load('rax',{rip:'rt.liveBytes'});a.test('rax','rax');a.jcc('ne','test.deletedStatic.fail');
 a.load('rax',{rip:'rt.gcRoots'});a.test('rax','rax');a.jcc('ne','test.deletedStatic.fail');
 a.call('rt.dispose');a.add('rsp',40);a.ret();a.label('test.deletedStatic.fail');a.mov('rcx',42);a.callImport('ExitProcess');a.label('test.deletedStatic.end');
 program.fragments.find(f=>f.name==='entry')!.fixups.find(f=>f.target==='rt.dispose')!.target='test.deletedStatic';
 program.fragments.push({...a.finish(),name:'test.deletedStatic',section:'.text'});
 program.functions.push({begin:'test.deletedStatic',end:'test.deletedStatic.end',prologSize,stackAllocation:40,savedRegisters:[]});
 const run=runNative(linkPe(program));assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
});
for(const source of [
 'function f(n){if(n)return f.call(this,n-1);return this.text;}console.log(f.call({text:""+42},20));',
 'function f(){for(let i=0;i<40;i++){({x:i});}return this;}let s=f.call("x"+42);console.log(s[0],s.length,""+s);',
 'function f(){}let c=f.call;c.cache={text:""+42};c=null;for(let i=0;i<40;i++){({x:i});}console.log(f.call.cache.text);',
])test('call and boxing survive stress GC: '+source,()=>{
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
