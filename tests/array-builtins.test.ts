import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

test('IsArray unwraps nested proxies for concat and species under GC stress',()=>{
 const source=`var array=[3],proxy=new Proxy(new Proxy(array,{}),{});
 console.log(Array.isArray(proxy),[].concat(proxy).join(','));
 function Ctor(){}array.constructor={[Symbol.species]:Ctor};
 console.log(Object.getPrototypeOf(Array.prototype.concat.call(proxy))===Ctor.prototype);
 console.log([proxy].flat().join(','),[proxy].flatMap(value=>value).join(','));
 var handle=Proxy.revocable([],{});handle.revoke();
 try{Array.isArray(handle.proxy)}catch(error){console.log(error.name)}
 try{[].concat(handle.proxy)}catch(error){console.log(error.name)}
 try{[handle.proxy].flat()}catch(error){console.log(error.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

const cases:[string,string][]=[
 ['sparse million element map completes',`var a=[];a[999999]=1;var b=a.map(function(x){return x+1});console.log(b.length,0 in b,b[999999]);`],
 ['Array unscopables object can be modified',`var u=Array.prototype[Symbol.unscopables];u.flat=false;u.extra=true;console.log(u.flat,u.extra,Object.prototype.hasOwnProperty.call(u,'extra'),Array.prototype[Symbol.unscopables]===u);`],
 ['Array.of falls back for nonconstructor functions',`var a=Array.of.call(Math.pow),b=Array.of.call(Math.pow.bind(Math));console.log(Array.isArray(a),Array.isArray(b),a.length,b.length);`],
 ['sort default and metadata',`var a=[10,2,1];console.log(a.sort()===a,a.join(','),Array.prototype.sort.length);`],
 ['sort numeric callback and stability',`var a=[{k:2,i:'a'},{k:1,i:'b'},{k:2,i:'c'}];a.sort(function(x,y){return x.k-y.k});console.log(a.map(function(x){return x.i}).join(','));`],
 ['sort undefined and holes',`var a=[,undefined,3,,1,undefined];a.sort();console.log(a.length,a[0],a[1],a[2],a[3],4 in a,5 in a);`],
 ['sort generic and inherited indices',`var o={length:3,0:'b',2:'a'};Array.prototype.sort.call(o);console.log(o[0],o[1],2 in o);Array.prototype[1]='c';var a=['b',,'a'];a.sort();delete Array.prototype[1];console.log(a.join(','),a.length);`],
 // The comparison sequence is implementation-defined: test effects, not Node's call count.
 ['sort mutation during comparator',`var a=[3,2,1],mutated=false;a.sort(function(x,y){if(!mutated){mutated=true;a[0]=9}return x-y});console.log(a.join(','),mutated);`],
 ['sort invalid comparator',`try{[].sort(null)}catch(e){console.log(e.name)}try{Array.prototype.sort.call(null)}catch(e){console.log(e.name)}`],
 ['sort undefined never enters comparator',`var a=[undefined,2,1],called=false,sawUndefined=false;a.sort(function(x,y){called=true;if(x===undefined||y===undefined)sawUndefined=true;return x-y});console.log(a.join(','),called,sawUndefined,a.length);`],
 ['sort getters collected before comparisons',`var a=[3,2,1],s='';Object.defineProperty(a,0,{configurable:true,get:function(){s+='g';return 3},set:function(v){s+='s'+v}});a.sort(function(x,y){s+='c';return x-y});console.log(/^gc+s1$/.test(s),a.join(','));`],
 ['toLocaleString entries and metadata',`var a=[1,null,,{toLocaleString(){return 'x'}}];console.log(a.toLocaleString(),Array.prototype.toLocaleString.length);`],
 ['toLocaleString generic and frozen length',`var o={length:2,0:{toLocaleString(){o.length=0;return 'a'}},1:{toLocaleString(){return 'b'}}};console.log(Array.prototype.toLocaleString.call(o));`],
 ['toLocaleString invokes methods and converts results',`var s='',a=[{toLocaleString(){s+='A';return {toString(){s+='S';return 'x'}}}},{toLocaleString(){s+='B';return 'y'}}];console.log(a.toLocaleString(),s);`],
 ['flat nested depth and metadata',`var a=[1,[2,[3,[4]]]];console.log(a.flat().join(','),a.flat(2).join(','),a.flat(Infinity).join(','),a.flat(0).length,Array.prototype.flat.length);`],
 ['flat sparse and inherited',`var a=[1,,[2,,3]];var b=a.flat();console.log(b.length,b.join(','));Array.prototype[1]='p';b=a.flat();delete Array.prototype[1];console.log(b.join(','),b.length);`],
 ['flat generic and species',`var o={length:2,0:[1,2],1:3};console.log(Array.prototype.flat.call(o).join(','));var a=[1,[2]],s='';a.constructor={[Symbol.species]:function(n){s+='C'+n;return {x:7}}};var b=a.flat();console.log(s,b[0],b[1],b.x,b.length,Array.isArray(b));`],
 ['flat depth coercion',`var s='',a=[1,[2,[3]]];console.log(a.flat({valueOf(){s+='d';return 1.9}}).join(','),s,a.flat(-1).length,a.flat(NaN).length);`],
 ['flatMap sparse and callback args',`var a=[1,,3],s='',b=a.flatMap(function(v,i,o){s+=i+':'+(o===a)+';';return [v,v+1]});console.log(b.join(','),b.length,s,Array.prototype.flatMap.length);`],
 ['flatMap thisArg and one-level flatten',`var t={x:2},a=[1,[3]],b=a.flatMap(function(v){'use strict';return [v,this.x]},t);console.log(b.length,b[0],b[1],Array.isArray(b[2]),b[3]);`],
 ['flatMap species and nonarray spreadable',`var a=[1],o={0:7,length:1,[Symbol.isConcatSpreadable]:true},s='';a.constructor={[Symbol.species]:function(n){s+='C'+n;return {x:5}}};var b=a.flatMap(function(){s+='M';return o});console.log(s,b[0]===o,b.x,b.length);`],
 ['flatMap invalid mapper',`try{[].flatMap(null)}catch(e){console.log(e.name)}try{[].flatMap()}catch(e){console.log(e.name)}`],
 ['concat ordinary and length',`var a=[1,2].concat([3,4],5);console.log(a.length,a.join(','),Array.prototype.concat.length,[].concat().length);`],
 ['concat sparse and inherited',`var a=[1,,3],b=[,5];var c=a.concat(b);console.log(c.length,0 in c,1 in c,2 in c,3 in c,4 in c,c[4]);Array.prototype[1]='p';c=a.concat(b);delete Array.prototype[1];console.log(c[1],1 in c,c[3],3 in c);`],
 ['concat spreadable object and array override',`var o={0:'x',2:'z',length:3,[Symbol.isConcatSpreadable]:true},a=[1,2];a[Symbol.isConcatSpreadable]=false;var b=[0].concat(o,a);console.log(b.length,b[0],b[1],2 in b,b[3],b[4]===a);`],
 ['concat generic receiver and primitive argument',`var o={0:'x',length:1,[Symbol.isConcatSpreadable]:true};var a=Array.prototype.concat.call(o,'y');console.log(a.length,a[0],a[1]);var b=Array.prototype.concat.call('ab',1);console.log(b.length,typeof b[0],b[1]);`],
 ['concat species constructor and final length',`var a=[1,2],s='';a.constructor={[Symbol.species]:function(n){s+='C'+n;return {x:7}}};var b=a.concat([3]);console.log(s,b[0],b[1],b[2],b.length,b.x,Array.isArray(b));`],
 ['concat spreadability and length getter order',`var s='',a=[1],o={0:2,length:1};Object.defineProperty(o,Symbol.isConcatSpreadable,{get:function(){s+='S';return true}});Object.defineProperty(o,'length',{get:function(){s+='L';return 1}});Object.defineProperty(o,'0',{get:function(){s+='V';return 2}});console.log(a.concat(o).join(','),s);`],
 ['concat species own property and length setter',`var a=[1],p={},s='';Object.defineProperty(p,'0',{set:function(){s+='set'},configurable:true});var result=Object.create(p);Object.defineProperty(result,'length',{set:function(v){s+='L'+v}});a.constructor={[Symbol.species]:function(){return result}};var b=a.concat(2);console.log(b===result,Object.prototype.hasOwnProperty.call(b,'0'),b[0],b[1],s);`],
 ['concat abrupt length limit',`var o={length:9007199254740991,[Symbol.isConcatSpreadable]:true};try{[1].concat(o)}catch(e){console.log(e.name)}`],
 ['concat observes source mutations and holes',`var a=[1,2,3],s='';Object.defineProperty(a,'0',{get:function(){s+='g';delete a[1];return 7}});var b=a.concat();console.log(s,b.length,b[0],1 in b,b[2]);`],
 ['Array.from arrays and strings',`var a=Array.from([1,,3]),b=Array.from('a😀');console.log(a.length,a[0],1 in a,a[1],a[2],b.length,b[0],b[1]);`],
 ['Array.from array-like and mapping',`var a=Array.from({length:3,0:1,2:3},function(v,i){return String(v)+i});console.log(a.length,a.join(','),Array.from.length);`],
 ['Array.from iterable and constructor',`function C(n){this.argCount=arguments.length;this.n=n}var it={[Symbol.iterator]:function(){var i=0;return {next:function(){return i<2?{value:++i,done:false}:{done:true}}}}};var a=Array.from.call(C,it),b=Array.from.call(C,{length:2,0:'x'});console.log(a instanceof C,a.argCount,a.length,a[0],a[1],b.argCount,b.n,b.length,b[0],b[1]);`],
 ['Array.from mapper thisArg',`var t={x:5},a=Array.from([1,2],function(v,i){'use strict';return v+this.x+i},t);console.log(a.join(','));`],
 ['Array.from iterator getter once',`var s='',o={length:1,0:7};Object.defineProperty(o,Symbol.iterator,{get:function(){s+='g';return null}});console.log(Array.from(o)[0],s);`],
 ['Array.from iterator close on mapper throw',`var s='',it={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false}},return:function(){s+='closed';return {}}}}};try{Array.from(it,function(){throw Error('boom')})}catch(e){console.log(e.message,s)}`],
 ['Array.from invalid mapper and iterator method',`try{Array.from([1],null)}catch(e){console.log(e.name)}try{Array.from({[Symbol.iterator]:3})}catch(e){console.log(e.name)}`],
 ['Array.from keeps original mapper error after close failure',`var it={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false}},return:function(){throw Error('close')}}}};try{Array.from(it,function(){throw Error('map')})}catch(e){console.log(e.message)}`],
 ['Array.from does not close after next throws',`var s='',it={[Symbol.iterator]:function(){return {next:function(){throw Error('next')},return:function(){s+='closed';return {}}}}};try{Array.from(it)}catch(e){console.log(e.message,s)}`],
 ['Array.from closes after result definition fails',`var s='',it={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false}},return:function(){s+='closed';return {}}}}};function C(){return Object.preventExtensions({})}try{Array.from.call(C,it)}catch(e){console.log(e.name,s)}`],
 ['Array.of ordinary and one number',`var a=Array.of(3);console.log(a.length,a[0],Array.of().length,Array.of(1,2).join(','),Array.of.length);`],
 ['Array.of generic constructor',`function C(n){this.x=n}var a=Array.of.call(C,1,2);console.log(a instanceof C,a.x,a.length,a[0],a[1]);`],
 ['Array.of subclass and fallback',`class A extends Array{}var a=A.of(1,2);console.log(a instanceof A,a.length,a[0],a[1]);var b=Array.of.call({},1,2);console.log(Array.isArray(b),b.join(','));`],
 ['Array.of own property and length setter',`var s='',p={};Object.defineProperty(p,'0',{set:function(){s+='set'}});function C(){return Object.create(p)}var a=Array.of.call(C,7);console.log(s,Object.prototype.hasOwnProperty.call(a,'0'),a[0],a.length);`],
 ['Array.of nonconstructor fallback',`var a=Array.of.call(()=>{},1,2),b=Array.of.call(null,3);console.log(Array.isArray(a),a.join(','),Array.isArray(b),b[0]);`],
 ['Array species getter',`var d=Object.getOwnPropertyDescriptor(Array,Symbol.species);console.log(Array[Symbol.species]===Array,d.get.call({x:1}).x,d.enumerable,d.configurable,d.set===undefined,d.get.length,d.get.name);`],
 ['map ordinary and sparse',`var a=[1,,3],b=a.map(function(v,i){return v*2+i});console.log(b.length,b[0],1 in b,b[2],a.length,Array.prototype.map.length);`],
 ['map generic and inherited',`var o={length:3,0:2,2:4},s='';Object.prototype[1]=3;var b=Array.prototype.map.call(o,function(v,i,x){s+=i+':'+(x===o)+';';return v*2});delete Object.prototype[1];console.log(b.join(','),s);`],
 ['map species constructor',`var a=[1,2],s='';a.constructor={[Symbol.species]:function(n){s+='C'+n+';';return {x:1}}};var b=a.map(function(v){s+='M'+v+';';return v+1});console.log(s,b[0],b[1],b.x,Array.isArray(b));`],
 ['map species fallback and errors',`var a=[1];a.constructor={[Symbol.species]:null};console.log(Array.isArray(a.map(function(x){return x})));a.constructor={[Symbol.species]:{}};try{a.map(function(x){return x})}catch(e){console.log(e.name)}try{a.map(1)}catch(e){console.log(e.name)}`],
 ['map constructor null and undefined',`var a=[1];a.constructor=undefined;console.log(Array.isArray(a.map(function(x){return x})));a.constructor=null;try{a.map(function(x){return x})}catch(e){console.log(e.name)}`],
 ['map species getter and constructor order',`var s='',a=[1];Object.defineProperty(a,'constructor',{get:function(){s+='c';return {[Symbol.species]:function(n){s+='s'+n;return {}}}}});a.map(function(x){s+='m';return x});console.log(s);`],
 ['map subclass species',`class A extends Array{}var a=new A(1,2),b=a.map(function(x){return x+1});console.log(b instanceof A,b.length,b[0],b[1]);class B extends Array{static get [Symbol.species](){return Array}}var c=new B(4).map(function(x){return x});console.log(c instanceof B,Array.isArray(c));`],
 ['map own property bypasses inherited setter',`var a=[1],b={},s='';Object.defineProperty(b,'0',{set:function(){s+='set'},configurable:true});a.constructor={[Symbol.species]:function(){return Object.create(b)}};var r=a.map(function(x){return x+1});console.log(s,Object.prototype.hasOwnProperty.call(r,'0'),r[0]);`],
 ['filter ordinary and sparse',`var a=[1,,2,3],b=a.filter(function(v){return v>1});console.log(b.length,b[0],b[1],Array.prototype.filter.length,a.length);`],
 ['filter inherited and generic',`var o={length:3,0:1,2:3},s='';Object.prototype[1]=2;var b=Array.prototype.filter.call(o,function(v,i){s+=i;return v%2});delete Object.prototype[1];console.log(b.join(','),s);`],
 ['filter species constructor',`var a=[1,2,3],s='';a.constructor={[Symbol.species]:function(n){s+='C'+n+';';return {x:7}}};var b=a.filter(function(v){s+='F'+v+';';return v!==2});console.log(s,b[0],b[1],b.x,b.length);`],
 ['filter species fallback and errors',`var a=[1];a.constructor={[Symbol.species]:null};console.log(Array.isArray(a.filter(function(){return true})));a.constructor=null;try{a.filter(function(){return true})}catch(e){console.log(e.name)}try{a.filter(1)}catch(e){console.log(e.name)}`],
 ['filter own property bypasses inherited setter',`var a=[1],b={},s='';Object.defineProperty(b,'0',{set:function(){s+='set'},configurable:true});a.constructor={[Symbol.species]:function(){return Object.create(b)}};var r=a.filter(function(){return true});console.log(s,Object.prototype.hasOwnProperty.call(r,'0'),r[0]);`],
 ['slice ordinary and sparse',`var a=[1,,3,4],b=a.slice(1,3);console.log(b.length,0 in b,b[1],Array.prototype.slice.length);`],
 ['slice bounds and coercion order',`var s='',a=[1,2,3,4];console.log(a.slice({valueOf(){s+='s';return -3.9}},{valueOf(){s+='e';return -1.2}}).join(','),s,a.slice(0,undefined).length,a.slice(Infinity).length,a.slice(-Infinity).length);`],
 ['slice generic and inherited',`var o={length:3,0:'a',2:'c'};Object.prototype[1]='b';var b=Array.prototype.slice.call(o,0,3);delete Object.prototype[1];console.log(b.join(','),b.length);`],
 ['slice species and holes',`var a=[1,,3],s='';a.constructor={[Symbol.species]:function(n){s+='C'+n;return {x:7}}};var b=a.slice(0,3);console.log(s,b[0],1 in b,b[2],b.x,b.length);`],
 ['slice species null and constructor errors',`var a=[1];a.constructor={[Symbol.species]:null};console.log(Array.isArray(a.slice()));a.constructor=null;try{a.slice()}catch(e){console.log(e.name)}`],
 ['slice length setter on species result',`var a=[1,2],s='',o={};Object.defineProperty(o,'length',{set:function(x){s+='L'+x}});a.constructor={[Symbol.species]:function(){return o}};var b=a.slice(0,1);console.log(b===o,b[0],s);`],
 ['slice own property bypasses inherited setter',`var a=[1],b={},s='';Object.defineProperty(b,'0',{set:function(){s+='set'},configurable:true});a.constructor={[Symbol.species]:function(){return Object.create(b)}};var r=a.slice();console.log(s,Object.prototype.hasOwnProperty.call(r,'0'),r[0],r.length);`],
 ['splice removes and inserts',`var a=[1,2,3,4],b=a.splice(1,2,'x','y','z');console.log(b.join(','),b.length,a.join(','),a.length,Array.prototype.splice.length);`],
 ['splice no arguments and one argument',`var a=[1,2,3];console.log(a.splice().length,a.join(','));var b=a.splice(1);console.log(b.join(','),a.join(','));`],
 ['splice sparse and inherited',`var a=[1,,3,4];var b=a.splice(0,2);console.log(b.length,0 in b,1 in b,a.length,a.join(','));Array.prototype[1]='p';a=[,2,3];b=a.splice(0,2);delete Array.prototype[1];console.log(b.join(','),a.join(','));`],
 ['splice negative and explicit undefined',`var a=[1,2,3,4];console.log(a.splice(-2,undefined,'x').length,a.join(','));console.log(a.splice(-2,Infinity,'y').join(','),a.join(','));`],
 ['splice generic shift left',`var o={length:4,0:'a',2:'c',3:'d'};var r=Array.prototype.splice.call(o,1,2);console.log(r.length,0 in r,r[1],o.length,o[0],o[1],2 in o);`],
 ['splice generic shift right',`var o={length:3,0:'a',2:'c'};var r=Array.prototype.splice.call(o,1,0,'x','y');console.log(r.length,o.length,o[0],o[1],o[2],3 in o,o[4]);`],
 ['splice species constructor',`var a=[1,2,3],s='';a.constructor={[Symbol.species]:function(n){s+='C'+n;return {x:7}}};var b=a.splice(1,1,'x');console.log(s,b[0],b.length,b.x,a.join(','));`],
 ['splice keeps inherited values on shift',`var a=[,1,2];Array.prototype[0]='p';var b=a.splice(1,0,'x');delete Array.prototype[0];console.log(b.length,a.length,a[0],a[1],a[2],a[3]);`],
 ['splice uses own properties on result',`var a=[1,2],p={},s='';Object.defineProperty(p,'0',{set:function(){s+='set'},configurable:true});a.constructor={[Symbol.species]:function(){return Object.create(p)}};var b=a.splice(0,1);console.log(s,Object.prototype.hasOwnProperty.call(b,'0'),b[0],b.length,a[0]);`],
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

test('array builtins: ES2020 Array unscopables names and descriptors',()=>{
 const source=`var u=Array.prototype[Symbol.unscopables],d=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.unscopables);console.log(Object.getPrototypeOf(u)===null,Object.keys(u).join(','),Object.keys(u).every(function(k){return u[k]===true}),d.writable,d.enumerable,d.configurable);`;
 expectProgram(source,'true copyWithin,entries,fill,find,findIndex,flat,flatMap,includes,keys,values true false false true\n');
});

test('array builtins: toLocaleString methods and strings survive stress GC',()=>{
 const source=`var a=[{toLocaleString(){for(var i=0;i<30;i++)({x:i});return {toString(){for(var j=0;j<30;j++)({y:j});return 'left'}}}},{toLocaleString(){for(var i=0;i<30;i++)({z:i});return 'right'}}];console.log(a.toLocaleString());`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: sort comparator and elements survive stress GC',()=>{
 const source=`var a=[{x:3},{x:1},{x:2}];a.sort(function(v,w){for(var i=0;i<30;i++)({i:i});return v.x-w.x});console.log(a[0].x,a[1].x,a[2].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

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
test('array builtins: filter species and callback survive stress GC',()=>{
 const source=`var a=[{x:1},,{x:3}];a.constructor={[Symbol.species]:function(n){for(var i=0;i<30;i++)({v:i});return new Array(n)}};var b=a.filter(function(v){for(var i=0;i<30;i++)({v:i});return v.x>1});console.log(b.length,b[0].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: slice species and getter survive stress GC',()=>{
 const source=`var a=[{x:1},,{x:3}];a.constructor={[Symbol.species]:function(n){for(var i=0;i<30;i++)({v:i});return new Array(n)}};Object.defineProperty(a,2,{get:function(){for(var i=0;i<30;i++)({v:i});return {x:4}}});var b=a.slice();console.log(b.length,b[0].x,1 in b,b[2].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: splice species, getter and inserted values survive stress GC',()=>{
 const source=`var a=[{x:1},,{x:3},{x:4}];a.constructor={[Symbol.species]:function(n){for(var i=0;i<30;i++)({v:i});return new Array(n)}};Object.defineProperty(a,2,{configurable:true,get:function(){for(var i=0;i<30;i++)({v:i});Object.defineProperty(a,2,{configurable:true,writable:true,value:{x:5}});return {x:5}}});var b=a.splice(1,2,{x:8},{x:9},{x:10});console.log(b.length,0 in b,b[1].x,a.length,a[0].x,a[1].x,a[2].x,a[3].x,a[4].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: Array.of constructor and items survive stress GC',()=>{
 const source=`function C(n){for(var i=0;i<30;i++)({v:i});this.initial=n}var x={x:1},y={x:2};var a=Array.of.call(C,x,y);console.log(a instanceof C,a.initial,a.length,a[0].x,a[1].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('array builtins: Array.from iterator, mapper and result survive stress GC',()=>{
 const source=`var it={[Symbol.iterator]:function(){var i=0;return {next:function(){for(var j=0;j<20;j++)({v:j});return i<3?{value:{x:++i},done:false}:{done:true}}}}};var a=Array.from(it,function(v,i){for(var j=0;j<20;j++)({v:j});return {x:v.x+i}});console.log(a.length,a[0].x,a[1].x,a[2].x);`;
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

test('array builtins: concat spreadability, species and entries survive stress GC',()=>{
 const source=`var value={x:7},a=[value],o={length:2,1:{x:9}},s='';Object.defineProperty(o,Symbol.isConcatSpreadable,{get:function(){for(var i=0;i<30;i++)({x:i});s+='S';return true}});Object.defineProperty(o,'0',{get:function(){for(var i=0;i<30;i++)({x:i});s+='G';return value}});a.constructor={[Symbol.species]:function(){for(var i=0;i<30;i++)({x:i});return []}};var r=a.concat(o);console.log(r.length,r[0].x,r[1].x,r[2].x,s);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('array builtins: flat nested arrays and species survive stress GC',()=>{
 const source=`var value={x:7},a=[,[value,[{x:8}]]];a.constructor={[Symbol.species]:function(){for(var i=0;i<30;i++)({x:i});return []}};var b=a.flat(2);console.log(b.length,b[0].x,b[1].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('array builtins: flatMap callback and mapped values survive stress GC',()=>{
 const source=`var value={x:7},a=[value,{x:8}],t={n:1};var b=a.flatMap(function(v,i){for(var j=0;j<30;j++)({x:j});return [v,{x:v.x+this.n+i}]},t);console.log(b.length,b[0].x,b[1].x,b[2].x,b[3].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
