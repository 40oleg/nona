import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {compile} from '../dist/src/compiler.js';
import {loaderProbe,loaderProbeOutput,runtimeProbes} from '../dist/src/backend/platform-probes.js';
import {eventProbes} from '../dist/src/backend/event-probes.js';
import {arm64BridgeProbe} from '../dist/src/backend/arm64/bridge-probe.js';
import {arm64CpuProbe} from '../dist/src/backend/arm64/cpu-probe.js';
import {arm64MathProbe,arm64MathCases} from '../dist/src/backend/arm64/math.js';

const allTargets=['linux-x64','linux-arm64','freebsd-x64','openbsd-x64','darwin-x64','darwin-arm64','win32-arm64'];
const targets=process.argv[3]?.split(',')??allTargets;
if(!targets.length||targets.some(t=>!allTargets.includes(t))||new Set(targets).size!==targets.length)throw new Error('Invalid or duplicate probe target');
const directory=resolve(process.argv[2]??'work/platform-probes');
mkdirSync(directory,{recursive:true});
for(const target of targets){
  writeFileSync(join(directory,target+(target.startsWith('win32-')?'.exe':'')),loaderProbe(target),{mode:0o755});
}
writeFileSync(join(directory,'expected.txt'),loaderProbeOutput);
writeFileSync(join(directory,'process.env'),"export NONA_PLATFORM_ENV_QUOTED=' value # bytes '\nNONA_PLATFORM_ENV_MULTILINE='first\nsecond'\nNONA_PLATFORM_ENV_KEEP=changed\n");
const runtime={};
const eventsProbeSource=`import {EventEmitter, once, errorMonitor} from 'node:events';
const emitter=new EventEmitter();const seen=[];const key=Symbol('ready');
function first(value){seen.push('first:'+value);emitter.removeListener(key,second);}
function second(value){seen.push('second:'+value);}
emitter.on(key,first).on(key,second).prependOnceListener(key,value=>seen.push('once:'+value));
emitter.emit(key,1);emitter.emit(key,2);
console.log(seen.join('|'),emitter.listenerCount(key));
const waiting=once(emitter,'done');waiting.then(args=>console.log('promise',args.join(','),emitter.listenerCount('done'),emitter.listenerCount('error')));
emitter.emit('done',3,4);
emitter.on(errorMonitor,error=>console.log('monitor',error.message));
try{emitter.emit('error',new Error('probe'))}catch(error){console.log('caught',error.message)}
`;
const eventsProbeExpected='once:1|first:1|second:1|first:2 1\nmonitor probe\ncaught probe\npromise 3,4 0 0\n';
if(targets.includes('linux-arm64')){
  writeFileSync(join(directory,'linux-arm64-bridge'),arm64BridgeProbe(),{mode:0o755});
  writeFileSync(join(directory,'linux-arm64-cpu'),arm64CpuProbe(),{mode:0o755});
  writeFileSync(join(directory,'linux-arm64-math-kernels'),arm64MathProbe(),{mode:0o755});
  writeFileSync(join(directory,'arm64-math-cases.json'),JSON.stringify(arm64MathCases,(_,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v,null,2)+'\n');
  runtime['linux-arm64']=[{file:'linux-arm64-bridge',expected:loaderProbeOutput},{file:'linux-arm64-cpu',expected:loaderProbeOutput},{file:'linux-arm64-math-kernels',expected:loaderProbeOutput}];
}
for(const target of ['freebsd-x64','openbsd-x64','linux-arm64','darwin-x64','darwin-arm64','win32-arm64','linux-x64']){
  if(!targets.includes(target))continue;
  const eventsProbe=compile(eventsProbeSource,{fileName:'events-probe.mjs',target,module:true});
  if(!eventsProbe.ok)throw new Error('Events probe failed to compile: '+JSON.stringify(eventsProbe.diagnostics));
  const eventsFile=`${target}-events${target.startsWith('win32-')?'.exe':''}`;
  writeFileSync(join(directory,eventsFile),eventsProbe.image,{mode:0o755});
  writeFileSync(join(directory,eventsFile+'.expected'),eventsProbeExpected);
  writeFileSync(join(directory,eventsFile+'.status'),'0\n');
  writeFileSync(join(directory,eventsFile+'.minimal-environment'),'0\n');
  runtime[target]=[...(runtime[target]??[]),{file:eventsFile,expected:eventsProbeExpected}];
  runtime[target]=[...(runtime[target]??[]),...[...runtimeProbes(target),...eventProbes(target)].map(probe=>{
    const file=`${target}-${probe.name}${target.startsWith('win32-')?'.exe':''}`;writeFileSync(join(directory,file),probe.image,{mode:0o755});
    writeFileSync(join(directory,file+'.expected'),probe.expected);
    writeFileSync(join(directory,file+'.status'),String(probe.status??0)+'\n');
    writeFileSync(join(directory,file+'.minimal-environment'),probe.minimalEnvironment?'1\n':'0\n');
    return {file,expected:probe.expected,status:probe.status??0,...(probe.signal?{signal:probe.signal}:{}),minimalEnvironment:probe.minimalEnvironment??false,...('timeoutMs' in probe?{timeoutMs:probe.timeoutMs}:{})};
  })];
}
writeFileSync(join(directory,'manifest.json'),JSON.stringify({kind:'loader',targets,expected:loaderProbeOutput,runtime},null,2)+'\n');
console.log(`Built ${targets.length} loader probes in ${directory}`);
