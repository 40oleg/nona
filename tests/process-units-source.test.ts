import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {processHostDeclarations,processPreludeForTarget} from '../src/runtime/process-source.js';
import {compile} from '../src/compiler.js';

 test('Windows startup copies UTF-16 once and preserves all code units',()=>{
 const text='C:\\'+'a'.repeat(4097)+'\ud800\udc00\udfff.exe';let calls=0;
 const globals:Record<string,unknown>={TextEncoder,TextDecoder,__nonaRegexpVm:{isRejectionError:()=>false},__nonaPromiseDrainJobs(){},__nonaProcessNow:()=>1000,__nonaProcessUnits:(units:Uint16Array,length:number)=>{calls++;return String.fromCharCode(...units.subarray(0,length))}};
 for(const item of processHostDeclarations('win32-arm64'))globals['__nonaHost_'+item.name]=()=>0;
 globals.__nonaHost_GetCommandLineW=()=>1;globals.__nonaHost_lstrlenW=()=>0;
 globals.__nonaHost_GetModuleFileNameW=(_:unknown,units:Uint16Array)=>{for(let i=0;i<text.length;i++)units[i]=text.charCodeAt(i);return text.length};
 const context=createContext(globals);runInContext(processPreludeForTarget('win32-arm64'),context);
 assert.equal(runInContext('process.execPath',context),text);assert.equal(calls,2);assert.equal(runInContext('typeof __nonaProcessUnits',context),'undefined');
 });
for(const target of ['win32-x64','win32-arm64','linux-x64','linux-arm64','darwin-x64','darwin-arm64','freebsd-x64','openbsd-x64'] as const)test('UTF-16 process helper links for '+target,()=>{
 const result=compile('console.log(process.execPath.length>0)',{fileName:'process-units.js',target});assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
});
