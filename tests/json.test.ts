import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runOnHost} from './helpers/host.js';

test('JSON Proxy traversal preserves values during GC stress',()=>{
 const source=`var replacer=new Proxy(['b'],{get:function(t,k){for(var i=0;i<12;i++)({i:i});return t[k]}});
 console.log(JSON.stringify({a:1,b:2},replacer));
 var values=new Proxy([1,2],{get:function(t,k){for(var i=0;i<12;i++)({i:i});return t[k]}});
 console.log(JSON.stringify(values));
 var lengthProxy=new Proxy(['b'],{get:function(t,k){if(k==='length')return {valueOf:function(){for(var i=0;i<12;i++)({i:i});return 1}};return t[k]}});
 console.log(JSON.stringify({a:1,b:2},lengthProxy));
 var seen=[];JSON.parse('[0,0]',function(k,v){if(k==='0')this[1]=new Proxy([3],{});seen.push(k);return v});console.log(seen.join(','))`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('JSON intrinsic metadata',()=>expectProgram(`console.log(Object.prototype.toString.call(JSON),typeof JSON.parse,JSON.parse.length,typeof JSON.stringify,JSON.stringify.length,Object.getPrototypeOf(JSON)===Object.prototype)`,'[object JSON] function 2 function 3 true\n'));
test('JSON.parse exact primitive literals',()=>expectProgram(`let errors=[];for(let s of ['null','true','false','other']){try{let v=JSON.parse(s);console.log(typeof v,String(v))}catch(e){console.log(e.name)}}`,'object null\nboolean true\nboolean false\nSyntaxError\n'));
test('JSON.parse number grammar',()=>expectProgram(`for(let s of ['0','-0','12','-12.5','1e3','1E-3','01','+1','1.','1e','1e+','NaN','Infinity']){try{let x=JSON.parse(s);console.log(s,Object.is(x,-0)?'-0':String(x))}catch(e){console.log(s,e.name)}}`,'0 0\n-0 -0\n12 12\n-12.5 -12.5\n1e3 1000\n1E-3 0.001\n01 SyntaxError\n+1 SyntaxError\n1. SyntaxError\n1e SyntaxError\n1e+ SyntaxError\nNaN SyntaxError\nInfinity SyntaxError\n'));
test('JSON.parse trims JSON whitespace only',()=>{const inputs=[' \t\ntrue\r ','\t -12.5 \n','\u000btrue',' true\u00a0'];expectProgram(`for(let s of ${JSON.stringify(inputs)}){try{console.log(JSON.parse(s))}catch(e){console.log(e.name)}}`,'true\n-12.5\nSyntaxError\nSyntaxError\n');});
test('JSON.parse quoted strings and escapes',()=>{const inputs=['"a\\n\\u0041\\/\\"\\\\z"','"\\uD800"','""','"bad\nline"','"\\x"','"unterminated'];expectProgram(`for(let s of ${JSON.stringify(inputs)}){try{let v=JSON.parse(s);console.log(JSON.stringify(v))}catch(e){console.log(e.name)}}`,'"a\\nA/\\"\\\\z"\n"\\ud800"\n""\nSyntaxError\nSyntaxError\nSyntaxError\n');});
test('JSON.parse nested arrays and objects',()=>{const value=' { "property" : {}, "prop2" : [true,null,123.456,{"x":[1,2]}] } ';expectProgram(`let x=JSON.parse(${JSON.stringify(value)});console.log(Object.keys(x).join(','),Object.keys(x.property).length,x.prop2.length,x.prop2[0],x.prop2[1],x.prop2[2],x.prop2[3].x[1])`,'property,prop2 0 4 true null 123.456 2\n');});
test('JSON.parse allows whitespace before every structural token',()=>{const values=['{}','{ \n }','{"property" : { }}','{ \n "property" : { } , "prop2" : [ true , null , 123.456 ] }'];expectProgram(`for(let s of ${JSON.stringify(values)}){try{JSON.parse(s);console.log('ok')}catch(e){console.log(e.name)}}`,'ok\nok\nok\nok\n');});
test('JSON.parse defines __proto__ as data and rejects trailing commas',()=>{const inputs=['{"__proto__":[],"__proto__":2}','[1,]','{"x":1,}','[1,,2]'];expectProgram(`let a=JSON.parse(${JSON.stringify(inputs[0])});console.log(Object.getPrototypeOf(a)===Object.prototype,a.__proto__);for(let s of ${JSON.stringify(inputs.slice(1))}){try{JSON.parse(s);console.log('accepted')}catch(e){console.log(e.name)}}`,'true 2\nSyntaxError\nSyntaxError\nSyntaxError\n');});
test('JSON.parse reviver visits children then root',()=>expectProgram(`let log=[];let x=JSON.parse('{"b":[1,2],"a":3}',function(k,v){log.push(k);return v});console.log(log.length,'['+log.join('|')+']',x.b[1],x.a)`,'5 [0|1|b|a|] 2 3\n'));
test('JSON.parse reviver deletes properties and owns root wrapper',()=>expectProgram(`let holder;let x=JSON.parse('{"a":1,"b":2}',function(k,v){if(k===''){holder=this}if(k==='a')return undefined;return v});console.log(Object.keys(x).join(','),Object.getPrototypeOf(holder)===Object.prototype,Object.keys(holder).join(','))`,'b true \n'));
test('JSON.parse reviver ignores failed ordinary delete and define',()=>expectProgram(`let a=JSON.parse('[1,2]',function(k,v){if(k==='0')Object.defineProperty(this,'1',{configurable:false});if(k==='1')return 22;return v});let o=JSON.parse('{"a":1,"b":2}',function(k,v){if(k==='a')Object.defineProperty(this,'b',{configurable:false});if(k==='b')return undefined;return v});console.log(a[0],a[1],o.a,o.b)`,'1 2 1 2\n'));
test('JSON.stringify primitive values',()=>expectProgram(`for(let x of [null,true,false,0,-0,12.5,NaN,Infinity,-Infinity,undefined,Symbol('x')])console.log(JSON.stringify(x))`,'null\ntrue\nfalse\n0\n0\n12.5\nnull\nnull\nnull\nundefined\nundefined\n'));
test('JSON.stringify quotes controls and surrogates',()=>{const value='a"\\\n\t\u0000\ud800\udc00\ud800x';expectProgram(`console.log(JSON.stringify(${JSON.stringify(value)}))`,JSON.stringify(value)+'\n');});
test('JSON.stringify nested arrays and objects',()=>expectProgram(`console.log(JSON.stringify([1,undefined,null,{a:true}]));console.log(JSON.stringify({a:1,b:undefined,c:[2]}))`,'[1,null,null,{"a":true}]\n{"a":1,"c":[2]}\n'));
test('JSON.stringify detects cycles and clears guard after a throw',()=>expectProgram(`let a=[];a.push(a);try{JSON.stringify(a)}catch(e){console.log(e.name)}a.pop();console.log(JSON.stringify(a))`,'TypeError\n[]\n'));
test('JSON.stringify invokes toJSON with each property key',()=>expectProgram(`let o={a:{toJSON:function(k){return k+'!'}},b:[{toJSON:function(k){return k+'?'}}]};console.log(JSON.stringify(o));console.log(JSON.stringify({toJSON:function(k){return k+'root'}}))`,'{"a":"a!","b":["0?"]}\n"root"\n'));
test('JSON.stringify unwraps primitive wrapper objects',()=>expectProgram(`console.log(JSON.stringify([new Boolean(true),new Number(2),new String('a')]));console.log(JSON.stringify({b:new Boolean(false),n:new Number(3),s:new String('x')}))`,'[true,2,"a"]\n{"b":false,"n":3,"s":"x"}\n'));
test('JSON.stringify invokes BigInt toJSON before the replacer',()=>expectProgram(`
  BigInt.prototype.toJSON=function(key){'use strict';console.log(typeof this,key);return 'converted'};
  console.log(JSON.stringify({n:1n}));
  delete BigInt.prototype.toJSON;
  try{JSON.stringify(Object(2n))}catch(error){console.log(error.name)}
  try{JSON.stringify(3n,function(key,value){return value})}catch(error){console.log(error.name)}
`,'bigint n\n{"n":"converted"}\nTypeError\nTypeError\n'));
test('JSON.stringify replacer function receives holder and key',()=>expectProgram(`let a={x:1,y:2};console.log(JSON.stringify(a,function(k,v){if(k==='x')return v+5;if(k==='y')return undefined;return v}));console.log(JSON.stringify([1,2],function(k,v){if(k==='1')return undefined;return v}))`,'{"x":6}\n[1,null]\n'));
test('JSON.stringify replacer array controls object keys recursively',()=>expectProgram(`let a={a:{b:2,c:3},b:1,c:4};console.log(JSON.stringify(a,['c','b','a','b']));console.log(JSON.stringify({a:1},[]))`,'{"c":4,"b":1,"a":{"c":3,"b":2}}\n{}\n'));
test('JSON operations recognize array proxies and observe their length',()=>expectProgram(`let r=new Proxy(['b'],{});console.log(JSON.stringify({a:1,b:2},r));let a=new Proxy([], {get(t,k){if(k==='length')return 2;return Number(k)}});console.log(JSON.stringify(a));let seen=0;JSON.parse('[null,null]',function(k,v){if(k==='0')this[1]=new Proxy([],{});if(k==='other')seen++;return v});console.log(seen)`,'{"b":2}\n[0,1]\n0\n'));
test('JSON.stringify space indents nested arrays and objects',()=>expectProgram(`console.log(JSON.stringify({a:[1,{b:2}]},null,'  '));console.log(JSON.stringify([1,2],null,1))`,'{\n  "a": [\n    1,\n    {\n      "b": 2\n    }\n  ]\n}\n[\n 1,\n 2\n]\n'));

// Fast paths (roadmap item 14): keys shared through a per-parse cache, exact
// decimals without ToNumber, array elements by Number key, strings quoted and
// integers written straight into the stringify builder. Under GC stress every
// member is a collection, which also invalidates the key cache.
const fastPathSource=String.raw`
const texts=['{"a":1,"a":2,"b":[1,2,{"a":"x"}]}',
 '[0.1,0.2,0.3,1.5,-2.5,123.456,0.000001,9007199254740.993,1234567890.12345,99999999999999.9,0.30000000000000004,-0.0,12.5e-3,5e-324,123456789012345.6,0.1234567890123456,1.0000000000000002]',
 '{"k\\u0041":1,"kA":2,"\\"q":3,"é":4,"":5,"long key with spaces":6}',
 JSON.stringify(Array.from({length:40},(_, i)=>({["key"+i]:i,["key"+(i%7)]:"v"+i})))];
for(const t of texts){const v=JSON.parse(t);console.log(JSON.stringify(v),Object.is(JSON.parse("-0.0"),-0),Object.keys(v).length);}
console.log(JSON.stringify([0,-0,9,-98765,2**31,2**53-1,-(2**53-1),2**53,2**53+2,1e21,4294967295,0.5,-1e-7,NaN,Infinity]));
console.log(JSON.stringify({a:"x\"y\\z\n\u0001\ud800é😀",b:["","plain","tab\there"],"key\"q":1,"ключ":[true,false,null]}));
console.log(JSON.stringify([1,[2,{toJSON(k){return "k="+k+typeof k}}]]),JSON.stringify([5,6],(k,v)=>Array.isArray(v)?v:k+typeof k));
const holes=[1,,3];holes.length=5;console.log(JSON.stringify(holes));
for(const bad of ['{"a" 1}','{"a\\x":1}','[1,]','{"a":01}','1.','.5','-']){try{JSON.parse(bad);console.log('accepted',bad)}catch(e){console.log(e.name)}}
`;
test('JSON fast paths agree with Node.js under GC stress',()=>{
 const run=runOnHost(fastPathSource);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(fastPathSource).stdout);
});
