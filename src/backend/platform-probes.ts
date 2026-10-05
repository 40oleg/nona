import {Arm64Assembler} from './arm64/assembler.js';
import {linkWindowsArm64} from './arm64/windows.js';
import {Assembler} from './x64/assembler.js';
import {linkElf} from './elf/writer.js';
import {linkMachO} from './macho/writer.js';
import {getTarget,type Target} from '../target.js';
import type {CodeFragment,NativeProgram} from './pe/model.js';
import {compile} from '../compiler.js';
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
export function runtimeProbes(target:Target):{name:string;image:Uint8Array;expected:string}[] {
  const probes:{name:string;image:Uint8Array;expected:string}[]=runtimeProbeSources.map(probe=>{
    const result=compile(probe.source,{fileName:`${probe.name}.js`,target,...(probe.name==='clock'?{agents:['']}: {})});
    if(!result.ok)throw new Error(`${target}/${probe.name}: ${JSON.stringify(result.diagnostics)}`);
    return {name:probe.name,image:result.image,expected:probe.expected};
  });
  const descriptor=getTarget(target)!;
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
  return probes;
}
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
