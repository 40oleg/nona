import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile,compileToIR} from '../src/compiler.js';
import {collectSourceUsage} from '../src/frontend/lexer.js';
import {runtimeRegExpLink} from '../src/runtime/link.js';
import {regexpVmPrelude} from '../src/runtime/regexp-vm-source.js';
import {captureProcessStartup} from '../src/runtime/process-host.js';
import {Assembler} from '../src/backend/x64/assembler.js';
import {supportedNativeTargets} from '../src/target.js';
import {createContext,runInContext} from 'node:vm';
import {processPreludeForTarget,processHostDeclarations} from '../src/runtime/process-source.js';
import {runtimeProbes} from '../src/backend/platform-probes.js';
import {processExtendedOracle,processReviewOracle} from './helpers/process-fixture.js';
import {timersPreludeSource} from '../src/runtime/timers-source.js';
import {runOracle} from './helpers/oracle.js';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('FreeBSD startup captures the RDI vector independently of aligned RSP',()=>{
 // FreeBSD14.3 native entry: RDI points to argc, followed by argv and envp.
 // https://github.com/freebsd/freebsd-src/blob/releng/14.3/lib/csu/amd64/crt1_s.S
 const a=new Assembler('process.startup.test');captureProcessStartup(a,'freebsd-x64');
 assert.deepEqual(Array.from(a.finish().bytes.slice(0,4)),[0x48,0x8d,0x47,0x08]);
});

test('trimmed process programs link the original RegExp engine for internal OS text parsing',()=>{
 const {usage}=collectSourceUsage(()=>compileToIR('process.loadEnvFile("fixture.env");process.availableMemory()',undefined,undefined,'linux-x64'));
 assert.equal(usage.regexp,false);assert.equal(runtimeRegExpLink(usage,['process']).regexp,true);
 for(const linked of [[],['process']] as const){const context=createContext({});runInContext('Function.prototype.__nonaMarkNativeInternal=function(){}',context);runInContext(regexpVmPrelude(runtimeRegExpLink(usage,linked)),context);
  const call='__nonaRegexpVm(undefined,"",0,false,"^[A-Za-z_][A-Za-z0-9_]*$","")';
  if(linked.length)assert.equal(runInContext(call,context),undefined);else assert.throws(()=>runInContext(call,context),/without the RegExp engine/)
 }
 const image=compile('process.loadEnvFile("fixture.env")',{fileName:'process-link.js',target:'linux-x64'});assert.ok(image.ok,image.ok?'':JSON.stringify(image.diagnostics));
});
function machCommands(image:Uint8Array){const v=new DataView(image.buffer,image.byteOffset,image.byteLength),types:number[]=[];let at=32;for(let i=0;i<v.getUint32(16,true);i++){types.push(v.getUint32(at,true));at+=v.getUint32(at+4,true)}return types}
test('Darwin x64 keeps kernel startup without system imports and uses dyld for process Mach queries',()=>{
 const plain=compile('console.log(42)',{fileName:'process-darwin.js',target:'darwin-x64'}),processImage=compile('console.log(process.argv,process.availableMemory())',{fileName:'process-darwin.js',target:'darwin-x64'});
 assert.ok(plain.ok);assert.ok(processImage.ok,processImage.ok?'':JSON.stringify(processImage.diagnostics));if(!plain.ok||!processImage.ok)return;
 assert.ok(machCommands(plain.image).includes(5));assert.ok(!machCommands(plain.image).includes(0x80000028));
 assert.ok(machCommands(processImage.image).includes(0x80000028));assert.ok(machCommands(processImage.image).includes(0xc));
});

test('process loads dotenv syntax with the Node 26 oracle and preserves existing values',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-env-oracle-')),path=join(directory,'fixture.env');
 const text="# comment\nexport NONA_ENV_A = first # trailing\nNONA_ENV_B='  spaced # value  '\nNONA_ENV_C=\"line\\nnext\"\nNONA_ENV_D='multi\nline'\nNONA_ENV_A=last\nNONA_ENV_KEEP=replaced\n";
 try{
  writeFileSync(path,text);let read=false;
  const context=mockProcess({__nonaHost_sys_open:(_path:Uint8Array,flags:number)=>flags===0?10:-2,
   __nonaHost_sys_read:(_fd:number,buffer:Uint8Array)=>{if(read)return 0;read=true;const bytes=new TextEncoder().encode(text);buffer.set(bytes);return bytes.length},__nonaHost_sys_close:()=>0});
  const source='process.env.NONA_ENV_KEEP="original";process.loadEnvFile('+JSON.stringify(path)+');JSON.stringify([process.env.NONA_ENV_A,process.env.NONA_ENV_B,process.env.NONA_ENV_C,process.env.NONA_ENV_D,process.env.NONA_ENV_KEEP])';
  const actual=runInContext(source,context);
  // Keep evaluation separate from printing so the fixture is shared exactly.
  const expected=spawnSync(process.execPath,['-e',source.replace(';JSON.stringify',';console.log(JSON.stringify')+')'],{encoding:'utf8',windowsHide:true});
  assert.equal(expected.status,0,expected.stderr);assert.equal(actual+'\n',expected.stdout);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('process numeric credential operations validate and use native group/identity primitives',()=>{
 const calls:unknown[][]=[];const context=mockProcess({__nonaHost_sys_getegid:()=>5,
  __nonaHost_sys_getgroups:(size:number,groups:Uint32Array)=>{if(!size)return 2;groups.set([2,5]);return 2},
  __nonaHost_sys_setuid:(id:number)=>{calls.push(['uid',id]);return 0},__nonaHost_sys_setgid:(id:number)=>{calls.push(['gid',id]);return 0},
  __nonaHost_sys_setresuid:(a:number,b:number,c:number)=>{calls.push(['euid',a,b,c]);return 0},__nonaHost_sys_setresgid:(a:number,b:number,c:number)=>{calls.push(['egid',a,b,c]);return 0},
  __nonaHost_sys_setgroups:(n:number,groups:Uint32Array)=>{calls.push(['groups',n,...groups]);return 0}});
 assert.equal(runInContext('JSON.stringify(process.getgroups())',context),'[2,5]');
 runInContext('process.setuid(11);process.setgid(12);process.seteuid(13);process.setegid(14);process.setgroups([2,5])',context);
 assert.deepEqual(calls,[['uid',11],['gid',12],['euid',4294967295,13,4294967295],['egid',4294967295,14,4294967295],['groups',2,2,5]]);
 assert.throws(()=>runInContext('process.setuid(-1)',context));assert.throws(()=>runInContext('process.setgroups([1,"root"])',context));
});
test('process active resource inventory follows real timer and stdin lifecycle',()=>{
 let clock=0;const context=mockProcess({__nonaHostNow:()=>clock,__nonaHostWait:(ms:number)=>{clock+=ms}});runInContext(timersPreludeSource,context);
 assert.equal(runInContext('JSON.stringify(process.getActiveResourcesInfo())',context),'[]');
 assert.equal(runInContext('let timer=setTimeout(()=>{},50);JSON.stringify(process.getActiveResourcesInfo())',context),'["Timeout"]');
 assert.equal(runInContext('process.stdin.resume();JSON.stringify(process.getActiveResourcesInfo())',context),'["Timeout","NonaStdin"]');
 assert.equal(runInContext('clearTimeout(timer);process.stdin.unref();JSON.stringify(process.getActiveResourcesInfo())',context),'[]');
});

test('OpenBSD 7.8 process syscalls match the release ABI and compile its native I/O probe',()=>{
 // Release syscall.h revision 1.283, OPENBSD_7_8; 37 is obsolete msyscall.
 // https://cvsweb.openbsd.org/src/sys/sys/syscall.h?rev=OPENBSD_7_8&content-type=text/plain
 const expected:Record<string,string>={sys_read:'3',sys_write:'4',sys_open:'5',sys_close:'6',sys_chdir:'12',sys_getrusage:'19',sys_getpid:'20',sys_getuid:'24',sys_geteuid:'25',sys_getppid:'39',sys_getegid:'43',sys_getgid:'47',sys_readlink:'58',sys_umask:'60',sys_kill:'122',sys_sysctl:'202',sys_poll:'252',sys_exit:'1'};
 const declarations=processHostDeclarations('openbsd-x64');
 for(const [name,number] of Object.entries(expected))assert.equal(declarations.find(item=>item.name===name)?.declaration.name,number,name);
 const probe=runtimeProbes('openbsd-x64').find(item=>item.name==='process-io');assert.ok(probe);assert.ok(probe.image.length>0);assert.match(probe.expected,/true true true true/);
});

function mockProcess(extra:Record<string,unknown>={},target='linux-x64'){
 const context=createContext({TextEncoder,TextDecoder,__nonaRegexpVm:{},__nonaProcessNow:()=>1000,__nonaPromiseDrainJobs(){},
  __nonaHost_GetCommandLineW:()=>0,__nonaHost_sys_open:()=>-2,__nonaHost_sys_readlink:()=>0,
  __nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>12,__nonaHost_startupArgv:()=>0,__nonaHost_startupEnv:()=>0,__nonaHost_sys_procinfo:()=>0,...extra});
 runInContext(processPreludeForTarget(target),context);return context;
}
test('process Linux memory queries account for real cgroup usage and native limits',()=>{
 const files:Record<string,string>={'/proc/meminfo':'MemAvailable: 4 kB\n','/proc/self/cgroup':'0::/group\n','/sys/fs/cgroup/group/memory.max':'2048','/sys/fs/cgroup/group/memory.current':'1024','/sys/fs/cgroup/memory.max':'4096','/sys/fs/cgroup/memory.current':'1024'};
 let next=10;const handles=new Map<number,{bytes:Uint8Array;done:boolean}>();
 const context=mockProcess({__nonaHost_sys_getrlimit:(_resource:number,bounds:Uint32Array)=>{bounds.set([10000,0,10000,0]);return 0},
  __nonaHost_sys_open:(path:Uint8Array,flags:number)=>{if(flags!==0)return -2;const key=new TextDecoder().decode(path).split('\0')[0]!,text=files[key];if(text===undefined)return -2;const fd=next++;handles.set(fd,{bytes:new TextEncoder().encode(text),done:false});return fd},
  __nonaHost_sys_read:(fd:number,bytes:Uint8Array)=>{const handle=handles.get(fd)!;if(handle.done)return 0;handle.done=true;bytes.set(handle.bytes);return handle.bytes.length},__nonaHost_sys_close:()=>0});
 assert.equal(runInContext('process.constrainedMemory()',context),2048);assert.equal(runInContext('process.availableMemory()',context),1024);
});
test('process OpenBSD memory uses release uvmexp page/free counters',()=>{
 const context=mockProcess({__nonaHost_sys_sysctl:(mib:Int32Array,_n:number,bytes:Uint8Array,length:Uint32Array)=>{assert.deepEqual(Array.from(mib),[2,4]);new Uint32Array(bytes.buffer).set([4096,4095,12,10000,12]);length[0]=20;return 0},
  __nonaHost_sys_getrlimit:(_resource:number,bounds:Uint32Array)=>{bounds.set([0xffffffff,0x7fffffff,0xffffffff,0x7fffffff]);return 0}},'openbsd-x64');
 assert.equal(runInContext('process.availableMemory()',context),49152);assert.equal(runInContext('process.constrainedMemory()',context),0);
});
test('process Windows memory queries honor actual process Job Object limits',()=>{
 const context=mockProcess({__nonaHost_GetCommandLineW:()=>100,__nonaHost_lstrlenW:()=>0,__nonaHost_RtlMoveMemory:()=>{},__nonaHost_GetModuleFileNameW:()=>0,
  __nonaHost_GetEnvironmentStringsW:()=>0,__nonaHost_GetCurrentProcessId:()=>123,__nonaHost_NtQueryInformationProcess:()=>-1,
  __nonaHost_GlobalMemoryStatusEx:(words:Uint32Array)=>{words[4]=8192;return true},__nonaHost_IsProcessInJob:(_process:number,_job:number,yes:Uint32Array)=>{yes[0]=1;return true},
  __nonaHost_QueryInformationJobObject:(_job:number,_class:number,words:Uint32Array)=>{words[4]=0x100;words[28]=4096;return true}});
 assert.equal(runInContext('process.constrainedMemory()',context),4096);assert.equal(runInContext('process.availableMemory()',context),4096);
});
test('process Darwin memory queries use native Mach page statistics and cache the host right',()=>{
 let hosts=0;const context=mockProcess({__nonaHost_mach_host_self:()=>{hosts++;return 77},
  __nonaHost_host_page_size:(port:number,size:Uint32Array)=>{assert.equal(port,77);size[0]=16384;return 0},
  __nonaHost_host_statistics64:(port:number,flavor:number,stats:Uint32Array,count:Uint32Array)=>{assert.equal(port,77);assert.equal(flavor,4);assert.equal(count[0],64);stats[0]=100;return 0},
  __nonaHost_sys_getrlimit:(_resource:number,bounds:Uint32Array)=>{bounds.set([0xffffffff,0x7fffffff,0xffffffff,0x7fffffff]);return 0}},'darwin-arm64');
 assert.equal(runInContext('process.availableMemory()',context),1638400);assert.equal(runInContext('process.availableMemory()',context),1638400);assert.equal(hosts,1);
});
test('process FreeBSD memory resolves native sysctl OIDs and page counters',()=>{
 const context=mockProcess({__nonaHost_sys_sysctl:(mib:Int32Array,_n:number,bytes:Uint8Array,length:Uint32Array,newBytes:Uint8Array|null)=>{
  if(mib[0]===1){bytes.set(new TextEncoder().encode('/image\0'));length[0]=7;return 0}
  const words=new Uint32Array(bytes.buffer);if(mib[0]===0){const name=new TextDecoder().decode(newBytes!).split('\0')[0];words.set(name==='hw.pagesize'?[6,7]:[2,99]);length[0]=8}
  else{words[0]=mib[0]===6?4096:100;length[0]=4}return 0},
  __nonaHost_sys_getrlimit:(_resource:number,bounds:Uint32Array)=>{bounds.set([0xffffffff,0x7fffffff,0xffffffff,0x7fffffff]);return 0}},'freebsd-x64');
 assert.equal(runInContext('process.availableMemory()',context),409600);
 assert.match(processHostDeclarations('freebsd-x64').find(item=>item.name==='sys_sysctl')!.declaration.signature,/buf,buf,buf,u64/);
});
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

