import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
const cases:[string,string][]=[
["catch var initializer writes catch binding","var e=1;try{throw 2;}catch(e){var e=3;console.log(e);}console.log(e);"],
["catch values live across throwing call before later overwrite","function bad(){throw 7;}function f(){let keep={x:\"\"+42};try{bad();keep=null;}catch(e){for(let i=0;i<30;i++){({x:\"\"+i});}console.log(keep.x,e);}}f();"],
["uncaught inner join cleanup preserves outer guard","let a=[{toString(){let b=[{toString(){throw 1;}}];try{b.join();}catch(e){return a.join()+\"ok\";}}}];console.log(a.join());"],
["return expression throws before popping handler","function f(){try{return ({get x(){throw 7;}}).x;}catch(e){return e;}}console.log(f());"],
["closures observe catch var initialization","function f(){try{throw 2;}catch(e){let g=function(){return e;};var e=7;return g;}}console.log(f()());"],
 [
  "primitive throw and optional binding",
  "try{throw 7;}catch(e){console.log(e);}try{throw undefined;}catch{console.log(\"caught\");}"
 ],
 [
  "normal path skips catch",
  "try{console.log(\"try\");}catch(e){console.log(\"bad\");}console.log(\"after\");"
 ],
 [
  "nested frames object and gc",
  "function f(){throw {x:\"\"+42};}function g(){f();}try{g();}catch(e){for(let i=0;i<30;i++){({s:\"\"+i});}console.log(e.x);}console.log(\"alive\");"
 ],
 [
  "catch local mutation survives gc",
  "function f(){let x={v:1};try{x={v:2};throw 3;}catch(e){for(let i=0;i<20;i++){({s:\"\"+i});}console.log(x.v,e);}}f();"
 ],
 [
  "nested catch rethrow",
  "try{try{throw {x:7};}catch(e){console.log(e.x);throw e;}}catch(e){console.log(e.x+1);}"
 ],
 [
  "return removes handler",
  "function f(){try{return 7;}catch(e){return 8;}}console.log(f());try{throw 9;}catch(e){console.log(e);}"
 ],
 [
  "loop abrupt exits remove handlers",
  "for(let i=0;i<4;i++){try{if(i===0)continue;if(i===2)break;console.log(i);}catch(e){console.log(\"bad\");}}try{throw 7;}catch(e){console.log(e);}"
 ],
 [
  "outer loop continue and break",
  "let n=0;outer:for(let i=0;i<3;i++){try{while(true){n++;if(i===0)continue outer;break outer;}}catch(e){console.log(\"bad\");}}console.log(n);try{throw 3;}catch(e){console.log(e);}"
 ],
 [
  "nested handler local return keeps outer",
  "function f(){try{return 1;}catch(e){return 2;}}try{console.log(f());throw 7;}catch(e){console.log(e);}"
 ],
 [
  "catch binding closure per invocation",
  "function f(n){try{throw n;}catch(e){return function(){return e;};}}let a=f(1),b=f(2);console.log(a(),b());"
 ],
 [
  "catch binding shadow and var hoisting",
  "let e=7;try{throw 3;}catch(e){var x=e;console.log(e);}console.log(e,x);"
 ],
 [
  "getter callback throw",
  "let o={get x(){throw {n:3};}};try{console.log(o.x);}catch(e){console.log(e.n);}"
 ],
 [
  "coercion callback throw",
  "let o={toString(){throw \"key\";}};try{({})[o]=3;}catch(e){console.log(e);}"
 ],
 [
  "join guard cleaned after escape",
  "let a=[{toString(){throw 7;}}];try{a.join();}catch(e){console.log(e);}a[0]=3;console.log(a.join());"
 ],
 [
  "nested join guards cleaned",
  "let inner=[{toString(){throw 7;}}],outer=[inner];try{outer.join();}catch(e){console.log(e);}inner[0]=4;console.log(inner.join(),outer.join());"
 ],
 [
  "catch inside conversion preserves active outer guard",
  "let a=[{toString(){try{throw 1;}catch(e){return a.join()+\"ok\";}}}];console.log(a.join());"
 ],
 [
  "partial descriptor collection throws before commit",
  "let o={},p={a:{value:1},get b(){throw 7;}};try{Object.defineProperties(o,p);}catch(e){console.log(e,o.a);}"
 ],
 [
  "receiver newtarget survive caught exception",
  "function F(){this.x=7;try{throw 3;}catch(e){console.log(this.x,new.target===F,e);}}new F();"
 ],
 [
  "setter and apply bound stack cleanup",
  "function f(){throw 7;}let b=f.bind(null);try{b.apply(null,[1,2]);}catch(e){console.log(e);}let o={set x(v){throw v;}};try{o.x=9;}catch(e){console.log(e);}"
 ],
 [
  "repeated catches and live closures",
  "let sum=0;for(let i=0;i<100;i++){try{throw {x:i};}catch(e){sum+=e.x;}}console.log(sum);"
 ]
];
function native(source:string){return runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));}
for(const [name,source] of cases)test('Explicit exceptions: '+name,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.toString(),runOracle(source).stdout);});

for(const source of ["throw\n1;","try {}","try{}catch(e){let e=1;}"])test("exception syntax rejects "+source,()=>{assert.throws(()=>bind(parse(lex(source))));});
