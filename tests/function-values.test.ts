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
import {linkPe} from '../src/backend/pe/writer.js';

const cases:[string,string][]=[
 ['alias and typeof','function add(a,b){return a+b;}let f=add;console.log(f(2,3),f===add,typeof f,!!f);'],
 ['passed callbacks','function twice(f,x){return f(f(x));}function inc(x){return x+1;}console.log(twice(inc,3));'],
 ['returned functions and method calls','function inc(x){return x+1;}function choose(){return inc;}const o={run:choose()};console.log(o.run(4),choose()(8),[inc][0](10));'],
 ['mutable declaration bindings','console.log(f(3));function f(x){return x+1;}function g(x){return x*2;}let alias=f;f=g;console.log(f(3),alias(3));'],
 ['callee resolved before argument side effects','function f(x){return x+1;}function g(x){return x*10;}function arg(){f=g;return 3;}console.log(f(arg()),f(3));'],
 ['var redeclaration preserves hoisted function','var f;console.log(f(2));function f(x){return x*3;}'],
 ['function objects carry writable properties','function f(){return 1;}f.counter=4;f.counter++;const a=[f,f];console.log(a[0].counter,a[0]===a[1],delete f.counter,f.counter);'],
 ['shadowed callable and missing arguments','function f(x){return x;}function apply(f){return f();}console.log(apply(f));'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
test('function values stay rooted through indirect calls under GC stress',()=>{
 const source='function keep(f){let a={f:f};for(let i=0;i<10;i++){a[i]=""+i;}return a.f;}function add(x){return x+2;}let f=keep(add);add=null;console.log(f(4),typeof f);';
 const image=linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true}));
 const run=runNative(image);assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
for(const source of ['let f=3;f();','let a={};a.missing();','undefined();'])test(`noncallable runtime error: ${source}`,()=>{
 const compiled=compile(source,{fileName:'noncallable.js',target:'win32-x64'});assert.equal(compiled.ok,true);if(!compiled.ok)return;
 const run=runNative(compiled.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
