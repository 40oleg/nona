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
import {linkHost} from './helpers/program.js';

const cases:[string,string][]=[
 ['method receiver and writes','let o={x:3,f:function(n){this.x+=n;return this;}};console.log(o.f(4)===o,o.x);'],
 ['inherited method receives child','let p={f:function(){return this.x;}};let o={__proto__:p,x:8};console.log(o.f());'],
 ['parentheses preserve receiver, comma and conditional lose it','let global=this;function f(){return this===global;}let o={f:f};console.log((o.f)(),(0,o.f)(),(true?o.f:o.f)());'],
 ['receiver evaluated once before key and arguments','let trace="";let o={x:7,f:function(n){return this.x+n;}};function base(){trace+="b";return o;}function key(){trace+="k";return "f";}function arg(){trace+="a";o={x:100};return 2;}console.log(base()[key()](arg()),trace);'],
 ['ordinary nested function has independent this','let global=this;let o={f:function(){function inner(){return this===global;}return inner();}};console.log(o.f());'],
 ['array and callable receivers','function f(){return this;}let a=[f];f.m=f;console.log(a[0]()===a,f.m()===f);'],
 ['recursive methods preserve receiver and five arguments','let o={x:8,f:function(n,a,b,c,d){return n?this.f(n-1,a+1,b+1,c+1,d+1):this.x+a+b+c+d;}};console.log(o.f(3,1,2,3,4));'],
 ['script globals alias properties both ways','var x=1;this.x=4;console.log(x);x=9;console.log(this.x,"x" in this,delete this.x,x);'],
 ['global function declaration property is same binding','console.log(this.f===f);function f(){return 1;}this.f=function(){return 2;};console.log(f());'],
 ['lexicals stay outside global object','let hidden=3;const other=4;console.log(this.hidden,this.other,"hidden" in this,hidden+other);'],
 ['global dynamic properties and inherited global alias','this.extra=7;let o={__proto__:this};var x=3;console.log(o.x,o.extra);o.x=8;console.log(x,o.x);console.log(delete this.extra,"extra" in this);'],
 ['global alias shadows proto accessor','var __proto__=6;console.log(this.__proto__,delete this.__proto__);this.__proto__=8;console.log(__proto__);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of [
 'function f(){let old=this;this.self=null;for(let i=0;i<100;i++){({x:""+i});}return old.x;}console.log(({x:42,self:f}).self());',
 'this.keep={value:""+42};function f(){for(let i=0;i<100;i++){({x:i});}return this.keep.value;}console.log(f());',
])test('receiver and global properties survive stress GC: '+source,()=>{
 const result=runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
 assert.equal(result.stdout.toString(),runOracle(source).stdout);
});
