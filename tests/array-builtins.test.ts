import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['Array species getter',`var d=Object.getOwnPropertyDescriptor(Array,Symbol.species);console.log(Array[Symbol.species]===Array,d.get.call({x:1}).x,d.enumerable,d.configurable,d.set===undefined,d.get.length,d.get.name);`],
 ['map ordinary and sparse',`var a=[1,,3],b=a.map(function(v,i){return v*2+i});console.log(b.length,b[0],1 in b,b[2],a.length,Array.prototype.map.length);`],
 ['map generic and inherited',`var o={length:3,0:2,2:4},s='';Object.prototype[1]=3;var b=Array.prototype.map.call(o,function(v,i,x){s+=i+':'+(x===o)+';';return v*2});delete Object.prototype[1];console.log(b.join(','),s);`],
 ['map species constructor',`var a=[1,2],s='';a.constructor={[Symbol.species]:function(n){s+='C'+n+';';return {x:1}}};var b=a.map(function(v){s+='M'+v+';';return v+1});console.log(s,b[0],b[1],b.x,Array.isArray(b));`],
 ['map species fallback and errors',`var a=[1];a.constructor={[Symbol.species]:null};console.log(Array.isArray(a.map(function(x){return x})));a.constructor={[Symbol.species]:{}};try{a.map(function(x){return x})}catch(e){console.log(e.name)}try{a.map(1)}catch(e){console.log(e.name)}`],
 ['map constructor null and undefined',`var a=[1];a.constructor=undefined;console.log(Array.isArray(a.map(function(x){return x})));a.constructor=null;try{a.map(function(x){return x})}catch(e){console.log(e.name)}`],
 ['map species getter and constructor order',`var s='',a=[1];Object.defineProperty(a,'constructor',{get:function(){s+='c';return {[Symbol.species]:function(n){s+='s'+n;return {}}}}});a.map(function(x){s+='m';return x});console.log(s);`],
 ['map subclass species',`class A extends Array{}var a=new A(1,2),b=a.map(function(x){return x+1});console.log(b instanceof A,b.length,b[0],b[1]);class B extends Array{static get [Symbol.species](){return Array}}var c=new B(4).map(function(x){return x});console.log(c instanceof B,Array.isArray(c));`],
 ['map own property bypasses inherited setter',`var a=[1],b={},s='';Object.defineProperty(b,'0',{set:function(){s+='set'},configurable:true});a.constructor={[Symbol.species]:function(){return Object.create(b)}};var r=a.map(function(x){return x+1});console.log(s,Object.prototype.hasOwnProperty.call(r,'0'),r[0]);`],
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
 ['fill basic and return identity',`var a=[1,,3,4];console.log(a.fill(7,1,3)===a,a.length,a.join(','),Array.prototype.fill.length);`],
 ['fill negative and infinite positions',`var a=[1,2,3,4];a.fill(8,-3,-1);console.log(a.join(','));a.fill(5,Infinity);console.log(a.join(','));a.fill(6,-Infinity,-Infinity);console.log(a.join(','));`],
 ['fill generic and omitted value',`var o={length:3};console.log(Array.prototype.fill.call(o,'x',1)===o,o[0],o[1],o[2]);var a=[1];a.fill();console.log(0 in a,a[0]);`],
 ['fill start and end coercion order',`var s='',a=[1,2,3];a.fill(9,{valueOf(){s+='s';return 1.9}},{valueOf(){s+='e';return 3}});console.log(s,a.join(','));`],
 ['fill explicit undefined end',`var a=[0,0];console.log(a.fill(1,0,undefined).join(','));a=[0,0];console.log(a.fill(1,0,NaN).join(','));`],
 ['copyWithin basic and overlap',`var a=[1,2,3,4,5];console.log(a.copyWithin(1,0,4)===a,a.join(','));a=[1,2,3,4];a.copyWithin(1,2);console.log(a.join(','),Array.prototype.copyWithin.length);`],
 ['copyWithin holes and inherited',`var a=[1,2,,4];a.copyWithin(0,2,4);console.log(0 in a,1 in a,a[0],a[1]);Array.prototype[2]=7;a=[1,2,,4];a.copyWithin(0,2,4);console.log(a[0],a[1]);delete Array.prototype[2];`],
 ['copyWithin generic and bounds',`var o={length:4,0:'a',2:'c'};console.log(Array.prototype.copyWithin.call(o,1,0,3)===o,o[1],o[2],3 in o);var a=[1,2,3];a.copyWithin(-2,-1,undefined);console.log(a.join(','));`],
 ['copyWithin coercion order',`var s='',a=[1,2,3];a.copyWithin({valueOf(){s+='t';return 0}},{valueOf(){s+='s';return 1}},{valueOf(){s+='e';return 3}});console.log(s,a.join(','));`],
 ['reverse basic and identity',`var a=[1,2,3,4];console.log(a.reverse()===a,a.join(','),Array.prototype.reverse.length);`],
 ['reverse sparse holes',`var a=[1,,3,];a.length=4;a.reverse();console.log(a.length,0 in a,1 in a,2 in a,3 in a,a[0],a[1],a[2],a[3]);`],
 ['reverse generic and inherited',`var o={length:3,0:'a',2:'c'};console.log(Array.prototype.reverse.call(o)===o,o[0],o[2]);Array.prototype[0]='x';var a=[,1];a.reverse();console.log(a[1],0 in a,1 in a);delete Array.prototype[0];`],
 ['reverse getter and setter order',`var s='',o={length:2};Object.defineProperty(o,'0',{get:function(){s+='a';return 1},set:function(v){s+='c'}});Object.defineProperty(o,'1',{get:function(){s+='b';return 2},set:function(v){s+='d'}});Array.prototype.reverse.call(o);console.log(s);`],
 ['reverse getter deletes upper',`var a=['first','second'];Object.defineProperty(a,0,{get:function(){a.length=0;return 'first'}});a.reverse();console.log(0 in a,1 in a,a[1]);`],
 ['shift basic and empty',`var a=[1,2,3];console.log(a.shift(),a.length,a.join(','),a.shift(),a.shift(),a.shift(),a.length,Array.prototype.shift.length);`],
 ['shift sparse and inherited',`var a=[,2,,4];console.log(a.shift(),a.length,0 in a,1 in a,2 in a,a[0],a[2]);Array.prototype[1]='x';a=[,];a.length=2;console.log(a.shift(),a[0],a.length);delete Array.prototype[1];`],
 ['shift generic and accessor',`var o={length:3,0:'a',2:'c'};console.log(Array.prototype.shift.call(o),o.length,0 in o,o[0],1 in o,o[1],2 in o);`],
 ['shift getter changes later element',`var a=[1,2,3],backing=1;Object.defineProperty(a,0,{configurable:true,get:function(){a[1]=7;return backing},set:function(v){backing=v}});console.log(a.shift(),backing,a[1],a.length);`],
 ['unshift basic and empty',`var a=[3,4];console.log(a.unshift(1,2),a.join(','),a.length);console.log(a.unshift(),a.join(','),Array.prototype.unshift.length);`],
 ['unshift sparse and inherited',`var a=[,2];console.log(a.unshift('x'),a.length,0 in a,1 in a,2 in a,a[0],a[1],a[2]);Array.prototype[0]='p';a=[,];a.length=1;console.log(a.unshift('q'),a[0],a[1]);delete Array.prototype[0];`],
 ['unshift generic',`var o={length:3,0:'a',2:'c'};console.log(Array.prototype.unshift.call(o,'x','y'),o.length,o[0],o[1],o[2],3 in o,o[4]);`],
 ['unshift length limit',`var o={length:9007199254740991};try{Array.prototype.unshift.call(o,'x')}catch(e){console.log(e.name)}`],
 ['unshift no arguments clamps huge length',`var o={length:Infinity};console.log(Array.prototype.unshift.call(o),o.length);o.length=9007199254740992;console.log(Array.prototype.unshift.call(o),o.length);`],
];
for(const [name,source] of cases)test(`array builtins: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('array builtins: push survives stress GC',()=>{
 const source=`var a=[];for(var i=0;i<50;i++){a.push({x:i});}console.log(a.length,a[0].x,a[49].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('array builtins: map species and callback survive stress GC',()=>{
 const source=`var a=[{x:1},,{x:3}];a.constructor={[Symbol.species]:function(n){for(var i=0;i<30;i++)({v:i});return new Array(n)}};var b=a.map(function(v){for(var i=0;i<30;i++)({v:i});return {x:v.x+1}});console.log(b.length,b[0].x,1 in b,b[2].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
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
test('array builtins: fill value survives setter and stress GC',()=>{
 const source=`var value={x:7},o={length:2},seen='';Object.defineProperty(o,'0',{set:function(v){for(var i=0;i<30;i++)({v:i});seen+=v.x;}});Array.prototype.fill.call(o,value);console.log(seen,o[1].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: copyWithin value survives getter and stress GC',()=>{
 const source=`var value={x:7},o={length:2};Object.defineProperty(o,'1',{get:function(){for(var i=0;i<30;i++)({v:i});return value;}});Array.prototype.copyWithin.call(o,0,1);console.log(o[0].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: reverse values survive getters and stress GC',()=>{
 const source=`var a={x:1},b={x:2},o={length:2};Object.defineProperty(o,'0',{get:function(){for(var i=0;i<30;i++)({v:i});return a;},set:function(v){a=v;}});Object.defineProperty(o,'1',{get:function(){for(var i=0;i<30;i++)({v:i});return b;},set:function(v){b=v;}});Array.prototype.reverse.call(o);console.log(a.x,b.x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: shift first value survives getter and stress GC',()=>{
 const source=`var value={x:7},backing=value,a=[0,{x:2}];Object.defineProperty(a,'0',{configurable:true,get:function(){for(var i=0;i<30;i++)({v:i});return backing;},set:function(v){backing=v;}});var first=a.shift();console.log(first.x,backing.x,a.length);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: unshift values survive setter and stress GC',()=>{
 const source=`var value={x:7},o={length:1,0:{x:2}},seen='';Object.defineProperty(o,'1',{set:function(v){for(var i=0;i<30;i++)({v:i});seen+=v.x}});console.log(Array.prototype.unshift.call(o,value),seen,o[0].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
