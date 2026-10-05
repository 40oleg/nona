import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {loaderProbe,loaderProbeOutput,runtimeProbes} from '../dist/src/backend/platform-probes.js';
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
if(targets.includes('linux-arm64')){
  writeFileSync(join(directory,'linux-arm64-bridge'),arm64BridgeProbe(),{mode:0o755});
  writeFileSync(join(directory,'linux-arm64-cpu'),arm64CpuProbe(),{mode:0o755});
  writeFileSync(join(directory,'linux-arm64-math-kernels'),arm64MathProbe(),{mode:0o755});
  writeFileSync(join(directory,'arm64-math-cases.json'),JSON.stringify(arm64MathCases,(_,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v,null,2)+'\n');
  runtime['linux-arm64']=[{file:'linux-arm64-bridge',expected:loaderProbeOutput},{file:'linux-arm64-cpu',expected:loaderProbeOutput},{file:'linux-arm64-math-kernels',expected:loaderProbeOutput}];
}
for(const target of ['freebsd-x64','openbsd-x64','linux-arm64','darwin-x64','darwin-arm64','win32-arm64','linux-x64']){
  if(!targets.includes(target))continue;
  runtime[target]=[...(runtime[target]??[]),...runtimeProbes(target).map(probe=>{
    const file=`${target}-${probe.name}${target.startsWith('win32-')?'.exe':''}`;writeFileSync(join(directory,file),probe.image,{mode:0o755});
    writeFileSync(join(directory,file+'.expected'),probe.expected);
    return {file,expected:probe.expected};
  })];
}
writeFileSync(join(directory,'manifest.json'),JSON.stringify({kind:'loader',targets,expected:loaderProbeOutput,runtime},null,2)+'\n');
console.log(`Built ${targets.length} loader probes in ${directory}`);
