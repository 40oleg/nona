import {readFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertNativeHost} from '../dist/src/backend/platform-probes.js';

const target=process.argv[2],directory=resolve(process.argv[3]??'work/platform-probes');
assertNativeHost(target);
const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
if(manifest.kind!=='loader'||!manifest.targets.includes(target)||typeof manifest.expected!=='string')throw new Error('Invalid loader probe manifest');
const executable=join(directory,target);chmodSync(executable,0o755);
if(process.platform==='darwin'){
  const signature=spawnSync('/usr/bin/codesign',['--verify','--strict','--verbose=4',executable],{encoding:'utf8'});
  if(signature.error||signature.status!==0)throw new Error(`Signature verification failed: ${signature.error??signature.stderr}`);
  console.log(signature.stderr.trim());
}
const run=spawnSync(executable,[],{encoding:'utf8',timeout:15000,windowsHide:true});
if(run.error||run.status!==0||run.stdout!==manifest.expected)throw new Error(`Loader probe ${target} failed: status=${run.status}, signal=${run.signal}, stdout=${JSON.stringify(run.stdout)}, stderr=${JSON.stringify(run.stderr)}, error=${run.error??''}`);
console.log(`Native loader probe passed on ${process.platform}/${process.arch}: ${target}`);
