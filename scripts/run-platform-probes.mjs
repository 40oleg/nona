import {readFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertNativeHost} from '../dist/src/backend/platform-probes.js';

const target=process.argv[2],directory=resolve(process.argv[3]??'work/platform-probes');
assertNativeHost(target);
const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
if(manifest.kind!=='loader'||!manifest.targets.includes(target)||typeof manifest.expected!=='string')throw new Error('Invalid loader probe manifest');
const executable=join(directory,target+(process.platform==='win32'?'.exe':''));chmodSync(executable,0o755);
if(process.platform==='darwin'){
  const signature=spawnSync('/usr/bin/codesign',['--verify','--strict','--verbose=4',executable],{encoding:'utf8'});
  if(signature.error||signature.status!==0)throw new Error(`Signature verification failed: ${signature.error??signature.stderr}`);
  console.log(signature.stderr.trim());
}
const run=spawnSync(executable,[],{encoding:'utf8',timeout:15000,windowsHide:true});
if(run.error||run.status!==0||run.stdout!==manifest.expected)throw new Error(`Loader probe ${target} failed: status=${run.status}, signal=${run.signal}, stdout=${JSON.stringify(run.stdout)}, stderr=${JSON.stringify(run.stderr)}, error=${run.error??''}`);
console.log(`Native loader probe passed on ${process.platform}/${process.arch}: ${target}`);
for(const probe of manifest.runtime?.[target]??[]){
  if(typeof probe.file!=='string'||!/^[a-z0-9-]+(?:\.exe)?$/.test(probe.file)||typeof probe.expected!=='string'||(probe.minimalEnvironment!==undefined&&typeof probe.minimalEnvironment!=='boolean'))throw new Error('Invalid runtime probe manifest');
  if(probe.signal!==undefined&&!['SIGABRT','SIGTERM'].includes(probe.signal))throw new Error('Invalid runtime probe signal');
  if(probe.status!==undefined&&(!Number.isInteger(probe.status)||probe.status<0||probe.status>255))throw new Error('Invalid runtime probe status');
  const file=join(directory,probe.file);chmodSync(file,0o755);
  const env=probe.minimalEnvironment?(process.platform==='win32'?{SystemRoot:process.env.SystemRoot}:{}):process.env;
  const timeout=probe.timeoutMs??15000;
  if(!Number.isInteger(timeout)||timeout<1||timeout>60000)throw new Error('Invalid runtime probe timeout');
  const result=spawnSync(file,[],{encoding:'utf8',timeout,windowsHide:true,env});
  const terminated=probe.signal?result.status===null&&result.signal===probe.signal:result.status===(probe.status??0);
  if(result.error||!terminated||result.stdout!==probe.expected)throw new Error(`Native probe ${probe.file} failed: status=${result.status}, signal=${result.signal}, stdout=${JSON.stringify(result.stdout)}, stderr=${JSON.stringify(result.stderr)}, error=${result.error??''}`);
  console.log(`Native execution probe passed: ${probe.file}`);
}
