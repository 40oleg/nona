import {mkdtempSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileToIR} from '../../src/compiler.js';
import {generate} from '../../src/backend/x64/codegen.js';
import {linkHost} from './program.js';
import {removeTemporaryDirectory} from './cleanup.js';
/** Keep GC-stress environment decoding bounded and reproducible on every CPU. */
export function runProcess(source:string,input?:string){
 const directory=mkdtempSync(join(tmpdir(),'nona-process-stress-'));
 try{
  const executable=join(directory,process.platform==='win32'?'image.exe':'image');
  writeFileSync(executable,linkHost(generate(compileToIR(source),{gcStress:true})));chmodSync(executable,0o755);
  const env:Record<string,string>={PATH:process.env.PATH??process.env.Path??'',NONA_TEST:'value'};
  if(process.platform==='win32')env.SystemRoot=process.env.SystemRoot??'C:\\Windows';
  return spawnSync(executable,[],{env,input,encoding:'utf8',timeout:60_000,windowsHide:true});
 }finally{removeTemporaryDirectory(directory)}
}
