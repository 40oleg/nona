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
["escaped method name stays valid","let o={g\\u0065t(){return 1;},s\\u0065t(){return 2;}};console.log(o.get(),o.set(),o.get.name,o.set.name);"],
 [
  "concise receiver and closure",
  "let n=4,o={x:3,add(a){return this.x+a+n;}};console.log(o.add(2),o.add.call({x:8},1));"
 ],
 [
  "get set merge",
  "let o={n:1,get x(){return this.n;},set x(v){this.n=v+1;}};o.x=7;let d=Object.getOwnPropertyDescriptor(o,\"x\");console.log(o.x,d.enumerable,d.configurable,typeof d.get,typeof d.set);"
 ],
 [
  "setter first and getter replacement",
  "let n=0,o={set x(v){n=v;},get x(){return n;},get x(){return n+1;}};o.x=8;console.log(o.x);"
 ],
 [
  "data accessor transitions",
  "let o={get x(){return 1;},x:2,set y(v){},y:3,z:4,get z(){return 5;}};console.log(o.x,o.y,o.z,Object.getOwnPropertyDescriptor(o,\"z\").set);"
 ],
 [
  "computed names evaluation and metadata",
  "let n=0,k={toString:function(){n++;return \"x\";}},o={get [k](){return 7;},[\"a\"+\"b\"](x,y){return x+y;},set [k](v){}};let d=Object.getOwnPropertyDescriptor(o,\"x\");console.log(n,d.get.name,d.set.name,d.get.length,d.set.length,o.ab.name,o.ab.length,o.ab(2,3));"
 ],
 [
  "methods lack prototype and remain callable",
  "let o={m(){return 2;},get x(){return 3;}};let g=Object.getOwnPropertyDescriptor(o,\"x\").get;console.log(\"prototype\" in o.m,\"prototype\" in g,Object.getOwnPropertyNames(o.m).join(\"|\"),o.m.bind(null)());"
 ],
 [
  "get set named methods and ordinary fields",
  "let o={get(){return 1;},set:2,getter:3};console.log(o.get(),o.set,o.getter);"
 ],
 [
  "proto methods and accessors are ordinary keys",
  "let o={__proto__(){return 1;}},p={get __proto__(){return 2;},set __proto__(v){this.n=v;}};p.__proto__=9;console.log(o.__proto__(),Object.getPrototypeOf(o)===Object.prototype,p.__proto__,p.n);"
 ],
 [
  "string numeric keyword names",
  "let o={\"a b\"(){return 1;},7(){return 2;},default(){return 3;},get 8(){return 4;}};console.log(o[\"a b\"](),o[7](),o.default(),o[8],o[7].name);"
 ],
 [
  "method source text",
  "let o={ /* before */ m /* hi */ (x) {return x;},get x() { return 1; },set x(v) { }};console.log(o.m.toString());console.log(Object.getOwnPropertyDescriptor(o,\"x\").get.toString());console.log(Object.getOwnPropertyDescriptor(o,\"x\").set.toString());"
 ],
 [
  "sloppy methods arguments and nested closures",
  "let o={m(a){arguments[0]=7;return function(){return a;};}};let f=o.m(1);for(let i=0;i<20;i++){({s:\"\"+i});}console.log(f());"
 ],
 [
  "literal ignores replaced public defineProperty",
  "Object.defineProperty=3;let o={get x(){return 7;},set x(v){}};console.log(o.x);"
 ],
 [
  "getter GC with lost object reference",
  "let o={get x(){o=null;for(let i=0;i<30;i++){({s:\"\"+i});}return \"ok\";}};console.log(o.x);"
 ],
 [
  "method name not inner binding",
  "let m=9,o={m(){return m;}};console.log(o.m());"
 ],
 [
  "accessor key order and integrity",
  "let o={get x(){return 1;},y:2,set x(v){}};Object.freeze(o);console.log(Object.keys(o).join(\"|\"),Object.isFrozen(o));"
 ]
];
function native(source:string){return runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));}
for(const [name,source] of cases)test('Object literal methods: '+name,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.toString(),runOracle(source).stdout);});
for(const source of ["let o={m(){}};new o.m();","let o={get x(){return 1;}};let g=Object.getOwnPropertyDescriptor(o,\"x\").get;new g();","let o={m(){}};new (o.m.bind(null))();"])test('Object literal methods error: '+source,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,1);assert.match(r.stderr.toString(),/Nona runtime error/);const n=spawnSync(process.execPath,['-e',source],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(n.status,1);assert.equal(r.stdout.toString(),n.stdout);});

for(const source of ["({get x(a){}});","({set x(){}});","({set x(a,b){}});","({m(a,a){}});","({get x:1});"])test("method syntax rejects "+source,()=>{assert.throws(()=>parse(lex(source)));});

for(const source of ["({g\\u0065t x(){return 1;}});","({s\\u0065t x(v){}});"])test("escaped accessor prefix rejects "+source,()=>{assert.throws(()=>parse(lex(source)));});
