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

const cases:[string,string][]=[
 ['argument count includes extra values','function f(a){console.log(arguments.length,arguments[0],arguments[1],arguments[2],arguments.callee===f);}f(2,3);f();'],
 ['arguments alias parameter writes in both directions','function f(a,b){a=8;console.log(arguments[0]);arguments[1]=9;console.log(b);arguments[0]++;console.log(a);}f(1,2);'],
 ['missing parameters have no argument mapping','function f(a){a=8;console.log(arguments.length,arguments[0],0 in arguments);arguments[0]=9;console.log(a,arguments[0]);}f();'],
 ['deleting mapped index disconnects it','function f(a){delete arguments[0];a=8;console.log(arguments[0],0 in arguments);arguments[0]=9;console.log(a,arguments[0]);}f(1);'],
 ['argument length is ordinary property','function f(a,b){arguments.length=0;console.log(arguments[0],arguments[1],arguments.length);arguments[5]=9;console.log(arguments.length);}f(1,2);'],
 ['returned arguments retains parameter cells','function f(a){let get=function(){return a;};return {args:arguments,get:get};}let pair=f(3);pair.args[0]=8;console.log(pair.get());'],
 ['arguments binding can be replaced without breaking mapping','function f(a){let saved=arguments;arguments=null;a=7;console.log(saved[0],arguments);}f(1);'],
 ['var arguments preserves implicit object','function f(a){var arguments;return arguments[0];}console.log(f(5));'],
 ['parameter named arguments shadows implicit object','function f(arguments){return arguments;}console.log(f(8));'],
 ['lexical and function arguments declarations shadow implicit object','function f(){let arguments=7;return arguments;}function g(){return arguments();function arguments(){return 8;}}console.log(f(),g());'],
 ['ordinary nested functions each get their own arguments','function f(a){function g(){return arguments[0];}return g(9)+arguments[0];}console.log(f(2));'],
 ['named expression arguments is shadowed by implicit binding','let f=function arguments(x){return arguments[0];};console.log(f(7));'],
 ['arguments callee supports anonymous recursion','let f=function(n){return n?arguments.callee(n-1)+1:0;};console.log(f(5));'],
 ['arguments is object with Arguments string tag','function f(){return arguments;}let a=f(1,2);console.log(typeof a,""+a,a.__proto__==={}.__proto__);'],
 ['constructor receives arguments','function C(a){this.value=arguments[0];this.count=arguments.length;}let o=new C(7,8);console.log(o.value,o.count);'],
 ['arguments callee and length can be deleted','function f(){console.log(delete arguments.callee,delete arguments.length,arguments.callee,arguments.length);}f(1);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
test('escaped arguments and closures share cells through stress GC',()=>{
 const source='function f(a){let args=arguments;return {args:args,set:function(n){a=n;}};}let p=f(""+42);for(let i=0;i<30;i++){({x:i});}p.set(""+57);console.log(p.args[0]);p.args[0]=""+8;console.log(p.args[0]);';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
