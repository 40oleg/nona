import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile,compileToIR} from '../src/compiler.js';
import {collectSourceUsage} from '../src/frontend/lexer.js';
import {runtimeRegExpLink} from '../src/runtime/link.js';
import {regexpVmPrelude} from '../src/runtime/regexp-vm-source.js';
import {captureProcessStartup} from '../src/runtime/process-host.js';
import {Assembler} from '../src/backend/x64/assembler.js';
import {processNativeHelpers} from '../src/runtime/process-host.js';
import {supportedNativeTargets} from '../src/target.js';
import {createContext,runInContext} from 'node:vm';
import {processPreludeForTarget,processHostDeclarations} from '../src/runtime/process-source.js';
import {runtimeProbes} from '../src/backend/platform-probes.js';
import {emitRuntime} from '../src/runtime/index.js';
import {processExtendedOracle,processReviewOracle,processEnvironmentOracle,processAccountOracle,processThreadOracle,processExecErrorOracle} from './helpers/process-fixture.js';
import {timersPreludeSource} from '../src/runtime/timers-source.js';
import {runOracle} from './helpers/oracle.js';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('native probes do not read the private prelude binding as a public global',()=>{
 const source=readFileSync(new URL('../../src/backend/platform-probes.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b__nonaRegexpVm\b/);
 const result=compileToIR('let p=process;console.log(typeof __nonaRegexpVm)','private-prelude.js');
 assert.ok(result.functions.some(fn=>fn.blocks.some(block=>block.operations.some(op=>op.kind==='readGlobalProperty'&&op.name==='__nonaRegexpVm'))));
});

test('FreeBSD startup captures the RDI vector independently of aligned RSP',()=>{
 // FreeBSD14.3 native entry: RDI points to argc, followed by argv and envp.
 // https://github.com/freebsd/freebsd-src/blob/releng/14.3/lib/csu/amd64/crt1_s.S
 const a=new Assembler('process.startup.test');captureProcessStartup(a,'freebsd-x64');
 assert.deepEqual(Array.from(a.finish().bytes.slice(0,4)),[0x48,0x8d,0x47,0x08]);
});
test('native process heap snapshot reads actual allocator state without calls',()=>{
 const fragment=processNativeHelpers().bundle.fragments.find(item=>item.name==='process.heapSnapshot.code')!;
 assert.ok(fragment.fixups.some(item=>item.target==='rt.liveBytes'));
 assert.ok(fragment.fixups.some(item=>item.target==='rt.chunks'));
 assert.ok(fragment.fixups.some(item=>item.target==='rt.largeList'));
 assert.ok(fragment.fixups.some(item=>item.target==='rt.largeCache'));
 assert.ok(fragment.fixups.some(item=>item.target==='rt.sharedArrayBufferBytes'));
 const runtime=emitRuntime();
 const shared=runtime.fragments.find(item=>item.name==='rt.SharedArrayBuffer.construct')!;
 assert.ok(shared.fixups.some(item=>item.target==='rt.sharedArrayBufferBytes'));
 assert.ok(!fragment.fixups.some(item=>item.target==='rt.alloc'||item.target.startsWith('rt.gc')));
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
 const text="# comment\nexport NONA_ENV_A = first # trailing\nNONA_ENV_B='  spaced # value  '\nNONA_ENV_C=\"line\\nnext\"\nNONA_ENV_D='multi\nline'\nNONA_ENV_A=last\nNONA_ENV_KEEP=replaced\nNONA_ENV_CRLF='a\r\nb'\r\nNONA_ENV_LITERAL=\"a\\rb\"\r\n";
 try{
  writeFileSync(path,text);let read=false;
  const context=mockProcess({__nonaHost_sys_open:(_path:Uint8Array,flags:number)=>flags===0?10:-2,
   __nonaHost_sys_read:(_fd:number,buffer:Uint8Array)=>{if(read)return 0;read=true;const bytes=new TextEncoder().encode(text);buffer.set(bytes);return bytes.length},__nonaHost_sys_close:()=>0});
  const source='process.env.NONA_ENV_KEEP="original";process.loadEnvFile('+JSON.stringify(path)+');JSON.stringify([process.env.NONA_ENV_A,process.env.NONA_ENV_B,process.env.NONA_ENV_C,process.env.NONA_ENV_D,process.env.NONA_ENV_KEEP,process.env.NONA_ENV_CRLF,process.env.NONA_ENV_LITERAL])';
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
test('original local account parser resolves names and collects supplementary groups',()=>{
 const files:Record<string,string>={'/etc/passwd':'# comment\n+remote::::::\nbroken:x:no:20::/:/bin/sh\nalice:x:501:20:Alice:/home/alice:/bin/sh\n', '/etc/group':'staff:x:20:alice,bob\nwheel:x:0:root\nproject:x:40:alice\nproject-alias:x:40:alice\ninvalid:x:-1:alice\n'};
 const calls:unknown[][]=[];let bytes=new Uint8Array(),read=false;
 const context=mockProcess({__nonaHost_sys_open:(path:Uint8Array)=>{const name=new TextDecoder().decode(path).split('\0')[0]!;if(!(name in files))return -2;bytes=new TextEncoder().encode(files[name]);read=false;return 10},__nonaHost_sys_read:(_fd:number,out:Uint8Array)=>{if(read)return 0;read=true;out.set(bytes);return bytes.length},__nonaHost_sys_close:()=>0,
  __nonaHost_sys_setuid:(id:number)=>{calls.push(['uid',id]);return 0},__nonaHost_sys_setgid:(id:number)=>{calls.push(['gid',id]);return 0},__nonaHost_sys_setgroups:(n:number,ids:Uint32Array)=>{calls.push(['groups',n,...ids]);return 0}});
 runInContext('RegExp.prototype.exec=function(){throw Error("OS scanner must not invoke RegExp")};process.setuid("alice");process.setgid("staff");process.setgroups(["staff",40]);process.initgroups("alice","wheel");process.initgroups(501,0)',context);
 assert.deepEqual(calls,[['uid',501],['gid',20],['groups',2,20,40],['groups',3,0,20,40],['groups',3,0,20,40]]);
 assert.throws(()=>runInContext('process.setuid("unknown")',context),{code:'ERR_UNKNOWN_CREDENTIAL'});
 assert.throws(()=>runInContext('process.setgid("invalid")',context),{code:'ERR_UNKNOWN_CREDENTIAL'});
 assert.throws(()=>runInContext('process.initgroups("unknown",0)',context),{code:'ERR_UNKNOWN_CREDENTIAL'});
 assert.throws(()=>runInContext('process.setuid("alice\\0suffix")',context),{code:'ERR_INVALID_ARG_VALUE'});
});
test('Darwin account adapters copy OS TLS records and use native initgroups',()=>{
 const calls:unknown[][]=[],decode=(bytes:Uint8Array)=>new TextDecoder().decode(bytes).split('\0')[0];
 const context=mockProcess({__nonaHost_getpwnam:(name:Uint8Array)=>decode(name)==='alice'?2000:0,__nonaHost_getpwuid:(id:number)=>id===501?2000:0,__nonaHost_getgrnam:(name:Uint8Array)=>decode(name)==='staff'?4000:0,__nonaHost_getgrgid:(id:number)=>id===20?4000:0,
  __nonaHost_copy:(out:Uint8Array|Uint32Array,pointer:number)=>{if(pointer===2000)new Uint32Array(out.buffer).set([3000,0,0,0,501,20]);else if(pointer===4000)new Uint32Array(out.buffer).set([5000,0,0,0,20,0]);else new Uint8Array(out.buffer).set(new TextEncoder().encode(pointer===3000?'alice':'staff'))},__nonaHost_length:(pointer:number)=>pointer===3000?5:5,
  __nonaHost_sys_seteuid:(id:number)=>{calls.push(['euid',id]);return 0},__nonaHost_sys_setegid:(id:number)=>{calls.push(['egid',id]);return 0},__nonaHost_initgroups:(name:Uint8Array,gid:number)=>{calls.push(['init',decode(name),gid]);return 0}},'darwin-arm64');
 runInContext('process.seteuid("alice");process.setegid("staff");process.initgroups(501,"staff")',context);
 assert.deepEqual(calls,[['euid',501],['egid',20],['init','alice',20]]);
 assert.throws(()=>runInContext('process.setuid("unknown")',context),{code:'ERR_UNKNOWN_CREDENTIAL'});
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
  __nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>12,__nonaHost_startupArgv:()=>0,__nonaHost_startupEnv:()=>0,__nonaHost_sys_procinfo:()=>0,__nonaHost_replaceEnvironment:()=>{},__nonaHost_environmentVector:()=>0,...extra});
 runInContext(processPreludeForTarget(target),context);return context;
}
test('POSIX execve packs actual UTF-8 argv/envp without mutating the current environment',()=>{
 let args:string[]=[],environment:string[]=[];const calls:unknown[][]=[];const decode=(bytes:Uint8Array)=>new TextDecoder().decode(bytes).split('\0').filter(Boolean);
 const context=mockProcess({__nonaHost_replaceArguments:(bytes:Uint8Array)=>{args=decode(bytes)},__nonaHost_replaceExecEnvironment:(bytes:Uint8Array)=>{environment=decode(bytes)},__nonaHost_argumentVector:()=>1234,__nonaHost_execEnvironmentVector:()=>5678,
  __nonaHost_sys_execve:(path:Uint8Array,argv:number,envp:number)=>{calls.push([decode(path)[0],argv,envp]);return -2}});
 runInContext('process.env.NONA_CURRENT="preserved"',context);
 assert.throws(()=>runInContext('process.execve("/missing",["program","ü=arg"],{VALUE:"ü=env"})',context),{code:'ENOENT',syscall:'execve',path:'/missing'});
 assert.deepEqual(args,['program','ü=arg']);assert.deepEqual(environment,['VALUE=ü=env']);assert.deepEqual(calls,[['/missing',1234,5678]]);
 assert.equal(runInContext('process.env.NONA_CURRENT',context),'preserved');
 for(const source of ['process.execve(1,[])','process.execve("/missing",[1])','process.execve("/missing",[],null)','process.execve("/missing\\0suffix",[])','process.execve("/missing",["a\\0b"])','process.execve("/missing",[],{A:"a\\0b"})'])assert.throws(()=>runInContext(source,context));
 assert.equal(calls.length,1);
 assert.equal(processHostDeclarations('linux-arm64').find(item=>item.name==='sys_execve')!.declaration.name,'221');
 for(const target of ['darwin-x64','darwin-arm64','freebsd-x64','openbsd-x64'])assert.equal(processHostDeclarations(target as typeof supportedNativeTargets[number]).find(item=>item.name==='sys_execve')!.declaration.name,'59');
});
test('thread CPU reports RUSAGE_THREAD counters with Node 26 previous-value validation',()=>{
 const output:string[]=[],context=mockProcess({console:{log:(...args:unknown[])=>output.push(args.join(' '))},__nonaHost_sys_getrusage:(who:number,words:Uint32Array)=>{assert.equal(who,1);words.set([2,0,3,0,4,0,5,0]);return 0}});
 assert.equal(runInContext('JSON.stringify(process.threadCpuUsage())',context),'{"user":2000003,"system":4000005}');
 runInContext(processThreadOracle,context);assert.equal(output.join('\n')+'\n',runOracle(processThreadOracle).stdout);
});
test('Darwin thread CPU uses original Mach time-value ABI and caches the thread right',()=>{
 let rights=0;const context=mockProcess({__nonaHost_mach_thread_self:()=>{rights++;return 71},__nonaHost_thread_info:(port:number,flavor:number,words:Int32Array,count:Uint32Array)=>{assert.equal(port,71);assert.equal(flavor,3);assert.equal(count[0],10);words.set([2,3,4,5]);return 0}},'darwin-x64');
 assert.equal(runInContext('JSON.stringify(process.threadCpuUsage())',context),'{"user":2000003,"system":4000005}');runInContext('process.threadCpuUsage()',context);assert.equal(rights,1);
});
test('process environment mutations publish owned native UTF-8 vectors matching Node coercion',()=>{
 let entries:string[]=[];const context=mockProcess({__nonaHost_replaceEnvironment:(bytes:Uint8Array,size:number,count:number)=>{assert.equal(size,bytes.length);entries=new TextDecoder().decode(bytes).split('\0').filter(Boolean);assert.equal(entries.length,count)},__nonaHost_environmentVector:()=>1234,
  __nonaHost_environmentContains:(bytes:Uint8Array)=>entries.includes(new TextDecoder().decode(bytes).split('\0')[0]!)});
 const source='process.env.NONA_VECTOR="ü=value";process.env.NONA_NUMBER=42;delete process.env.NONA_NUMBER;JSON.stringify([process.env.NONA_VECTOR,process.env.NONA_NUMBER])';
 const actual=runInContext(source,context);assert.equal(actual+'\n',runOracle('console.log('+source.replace(';JSON.stringify',';return JSON.stringify').replace(/^/,'(()=>{')+'})())').stdout);
 assert.deepEqual(entries,['NONA_VECTOR=ü=value']);
 assert.equal(runInContext('__nonaRegexpVm.processEnvironmentVector()',context),1234);
 assert.equal(runInContext('__nonaRegexpVm.processEnvironmentHas("NONA_VECTOR","ü=value")',context),true);
 runInContext('delete process.env.NONA_VECTOR',context);assert.deepEqual(entries,[]);
 runInContext('Object.defineProperty(process.env,"NONA_DESCRIPTOR",{value:42,writable:true,enumerable:true,configurable:true})',context);assert.deepEqual(entries,['NONA_DESCRIPTOR=42']);
 assert.throws(()=>runInContext('Object.defineProperty(process.env,"NONA_INVALID",{value:42})',context),{code:'ERR_INVALID_OBJECT_DEFINE_PROPERTY'});
});
test('Darwin environment mutations also update the authorized OS libSystem state',()=>{
 const calls:unknown[][]=[],decode=(bytes:Uint8Array)=>new TextDecoder().decode(bytes).split('\0')[0];
 const context=mockProcess({__nonaHost_setenv:(key:Uint8Array,value:Uint8Array,overwrite:number)=>{calls.push(['set',decode(key),decode(value),overwrite]);return 0},__nonaHost_unsetenv:(key:Uint8Array)=>{calls.push(['delete',decode(key)]);return 0}},'darwin-x64');
 runInContext('process.env.NONA_DARWIN="original";delete process.env.NONA_DARWIN',context);
 assert.deepEqual(calls,[['set','NONA_DARWIN','original',1],['delete','NONA_DARWIN']]);
});
test('environment descriptors, assignment and native string boundaries match Node 26',()=>{
 const output:string[]=[],snapshots:string[][]=[];const context=mockProcess({console:{log:(...args:unknown[])=>output.push(args.join(' '))},__nonaHost_replaceEnvironment:(bytes:Uint8Array)=>snapshots.push(new TextDecoder().decode(bytes).split('\0').filter(Boolean))});
 runInContext(processEnvironmentOracle,context);assert.equal(output.join('\n')+'\n',runOracle(processEnvironmentOracle).stdout);
 assert.ok(snapshots.some(entries=>entries.includes('NONA_NUL=a')));assert.ok(!snapshots.some(entries=>entries.includes('NONA_NUL=a\0b')));
 assert.deepEqual(snapshots.at(-1),['NONA_ASSIGN=42','NONA_DEFINE=73']);
});
test('process memoryUsage returns actual allocator counters and current RSS with Node shape',()=>{
 let read=false;const context=mockProcess({
  __nonaHost_heapSnapshot:(words:Uint32Array)=>words.set([65536,0,4096,0,1024,0,12,0]),
  __nonaHost_sys_open:()=>{read=false;return 10},__nonaHost_sys_read:(_fd:number,bytes:Uint8Array)=>{if(read)return 0;read=true;const status=new TextEncoder().encode('VmRSS: 12 kB\n');bytes.set(status);return status.length},__nonaHost_sys_close:()=>0});
 // Initialize lazy metadata before the mock file read used for RSS.
 runInContext('process.pid',context);read=false;
 assert.equal(runInContext('JSON.stringify(process.memoryUsage())',context),'{"rss":12288,"heapTotal":65536,"heapUsed":4096,"external":1024,"arrayBuffers":1024}');
 const source='console.log(Object.keys(process.memoryUsage()).join(","));console.log(typeof process.memoryUsage.rss)';
 assert.equal(runInContext('Object.keys(process.memoryUsage()).join(",")',context)+'\nfunction\n',runOracle(source).stdout);
});
for(const target of ['freebsd-x64','openbsd-x64','darwin-x64','darwin-arm64'])test(`process RSS uses current release ABI counters for ${target}`,()=>{
 const context=mockProcess({__nonaHost_sys_procinfo:(_call:number,_pid:number,flavor:number,_arg:number,words:Uint32Array)=>{if(flavor===11)return 0;assert.equal(flavor,4);words[2]=8192;return 96},
  __nonaHost_sys_sysctl:(mib:Int32Array,_n:number,output:Uint8Array|Uint32Array,length:Uint32Array)=>{
   const words=new Uint32Array(output.buffer);if(mib[0]===1&&mib[2]===12){new Uint8Array(output.buffer).set(new TextEncoder().encode('/image\0'));length[0]=7}
   else if(mib[0]===1){if(target==='openbsd-x64'){assert.deepEqual(Array.from(mib),[1,66,1,123,388,1]);words[96]=2;length[0]=388}else{assert.deepEqual(Array.from(mib),[1,14,1,123]);words[66]=2;length[0]=1088}}
   else if(mib[0]===0){words.set([6,7]);length[0]=8}else{words[0]=4096;length[0]=4}return 0}},target);
 assert.equal(runInContext('process.memoryUsage.rss()',context),8192);
});
test('process Linux memory queries account for real cgroup usage and native limits',()=>{
 const files:Record<string,string>={'/proc/meminfo':'MemTotal: 8 kB\nMemAvailable: 4 kB\n','/proc/self/status':'Name: nona\nVmRSS:\t4294967296 kB\n','/proc/self/cgroup':'0::/group\n','/sys/fs/cgroup/group/memory.max':'2048','/sys/fs/cgroup/group/memory.current':'1024','/sys/fs/cgroup/memory.max':'4096','/sys/fs/cgroup/memory.current':'1024'};
 let next=10;const handles=new Map<number,{bytes:Uint8Array;done:boolean}>();
 const context=mockProcess({__nonaHost_sys_getrlimit:(_resource:number,bounds:Uint32Array)=>{bounds.set([10000,0,10000,0]);return 0},
  __nonaHost_sys_open:(path:Uint8Array,flags:number)=>{if(flags!==0)return -2;const key=new TextDecoder().decode(path).split('\0')[0]!,text=files[key];if(text===undefined)return -2;const fd=next++;handles.set(fd,{bytes:new TextEncoder().encode(text),done:false});return fd},
  __nonaHost_sys_read:(fd:number,bytes:Uint8Array)=>{const handle=handles.get(fd)!;if(handle.done)return 0;handle.done=true;bytes.set(handle.bytes);return handle.bytes.length},__nonaHost_sys_close:()=>0});
 runInContext('RegExp.prototype.exec=function(){throw Error("OS scanner must not invoke RegExp")}',context);
 assert.equal(runInContext('process.constrainedMemory()',context),2048);assert.equal(runInContext('process.availableMemory()',context),1024);
 assert.equal(runInContext('process.memoryUsage.rss()',context),4294967296*1024);
 files['/proc/self/status']='VmRSS: 12.5 kB\n';assert.throws(()=>runInContext('process.memoryUsage.rss()',context),{code:'EIO'});
});
test('process OpenBSD memory uses release uvmexp page/free counters',()=>{
 const context=mockProcess({__nonaHost_sys_sysctl:(mib:Int32Array,_n:number,bytes:Uint8Array,length:Uint32Array)=>{assert.deepEqual(Array.from(mib),[2,4]);new Uint32Array(bytes.buffer).set([4096,4095,12,10000,12]);length[0]=20;return 0},
  __nonaHost_sys_getrlimit:(_resource:number,bounds:Uint32Array)=>{bounds.set([0xffffffff,0x7fffffff,0xffffffff,0x7fffffff]);return 0}},'openbsd-x64');
 assert.equal(runInContext('process.availableMemory()',context),49152);assert.equal(runInContext('process.constrainedMemory()',context),0);
});
test('process Windows memory queries honor actual process Job Object limits',()=>{
 const context=mockProcess({__nonaHost_GetCommandLineW:()=>100,__nonaHost_lstrlenW:()=>0,__nonaHost_RtlMoveMemory:()=>{},__nonaHost_GetModuleFileNameW:()=>0,
  __nonaHost_GetEnvironmentStringsW:()=>0,__nonaHost_GetCurrentProcessId:()=>123,__nonaHost_NtQueryInformationProcess:()=>-1,
  __nonaHost_K32GetProcessMemoryInfo:(_process:number,words:Uint32Array,size:number)=>{assert.equal(size,72);assert.equal(words[0],72);words[2]=16384;words[4]=8192;return true},
  __nonaHost_GetThreadTimes:(thread:number,_creation:Uint32Array,_exit:Uint32Array,kernel:Uint32Array,user:Uint32Array)=>{assert.equal(thread,-2);kernel[0]=50;user[0]=30;return true},
  __nonaHost_GlobalMemoryStatusEx:(words:Uint32Array)=>{words[4]=8192;return true},__nonaHost_IsProcessInJob:(_process:number,_job:number,yes:Uint32Array)=>{yes[0]=1;return true},
  __nonaHost_QueryInformationJobObject:(_job:number,_class:number,words:Uint32Array)=>{words[4]=0x100;words[28]=4096;return true}});
 assert.equal(runInContext('process.constrainedMemory()',context),4096);assert.equal(runInContext('process.availableMemory()',context),4096);
 assert.equal(runInContext('process.memoryUsage.rss()',context),8192);
 assert.equal(runInContext('JSON.stringify(process.threadCpuUsage())',context),'{"user":3,"system":5}');
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
  __nonaHost_replaceEnvironment:()=>{},__nonaHost_environmentVector:()=>0,
  __nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>12,
  __nonaHost_sys_write:(fd:number,b:Uint8Array,n:number)=>{writes.push({fd,bytes:Array.from(b.slice(0,n))});return n},
 });
 runInContext(processPreludeForTarget('linux-x64'),context);
 assert.equal(runInContext('process.stdout.write("hello ü");process.stderr.write(new Uint8Array([0,65,255]))',context),true);
 assert.deepEqual(writes,[{fd:1,bytes:Array.from(new TextEncoder().encode('hello ü'))},{fd:2,bytes:[0,65,255]}]);
});

for(const target of supportedNativeTargets)test(`process standard streams/resources compile for ${target}`,()=>{
 const result=compile(processExtendedOracle+processReviewOracle+processEnvironmentOracle+processAccountOracle+processThreadOracle+processExecErrorOracle,{fileName:'process-io.js',target});assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});


function portableBoundary(){
 let directory='/work',clock=5000;const jobs:(()=>void)[]=[];
 const context=createContext({TextEncoder,TextDecoder,__nonaRegexpVm:{},scheduleJob:(job:()=>void)=>jobs.push(job),__nonaPromiseDrainJobs(){while(jobs.length)jobs.shift()!()},__nonaProcessNow:()=>clock++,
  __nonaHost_GetCommandLineW:()=>0,__nonaHost_sys_open:()=>-2,__nonaHost_replaceEnvironment:()=>{},
  __nonaHost_sys_readlink:(_path:unknown,bytes:Uint8Array)=>{bytes.set(new TextEncoder().encode('/app'));return 4},
  __nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>45,
  __nonaHost_sys_getcwd:(bytes:Uint8Array)=>{bytes.set(new TextEncoder().encode(directory+'\0'));return directory.length+1},
  __nonaHost_sys_chdir:(bytes:Uint8Array)=>{directory=new TextDecoder().decode(bytes).slice(0,-1);return 0},
 });
 runInContext(processPreludeForTarget('linux-x64'),context);return context;
}
test('process boundary validates exitCode and directory arguments',()=>{
 const context=portableBoundary();
 assert.equal(runInContext('process.exitCode=" 3 ";process.exitCode',context),3);
 assert.equal(runInContext('process.exitCode=null;process.exitCode',context),undefined);
 assert.equal(runInContext('try{process.exitCode=1.5}catch(e){e.code}',context),'ERR_OUT_OF_RANGE');
 assert.equal(runInContext('try{process.exitCode="1.5"}catch(e){e.code}',context),'ERR_OUT_OF_RANGE');
 assert.equal(runInContext('try{process.exitCode=1e30}catch(e){e.code}',context),'ERR_OUT_OF_RANGE');
 assert.equal(runInContext('process.exitCode=" ";process.exitCode',context),0);
 assert.equal(runInContext('try{process.chdir(1)}catch(e){e.code}',context),'ERR_INVALID_ARG_TYPE');
 assert.equal(runInContext('process.chdir("/other");process.cwd()',context),'/other');
 assert.equal(runInContext('process.ppid',context),45);
 assert.equal(runInContext('process.hrtime.bigint()>0n&&process.uptime()>=0',context),true);
 assert.equal(runInContext('process.hrtime()[1]>=0&&process.hrtime()[1]<1000000000',context),true);
});
test('nextTick boundary drains nested ticks before jobs and later ticks after the job batch',()=>{
 const context=portableBoundary();
 const result=runInContext('var order=[];scheduleJob(()=>{order.push("promise");process.nextTick(()=>order.push("later"))});process.nextTick((a,b)=>{order.push(a+b);process.nextTick(()=>order.push("nested"))},1,2);__nonaPromiseDrainJobs();order.join(",")',context);
 assert.equal(result,'3,nested,promise,later');
});
