import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {loaderProbe,loaderProbeOutput} from '../dist/src/backend/platform-probes.js';

const directory=resolve(process.argv[2]??'work/platform-probes');
mkdirSync(directory,{recursive:true});
const targets=['linux-x64','linux-arm64','freebsd-x64','openbsd-x64','darwin-x64','darwin-arm64'];
for(const target of targets){
  writeFileSync(join(directory,target),loaderProbe(target),{mode:0o755});
}
writeFileSync(join(directory,'expected.txt'),loaderProbeOutput);
writeFileSync(join(directory,'manifest.json'),JSON.stringify({kind:'loader',targets,expected:loaderProbeOutput},null,2)+'\n');
console.log(`Built ${targets.length} loader probes in ${directory}`);
