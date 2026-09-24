import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
const cases:[string,string][]=[
 ["intrinsic property order Object","let keys=Object.getOwnPropertyNames(Object),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"length\"||k===\"name\"||k===\"prototype\"||k===\"getOwnPropertyDescriptor\"||k===\"getOwnPropertyDescriptors\"||k===\"getOwnPropertyNames\"||k===\"create\"||k===\"defineProperties\"||k===\"defineProperty\"||k===\"getPrototypeOf\"||k===\"setPrototypeOf\"||k===\"keys\"||k===\"entries\"||k===\"values\")s+=k+\"|\";}console.log(s);"],
 ["intrinsic property order Function.prototype","let keys=Object.getOwnPropertyNames(Function.prototype),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"length\"||k===\"name\"||k===\"constructor\"||k===\"apply\"||k===\"bind\"||k===\"call\"||k===\"toString\")s+=k+\"|\";}console.log(s);"],
 ["intrinsic property order Object.prototype","let keys=Object.getOwnPropertyNames(Object.prototype),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"constructor\"||k===\"hasOwnProperty\"||k===\"isPrototypeOf\"||k===\"propertyIsEnumerable\"||k===\"toString\"||k===\"valueOf\"||k===\"__proto__\"||k===\"toLocaleString\")s+=k+\"|\";}console.log(s);"],
 ["intrinsic property order Array.prototype","let keys=Object.getOwnPropertyNames(Array.prototype),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"length\"||k===\"constructor\"||k===\"join\"||k===\"toString\")s+=k+\"|\";}console.log(s);"],
 ["intrinsic property order Boolean.prototype","let keys=Object.getOwnPropertyNames(Boolean.prototype),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"constructor\"||k===\"toString\"||k===\"valueOf\")s+=k+\"|\";}console.log(s);"],
 ["intrinsic property order Number.prototype","let keys=Object.getOwnPropertyNames(Number.prototype),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"constructor\"||k===\"toString\"||k===\"valueOf\")s+=k+\"|\";}console.log(s);"],
 ["intrinsic property order String.prototype","let keys=Object.getOwnPropertyNames(String.prototype),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"length\"||k===\"constructor\"||k===\"toString\"||k===\"valueOf\")s+=k+\"|\";}console.log(s);"],
 ["intrinsic property order globalThis","let keys=Object.getOwnPropertyNames(globalThis),s=\"\";for(let i=0;i<keys.length;i++){let k=keys[i];if(k===\"Object\"||k===\"Function\"||k===\"Array\"||k===\"Number\"||k===\"Boolean\"||k===\"String\"||k===\"globalThis\")s+=k+\"|\";}console.log(s);"],

 ['keys numeric and insertion order','let o={z:1,10:2,2:3,a:4,"01":5,"4294967295":6,0:7};console.log(Object.keys(o).join("|"),Object.values(o).join("|"),Object.entries(o).join("|"));'],
 ['delete reinsert versus redefine order','let o={a:1,b:2,c:3};delete o.b;o.b=4;Object.defineProperty(o,"a",{value:5});console.log(Object.keys(o).join("|"));'],
 ['nonenumerable and inherited are excluded','let o={__proto__:{p:1},x:2};Object.defineProperty(o,"hidden",{value:3});console.log(Object.keys(o).join("|"),Object.getOwnPropertyNames(o).join("|"));'],
 ['arrays and boxed strings','let a=[1,,3];a.x=4;console.log(Object.keys(a).join("|"),Object.getOwnPropertyNames(a).join("|"));console.log(Object.keys("ab").join("|"),Object.values("ab").join("|"),Object.getOwnPropertyNames("ab").join("|"),Object.keys(3).length);'],
 ['function metadata order','function f(a){}console.log(Object.getOwnPropertyNames(f).join("|"),Object.getOwnPropertyNames(f.bind(null)).join("|"));Object.defineProperty(f,"name",{enumerable:true});Object.defineProperty(f,"length",{enumerable:true});console.log(Object.keys(f).join("|"));'],
 ['redeclared builtin preserves global key position','function fresh(){}function Number(){}let a=Object.keys(globalThis),s="";for(let i=0;i<a.length;i++){if(a[i]==="fresh"||a[i]==="Number")s+=a[i]+"|";}console.log(s);'],
 ['bulk descriptor reflection preserves methods and proto data key','let o=Object.create(null);Object.defineProperty(o,"x",{get:function(){console.log("unexpected");return 3;}});Object.defineProperty(o,"__proto__",{value:7,enumerable:true});let d=Object.getOwnPropertyDescriptors(o);console.log(Object.keys(d).join("|"),typeof d.x.get,d.__proto__.value,Object.getPrototypeOf(d)===Object.prototype);'],
 ['intrinsic metadata creation order','let k=Object.getOwnPropertyNames(Number);console.log(k[0],k[1],k[2],Object.getOwnPropertyNames(Object.keys).join("|"));'],
 ['keys never reads getters','let o={};Object.defineProperty(o,"x",{enumerable:true,get:function(){console.log("unexpected");return 7;}});console.log(Object.keys(o).join("|"));'],
 ['values recheck descriptors after getters','let o={};Object.defineProperty(o,"a",{enumerable:true,get:function(){delete o.b;Object.defineProperty(o,"c",{enumerable:true});o.d=4;return 1;}});o.b=2;Object.defineProperty(o,"c",{value:3,configurable:true});console.log(Object.values(o).join("|"),Object.keys(o).join("|"));'],
 ['entry key snapshot and result survive mutation GC','let o={};Object.defineProperty(o,"a"+1,{enumerable:true,configurable:true,get:function(){delete this.a1;o=null;for(let i=0;i<30;i++){({s:""+i});}return "value"+42;}});console.log(Object.entries(o).join("|"));'],
 ['global aliases follow older builtin properties','var collectionAlias=3;globalThis.collectionDynamic=4;Object.defineProperty(globalThis,"Number",{enumerable:true});let keys=Object.keys(globalThis),s="";for(let i=0;i<keys.length;i++){let k=keys[i];if(k==="Number"||k==="collectionAlias"||k==="collectionDynamic")s+=k+"|";}console.log(s);'],
 ['create null and ordinary prototypes','let p={x:3},o=Object.create(p),n=Object.create(null);console.log(Object.getPrototypeOf(o)===p,o.x,Object.getPrototypeOf(n),n.toString,Object.keys(n).length);'],
 ['create descriptors and accessor receiver','let p={x:3},o=Object.create(p,{y:{value:7,enumerable:true},z:{get:function(){return this.x+this.y;},enumerable:true}});console.log(o.z,Object.keys(o).join("|"));o.y=9;console.log(o.y);'],
 ['defineProperties returns target and ignores inherited entries','let o={},p={__proto__:{bad:3},a:{value:1}};console.log(Object.defineProperties(o,p)===o,o.a,o.bad);'],
 ['defineProperties collects everything before writing','let o={},p={a:{value:1}};Object.defineProperty(p,"b",{enumerable:true,get:function(){console.log(o.a);return {value:2};}});Object.defineProperties(o,p);console.log(o.a,o.b);'],
 ['defineProperties snapshots keys and rechecks enumerability','let o={},p={};Object.defineProperty(p,"a",{enumerable:true,get:function(){delete p.b;Object.defineProperty(p,"c",{enumerable:true});p.d={value:4};return {value:1};}});p.b={value:2};Object.defineProperty(p,"c",{value:{value:3},configurable:true});Object.defineProperties(o,p);console.log(Object.getOwnPropertyNames(o).join("|"),o.a,o.b,o.c,o.d);'],
 ['descriptor records survive late callbacks and lost source','let o={},p={a:{value:{text:""+42}}};Object.defineProperty(p,"b",{enumerable:true,get:function(){p.a.value=null;p=null;for(let i=0;i<30;i++){({s:""+i});}return {value:7};}});Object.defineProperties(o,p);console.log(o.a.text,o.b);'],
 ['primitive property bags and omitted create descriptors','let o={};console.log(Object.defineProperties(o,3)===o,Object.keys(Object.create(null,undefined)).length);'],
 ['numeric descriptor keys define in numeric order','let o={};Object.defineProperties(o,{10:{value:10,enumerable:true},2:{value:2,enumerable:true},a:{value:3,enumerable:true}});console.log(Object.keys(o).join("|"));'],
 ['enumeration scales over reverse numeric keys','let o={};for(let i=511;i>=0;i--)o[i]=i;let k=Object.keys(o);console.log(k.length,k[0],k[255],k[511]);'],
 ['method metadata','console.log(Object.create.length,Object.defineProperties.length,Object.keys.length,Object.values.length,Object.entries.length,Object.getOwnPropertyNames.length,"prototype" in Object.create);'],
];
function native(source:string){return runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));}
for(const [name,source] of cases)test('Object collections: '+name,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.toString(),runOracle(source).stdout);});
for(const source of [
 'Object.create();','Object.create(3);','Object.create(null,null);','Object.defineProperties(null,{});',
 'Object.defineProperties({},null);','Object.keys(null);','Object.values(undefined);','Object.entries(null);','Object.getOwnPropertyNames(undefined);',
 'Object.defineProperties({}, {a:{value:1},b:3});',
 'let o={};Object.defineProperty(o,"x",{value:1});let p={a:{value:2},x:{value:3},z:{value:4}};Object.defineProperty(p,"z",{get:function(){console.log("collected z");return {value:4};},enumerable:true});Object.defineProperties(o,p);',
])test('Object collections error: '+source,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,1);assert.match(r.stderr.toString(),/Nona runtime error/);const n=spawnSync(process.execPath,['-e',source],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(n.status,1);assert.equal(r.stdout.toString(),n.stdout);});
