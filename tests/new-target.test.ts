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
import {linkHost} from './helpers/program.js';
const cases:[string,string][]=[
 [
  "call versus construction",
  "function F(){console.log(new.target===F,typeof new.target);}F();new F();F.call({});F.apply(null,[]);"
 ],
 [
  "bound constructor targets original function",
  "function F(){console.log(new.target===F,new.target.name);}let B=F.bind(null),C=B.bind({});new B();new C();"
 ],
 [
  "bound normal call undefined",
  "function F(){return new.target;}console.log(F.bind(null)());"
 ],
 [
  "nested normal calls reset new target",
  "function inner(){return new.target;}function F(){console.log(new.target===F,inner());}new F();"
 ],
 [
  "nested constructors retain each frame target",
  "function G(){console.log(new.target===G);}function F(){new G();console.log(new.target===F);}new F();"
 ],
 [
  "value survives rebinding and gc",
  "let F=function(){let target=new.target;F=null;for(let i=0;i<30;i++){({s:\"\"+i});}console.log(target===new.target,new.target.name);};new F();"
 ],
 [
  "methods and accessors receive undefined",
  "let o={m(){return new.target;},get x(){return new.target;}};console.log(o.m(),o.x);"
 ],
 [
  "new target is function value",
  "function F(){if(new.target)return new.target;return 7;}console.log(new F()===F,F());"
 ],
 [
  "nested ordinary closure has own new target",
  "function F(){return function(){return new.target;};}let f=new F();console.log(f(),new f()===f);"
 ],
 [
  "constructor target with overridden prototype",
  "function F(){console.log(new.target===F);}F.prototype=3;new F();"
 ],
 [
  "read after nested method gc",
  "function F(){let o={m(){for(let i=0;i<20;i++){({x:\"\"+i});}return new.target;}};console.log(o.m(),new.target===F);}new F();"
 ]
];
function native(source:string){return runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));}
for(const [name,source] of cases)test('New target: '+name,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.toString(),runOracle(source).stdout);});

for(const source of ["new.target;","new.other;","function f(){new.t\\u0061rget;}"])test("invalid new.target "+source,()=>{assert.throws(()=>bind(parse(lex(source))));});
