import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['identity and type',`var a=Symbol('x'),b=Symbol('x');console.log(typeof a,a===a,a===b,a==b,!!a);`],
 ['description and conversion',`var a=Symbol('x'),b=Symbol();console.log(String(a),String(b),a.toString(),b.toString());`],
 ['property identity',`var a=Symbol('x'),b=Symbol('x'),o={};o[a]=3;o[b]=4;console.log(o[a],o[b],o[Symbol('x')]);`],
 ['reflection filters',`var s=Symbol('x'),o={a:1};o[s]=2;console.log(Object.keys(o).join(','),Object.getOwnPropertyNames(o).join(','),Object.getOwnPropertyDescriptor(o,s).value);`],
 ['symbol key ordering',`var a=Symbol('a'),b=Symbol('b'),o={};o[b]=2;o[1]=1;o[a]=3;console.log(Object.getOwnPropertySymbols(o)[0]===b,Object.getOwnPropertySymbols(o)[1]===a,Object.keys(o).join(','));`],
 ['boxed symbol',`var s=Symbol('x'),o=Object(s);console.log(typeof o,o.valueOf()===s,o.toString());`],
 ['symbol numeric error',`var s=Symbol();try{+s;}catch(e){console.log(e instanceof TypeError);}try{''+s;}catch(e){console.log(e instanceof TypeError);}`],
 ['symbol construction error',`try{new Symbol();}catch(e){console.log(e instanceof TypeError);}`],
 ['global registry',`var a=Symbol.for('x'),b=Symbol.for('x'),c=Symbol('x');console.log(a===b,a===c,Symbol.keyFor(a),Symbol.keyFor(c));`],
 ['well-known symbols',`console.log(typeof Symbol.iterator,Symbol.iterator===Symbol.iterator,Symbol.iterator===Symbol.for('Symbol.iterator'),Symbol.iterator.toString());`],
 ['toPrimitive hook',`var o={valueOf:function(){return 1;},[Symbol.toPrimitive]:function(h){console.log(h);return h==='string'?'key':7;}};var x={};x[o]=3;console.log(x.key,+o,''+o);`],
 ['boxed symbol primitive',`var s=Symbol('x'),o=Object(s),x={};x[o]=5;console.log(o==s,Object.getOwnPropertySymbols(x)[0]===s,x[s]);`],
 ['description getter',`console.log(Symbol('x').description,Symbol().description,Symbol('').description,Symbol.iterator.description);`],
 ['toStringTag hook',`var o={[Symbol.toStringTag]:'Custom'};console.log(Object.prototype.toString.call(o),Object.prototype.toString.call(Symbol('x')));`],
 ['Symbol prototype tag',`console.log(Symbol.prototype[Symbol.toStringTag],Object.prototype.toString.call(Object(Symbol('x'))));`],
 ['custom hasInstance',`var matcher={[Symbol.hasInstance]:function(x){return x.value===7;}};console.log(({value:7}) instanceof matcher,({value:8}) instanceof matcher);`],
 ['native hasInstance',`function F(){}var x=new F();console.log(x instanceof F,Function.prototype[Symbol.hasInstance].call(F,x),Function.prototype[Symbol.hasInstance].call({},x));`],
];
for(const [name,source] of cases)test(`symbol: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('symbol: property identity survives stress GC',()=>{
 const source=`var s=Symbol('held'),o={};o[s]=14;for(var i=0;i<80;i++){var t=Symbol('temp'+i);o[t]=i;}console.log(o[s],Object.getOwnPropertySymbols(o).length,s.toString());`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('symbol: registry survives stress GC',()=>{
 const source=`var a=Symbol.for('persistent');for(var i=0;i<90;i++){Symbol.for('ephemeral'+i);({v:i});}console.log(Symbol.for('persistent')===a,Symbol.keyFor(a));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('symbol: toStringTag getter survives stress GC',()=>{
 const source=`var o={};Object.defineProperty(o,Symbol.toStringTag,{get:function(){for(var i=0;i<30;i++)({x:i});return 'Live';}});console.log(Object.prototype.toString.call(o));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
