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
 ['object methods exist as native callable properties','let o={};console.log(typeof o.toString,typeof o.valueOf,"toString" in o,"valueOf" in o,o.toString.name,o.toString.length,o.valueOf.length,o.toString.toString());'],
 ['Object toString handles nullish primitive and object tags','let t={}.toString;function f(){}function g(){return t.call(arguments);}console.log(t.call(),t.call(null),t.call(true),t.call(3),t.call("x"),t.call({}),t.call([]),t.call(f),g());'],
 ['Object valueOf returns objects and fresh primitive boxes','let v={}.valueOf,o={x:7};let n=v.call(3),s=v.call("ab");console.log(v.call(o)===o,typeof n,n+1,n===v.call(3),s.length,s[1]);'],
 ['array join separators and empty entries','console.log([1,null,undefined,,5].join(),[1,2,3].join("--"),[1,2].join(null),[1,2].join(3),[].join("|"));'],
 ['array join is generic and sees inherited entries','let j=[].join,p={1:8,length:3},o={__proto__:p,0:7,2:9};console.log(j.call(o,"/"),j.call("abc","-"),j.call(3),j.call({length:2.9,0:"a",1:"b"},""));'],
 ['nested array join and cycles','let a=[1,2],b=[a,3];console.log(b.join(";"));a[2]=a;console.log(a.join("/"));'],
 ['Array toString uses generic callable join receiver','let t=[].toString,o={x:7,join:function(){return this.x;}};console.log(t.call(o),typeof t.call(o));o.join=3;console.log(t.call(o),t.call("ab"));'],
 ['Array toString returns join result without conversion','let t=[].toString,o={};o.join=function(){return o;};console.log(t.call(o)===o);o.join=function(){};console.log(t.call(o));'],
 ['Array toString dispatches bound join','let a=[1,2];a.join=function(){return this.x;}.bind({x:9});console.log(a.toString());'],
 ['array method metadata and native source','let a=[];console.log(a.join.name,a.join.length,a.toString.name,a.toString.length,"prototype" in a.join,a.join.toString());'],
 ['method mutation and deletion affect lookup and fallback','let p=[].__proto__,saved=p.join;delete p.join;let text=[1,2].toString(),has="join" in [];p.join=saved;console.log(text,has,[1,2].toString());'],
 ['join converts receiver used as separator before cycle guard','let a=[1,2];console.log(a.join(a));'],
 ['Object toString ignores user toString while array fallback ignores it too','let o={toString:function(){return "custom";},join:null},t={}.toString;console.log(t.call(o),[].toString.call(o));'],
 ['Object toString checks Proxy array status before invoking the tag getter','let t=Object.prototype.toString,p=Proxy.revocable([], {get:function(){p.revoke();return undefined;}});console.log(t.call(p.proxy));let q=Proxy.revocable({}, {get:function(){q.revoke();return undefined;}});console.log(t.call(q.proxy));'],
 ['Object toString falls back to Object for Symbol and BigInt without string tags','let t=Object.prototype.toString;delete Symbol.prototype[Symbol.toStringTag];Object.defineProperty(BigInt.prototype,Symbol.toStringTag,{value:null});console.log(t.call(Symbol()),t.call(1n),t.call(Object(1n)));'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of ['let v={}.valueOf;v();','({}).valueOf.call(null);','[].join.call(null);','[].toString.call(undefined);','new [].join();'])test('object method protocol error: '+source,()=>{
 const result=compile(source,{fileName:'object-method-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
test('Array toString roots receiver and callback through nested JS GC',()=>{
 const source='let o={text:""+42,join:function(){let old=this;this.join=null;o=null;for(let i=0;i<50;i++){({text:""+i});}return old.text;}};console.log([].toString.call(o));';
 const run=runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
