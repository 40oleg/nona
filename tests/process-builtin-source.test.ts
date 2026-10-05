import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {compileToIR,compileModuleToIR} from '../src/compiler.js';
import {withBuiltinModules} from '../src/frontend/builtin-modules.js';
import {promisePreludeSource} from '../src/runtime/promise-source.js';
import {supportedNativeTargets} from '../src/target.js';
import {processBuiltinProbeCases,processBuiltinProbes} from '../src/backend/process-builtin-probes.js';
import {collectSourceUsage} from '../src/frontend/lexer.js';
import {generate} from '../src/backend/x64/codegen.js';
import {withNativeTarget} from '../src/backend/machine/context.js';

const emptyHost={resolve:()=>undefined,read:()=>undefined};
const foldedLookup='console.log(typeof globalThis["pro"+"cess"]["get"+"BuiltinModule"]("fs"))';
test('folded builtin access selects the actual process runtime and usage resets',()=>{
 const {result:ir,usage}=collectSourceUsage(()=>compileToIR(foldedLookup,'folded.js',emptyHost,'linux-x64'));
 assert.equal(usage.preludes.process,true);
 assert.ok(!ir.scripts!.includes('node:process'));
 assert.equal(collectSourceUsage(()=>compileToIR('console.log(1)')).usage.preludes.process,false);
});
function boundary(){
 const context=createContext({__nonaRegexpVm:{}});
 runInContext('Function.prototype.__nonaSharedQueueInternal=function(){};Function.prototype.__nonaMarkNativeInternal=function(){};Function.prototype.__nonaMarkPromiseInternal=function(){};Function.prototype.__nonaProxyCreateInternal=function(target,handler){return new Proxy(target,handler)};__nonaRegexpVm.isConstructor=function(value){return typeof value==="function"};__nonaRegexpVm.AggregateError=AggregateError;'+promisePreludeSource.replace('__NONA_FAIL_ON_UNHANDLED__','true'),context);
 return context;
}

test('getBuiltinModule literal names select actual builtin providers without unrelated adapters',()=>{
 const ir=compileToIR('process.getBuiltinModule("fs")','builtin.js',emptyHost,'linux-x64');
 assert.ok(ir.scripts!.includes('node:fs'));
 assert.ok(!ir.scripts!.includes('node:process'));
 assert.ok(!ir.scripts!.includes('nona:win32'));
 const processIR=compileToIR('process.getBuiltinModule("node:process")','builtin.js',emptyHost,'linux-x64');
 assert.ok(processIR.scripts!.includes('node:process'));
 assert.ok(!processIR.scripts!.includes('node:fs'));
 const unrelated=compileToIR('console.log(process.pid)','builtin.js',emptyHost,'linux-x64');
 assert.deepEqual(unrelated.scripts,['']);
});

test('builtin import aliases share one canonical module record and actual default',()=>{
 const ir=compileModuleToIR('import p from "node:process";import q from "nona:process";import r from "process";console.log(p===q,p===r,p.getBuiltinModule("process")===p)','builtin.mjs',emptyHost,'','linux-x64');
 assert.equal(ir.scripts!.filter(path=>path==='node:process').length,1);
 assert.ok(!ir.scripts!.includes('nona:process'));
 assert.ok(!ir.scripts!.includes('node:fs'));
});

test('escaped builtin methods select only target-supported inventory',()=>{
 const ir=compileToIR('const get=process.getBuiltinModule;console.log(get("process"))','builtin.js',emptyHost,'darwin-arm64');
 assert.ok(ir.scripts!.includes('node:process'));
 assert.ok(ir.scripts!.includes('nona:ffi'));
 assert.ok(!ir.scripts!.includes('node:fs'));
 assert.ok(!ir.scripts!.includes('nona:win32'));
});

test('builtin lookup validates primitive strings and handles exact unknown names like Node26',()=>{
 const source='const out=[];for(const id of [undefined,null,1,true,{},new String("fs"),Symbol("fs")]){try{get(id)}catch(e){out.push(e.name+":"+e.code)}}for(const id of ["", "NODE:process", "__proto__", "toString", "node:missing"])out.push(String(get(id)));JSON.stringify(out)';
 const context=boundary();runInContext('const get=__nonaRegexpVm.getBuiltinModule',context);
 const actual=runInContext(source,context);
 const expected=spawnSync(process.execPath,['-e','const get=process.getBuiltinModule;'+source.replace(/JSON.stringify\(out\)$/,'console.log(JSON.stringify(out))')],{encoding:'utf8',windowsHide:true});
 assert.equal(expected.status,0,expected.stderr);assert.equal(actual,expected.stdout.trim());
});

test('builtin lookup evaluates actual fs exports once and preserves lazy failure identity',()=>{
 const context=boundary();
 const source=withBuiltinModules(emptyHost,'linux-x64').read('node:fs')!;
 const fs=new Function('define','TextEncoder','TextDecoder',source.replace(/^import .*$/gm,'').replace(/^export default /gm,'return ').replace(/^export /gm,''))(()=>()=>0,TextEncoder,TextDecoder);
 context.fs=fs;
 runInContext('var calls=0,namespace=__nonaRegexpVm.createNamespace(["default","readFileSync"],[function(){return fs},function(){return fs.readFileSync}]);__nonaRegexpVm.registerModule(0,"node:fs",function(){calls++},[],namespace,[],[],undefined,["fs","node:fs","nona:fs"]);',context);
 assert.equal(runInContext('calls',context),0);
 assert.equal(runInContext('__nonaRegexpVm.getBuiltinModule("fs")===fs&&__nonaRegexpVm.getBuiltinModule("node:fs")===namespace.default&&__nonaRegexpVm.getBuiltinModule("nona:fs")===fs',context),true);
 assert.equal(runInContext('calls',context),1);
 runInContext('var fault=new Error("once"),failures=0;__nonaRegexpVm.registerModule(1,"test:failure",function(){failures++;throw fault},[],{},[],[],undefined,["test:failure"]);',context);
 assert.equal(runInContext('var first,second;try{__nonaRegexpVm.getBuiltinModule("test:failure")}catch(e){first=e}try{__nonaRegexpVm.getBuiltinModule("test:failure")}catch(e){second=e}first===fault&&second===fault&&failures===1',context),true);
});

test('computed, reflected and imported builtin methods conservatively select inventory',()=>{
 for(const source of [
  'process[process.argv[2]]("process")',
  'const p=process;const key="get"+"BuiltinModule";p[key]("process")',
  'let p;p=process;p[process.argv[2]]("process")',
  'const {getBuiltinModule:get}=process;get("process")',
  'Reflect.get(process,"getBuiltinModule")("process")',
  'Object.getOwnPropertyDescriptor(process,"getBuiltinModule").value("process")',
  'process.getBuiltinModule(process.argv[2])',
 ]){
  const ir=compileToIR(source,'builtin.js',emptyHost,'linux-x64');
  assert.ok(ir.scripts!.includes('node:fs'),source);assert.ok(ir.scripts!.includes('node:process'),source);assert.ok(!ir.scripts!.includes('nona:win32'),source);
 }
 for(const source of [
  'import {getBuiltinModule as get} from "node:process";get("fs")',
  'process?.getBuiltinModule?.("fs")',
  'process["get"+"BuiltinModule"](`fs`)',
 ]){
  const ir=compileModuleToIR(source,'builtin.mjs',emptyHost,'','linux-x64');
  assert.ok(ir.scripts!.includes('node:fs'),source);assert.ok(!ir.scripts!.includes('nona:win32'),source);
  if(!source.startsWith('import'))assert.ok(!ir.scripts!.includes('node:process'),source+' must retain selective literal linking');
 }
});

test('unknown names never resolve user files and classic anonymous scripts retain builtin planning',()=>{
 let reads=0;const host={resolve:()=>'/pretend.mjs',read:()=>{reads++;return 'export default 1'}};
 const ir=compileToIR('process.getBuiltinModule("./pretend.mjs");process.getBuiltinModule("node:missing")',undefined,host,'linux-x64');
 assert.deepEqual(ir.scripts,['']);assert.equal(reads,0);
 assert.deepEqual(compileToIR('process.getBuiltinModule("getBuiltinModule");console.log("getBuiltinModule")',undefined,emptyHost,'linux-x64').scripts,['']);
 const script=compileToIR('process.getBuiltinModule("process")',undefined,emptyHost,'linux-x64');assert.ok(script.scripts!.includes('node:process'));
 const harness=compileModuleToIR('console.log(1)','builtin.mjs',emptyHost,'process.getBuiltinModule("fs")','linux-x64');assert.ok(harness.scripts!.includes('node:fs'));
});

test('process objects escaping through calls, returns, aggregates and global reflection select inventory',()=>{
 for(const source of [
  'function lookup(p,key){return p[key]("fs")}lookup(process,"getBuiltinModule")',
  'function lookup(p,key){return p[key]("fs")}lookup(globalThis["pro"+"cess"],"getBuiltinModule")',
  'function processObject(){return process}const p=processObject();p[process.argv[2]]("fs")',
  'const list=[process];list[0][process.argv[2]]("fs")',
  'const box={p:process};box.p[process.argv[2]]("fs")',
  'const key=process.argv[2];globalThis["pro"+"cess"][key]("fs")',
  'const key=process.argv[2];Reflect.get(globalThis,"process")[key]("fs")',
  'const p=globalThis.process;p[process.argv[2]]("fs")',
  'const p=Reflect.get(globalThis,"process");p[process.argv[2]]("fs")',
  'const p=Reflect.get(globalThis,process.argv[2]);p[process.argv[3]]("fs")',
  'Object.getOwnPropertyDescriptor(globalThis,"process").get()[process.argv[2]]("fs")',
  'const key="pro"+process.argv[2];globalThis[key].getBuiltinModule("fs")',
  'function lookup(root,key){return root[key]}const p=lookup(globalThis,"process");p[process.argv[2]]("fs")',
  'function globals(){return globalThis}const p=globals()["process"];p[process.argv[2]]("fs")',
  'const roots=[globalThis];roots[0]["process"][process.argv[2]]("fs")',
  'function get(value){return value}const p=get(globalThis)["process"];p[process.argv[2]]("fs")',
  'const helper={get:function(value){return value}};const p=helper.get(globalThis)["process"];p[process.argv[2]]("fs")',
 ]){
  const ir=compileToIR(source,'builtin.js',emptyHost,'linux-x64');
  assert.ok(ir.scripts!.includes('node:fs'),source);assert.ok(ir.scripts!.includes('node:process'),source);
 }
 for(const source of ['globalThis.process.getBuiltinModule("fs")','globalThis["pro"+"cess"].getBuiltinModule("fs")','Reflect.get(globalThis,"process").getBuiltinModule("fs")']){
  const ir=compileToIR(source,'builtin.js',emptyHost,'linux-x64');assert.ok(ir.scripts!.includes('node:fs'));assert.ok(!ir.scripts!.includes('node:process'),source);
 }
});

for(const target of supportedNativeTargets)test('builtin inventory derives supported providers for '+target,()=>{
 const host=withBuiltinModules(emptyHost,target),supported=host.builtinCandidates!();
 const ir=compileToIR('const get=process.getBuiltinModule;get("process")','builtin.js',emptyHost,target);
 for(const path of supported){assert.equal(ir.scripts!.filter(item=>item===path).length,1);assert.ok(host.builtinAliases!(path)!.includes(path))}
 assert.equal(supported.includes('node:fs'),target.startsWith('win32-')||target.startsWith('linux-'));
 assert.equal(supported.includes('nona:win32'),target.startsWith('win32-'));
 assert.ok(supported.includes('nona:ffi'));assert.ok(supported.includes('node:process'));
});

test('Nona-only providers without a default return their real namespace and linking errors precede evaluation',()=>{
 const context=boundary();
 runInContext('var define=function(){},ns=__nonaRegexpVm.createNamespace(["define"],[function(){return define}]),evaluations=0;__nonaRegexpVm.registerModule(0,"nona:ffi",function(){evaluations++},[],ns,[],[],undefined,["nona:ffi"]);',context);
 assert.equal(runInContext('__nonaRegexpVm.getBuiltinModule("nona:ffi")===ns&&__nonaRegexpVm.getBuiltinModule("nona:ffi").define===define&&evaluations===1',context),true);
 runInContext('__nonaRegexpVm.registerModule(1,"bad:dependency",function(){evaluations++},[],{},[],[],"missing export");__nonaRegexpVm.registerModule(2,"bad:root",function(){evaluations++},[1],{},[],[],undefined,["bad:root"]);',context);
 assert.equal(runInContext('var error;try{__nonaRegexpVm.getBuiltinModule("bad:root")}catch(e){error=e}error instanceof SyntaxError&&error.message==="missing export"&&evaluations===1',context),true);
});

test('literal actual-default native fixture matches the Node26 module oracle',()=>{
 const probe=processBuiltinProbeCases('win32-x64').find(probe=>probe.name==='process-builtin-literal')!;
 const source=probe.source.replace(/nona:process/g,'node:process').replace(/nona:fs/g,'node:fs');
 const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,probe.expected);
});

for(const target of supportedNativeTargets)test('actual public builtin GC-stress probe images link for '+target,()=>{
 const {result:ir,usage}=collectSourceUsage(()=>compileToIR(foldedLookup,'folded.js',emptyHost,target));
 assert.equal(usage.preludes.process,true);
 const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage}));
 assert.ok(program.fragments.some(fragment=>fragment.name==='process.finalization.code'),target+' requires actual process native helpers');
 assert.ok(program.fragments.some(fragment=>/^hostffi\.\d+\.code$/.test(fragment.name)),target+' requires private process host adapters');
 const unlinked=collectSourceUsage(()=>compileToIR('console.log(1)',undefined,emptyHost,target));
 const bare=withNativeTarget(target,()=>generate(unlinked.result,{gcStress:true,link:unlinked.usage}));
 assert.ok(!bare.fragments.some(fragment=>fragment.name==='process.finalization.code'),target+' must retain independent cached runtime selection');
 const probes=processBuiltinProbes(target);assert.equal(probes.length,6);
 for(const probe of probes){assert.ok(probe.image.length>1024);assert.ok(probe.expected.endsWith('\n'))}
 const image=probes[0]!.image;
 if(target.startsWith('win32-'))assert.deepEqual(Array.from(image.subarray(0,2)),[0x4d,0x5a]);
 else if(target.startsWith('darwin-'))assert.equal(new DataView(image.buffer,image.byteOffset,4).getUint32(0,true),0xfeedfacf);
  else assert.deepEqual(Array.from(image.subarray(0,4)),[0x7f,0x45,0x4c,0x46]);
});

test('escaped-object native fixture matches the Node26 oracle',()=>{
 const probe=processBuiltinProbeCases('linux-x64').find(item=>item.name==='process-builtin-escaped')!;
 const result=spawnSync(process.execPath,['-e',probe.source],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,probe.expected);
});
