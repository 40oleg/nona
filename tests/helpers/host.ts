import {chmodSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runNative} from './native.js';
import {compileToIR} from '../../src/compiler.js';
import {generate} from '../../src/backend/x64/codegen.js';
import {linkPe} from '../../src/backend/pe/writer.js';
import {linkLinux} from '../../src/backend/linux/index.js';

export interface HostRun {status:number|null;stdout:string;stderr:string;error?:Error}
/** Compile with the runtime prelude for the host's native target and run it. */
export function runOnHost(source:string,options:{gcStress?:boolean}={gcStress:true}):HostRun {
 const program=generate(compileToIR(source),{gcStress:options.gcStress});
 if(process.platform!=='linux'){
  const result=runNative(linkPe(program));
  return {status:result.status,stdout:result.stdout.toString(),stderr:result.stderr.toString(),error:result.error};
 }
 const directory=mkdtempSync(join(tmpdir(),'nona-host-'));
 try{
  const executable=join(directory,'image');
  writeFileSync(executable,linkLinux(program));chmodSync(executable,0o755);
  const result=spawnSync(executable,[],{encoding:'utf8',timeout:60_000});
  return {status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error};
 }finally{rmSync(directory,{recursive:true,force:true});}
}

import {compileModuleToIR} from '../../src/compiler.js';
/** Write a module graph to a temp directory, compile the entry as a module and run it; also run Node on it. */
export function runModulesOnHost(files:Record<string,string>,entry:string):{native:HostRun;oracle:string} {
 const directory=mkdtempSync(join(tmpdir(),'nona-modules-'));
 try{
  for(const [name,text] of Object.entries(files))writeFileSync(join(directory,name),text);
  const program=generate(compileModuleToIR(files[entry]!,join(directory,entry)),{gcStress:true});
  const executable=join(directory,process.platform==='linux'?'image':'image.exe');
  let native:HostRun;
  if(process.platform!=='linux'){
   const result=runNative(linkPe(program));
   native={status:result.status,stdout:result.stdout.toString(),stderr:result.stderr.toString(),error:result.error};
  }else{
   writeFileSync(executable,linkLinux(program));chmodSync(executable,0o755);
   const result=spawnSync(executable,[],{encoding:'utf8',timeout:60_000});
   native={status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error};
  }
  const oracle=spawnSync(process.execPath,[join(directory,entry)],{encoding:'utf8',timeout:10_000});
  return {native,oracle:oracle.stdout};
 }finally{rmSync(directory,{recursive:true,force:true});}
}
