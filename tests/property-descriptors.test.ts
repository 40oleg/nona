import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {installAccessorFixture,oracleInstaller} from './helpers/accessors.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {RuntimeBuilder} from '../src/runtime/abi.js';

const prefix='function show(d){if(d===undefined){console.log("missing");return;}console.log("value" in d,d.value,"writable" in d,d.writable,"get" in d,typeof d.get,"set" in d,typeof d.set,d.enumerable,d.configurable);}';
function native(source:string){
 const program=generate(lower(bind(parse(lex(prefix+source)))),{gcStress:true});
 const builder=new RuntimeBuilder();builder.bundle={fragments:program.fragments,functions:program.functions,imports:program.imports};
 installAccessorFixture(builder);return runNative(linkHost(program));
}
const cases:[string,string][]=[
 ['own data and missing inherited','let o={__proto__:{x:3},y:4};show(Object.getOwnPropertyDescriptor(o,"x"));show(Object.getOwnPropertyDescriptor(o,"y"));show(Object.getOwnPropertyDescriptor(o,"z"));'],
 ['returned descriptor is fresh and mutable','let o={x:3},d=Object.getOwnPropertyDescriptor(o,"x"),e=Object.getOwnPropertyDescriptor(o,"x");d.value=7;d.writable=false;console.log(o.x,d===e,Object.getPrototypeOf(d)===Object.prototype);show(Object.getOwnPropertyDescriptor(d,"value"));'],
 ['array length holes and indices','let a=[1,,3];show(Object.getOwnPropertyDescriptor(a,"length"));show(Object.getOwnPropertyDescriptor(a,0));show(Object.getOwnPropertyDescriptor(a,1));show(Object.getOwnPropertyDescriptor(Array.prototype,"length"));'],
 ['string own properties and primitive boxing','show(Object.getOwnPropertyDescriptor("ab","length"));show(Object.getOwnPropertyDescriptor("ab",1));show(Object.getOwnPropertyDescriptor(new String("ab"),0));show(Object.getOwnPropertyDescriptor("ab",2));show(Object.getOwnPropertyDescriptor(3,"x"));'],
 ['function metadata','function f(a,b){}show(Object.getOwnPropertyDescriptor(f,"name"));show(Object.getOwnPropertyDescriptor(f,"length"));let d=Object.getOwnPropertyDescriptor(f,"prototype");console.log(d.value===f.prototype,d.writable,d.enumerable,d.configurable);show(Object.getOwnPropertyDescriptor(f.bind(null),"prototype"));'],
 ['global binding aliases','var descriptorGlobal=7;show(Object.getOwnPropertyDescriptor(this,"descriptorGlobal"));let d=Object.getOwnPropertyDescriptor(this,"Number");console.log(d.value===Number,d.writable,d.enumerable,d.configurable);'],
 ['mapped arguments read current cell','function f(a){a=7;show(Object.getOwnPropertyDescriptor(arguments,0));arguments[0]=9;show(Object.getOwnPropertyDescriptor(arguments,0));console.log(a);delete arguments[0];show(Object.getOwnPropertyDescriptor(arguments,0));}f(1);'],
 ['accessor reflection does not invoke getter','let o={};function g(){console.log("unexpected");return 3;}function s(v){}globalThis.installAccessor(o,"x",g,s);let d=Object.getOwnPropertyDescriptor(o,"x");show(d);console.log(d.get===g,d.set===s);'],
 ['undefined accessor methods remain own fields','let o={};globalThis.installAccessor(o,"x",undefined,undefined);show(Object.getOwnPropertyDescriptor(o,"x"));'],
 ['key coercion observes mutation and GC','let o={x:3},key={toString:function(){delete o.x;o.y=""+42;for(let i=0;i<20;i++){({s:""+i});}return "y";}};show(Object.getOwnPropertyDescriptor(o,key));'],
 ['descriptor result ignores inherited setters','let calls=0;globalThis.installAccessor(Object.prototype,"value",undefined,function(){calls++;});let d=Object.getOwnPropertyDescriptor({x:3},"x");delete Object.prototype.value;show(d);console.log(calls);'],
 ['legacy proto descriptor identities and invocation','let d=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__"),e=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__");show(d);console.log(d.get===e.get,d.set===e.set,d.get.name,d.get.length,d.set.name,d.set.length,"prototype" in d.get);let p={},o={};console.log(d.set.call(o,p),d.get.call(o)===p,d.get.call(3)===Number.prototype,d.set.call(3,p));'],
 ['legacy proto descriptor disappearance','delete Object.prototype.__proto__;show(Object.getOwnPropertyDescriptor(Object.prototype,"__proto__"));Object.prototype.__proto__=3;show(Object.getOwnPropertyDescriptor(Object.prototype,"__proto__"));'],
 ['method metadata','console.log(Object.getOwnPropertyDescriptor.name,Object.getOwnPropertyDescriptor.length,"prototype" in Object.getOwnPropertyDescriptor,Object.getOwnPropertyDescriptor.toString());'],
];
for(const [name,source] of cases)test('property descriptor: '+name,()=>{
 const run=native(source);assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(oracleInstaller+prefix+source).stdout);
});
for(const source of [
 'Object.getOwnPropertyDescriptor(null,{toString:function(){console.log("unexpected");return "x";}});',
 'Object.getOwnPropertyDescriptor(undefined,"x");',
 'let d=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__");d.get.call(null);',
 'let d=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__");d.set.call(null,3);',
 'let d=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__"),o={};d.set.call(o,o);',
])test('property descriptor error: '+source,()=>{
 const run=native(source);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
 const oracle=spawnSync(process.execPath,['-e',oracleInstaller+source],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(oracle.status,1);assert.equal(run.stdout.toString(),oracle.stdout);
});
