import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {linkLinux} from '../src/backend/linux/index.js';

// Run on the host's native target with GC stress so the tests execute on both
// Windows and Linux CI runners.
function run(source:string):{status:number|null;stdout:string;stderr:string;error?:Error}{
 const program=generate(compileToIR(source),{gcStress:true});
 if(process.platform!=='linux'){
  const result=runNative(linkPe(program));
  return {status:result.status,stdout:result.stdout.toString(),stderr:result.stderr.toString(),error:result.error};
 }
 const directory=mkdtempSync(join(tmpdir(),'nona-annexb-'));
 try{
  const executable=join(directory,'image');
  writeFileSync(executable,linkLinux(program));chmodSync(executable,0o755);
  const result=spawnSync(executable,[],{encoding:'utf8',timeout:60_000});
  return {status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error};
 }finally{rmSync(directory,{recursive:true,force:true});}
}

const cases:[string,string][]=[
 ['metadata','let p=Object.prototype;for(const n of ["__defineGetter__","__defineSetter__","__lookupGetter__","__lookupSetter__"]){let d=Object.getOwnPropertyDescriptor(p,n),f=d.value;console.log(n,f.name,f.length,d.writable,d.enumerable,d.configurable,typeof f,"prototype" in f,p.propertyIsEnumerable(n));}'],
 ['methods are not constructors','let r=[];for(const f of [Object.prototype.__defineGetter__,Object.prototype.__lookupSetter__]){try{new f("x",function(){});r.push("constructed");}catch(e){r.push(e instanceof TypeError);}}console.log(r.join());'],
 ['define getter and setter merge into one accessor','let o={};console.log(o.__defineGetter__("x",function(){return this.v*2;}),o.__defineSetter__("x",function(v){this.v=v+1;}));o.x=4;let d=Object.getOwnPropertyDescriptor(o,"x");console.log(o.x,o.v,d.enumerable,d.configurable,typeof d.get,typeof d.set,"value" in d);'],
 ['define replaces data property and keeps other accessor half','let s=function(){},o={x:1};Object.defineProperty(o,"y",{set:s,configurable:true});o.__defineGetter__("x",function(){return 9;});o.__defineGetter__("y",function(){return 8;});let d=Object.getOwnPropertyDescriptor(o,"y");console.log(o.x,o.y,d.set===s,d.enumerable);'],
 ['callable check precedes single key conversion','let n=0,k={toString(){n++;return "k";}},o={},r=[];for(const g of [1,"",true,{},null,undefined,Symbol()]){try{o.__defineGetter__(k,g);}catch(e){r.push(e.constructor.name);}}o.__defineSetter__(k,function(){});console.log(r.join(),n,Object.keys(o).join());'],
 ['receiver coercion precedes key conversion','let n=0,k={toString(){n++;return "k";}},f=function(){},r=[];for(const m of ["__defineGetter__","__defineSetter__","__lookupGetter__","__lookupSetter__"])for(const t of [null,undefined]){try{Object.prototype[m].call(t,k,f);}catch(e){r.push(e instanceof TypeError);}}console.log(r.join(),n);'],
 ['primitive receivers box','let g=function(){return "g";};Object.defineProperty(Number.prototype,"q",{get:g,configurable:true});console.log(Object.prototype.__lookupGetter__.call(5,"q")===g,Object.prototype.__lookupGetter__.call("ab","length"),Object.prototype.__lookupSetter__.call(true,"q"));Object.prototype.__defineGetter__.call(7,"z",g);console.log((7).z);'],
 ['symbol and numeric keys','let s=Symbol("s"),o={},g=function(){return "sym";},h=function(){return "num";};o.__defineGetter__(s,g);o.__defineGetter__(1.5,h);console.log(o[s],o["1.5"],o.__lookupGetter__(s)===g,o.__lookupGetter__("1.5")===h,o.__lookupGetter__({toString(){return "1.5";}})===h);'],
 ['lookup walks prototype chain and stops at first own property','let g=function(){},s=function(){},root={};Object.defineProperty(root,"a",{get:g,set:s});let mid=Object.create(root,{b:{value:1}}),leaf=Object.create(mid);console.log(leaf.__lookupGetter__("a")===g,leaf.__lookupSetter__("a")===s,leaf.__lookupGetter__("b"),leaf.__lookupGetter__("missing"),Object.create(root,{a:{value:2}}).__lookupGetter__("a"));'],
 ['lookup of accessor half without function','let root={};Object.defineProperty(root,"x",{get:function(){}});console.log(root.__lookupSetter__("x"),Object.create(null).__proto__,Object.prototype.__lookupGetter__.call(Object.create(null),"x"));'],
 ['lookup finds builtin accessors','let d=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__");console.log(({}).__lookupGetter__("__proto__")===d.get,({}).__lookupSetter__("__proto__")===d.set,[].__lookupGetter__("length"));'],
 ['non-extensible and non-configurable targets throw TypeError','let f=function(){},o=Object.preventExtensions({e:1}),c=Object.defineProperty({},"x",{value:1}),r=[];o.__defineGetter__("e",f);try{o.__defineGetter__("n",f);}catch(e){r.push(e instanceof TypeError);}try{c.__defineSetter__("x",f);}catch(e){r.push(e instanceof TypeError);}console.log(r.join(),typeof Object.getOwnPropertyDescriptor(o,"e").get,Object.isFrozen(Object.freeze({})));'],
 ['Proxy traps observe the algorithm','let log=[],t={};Object.defineProperty(t,"x",{get:function(){return 1;},configurable:true});let p=new Proxy(Object.create(t),{getOwnPropertyDescriptor(o,k){log.push("gopd:"+String(k));return Reflect.getOwnPropertyDescriptor(o,k);},getPrototypeOf(o){log.push("proto");return Reflect.getPrototypeOf(o);},defineProperty(o,k,d){log.push("define:"+String(k)+":"+Object.keys(d).sort().join("/")+":"+d.enumerable+d.configurable);return Reflect.defineProperty(o,k,d);}});console.log(typeof p.__lookupGetter__("x"));p.__defineSetter__("y",function(){});console.log(log.join());'],
 ['abrupt Proxy traps propagate','let r=[],e=function(){throw new RangeError("trap");};for(const [h,f] of [[{getOwnPropertyDescriptor:e},p=>p.__lookupGetter__("x")],[{getPrototypeOf:e},p=>p.__lookupSetter__("x")],[{defineProperty:e},p=>p.__defineGetter__("x",function(){})],[{defineProperty(){return false;}},p=>p.__defineSetter__("x",function(){})]]){try{f(new Proxy({},h));r.push("none");}catch(x){r.push(x.constructor.name);}}console.log(r.join());'],
 ['intrinsics are captured before user mutation','let f=function(){return 3;},saved=Object.defineProperty;Object.defineProperty=function(){throw new Error("user");};Object.getOwnPropertyDescriptor=null;Object.getPrototypeOf=null;let o={};o.__defineGetter__("x",f);Object.defineProperty=saved;console.log(o.x,Object.create(o).__lookupGetter__("x")===f);'],
 ['key and callbacks survive GC','let o={},made=0,k={toString(){for(let i=0;i<50;i++)({text:""+i});made++;return "k"+made;}};o.__defineGetter__(k,function(){let a=[];for(let i=0;i<30;i++)a.push({v:""+i});return a[29].v;});console.log(o.k1,o.__lookupGetter__(k),Object.keys(o).join());'],
 ['source text is native','console.log(/\\[native code\\]/.test(Object.prototype.__defineGetter__.toString()),/\\[native code\\]/.test(Function.prototype.toString.call(Object.prototype.__lookupSetter__)));'],
];
for(const [name,source] of cases)test('Object Annex B accessors: '+name,()=>{
 const result=run(source);
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout,runOracle(source).stdout);
});
