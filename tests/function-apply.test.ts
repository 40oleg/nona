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
 ['apply forwards receiver and array values','function f(a,b){return this.x+a+b;}console.log(f.apply({x:8},[2,3]));'],
 ['apply accepts nullish lists','function f(){return arguments.length;}console.log(f.apply(),f.apply(null),f.apply(null,null),f.apply(null,undefined));'],
 ['apply reads generic inherited array-like properties','function f(a,b,c){console.log(arguments.length,a,b,c);}let p={1:7,length:"3"};let o={__proto__:p,0:2};f.apply(null,o);'],
 ['apply holes become undefined arguments','function f(){console.log(arguments.length,0 in arguments,arguments[0],arguments[1]);}f.apply(null,[,8]);'],
 ['apply floors length and clamps negative and NaN','function f(){return arguments.length;}console.log(f.apply(null,{length:2.9}),f.apply(null,{length:-3}),f.apply(null,{length:NaN}),f.apply(null,{}));'],
 ['apply consumes arguments object','function f(a,b){return a+b;}function g(){return f.apply(null,arguments);}console.log(g(4,7));'],
 ['apply snapshots values before target body','let a=[1,2];function f(x,y){a[0]=9;return x+y;}console.log(f.apply(null,a),a[0]);'],
 ['apply and call compose','function f(a,b){return this.x+a+b;}console.log(f.apply.call(f,{x:3},[4,5]),f.call.apply(f,[{x:7},8,9]));'],
 ['apply boxes receiver and accepts boxed string list','function receiver(){return this;}function f(a,b){return a+b+this;}let s=receiver.call("ab");console.log(f.apply(3,s));'],
 ['apply metadata','function f(){}console.log(f.apply.name,f.apply.length,typeof f.apply,"prototype" in f.apply);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of ['function f(){}f.apply(null,"abc");','function f(){}f.apply(null,3);','function f(){}let a=f.apply;a(null,[]);','function f(){}new f.apply();','function f(){}f.apply(null,{length:Infinity});','function f(){}f.apply(null,{length:65537});'])test('apply protocol or resource error: '+source,()=>{
 const result=compile(source,{fileName:'apply-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});

test('nested apply buffers and temporary targets survive stress GC',()=>{
 const source='function factory(n){return function(a){if(n)return factory(n-1).apply({x:n},[{text:a.text+this.x}]);return a.text+this.x;};}console.log(factory(12).apply({x:13},[{text:"v"}]));';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('apply root scopes and copied argument buffers are released after return',()=>{
 const source='{let f=function(a){return a;};for(let i=0;i<20;i++){f.apply(null,[{x:i}]);}}';
 const program=generate(lower(bind(parse(lex(source)))),{gcStress:true});
 const a=new Assembler('test.applyCleanup');a.sub('rsp',40);const prologSize=a.offset;
 a.call('rt.collect');a.load('rax',{rip:'rt.liveBytes'});a.test('rax','rax');a.jcc('ne','test.applyCleanup.fail');
 a.load('rax',{rip:'rt.gcRoots'});a.test('rax','rax');a.jcc('ne','test.applyCleanup.fail');
 a.call('rt.dispose');a.add('rsp',40);a.ret();a.label('test.applyCleanup.fail');a.mov('rcx',42);a.callImport('ExitProcess');a.label('test.applyCleanup.end');
 program.fragments.find(f=>f.name==='entry')!.fixups.find(f=>f.target==='rt.dispose')!.target='test.applyCleanup';
 program.fragments.push({...a.finish(),name:'test.applyCleanup',section:'.text'});
 program.functions.push({begin:'test.applyCleanup',end:'test.applyCleanup.end',prologSize,stackAllocation:40,savedRegisters:[]});
 const run=runNative(linkPe(program));assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
});
test('apply copied heap argument buffer survives target stress GC and source mutation',()=>{
 const source='let list=[{text:""+42},""+57];function f(a,b){list=null;for(let i=0;i<50;i++){({x:i});}return a.text+b+arguments[0].text;}console.log(f.apply(null,list));';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
