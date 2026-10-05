import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {supportedNativeTargets} from '../src/target.js';
import {createContext,runInContext} from 'node:vm';
import {processPreludeForTarget,processHostDeclarations} from '../src/runtime/process-source.js';
import {runtimeProbes} from '../src/backend/platform-probes.js';
import {processExtendedOracle,processReviewOracle} from './helpers/process-fixture.js';
import {timersPreludeSource} from '../src/runtime/timers-source.js';
import {runOracle} from './helpers/oracle.js';
import {spawnSync} from 'node:child_process';

test('OpenBSD 7.8 process syscalls match the release ABI and compile its native I/O probe',()=>{
 // Release syscall.h revision 1.283, OPENBSD_7_8; 37 is obsolete msyscall.
 // https://cvsweb.openbsd.org/src/sys/sys/syscall.h?rev=OPENBSD_7_8&content-type=text/plain
 const expected:Record<string,string>={sys_read:'3',sys_write:'4',sys_open:'5',sys_close:'6',sys_chdir:'12',sys_getrusage:'19',sys_getpid:'20',sys_getuid:'24',sys_geteuid:'25',sys_getppid:'39',sys_getegid:'43',sys_getgid:'47',sys_readlink:'58',sys_umask:'60',sys_kill:'122',sys_sysctl:'202',sys_poll:'252',sys_exit:'1'};
 const declarations=processHostDeclarations('openbsd-x64');
 for(const [name,number] of Object.entries(expected))assert.equal(declarations.find(item=>item.name===name)?.declaration.name,number,name);
 const probe=runtimeProbes('openbsd-x64').find(item=>item.name==='process-io');assert.ok(probe);assert.ok(probe.image.length>0);assert.match(probe.expected,/true true true true/);
});

function mockProcess(extra:Record<string,unknown>={}){
 const context=createContext({TextEncoder,TextDecoder,__nonaRegexpVm:{},__nonaProcessNow:()=>1000,__nonaPromiseDrainJobs(){},
  __nonaHost_GetCommandLineW:()=>0,__nonaHost_sys_open:()=>-2,__nonaHost_sys_readlink:()=>0,
  __nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>12,...extra});
 runInContext(processPreludeForTarget('linux-x64'),context);return context;
}
test('process once listener fires once during reentrant emission, matching Node 26',()=>{
 const output:string[]=[],source='let n=0;process.on("x",()=>{if(++n===1)process.emit("x")});process.once("x",()=>console.log("once"));process.emit("x")';
 const context=mockProcess({console:{log:(s:string)=>output.push(s)}});runInContext(source,context);
 assert.equal(output.join('\n')+'\n',runOracle(source).stdout);
});
test('process final exit status follows exit-listener changes, matching Node 26',()=>{
 const source='process.on("exit",()=>{process.exitCode=7})',oracle=spawnSync(process.execPath,['-e',source],{encoding:'utf8',windowsHide:true});
 const statuses:number[]=[],stopped={};const context=mockProcess({__nonaHost_sys_exit:(code:number)=>{statuses.push(code);throw stopped}});
 runInContext(source,context);assert.throws(()=>runInContext('__nonaPromiseDrainJobs()',context),error=>error===stopped);
 assert.deepEqual(statuses,[oracle.status]);
});
test('unreferenced stdin still polls while a timer keeps the loop alive',()=>{
 const output:string[]=[],bytes=new TextEncoder().encode('abc');let reads=0,clock=0;
 const context=mockProcess({console:{log:(...args:unknown[])=>output.push(args.join(' '))},
  __nonaHostNow:()=>clock,__nonaHostWait:(ms:number)=>{clock+=ms},
  __nonaHost_sys_poll:()=>1,__nonaHost_sys_read:(_fd:number,buffer:Uint8Array)=>{reads++;if(reads!==1)return 0;buffer.set(bytes);return bytes.length}});
 runInContext(timersPreludeSource,context);
 runInContext('process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>console.log("data",chunk));process.stdin.unref();setTimeout(()=>console.log("timer"),50);__nonaPromiseDrainJobs()',context);
 assert.equal(reads,2);assert.deepEqual(output,['data abc','timer']);
 const oracle=spawnSync(process.execPath,['-e','process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>console.log("data",chunk));process.stdin.unref();setTimeout(()=>console.log("timer"),50)'],{input:'abc',encoding:'utf8',windowsHide:true});
 assert.equal(oracle.status,0,oracle.stderr);assert.equal(output.join('\n')+'\n',oracle.stdout);
});
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
 const result=compile(processExtendedOracle+processReviewOracle,{fileName:'process-io.js',target});assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});

