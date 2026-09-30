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
 [
  "compound write rereads mutated home prototype",
  "let o={__proto__:{get x(){Object.setPrototypeOf(o,{x:20});return 3;}},m(){super.x+=4;}};o.m();console.log(o.x,Object.getOwnPropertyDescriptor(o,\"x\").value);"
 ],
 [
  "lookup and receiver",
  "let p={x:2,m(){return this.x;}},o={__proto__:p,x:7,m(){return super.m()+super.x;}};console.log(o.m(),o.m.call({x:9}));"
 ],
 [
  "home object retained when method borrowed",
  "let p={x:3},o={__proto__:p,m(){return super.x;}},f=o.m;o=null;p=null;for(let i=0;i<30;i++){({x:\"\"+i});}console.log(f.call({x:9}));"
 ],
 [
  "dynamic home prototype",
  "let o={__proto__:{x:1},m(){return super.x;}};console.log(o.m());Object.setPrototypeOf(o,{x:7});console.log(o.m());"
 ],
 [
  "get set original receiver",
  "let p={get x(){return this.n;},set x(v){this.n=v;}},o={__proto__:p,n:1,m(v){super.x=v;return super.x;}};console.log(o.m(8),o.n,p.n);"
 ],
 [
  "super data writes own receiver without its inherited setter",
  "let n=0,p={x:1},o={__proto__:p,m(){super.x=7;}},r={__proto__:{set x(v){n=v;}}};o.m.call(r);console.log(r.x,n,p.x);"
 ],
 [
  "receiver accessor blocks data write",
  "let n=0,o={__proto__:{x:1},m(){super.x=7;}},r={set x(v){n=v;}};o.m.call(r);console.log(n,Object.getOwnPropertyDescriptor(r,\"x\").value);"
 ],
 [
  "nonwritable base blocks writes",
  "let p={};Object.defineProperty(p,\"x\",{value:1});let o={__proto__:p,m(){super.x=7;}};o.m();console.log(o.x,Object.keys(o).join(\"|\"));"
 ],
 [
  "missing base property creates receiver data",
  "let o={m(){super.x=7;}};o.m();console.log(o.x);"
 ],
 [
  "compound update",
  "let p={x:3},o={__proto__:p,m(){console.log(super.x++);super.x+=2;return this.x;}};console.log(o.m(),p.x);"
 ],
 [
  "computed key and RHS order",
  "let o={__proto__:{x:3},m(){let k={toString(){console.log(\"key\");return \"x\";}};super[k]=(console.log(\"rhs\"),7);return this.x;}};console.log(o.m());"
 ],
 [
  "key coercion changes home prototype",
  "let o={__proto__:{x:1},m(){return super[{toString(){Object.setPrototypeOf(o,{x:8});return \"x\";}}];}};console.log(o.m());"
 ],
 [
  "base resolved after RHS",
  "let o={__proto__:{set x(v){this.n=v;}},m(){super.x=(Object.setPrototypeOf(o,{}),7);}};o.m();console.log(o.n,o.x);"
 ],
 [
  "getters use super and bounds retain home",
  "let o={__proto__:{x:4},get x(){return super.x+1;},m(){return super.x;}};let b=o.m.bind({x:9});console.log(o.x,b());"
 ],
 [
  "array and string exotic bases",
  "let o={__proto__:[1,2],m(){return super.length+super[0];}},s={__proto__:new String(\"ab\"),m(){return super.length+super[1];}};console.log(o.m(),s.m());"
 ],
 [
  "super setters with gc",
  "let o={__proto__:{set x(v){for(let i=0;i<30;i++){({s:\"\"+i});}this.n=v;}},m(){super.x={v:7};return this.n.v;}};console.log(o.m());"
 ],
 [
  "frozen receiver rejects super data write",
  "let o={__proto__:{x:1},m(){super.x=3;return this.x;}};let r=Object.freeze({x:7});console.log(o.m.call(r),o.m.call(Object.preventExtensions({})));"
 ]
];
function native(source:string){return runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));}
for(const [name,source] of cases)test('Super property: '+name,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.toString(),runOracle(source).stdout);});
for(const source of ["let o={m(){delete super[(console.log(\"expr\"),{toString(){console.log(\"key\");return \"x\";}})];}};o.m();","let o={__proto__:null,m(){return super[{toString(){console.log(\"key\");return \"x\";}}];}};o.m();","let o={__proto__:null,m(){return super.x;}};o.m();","let o={__proto__:null,m(){super.x=3;}};o.m();"])test('Super property error: '+source,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,1);assert.match(r.stderr.toString(),/Nona runtime error/);const n=spawnSync(process.execPath,['-e',source],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(n.status,1);assert.equal(r.stdout.toString(),n.stdout);});

for(const source of ["super.x;","function f(){return super.x;}","({m(){return function(){return super.x;};}});","({m(){return super;}});","({m(){super();}});"])test("super invalid context "+source,()=>{assert.throws(()=>bind(parse(lex(source))));});
