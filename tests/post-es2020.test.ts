import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compile,hostTarget} from '../src/compiler.js';

// Small features newer than ES2020 (#69), compared with Node.js under GC stress.
const programs:Record<string,string>={
 'numeric separators':`console.log(1_000_000,0xA_B+0b1_0+0o7_7,1_0.0_1,.1_2e1_0,String(1_0n),1e1_0);`,
 'logical assignment':`
let a=0,b=1,c=null,d,log=[];a||=5;b&&=7;c??=9;d??=(()=>1)();console.log(a,b,c,d);
let e="x";e||=log.push("no");e&&=log.push("yes");console.log(e,log.join());
const o={get p(){log.push("get");return 0;},set p(v){log.push("set "+v);}};o.p||=3;o.p&&=4;o.p??=5;console.log(log.join());
const q={n:null};q.n??=function(){};let f;f??=function(){};let g;g||=class{};console.log(q.n.name,f.name,g.name);
const arr=[0,1];let i=0;arr[i++]||=10;console.log(arr.join(),i);
try{(function(){"use strict";const fz=Object.freeze({x:0});fz.x||=2;})();}catch(err){console.log(err.constructor.name);}
const k=1;try{k&&=2;}catch(err){console.log(err.constructor.name);}let z=0;z??=1;console.log(z);`,
 'at, findLast, hasOwn, error cause':`
console.log([1,2,3].at(-1),[1,2,3].at(5),"abc".at(-2),new Int8Array([4,5]).at(-1),[1,2,3,4].findLast(x=>x%2),[1,2,3,4].findLastIndex(x=>x>9),new Uint8Array([1,2,3]).findLastIndex(x=>x<3));
console.log(Object.hasOwn({a:1},"a"),Object.hasOwn([],"length"),Object.hasOwn.length,Array.prototype.at.name,Array.prototype[Symbol.unscopables].findLast,Object.getOwnPropertyDescriptor(Array.prototype,"at").enumerable);
try{Object.hasOwn(null,"x");}catch(e){console.log(e.constructor.name);}try{[].findLast();}catch(e){console.log(e.constructor.name);}
const ec=new TypeError("m",{cause:1});console.log(ec.cause,Object.getOwnPropertyDescriptor(ec,"cause").enumerable,"cause" in new Error("x",{}),"cause" in new RangeError("x"));`,
 'AggregateError and Promise.any':`
const ae=new AggregateError([1,2],"msg",{cause:"c"});
console.log(ae.message,ae.errors.join(),ae.cause,ae.name,ae instanceof Error,Object.prototype.toString.call(ae),AggregateError.length,Object.getPrototypeOf(AggregateError)===Error,AggregateError("x").message,Object.keys(ae).length,String(ae));
class Sub extends AggregateError{}const s=new Sub([]);console.log(s instanceof Sub,s instanceof AggregateError,s.constructor.name);
const log=[];Promise.any([Promise.reject(1),Promise.resolve(2),3]).then(v=>log.push("any "+v));
Promise.any([Promise.reject(1),Promise.reject(2)]).catch(e=>log.push(e.constructor.name+" "+e.errors.join()));
Promise.any([]).catch(e=>log.push("empty "+e.errors.length));
setTimeout(()=>console.log(log.join("|")),0);`,
};
for(const [name,source] of Object.entries(programs))test(`post-ES2020: ${name}`,()=>{
 const expected=runOracle(source).stdout;
 const run=runOnHost(source);
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,expected);
});
for(const source of ['0_1','1__2','1_','0x_1','1._1','1_.1','1e_1','08_1','01_1','({a}) ||= 1','[a] &&= 1','f() ??= 1'])
 test(`post-ES2020 early error: ${source}`,()=>{assert.equal(compile(source+';',{fileName:'e.js',target:hostTarget}).ok,false);});
