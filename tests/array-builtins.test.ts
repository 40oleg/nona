import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['isArray brands',`console.log(Array.isArray([]),Array.isArray({}),Array.isArray('x'),Array.isArray(Array.prototype));`],
 ['push values',`var a=[1];console.log(a.push(2,3),a.length,a[1],a[2]);`],
 ['push empty',`var a=[];console.log(a.push(),a.length);`],
 ['push generic',`var o={length:1,0:'a'};console.log(Array.prototype.push.call(o,'b','c'),o.length,o[1],o[2]);`],
 ['push sparse',`var a=[];a.length=2;console.log(a.push(5),a.length,a[2]);`],
 ['pop values',`var a=[1,2,3];console.log(a.pop(),a.length,a.pop(),a.length,a.pop(),a.pop());`],
 ['pop sparse',`var a=[1,,3];console.log(a.pop(),a.pop(),a.length);`],
 ['pop generic',`var o={length:2,0:'a',1:'b'};console.log(Array.prototype.pop.call(o),o.length,1 in o,o[0]);`],
 ['includes values and holes',`var a=[1,,NaN];console.log(a.includes(1),a.includes(undefined),a.includes(NaN),a.includes(2));`],
 ['includes fromIndex',`var a=[1,2,1];console.log(a.includes(1,1),a.includes(1,-1),a.includes(1,-3),a.includes(1,Infinity),a.includes(2,-Infinity));`],
 ['includes generic inherited values',`var o={__proto__:{0:'x'},length:2,1:'y'};console.log(Array.prototype.includes.call(o,'x'),Array.prototype.includes.call(o,'y'),Array.prototype.includes.call('ab','b'));`],
 ['indexOf and lastIndexOf values',`var a=['a','b','a'];console.log(a.indexOf('a'),a.indexOf('a',1),a.lastIndexOf('a'),a.lastIndexOf('a',1),a.indexOf('x'),a.lastIndexOf('x'));`],
 ['indexOf and lastIndexOf holes',`var a=[,undefined,NaN];console.log(a.indexOf(undefined),a.lastIndexOf(undefined),a.indexOf(NaN),a.lastIndexOf(NaN),Array.prototype.indexOf.length,Array.prototype.lastIndexOf.length);`],
 ['indexOf and lastIndexOf positions',`var a=[1,2,1];console.log(a.indexOf(1,-1),a.indexOf(1,-4),a.indexOf(1,Infinity),a.lastIndexOf(1,-1),a.lastIndexOf(1,-.5),a.lastIndexOf(1,Infinity),a.lastIndexOf(1,undefined),a.lastIndexOf(1,-Infinity),a.lastIndexOf(1,-5.3));`],
 ['indexOf and lastIndexOf generic inherited',`var o={__proto__:{0:'x'},length:2,1:'y'};console.log(Array.prototype.indexOf.call(o,'x'),Array.prototype.lastIndexOf.call(o,'x'),Array.prototype.indexOf.call('ab','b'));`],
 ['forEach sparse and inherited',`var a=[1,,3],s='';Array.prototype[1]=2;a.forEach(function(v,i,o){s+=v+':'+i+':'+(o===a)+';';});delete Array.prototype[1];console.log(s,a.forEach(function(){}),Array.prototype.forEach.length);`],
 ['forEach snapshot length and thisArg',`var a=[1,2],seen='',receiver={x:7};a.forEach(function(v,i){'use strict';seen+=this.x+':'+v+':'+i+';';if(i===0){a.push(3);a[1]=4;}},receiver);console.log(seen);`],
 ['forEach generic string',`var seen='';Array.prototype.forEach.call('ab',function(v,i,o){seen+=v+':'+i+':'+(typeof o)+';';});console.log(seen);`],
 ['forEach empty callback validation',`try{[].forEach(1)}catch(e){console.log(e.name)}`],
 ['some and every basic',`console.log([].some(function(){return true}),[].every(function(){return false}),[1,2,3].some(function(x){return x===2}),[1,2,3].every(function(x){return x>0}),Array.prototype.some.length,Array.prototype.every.length);`],
 ['some and every sparse inherited',`var a=[,2],s='';Array.prototype[0]=1;console.log(a.some(function(v,i){s+=v+':'+i+';';return v===1}),s);s='';console.log(a.every(function(v,i){s+=v+':'+i+';';return v<2}),s);delete Array.prototype[0];`],
 ['some and every short circuit and thisArg',`var a=[1,2,3],o={x:2},s='';console.log(a.some(function(v){'use strict';s+=v;return v===this.x},o),s);s='';console.log(a.every(function(v){s+=v;return v<2}),s);`],
 ['some and every generic mutation',`var a={length:3,0:1,1:2},s='';console.log(Array.prototype.some.call(a,function(v,i){s+=i;if(i===0){a[2]=3;a.length=1;}return v===3}),s);s='';console.log(Array.prototype.every.call(a,function(v,i){s+=i;return v<4}),s);`],
 ['some and every empty callback validation',`for(var method of ['some','every'])try{Array.prototype[method].call([],1)}catch(e){console.log(method,e.name)}`],
 ['find and findIndex basic',`var a=[1,2,3];console.log(a.find(function(x){return x>1}),a.findIndex(function(x){return x>1}),a.find(function(x){return x>9}),a.findIndex(function(x){return x>9}),Array.prototype.find.length,Array.prototype.findIndex.length);`],
 ['find and findIndex visit holes',`var a=[,2],s='';console.log(a.find(function(v,i){s+=String(v)+':'+i+';';return i===0}),s);s='';console.log(a.findIndex(function(v,i){s+=String(v)+':'+i+';';return v===2}),s);`],
 ['find and findIndex generic thisArg',`var o={length:3,0:'a',2:'c'},receiver={x:'c'},s='';console.log(Array.prototype.find.call(o,function(v,i,obj){'use strict';s+=i;return v===this.x&&obj===o},receiver),s);s='';console.log(Array.prototype.findIndex.call(o,function(v,i){s+=i;return i===1}),s);`],
 ['find and findIndex empty callback validation',`for(var method of ['find','findIndex'])try{Array.prototype[method].call([],1)}catch(e){console.log(method,e.name)}`],
 ['reduce and reduceRight basic',`var a=[1,2,3];console.log(a.reduce(function(x,y){return x-y}),a.reduceRight(function(x,y){return x-y}),a.reduce(function(x,y){return x+y},10),a.reduceRight(function(x,y){return x+y},10),Array.prototype.reduce.length,Array.prototype.reduceRight.length);`],
 ['reduce and reduceRight holes and initial',`var a=[,,3,,5],s='';console.log(a.reduce(function(x,y,i){s+=i;return x+y}),s);s='';console.log(a.reduceRight(function(x,y,i){s+=i;return x+y}),s);console.log([,,].reduce(function(){return 2},7),[,,].reduceRight(function(){return 2},7));`],
 ['reduce and reduceRight empty errors',`for(var method of ['reduce','reduceRight']){try{[][method](function(){})}catch(e){console.log(method,e.name)}try{[][method](1,7)}catch(e){console.log(method,e.name)}}`],
 ['reduce and reduceRight generic receiver',`var o={length:3,0:'a',2:'c'},s='';console.log(Array.prototype.reduce.call(o,function(a,v,i,obj){s+=i;return a+v+(obj===o)},''),s);s='';console.log(Array.prototype.reduceRight.call(o,function(a,v,i){s+=i;return a+v},''),s);`],
];
for(const [name,source] of cases)test(`array builtins: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('array builtins: push survives stress GC',()=>{
 const source=`var a=[];for(var i=0;i<50;i++){a.push({x:i});}console.log(a.length,a[0].x,a[49].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('array builtins: includes survives getter and GC',()=>{
 const source=`var o={length:2};Object.defineProperty(o,'0',{get:function(){for(var i=0;i<30;i++)({v:i});return 'needle';}});console.log(Array.prototype.includes.call(o,'needle'));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('array builtins: pop survives getter and GC',()=>{
 const source=`var o={length:2};Object.defineProperty(o,'1',{configurable:true,get:function(){for(var i=0;i<30;i++)({v:i});return {x:7};}});var v=Array.prototype.pop.call(o);console.log(v.x,o.length,1 in o);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: indexOf survives getter and GC',()=>{
 const source=`var needle={x:1},o={length:2};Object.defineProperty(o,'1',{get:function(){for(var i=0;i<30;i++)({v:i});return needle;}});console.log(Array.prototype.indexOf.call(o,needle),Array.prototype.lastIndexOf.call(o,needle));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: forEach callback and getter survive stress GC',()=>{
 const source=`var o={length:2},seen='';Object.defineProperty(o,'0',{get:function(){for(var i=0;i<30;i++)({v:i});return {x:7};}});Array.prototype.forEach.call(o,function(v,i,obj){for(var j=0;j<30;j++)({v:j});seen+=v.x+':'+i+':'+(obj===o)+';';});console.log(seen);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: some/every callback survives stress GC',()=>{
 const source=`var a=[{x:1},{x:2},{x:3}];console.log(a.some(function(v){for(var i=0;i<30;i++)({v:i});return v.x===2}),a.every(function(v){for(var i=0;i<30;i++)({v:i});return v.x>0}));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: find/findIndex callback survives stress GC',()=>{
 const source=`var a=[{x:1},,{x:3}];console.log(a.find(function(v){for(var i=0;i<30;i++)({v:i});return v&&v.x===3}).x,a.findIndex(function(v){for(var i=0;i<30;i++)({v:i});return v&&v.x===3}));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: reduce/reduceRight callback survives stress GC',()=>{
 const source=`var a=[{x:1},,{x:3}];console.log(a.reduce(function(acc,v){for(var i=0;i<30;i++)({v:i});return acc+v.x},0),a.reduceRight(function(acc,v){for(var i=0;i<30;i++)({v:i});return acc+v.x},0));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
