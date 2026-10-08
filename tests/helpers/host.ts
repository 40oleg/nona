import {chmodSync,mkdtempSync,writeFileSync} from 'node:fs';
import {removeTemporaryDirectory} from './cleanup.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runNative} from './native.js';
import {compileToIR} from '../../src/compiler.js';
import {generate} from '../../src/backend/x64/codegen.js';
import {linkHost} from './program.js';
import {requireHostTarget,getTarget} from '../../src/target.js';
import {linkLinux} from '../../src/backend/linux/index.js';

export interface HostRun {status:number|null;stdout:string;stderr:string;error?:Error}
/** Compile with the runtime prelude for the host's native target and run it. */
export function runOnHost(source:string,options:{gcStress?:boolean;realms?:number}={gcStress:true}):HostRun {
 const program=generate(compileToIR(source),{gcStress:options.gcStress,...(options.realms?{realms:options.realms}:{})});
 if(process.platform!=='linux'){
  const result=runNative(linkHost(program));
  return {status:result.status,stdout:result.stdout.toString(),stderr:result.stderr.toString(),error:result.error};
 }
 const directory=mkdtempSync(join(tmpdir(),'nona-host-'));
 try{
  const executable=join(directory,'image');
  writeFileSync(executable,linkLinux(program,getTarget(requireHostTarget())!.arch));chmodSync(executable,0o755);
  const result=spawnSync(executable,[],{encoding:'utf8',timeout:60_000});
  return {status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error};
 }finally{removeTemporaryDirectory(directory);}
}

import {compileModuleToIR} from '../../src/compiler.js';
/** Write a module graph to a temp directory, compile the entry as a module and run it; also run Node on it. */
export function runModulesOnHost(files:Record<string,string>,entry:string,options:{gcStress?:boolean;oracleSource?:string}={gcStress:true}):{native:HostRun;oracle:string} {
 const directory=mkdtempSync(join(tmpdir(),'nona-modules-'));
 try{
  for(const [name,text] of Object.entries(files))writeFileSync(join(directory,name),text);
  const program=generate(compileModuleToIR(files[entry]!,join(directory,entry)),{gcStress:options.gcStress});
  const executable=join(directory,process.platform==='linux'?'image':'image.exe');
  // Both programs run in the temporary directory, so relative paths stay inside it.
  writeFileSync(executable,linkHost(program));chmodSync(executable,0o755);
  const result=spawnSync(executable,[],{cwd:directory,encoding:'utf8',timeout:60_000,windowsHide:true});
  const native:HostRun={status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error};
  if(options.oracleSource!==undefined)writeFileSync(join(directory,entry),options.oracleSource);
  const oracle=spawnSync(process.execPath,[join(directory,entry)],{cwd:directory,encoding:'utf8',timeout:10_000});
  return {native,oracle:oracle.stdout};
 }finally{removeTemporaryDirectory(directory);}
}
