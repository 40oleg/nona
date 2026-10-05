import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {supportedNativeTargets} from '../src/target.js';
import {createContext,runInContext} from 'node:vm';
import {processPreludeForTarget} from '../src/runtime/process-source.js';
import {processExtendedOracle} from './helpers/process-fixture.js';
test('process native standard output boundary writes exact bytes',()=>{
 const writes:{fd:number;bytes:number[]}[]=[];
 const context=createContext({TextEncoder,TextDecoder,__nonaRegexpVm:{},__nonaProcessNow:()=>1000,__nonaPromiseDrainJobs(){},
  __nonaHost_GetCommandLineW:()=>0,__nonaHost_sys_open:()=>-2,__nonaHost_sys_readlink:()=>0,
  __nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>12,
  __nonaHost_sys_write:(fd:number,b:Uint8Array,n:number)=>{writes.push({fd,bytes:Array.from(b.slice(0,n))});return n},
 });
 runInContext(processPreludeForTarget('linux-x64'),context);
 assert.equal(runInContext('process.stdout.write("hello ü");process.stderr.write(new Uint8Array([0,65,255]))',context),true);
 assert.deepEqual(writes,[{fd:1,bytes:Array.from(new TextEncoder().encode('hello ü'))},{fd:2,bytes:[0,65,255]}]);
});

for(const target of supportedNativeTargets)test(`process standard streams/resources compile for ${target}`,()=>{
 const result=compile(processExtendedOracle,{fileName:'process-io.js',target});assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});

