import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {loaderProbe,loaderProbeOutput,runtimeProbes} from '../dist/src/backend/platform-probes.js';

const directory=resolve(process.argv[2]??'work/platform-probes');
mkdirSync(directory,{recursive:true});
const targets=['linux-x64','linux-arm64','freebsd-x64','openbsd-x64','darwin-x64','darwin-arm64'];
for(const target of targets){
  writeFileSync(join(directory,target),loaderProbe(target),{mode:0o755});
}
writeFileSync(join(directory,'expected.txt'),loaderProbeOutput);
const runtime={};
for(const target of ['freebsd-x64','openbsd-x64']){
  runtime[target]=runtimeProbes(target).map(probe=>{
    const file=`${target}-${probe.name}`;writeFileSync(join(directory,file),probe.image,{mode:0o755});
    writeFileSync(join(directory,file+'.expected'),probe.expected);
    return {file,expected:probe.expected};
  });
}
writeFileSync(join(directory,'manifest.json'),JSON.stringify({kind:'loader',targets,expected:loaderProbeOutput,runtime},null,2)+'\n');
console.log(`Built ${targets.length} loader probes in ${directory}`);
