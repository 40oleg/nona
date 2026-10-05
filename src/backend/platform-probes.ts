import {Arm64Assembler} from './arm64/assembler.js';
import {linkWindowsArm64} from './arm64/windows.js';
import {Assembler} from './x64/assembler.js';
import {linkElf} from './elf/writer.js';
import {linkPe} from './pe/writer.js';
import {linkMachO} from './macho/writer.js';
import {getTarget,type Target} from '../target.js';
import type {CodeFragment,NativeProgram} from './pe/model.js';
import {compile} from '../compiler.js';
import {processTitleProbe} from './process-title-probe.js';
import {processFinalizationProbeSource,processFinalizationProbeExpected} from './process-finalization-probe.js';
import {nonaVersion} from '../version.js';
import {compileToIR} from '../compiler.js';
import {collectSourceUsage} from '../frontend/lexer.js';
import {generate} from './x64/codegen.js';
import {linkDarwin} from './darwin/index.js';
import {linkLinux} from './linux/index.js';
import {linkBsd} from './bsd/index.js';
import {withNativeTarget} from './machine/context.js';

export const loaderProbeOutput='hello\n';
/** Small language/runtime probes with hand-derived observable results. */
export const runtimeProbeSources=[
  {name:'arithmetic',source:'let a=3;for(let i=0;i<100;i++)a=(a*7+i)%997;console.log(6*7,"a"+"b",10/4,17%5,a)',expected:'42 ab 2.5 2 693\n'},
  {name:'closures',source:'function make(n){return function(x){return n+x}}let f=make(9),a=[];for(let i=0;i<2000;i++)a.push({x:f(i)});console.log(a.length,a[0].x,a[1999].x);console.log(Object.getOwnPropertyNames(Reflect).includes("apply"),Reflect.ownKeys({x:1}).join(","))',expected:'2000 9 2008\ntrue x\n'},
  {name:'bigint',source:'let x=1234567890123456789n;console.log(String(x*9n),String(x/7n),String(x%7n))',expected:'11111111011111111101 176366841446208112 5\n'},
  {name:'math',source:'console.log(Math.sqrt(81),Math.abs(-17),Math.pow(2,10),Math.round(Math.sin(0.5)*1000000),Math.round(Math.log(2)*1000000))',expected:'9 17 1024 479426 693147\n'},
  {name:'generator',source:'function* f(){for(let i=0;i<20;i++)yield i*i}let sum=0;for(let x of f())sum+=x;console.log(sum)',expected:'2470\n'},
  {name:'async',source:'async function f(x){return (await Promise.resolve(x))+1}f(41).then(x=>console.log(x))',expected:'42\n'},
  {name:'clock',source:'let a=Date.now(),b=Date.now(),t=performance.now();__nonaAgentSleep(30);console.log(a>1700000000000,b>=a,performance.now()-t>=20)',expected:'true true true\n'},
  {name:'timers',source:'setTimeout(()=>console.log("timer",performance.now()>0),2)',expected:'timer true\n'},
] as const;
export function runtimeProbes(target:Target):{name:string;image:Uint8Array;expected:string;status?:number}[] {
  const probes:{name:string;image:Uint8Array;expected:string;status?:number}[]=runtimeProbeSources.map(probe=>{
    const result=compile(probe.source,{fileName:`${probe.name}.js`,target,...(probe.name==='clock'?{agents:['']}: {})});
    if(!result.ok)throw new Error(`${target}/${probe.name}: ${JSON.stringify(result.diagnostics)}`);
    return {name:probe.name,image:result.image,expected:probe.expected};
  });
  const descriptor=getTarget(target)!;
  const metadata=compile('console.log(process.version,Object.keys(process.versions).join(","),process.versions.nona,process.release.name,process.features.aot,process.features.inspector,process.config.target,Object.isFrozen(process.config))',{fileName:'process-metadata.js',target});if(!metadata.ok)throw new Error(JSON.stringify(metadata.diagnostics));probes.push({name:'process-metadata',image:metadata.image,expected:`v${nonaVersion} nona ${nonaVersion} nona true false ${descriptor.os}-${descriptor.arch} true\n`});
  probes.push({name:'process-finalization',image:processFinalizationProbeImage(target),expected:processFinalizationProbeExpected});
  const title=processTitleProbe(target),titleImage=compile(title.source,{fileName:'process-title.mjs',target,module:true});if(!titleImage.ok)throw new Error(`${target}/process-title: ${JSON.stringify(titleImage.diagnostics)}`);probes.push({name:'process-title',image:titleImage.image,expected:title.expected});
  if(target.startsWith('win32-')){
    const startup=compile('console.log("process getter");let p=process;console.log("process built",p.platform,typeof p.execve)',{fileName:'process-startup.js',target});
    if(!startup.ok)throw new Error(`${target}/process-startup: ${JSON.stringify(startup.diagnostics)}`);
    probes.push({name:'process-startup',image:startup.image,expected:'process getter\nprocess built win32 function\n'});
  }
  const processExec=compile('if(process.platform==="win32"){try{process.execve()}catch(error){console.log(error.code)}}else if(process.argv[1]==="child"){console.log(process.argv[1],process.argv[2],process.env.NONA_EXEC_VALUE,process.pid===Number(process.env.NONA_EXEC_PARENT))}else if(process.argv[1]==="environment"){console.log(process.env.NONA_NATIVE_VECTOR==="ü=value",process.env.NONA_NATIVE_NUMBER==="42",process.env.NONA_NATIVE_DELETED===undefined);process.execve(process.execPath,[process.execPath,"child","ü=arg"],{NONA_EXEC_VALUE:"ü=env",NONA_EXEC_PARENT:String(process.pid)})}else{process.on("exit",()=>console.log("unexpected exit"));setTimeout(()=>console.log("unexpected timer"),1);process.env.NONA_NATIVE_VECTOR="ü=value";process.env.NONA_NATIVE_NUMBER=42;process.env.NONA_NATIVE_DELETED="removed";delete process.env.NONA_NATIVE_DELETED;process.execve(process.execPath,[process.execPath,"environment"])}',{fileName:'process-exec.js',target});
  if(!processExec.ok)throw new Error(`${target}/process-exec: ${JSON.stringify(processExec.diagnostics)}`);
  probes.push({name:'process-exec',image:processExec.image,expected:target.startsWith('win32-')?'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM\n':'true true true\nchild ü=arg ü=env true\n'});
  const processThread=compile('let usage=process.threadCpuUsage(),delta=process.threadCpuUsage(usage);console.log(Object.keys(usage).join(","),usage.user>=0,usage.system>=0,delta.user>=0,delta.system>=0)',{fileName:'process-thread.js',target});
  if(!processThread.ok)throw new Error(`${target}/process-thread: ${JSON.stringify(processThread.diagnostics)}`);
  probes.push({name:'process-thread',image:processThread.image,expected:'user,system true true true true\n'});
  const processAccounts=compile('if(process.platform==="win32")console.log(true,true,true);else{let uid=process.geteuid(),gid=process.getegid(),failed=false;try{process.seteuid("__nona_missing_account_141__")}catch(error){failed=error.code==="ERR_UNKNOWN_CREDENTIAL"}if(!failed)throw new Error("Unknown account must fail");process.seteuid(uid===0?"root":uid);process.setegid(gid===0?"root":gid);console.log(process.geteuid()===uid,process.getegid()===gid,typeof process.initgroups==="function")}',{fileName:'process-accounts.js',target});
  if(!processAccounts.ok)throw new Error(`${target}/process-accounts: ${JSON.stringify(processAccounts.diagnostics)}`);
  probes.push({name:'process-accounts',image:processAccounts.image,expected:'true true true\n'});
  const processEnvironment=compile('process.env.NONA_NATIVE_VECTOR="ü=value";console.log(process.env.NONA_NATIVE_VECTOR==="ü=value",Object.keys(process.env).includes("NONA_NATIVE_VECTOR"),Object.getOwnPropertyDescriptor(process.env,"NONA_NATIVE_VECTOR").value==="ü=value");process.env.NONA_NATIVE_VECTOR=42;console.log(process.env.NONA_NATIVE_VECTOR==="42",process.env.NONA_NATIVE_VECTOR==="ü=value");delete process.env.NONA_NATIVE_VECTOR;console.log(Object.keys(process.env).includes("NONA_NATIVE_VECTOR"))' ,{fileName:'process-environment.js',target});
  if(!processEnvironment.ok)throw new Error(`${target}/process-environment: ${JSON.stringify(processEnvironment.diagnostics)}`);
  probes.push({name:'process-environment',image:processEnvironment.image,expected:'true true true\ntrue false\nfalse\n'});
  const processMemory=compile('let buffer=new ArrayBuffer(262144),shared=new SharedArrayBuffer(1024),memory=process.memoryUsage();console.log(Object.keys(memory).join(","),memory.rss>0,memory.heapTotal>=memory.heapUsed,memory.external>=memory.arrayBuffers,memory.arrayBuffers>=buffer.byteLength+shared.byteLength,process.memoryUsage.rss()>0)',{fileName:'process-memory.js',target});
  if(!processMemory.ok)throw new Error(`${target}/process-memory: ${JSON.stringify(processMemory.diagnostics)}`);
  probes.push({name:'process-memory',image:processMemory.image,expected:'rss,heapTotal,heapUsed,external,arrayBuffers true true true true true\n'});
  const processSystem=compile('console.log(process.availableMemory()>0,process.constrainedMemory()>=0,process.platform==="win32"?process.getgroups===undefined:process.getgroups().includes(process.getegid()));let timer=setTimeout(()=>{},50);console.log(process.getActiveResourcesInfo().filter(name=>name==="Timeout").length);clearTimeout(timer);let slash=process.platform==="win32"?"\\\\":"/";let path=process.execPath.slice(0,process.execPath.lastIndexOf(slash)+1)+"process.env";process.env.NONA_PLATFORM_ENV_KEEP="original";process.loadEnvFile(path);console.log(JSON.stringify([process.env.NONA_PLATFORM_ENV_QUOTED,process.env.NONA_PLATFORM_ENV_MULTILINE==="first\\nsecond",process.env.NONA_PLATFORM_ENV_KEEP]))',{fileName:'process-system.js',target});
  if(!processSystem.ok)throw new Error(`${target}/process-system: ${JSON.stringify(processSystem.diagnostics)}`);
  probes.push({name:'process-system',image:processSystem.image,expected:'true true true\n1\n[" value # bytes ",true,"original"]\n'});
  const processIO=compile('process.stdout.write("stdio\\n");let c=process.cpuUsage();console.log(c.user>=0,c.system>=0,process.resourceUsage().maxRSS>=0,process.kill(process.pid,0));process.once("custom",n=>console.log("event",n));process.emit("custom",42);let nested=0;process.on("nested",()=>{if(++nested===1)process.emit("nested")});process.once("nested",()=>console.log("once"));process.emit("nested");process.on("beforeExit",n=>console.log("beforeExit",n));process.on("exit",n=>console.log("exit",n))',{fileName:'process-io.js',target});
  if(!processIO.ok)throw new Error(`${target}/process-io: ${JSON.stringify(processIO.diagnostics)}`);
  probes.push({name:'process-io',image:processIO.image,expected:'stdio\ntrue true true true\nevent 42\nonce\nbeforeExit 0\nexit 0\n'});
  const processProbe=compile('let original=process.cwd();process.chdir(".");let t=process.hrtime(),n=process.hrtime.bigint();console.log(process.platform,process.arch,process.pid>0,process.ppid>0,process.execPath.length>0,process.argv[0]===process.execPath,process.argv.length>0,process.cwd()===original,typeof (process.env.PATH||process.env.Path));console.log(t.length,t[1]>=0&&t[1]<1000000000,process.hrtime.bigint()>=n,process.uptime()>=0);Promise.resolve().then(()=>{console.log("promise");process.nextTick(()=>console.log("after promise"))});process.nextTick((n)=>{console.log("tick",n);process.nextTick(()=>console.log("nested"))},42);console.log("sync")',{fileName:'process-core.js',target});
  if(!processProbe.ok)throw new Error(`${target}/process-core: ${JSON.stringify(processProbe.diagnostics)}`);
  probes.push({name:'process-core',image:processProbe.image,expected:`${descriptor.os} ${descriptor.arch} true true true true true true string\n2 true true true\nsync\ntick 42\nnested\npromise\nafter promise\n`});
  if(target==='freebsd-x64'||target==='openbsd-x64'||target==='linux-arm64'||getTarget(target)!.os==='darwin'||target==='win32-arm64'||target==='linux-x64'){
    const source='let saved=[];for(let i=0;i<200;i++){let x={n:i,s:"x"+i};saved.push(()=>x)}let sum=0;for(let i=0;i<saved.length;i++)sum+=saved[i]().n;console.log(saved.length,sum,saved[199]().s)';
    const {result:ir,usage}=collectSourceUsage(()=>compileToIR(source,undefined,undefined,target));
    const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage}));
    probes.push({name:'gc-stress',image:target==='win32-arm64'?linkWindowsArm64(program):getTarget(target)!.os==='darwin'?linkDarwin(program,getTarget(target)!.arch):getTarget(target)!.os==='linux'?linkLinux(program,getTarget(target)!.arch):linkBsd(program,target==='freebsd-x64'?'freebsd':'openbsd'),expected:'200 19900 x199\n'});
    const agent='$262.agent.receiveBroadcast(function(sab){let a=new Int32Array(sab);$262.agent.sleep(10);Atomics.store(a,0,42);Atomics.notify(a,0,1);$262.agent.report("done")})';
    const main='__nonaAgentStart(0);let b=new SharedArrayBuffer(4),a=new Int32Array(b);__nonaAgentBroadcast(b,0);let status=Atomics.wait(a,0,0,1000),report=null;for(let i=0;i<400&&report===null;i++){report=__nonaAgentGetReport();if(report===null)__nonaAgentSleep(5)}console.log(status==="ok"||status==="not-equal",Atomics.load(a,0),report)';
    const result=compile(main,{fileName:'agents.js',target,agents:[agent]});
    if(!result.ok)throw new Error(`${target}/agents: ${JSON.stringify(result.diagnostics)}`);
    probes.push({name:'agents',image:result.image,expected:'true 42 done\n'});
    const worker='$262.agent.receiveBroadcast(function(sab){let a=new Int32Array(sab);for(let i=0;i<5000;i++){let old;do{old=Atomics.load(a,0)}while(Atomics.compareExchange(a,0,old,old+1)!==old);Atomics.add(a,1,1)}$262.agent.report("done")})';
    const contention='for(let i=0;i<4;i++)__nonaAgentStart(i);let b=new SharedArrayBuffer(8),a=new Int32Array(b);__nonaAgentBroadcast(b,0);let count=0;for(let i=0;i<2000&&count<4;i++){let report=__nonaAgentGetReport();if(report!==null)count++;else __nonaAgentSleep(5)}console.log(count,Atomics.load(a,0),Atomics.load(a,1))';
    const contended=compile(contention,{fileName:'atomic-contention.js',target,agents:Array(4).fill(worker)});
    if(!contended.ok)throw new Error(JSON.stringify(contended.diagnostics));probes.push({name:'atomic-contention',image:contended.image,expected:'4 20000 20000\n'});
  }
  if(target==='linux-arm64'||target==='win32-arm64'){
    const extra=[
      {name:'process',source:'console.log(process.platform,process.arch,process.pid>0,process.execPath.length>0,process.argv.length>0,process.cwd().length>0,typeof (process.env.PATH||process.env.Path))',expected:(target==='linux-arm64'?'linux':'win32')+' arm64 true true true true string\n'},
      {name:'filesystem',source:'import * as fs from "node:fs";let d="work/platform-probes/arm-fs",stage="mkdir";try{fs.mkdirSync(d);stage="write";fs.writeFileSync(d+"/a","hello");stage="append";fs.appendFileSync(d+"/a"," world");stage="copy";fs.copyFileSync(d+"/a",d+"/b");stage="rename";fs.renameSync(d+"/b",d+"/c");stage="read-stat-list";console.log(fs.readFileSync(d+"/a","utf8"),fs.statSync(d+"/c").size,fs.statSync(d).isDirectory(),fs.readdirSync(d).sort().join(","));fs.unlinkSync(d+"/a");fs.unlinkSync(d+"/c");fs.rmdirSync(d);console.log(fs.existsSync(d))}catch(e){console.log("FAIL",stage,e.code,e.syscall,e.message);throw e}',expected:'hello world 11 true a,c\nfalse\n',module:true},
    ];
    for(const probe of extra){const result=compile(probe.source,{fileName:probe.name+'.js',target,module:probe.module});if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));probes.push({name:probe.name,image:result.image,expected:probe.expected});}
  }
  if(getTarget(target)!.os!=='win32'){
    const read=target==='linux-arm64'?63:target==='linux-x64'?0:3,pid=target==='linux-arm64'?172:target==='linux-x64'?39:20;
    const result=compile(`import {define} from 'nona:ffi';const read=define('syscall','${read}','i64(i32,ptr,u32)'),pid=define('syscall','${pid}','i64()');console.log(pid()>0,read(-1,null,0))`,{fileName:'ffi-syscall.mjs',target,module:true});
    if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));probes.push({name:'ffi-syscall',image:result.image,expected:'true -9\n'});
  }
  for(const probe of processExceptionProbes){
    const result=compile(probe.source,{fileName:probe.name+'.js',target});if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));
    probes.push({name:probe.name,image:result.image,expected:probe.expected,status:probe.status});
  }
  return probes;
}
/** Public API probes include real entry unwinding and fatal native statuses. */
export const processExceptionProbes=[
 {name:'process-rejection-proxy',source:'let gets=0;let real=new Proxy(Object.setPrototypeOf(Error("real"),null),{get(t,k,r){gets++;return Reflect.get(t,k,r)}}),fake=new Proxy(Object.create(Error.prototype),{get(t,k,r){gets++;return Reflect.get(t,k,r)}}),pair=Proxy.revocable(Error("revoked"),{});pair.revoke();process.on("uncaughtException",(e,o)=>console.log(e===real,e===real?"original":String(e.code),o,gets));Promise.reject(real);Promise.reject(fake);Promise.reject(pair.proxy)',expected:'true original unhandledRejection 0\nfalse ERR_UNHANDLED_REJECTION unhandledRejection 0\nfalse undefined uncaughtException 0\n',status:0},
 {name:'process-rejection-brand',source:'process.on("uncaughtException",(e,o)=>console.log(e.code===undefined?"native":e.code,o));Promise.reject(Object.create(Error.prototype));Promise.reject(Object.setPrototypeOf(Error("native"),null))',expected:'ERR_UNHANDLED_REJECTION unhandledRejection\nnative unhandledRejection\n',status:0},
 {name:'process-uncaught',source:'process.on("uncaughtExceptionMonitor",(e,o)=>console.log("monitor",e.message,o));process.on("uncaughtException",e=>{console.log("caught",e.message);if(e.message==="tick")setTimeout(()=>{throw Error("timer")},1);if(e.message==="timer")setTimeout(()=>console.log("later"),1)});process.nextTick(()=>{throw Error("tick")});throw Error("top")',expected:'monitor top uncaughtException\ncaught top\nmonitor tick uncaughtException\ncaught tick\nmonitor timer uncaughtException\ncaught timer\nlater\n',status:0},
 {name:'process-rejection',source:'let parent=Promise.reject("reason"),child=parent.then();process.on("unhandledRejection",(r,p)=>{console.log(r,p===child,p===parent);p.catch(()=>console.log("catch"))});process.on("rejectionHandled",p=>console.log("handled",p===child));Promise.reject("same turn").catch(()=>console.log("same turn"))',expected:'same turn\nreason true false\ncatch\nhandled true\n',status:0},
 {name:'process-capture',source:'process.on("uncaughtExceptionMonitor",()=>console.log("monitor"));process.on("uncaughtException",()=>console.log("unexpected event"));process.setUncaughtExceptionCaptureCallback(e=>console.log("capture",e.message));setTimeout(()=>{process.setUncaughtExceptionCaptureCallback(null);console.log(process.hasUncaughtExceptionCaptureCallback())},1);throw Error("top")',expected:'monitor\ncapture top\nfalse\n',status:0},
 {name:'process-fatal',source:'process.on("uncaughtExceptionMonitor",(e,o)=>console.log(e.message,o));process.on("beforeExit",()=>console.log("unexpected beforeExit"));process.on("exit",code=>console.log("exit",code));throw Error("fatal")',expected:'fatal uncaughtException\nexit 1\n',status:1},
 {name:'process-handler-fatal',source:'process.setUncaughtExceptionCaptureCallback(()=>{throw Error("handler")});process.on("exit",code=>console.log("unexpected exit",code));throw Error("fatal")',expected:'',status:7},
 {name:'process-rejection-fatal',source:'process.on("uncaughtExceptionMonitor",(e,o)=>console.log(e.name,e.code,o));Promise.reject("primitive")',expected:'UnhandledPromiseRejection ERR_UNHANDLED_REJECTION unhandledRejection\n',status:1},
] as const;
/** Refuse accidental emulation (including Rosetta) in native verification. */
export function assertNativeHost(target:string,platform:string=process.platform,arch:string=process.arch):void {
  const descriptor=getTarget(target);
  if(!descriptor)throw new Error(`Unknown probe target ${target}`);
  if(descriptor.os!==platform||descriptor.arch!==arch)throw new Error(`Native host ${platform}/${arch} does not match target ${target}`);
}

/** This is a loader/ABI probe, not a claim that the JavaScript backend works. */
export function loaderProbe(target:Target):Uint8Array {
  const descriptor=getTarget(target);if(!descriptor)throw new Error(`Loader probe is not implemented for ${target}`);
  if(target==='win32-arm64'){
    const result=compile('console.log("hello")',{fileName:'loader.js',target});if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));return result.image;
  }
  if(descriptor.os==='win32')throw new Error('Unsupported Windows loader probe');
  let code:CodeFragment;
  if(descriptor.arch==='x64'){
    const a=new Assembler('probe.start');
    a.mov('rdi',1);a.lea('rsi',{rip:'probe.message'});a.mov('rdx',6);
    a.syscall(descriptor.os==='linux'?1:descriptor.os==='darwin'?0x2000004:4);
    a.mov('rdi',0);a.syscall(descriptor.os==='linux'?60:descriptor.os==='darwin'?0x2000001:1);
    code=a.finish();
  }else{
    // ARM64 uses x0..x2 arguments; Linux uses x8/SVC 0, Darwin x16/SVC 0x80.
    const bytes:number[]=[],word=(value:number)=>{for(let i=0;i<4;i++)bytes.push(value>>>(i*8)&255);};
    word(0xd2800020); // mov x0, #1
    const pointer=bytes.length;
    word(0x90000001);word(0x91000021); // adrp/add x1, message (slide invariant)
    word(0xd28000c2); // mov x2, #6
    const linux=descriptor.os==='linux';
    word(linux?0xd2800808:0xd2800090);word(linux?0xd4000001:0xd4001001);
    word(0xd2800000);word(linux?0xd2800ba8:0xd2800030);word(linux?0xd4000001:0xd4001001);
    code={bytes:Uint8Array.from(bytes),symbols:{},fixups:[
      {offset:pointer,kind:'arm64-page21',target:'probe.message',addend:0},
      {offset:pointer+4,kind:'arm64-pageoff12',target:'probe.message',addend:0},
    ]};
  }
  const program:NativeProgram={entry:'probe.start',imports:[],functions:[],fragments:[
    {...code,name:'probe.start',section:'.text'},
    {name:'probe.message',section:'.rdata',bytes:new TextEncoder().encode(loaderProbeOutput),fixups:[],symbols:{}},
  ]};
  if(descriptor.os==='darwin')return linkMachO(program,{arch:descriptor.arch});
  return linkElf(program,{machine:descriptor.arch,os:descriptor.os,...(descriptor.os==='openbsd'?{
    syscallPins:code.syscalls!.map(call=>({symbol:'probe.start',...call})),
  }:{})});
}

export function processFinalizationProbeImage(target:Target):Uint8Array {
 const {result:ir,usage}=collectSourceUsage(()=>compileToIR(processFinalizationProbeSource,undefined,undefined,target));
 const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage})),descriptor=getTarget(target)!;
 return descriptor.os==='freebsd'||descriptor.os==='openbsd'?linkBsd(program,descriptor.os):descriptor.os==='linux'?linkLinux(program,descriptor.arch):descriptor.os==='darwin'?linkDarwin(program,descriptor.arch):target==='win32-arm64'?linkWindowsArm64(program):linkPe(program);
}
