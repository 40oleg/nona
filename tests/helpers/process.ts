import {mkdtempSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileToIR} from '../../src/compiler.js';
import {generate} from '../../src/backend/x64/codegen.js';
import {linkHost} from './program.js';
import {removeTemporaryDirectory} from './cleanup.js';
/** Keep GC-stress environment decoding bounded and reproducible on every CPU. */
export function processTestEnvironment():Record<string,string>{
 const env:Record<string,string>={PATH:process.env.PATH??process.env.Path??'',NONA_TEST:'value'};
 if(process.platform==='win32')env.SystemRoot=process.env.SystemRoot??'C:\\Windows';
 return env;
}
export function runProcess(source:string,input?:string,options:{gcStress?:boolean}={gcStress:true}){
 const directory=mkdtempSync(join(tmpdir(),'nona-process-stress-'));
 try{
  const executable=join(directory,process.platform==='win32'?'image.exe':'image');
  const gcStress=options.gcStress!==false;
  writeFileSync(executable,linkHost(generate(compileToIR(source),{gcStress})));chmodSync(executable,0o755);
  const env=processTestEnvironment();
  const timeout=process.arch==='arm64'&&gcStress?180_000:60_000;
  return spawnSync(executable,[],{env,input,encoding:'utf8',timeout,windowsHide:true});
 }finally{removeTemporaryDirectory(directory)}
}
