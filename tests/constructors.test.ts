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

const cases:[string,string][]=[
 ['constructor initializes instance','function C(x){this.x=x;}let o=new C(7);console.log(o.x,o instanceof C,o.constructor===C,C.prototype.constructor===C);'],
 ['constructor prototype identity and deletion','function C(){}function D(){}C.prototype.__proto__=null;console.log(C.prototype!==D.prototype,delete C.prototype,delete C.prototype.constructor,"constructor" in C.prototype);'],
 ['prototype reassignment affects later instances','function C(){}let a=new C;let old=C.prototype;C.prototype={x:8};let b=new C();console.log(a instanceof C,b instanceof C,b.x,a.__proto__===old);'],
 ['primitive constructor return is ignored','function C(x){this.x=x;return x;}console.log(new C(8).x,new C(null).x,new C("s").x);'],
 ['object constructor return replaces instance','function C(){return {x:9};}function D(){return function(){return 4;};}let c=new C;console.log(c.x,c instanceof C,(new D)());'],
 ['nonobject prototype falls back to Object prototype','function C(){}C.prototype=3;let o=new C();console.log(o.__proto__==={}.__proto__);'],
 ['constructor callee before arguments and prototype after arguments','let trace="";function C(x){trace+="c";this.x=x;}let holder={C:C};function arg(){trace+="a";C.prototype={p:9};holder.C=0;return 5;}let o=new holder.C(arg());console.log(trace,o.x,o.p);'],
 ['nested new and call/member precedence','function Outer(){return function Inner(){this.x=8;};}console.log(new new Outer()().x);function C(){this.f=function(){return this.x;};this.x=4;}console.log(new C().f(),(new C).x);'],
 ['instanceof walks chain and accepts primitive lhs','function C(){}let p=new C();let o={__proto__:p};console.log(o instanceof C,3 instanceof C,null instanceof C);C.prototype=null;console.log(3 instanceof C);'],
 ['constructor returned closure retains instance','function C(x){this.x=x;let self=this;return function(){return self.x;};}console.log((new C(12))());'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of ['new 3;','let C={};new C();','function C(){}C.prototype=3;({}) instanceof C;','3 instanceof {};'])test('constructor protocol runtime error: '+source,()=>{
 const result=compile(source,{fileName:'construct-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
test('constructor prototype and instance survive stress GC',()=>{
 const source='function C(n){this.x=""+n;for(let i=0;i<30;i++){({x:i});}return 4;}let a=new C(42);C.prototype.read=function(){return this.x;};console.log(a.read(),a instanceof C);';
 const run=runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
