import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {compile} from '../src/compiler.js';

const cases:[string,string][]=[
 ['declarations expose name and parameter length','function foo(a,b,c){}console.log(foo.name,foo.length);'],
 ['anonymous variable and assignment names','let foo=function(a){};let bar;bar=(function(a,b){});console.log(foo.name,foo.length,bar.name,bar.length);'],
 ['explicit function name wins over context','let other=function own(a,b){};let o={property:function named(){}};console.log(other.name,other.length,o.property.name);'],
 ['computed and numeric property names','let k="prefix"+3;let o={[k]:function(a){},7:function(){},plain:function(a,b){}};console.log(o[k].name,o[7].name,o.plain.name,o.plain.length);'],
 ['inference does not cross conditional comma or return','let f=true?function(){}:function(){};let g=(0,function(){});function make(){return function(){};}console.log(f.name==="",g.name==="",make().name==="");'],
 ['member assignment and proto setter do not infer name','let o={};o.x=function(){};let p={__proto__:function(){}};console.log(o.x.name==="",p.__proto__.name==="");'],
 ['metadata assignment ignored until deleted','function f(a,b){}f.name="x";f.length=9;console.log(f.name,f.length);console.log(delete f.name,delete f.length);f.name="changed";f.length=5;console.log(f.name,f.length);'],
 ['inherited metadata remains readonly','function f(a,b){}let o={__proto__:f};o.name="changed";o.length=8;console.log(o.name,o.length);delete f.name;delete f.length;f.name="replacement";f.length=4;console.log(o.name,o.length);'],
 ['literal own properties override inherited readonly metadata','function f(a){}let o={__proto__:f,name:"own",length:8};console.log(o.name,o.length);'],
 ['inferred name is not a named-expression binding','let f=function(){return f;};let original=f;f=4;console.log(original(),original.name);'],
 ['Function prototype is shared callable and has no own prototype','function f(){}function g(){}let p=f.__proto__;console.log(p===g.__proto__,typeof p,p(),p.name==="",p.length,"prototype" in p,p.__proto__==={}.__proto__);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
test('dynamic computed function name survives stress GC',()=>{
 const source='function make(n){let key="f"+n;return {[key]:function(a,b){return a+b;}}[key];}let f=make(42);for(let i=0;i<30;i++){({x:i});}console.log(f.name,f.length,f(2,3));';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('Function prototype is not constructable even with a prototype property',()=>{
 const result=compile('function f(){}let p=f.__proto__;p.prototype={};new p();',{fileName:'prototype-error.js',target:'win32-x64'});
 assert.equal(result.ok,true);if(!result.ok)return;const run=runNative(result.image);
 assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
test('static Function prototype retains dynamic properties through stress GC',()=>{
 const source='let p=(function(){}).__proto__;p.cache={text:""+42};p=null;for(let i=0;i<30;i++){({x:i});}console.log((function(){}).__proto__.cache.text);';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
