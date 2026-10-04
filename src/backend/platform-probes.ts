import {Assembler} from './x64/assembler.js';
import {linkElf} from './elf/writer.js';
import {linkMachO} from './macho/writer.js';
import {getTarget,type Target} from '../target.js';
import type {CodeFragment,NativeProgram} from './pe/model.js';
import {compile} from '../compiler.js';
import {compileToIR} from '../compiler.js';
import {collectSourceUsage} from '../frontend/lexer.js';
import {generate} from './x64/codegen.js';
import {linkBsd} from './bsd/index.js';

export const loaderProbeOutput='hello\n';
/** Small language/runtime probes with hand-derived observable results. */
export const runtimeProbeSources=[
  {name:'arithmetic',source:'let a=3;for(let i=0;i<100;i++)a=(a*7+i)%997;console.log(6*7,"a"+"b",10/4,17%5,a)',expected:'42 ab 2.5 2 693\n'},
  {name:'closures',source:'function make(n){return function(x){return n+x}}let f=make(9),a=[];for(let i=0;i<2000;i++)a.push({x:f(i)});console.log(a.length,a[0].x,a[1999].x)',expected:'2000 9 2008\n'},
  {name:'bigint',source:'let x=1234567890123456789n;console.log(String(x*9n),String(x/7n),String(x%7n))',expected:'11111111011111111101 176366841446208112 5\n'},
  {name:'math',source:'console.log(Math.sqrt(81),Math.abs(-17),Math.pow(2,10),Math.round(Math.sin(0.5)*1000000),Math.round(Math.log(2)*1000000))',expected:'9 17 1024 479426 693147\n'},
  {name:'generator',source:'function* f(){for(let i=0;i<20;i++)yield i*i}let sum=0;for(let x of f())sum+=x;console.log(sum)',expected:'2470\n'},
  {name:'async',source:'async function f(x){return (await Promise.resolve(x))+1}f(41).then(x=>console.log(x))',expected:'42\n'},
  {name:'clock',source:'let a=Date.now(),b=Date.now();console.log(a>1700000000000,b>=a)',expected:'true true\n'},
  {name:'timers',source:'setTimeout(()=>console.log("timer",performance.now()>0),2)',expected:'timer true\n'},
] as const;
export function runtimeProbes(target:Target):{name:string;image:Uint8Array;expected:string}[] {
  const probes:{name:string;image:Uint8Array;expected:string}[]=runtimeProbeSources.map(probe=>{
    const result=compile(probe.source,{fileName:`${probe.name}.js`,target});
    if(!result.ok)throw new Error(`${target}/${probe.name}: ${JSON.stringify(result.diagnostics)}`);
    return {name:probe.name,image:result.image,expected:probe.expected};
  });
  if(target==='freebsd-x64'||target==='openbsd-x64'){
    const source='let saved=[];for(let i=0;i<200;i++){let x={n:i,s:"x"+i};saved.push(()=>x)}let sum=0;for(let i=0;i<saved.length;i++)sum+=saved[i]().n;console.log(saved.length,sum,saved[199]().s)';
    const {result:ir,usage}=collectSourceUsage(()=>compileToIR(source,undefined,undefined,target));
    const program=generate(ir,{gcStress:true,link:usage});
    probes.push({name:'gc-stress',image:linkBsd(program,target==='freebsd-x64'?'freebsd':'openbsd'),expected:'200 19900 x199\n'});
    const agent='$262.agent.receiveBroadcast(function(sab){let a=new Int32Array(sab);$262.agent.sleep(10);Atomics.store(a,0,42);Atomics.notify(a,0,1);$262.agent.report("done")})';
    const main='__nonaAgentStart(0);let b=new SharedArrayBuffer(4),a=new Int32Array(b);__nonaAgentBroadcast(b,0);let status=Atomics.wait(a,0,0,1000),report=null;for(let i=0;i<400&&report===null;i++){report=__nonaAgentGetReport();if(report===null)__nonaAgentSleep(5)}console.log(status==="ok"||status==="not-equal",Atomics.load(a,0),report)';
    const result=compile(main,{fileName:'agents.js',target,agents:[agent]});
    if(!result.ok)throw new Error(`${target}/agents: ${JSON.stringify(result.diagnostics)}`);
    probes.push({name:'agents',image:result.image,expected:'true 42 done\n'});
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
  const descriptor=getTarget(target);if(!descriptor||descriptor.os==='win32')throw new Error(`Loader probe is not implemented for ${target}`);
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
    word(0x58000041);word(0x14000003); // ldr x1, literal; skip address
    const pointer=bytes.length;for(let i=0;i<8;i++)bytes.push(0);
    word(0xd28000c2); // mov x2, #6
    const linux=descriptor.os==='linux';
    word(linux?0xd2800808:0xd2800090);word(linux?0xd4000001:0xd4001001);
    word(0xd2800000);word(linux?0xd2800ba8:0xd2800030);word(linux?0xd4000001:0xd4001001);
    code={bytes:Uint8Array.from(bytes),symbols:{},fixups:[{offset:pointer,kind:'va64',target:'probe.message',addend:0}]};
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
