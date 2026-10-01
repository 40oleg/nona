import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile,hostTarget} from '../src/compiler.js';

/** Compile for the host target and run with arguments and environment in a temp directory. */
function run(source:string,args:string[]=[],env:Record<string,string>={},module=false):{status:number|null;stdout:string;stderr:string;directory:string;executable:string} {
 const result=compile(source,{fileName:module?'main.mjs':'main.js',target:hostTarget,module});
 if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'nona-process-')));
 try{
  const executable=join(directory,process.platform==='win32'?'image.exe':'image');
  writeFileSync(executable,result.image);chmodSync(executable,0o755);
  const child=spawnSync(executable,args,{cwd:directory,encoding:'utf8',timeout:60_000,windowsHide:true,env:{...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'C:\\Windows'}:{}),...env}});
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr,directory,executable};
 }finally{rmSync(directory,{recursive:true,force:true});}
}

test('process.argv, env, execPath, cwd and platform',()=>{
 const args=['a','b c','','quote"inside','back\\slash','trailing\\','x\\"y','ünïcödé 😀'];
 const r=run(`console.log(JSON.stringify(process.argv.slice(1)));
console.log(process.env.NONA_TEST, process.env.NONA_EMPTY === '', process.env.MISSING, typeof process.env);
console.log(process.execPath === process.argv[0], process.execPath.length > 0, process.platform, process.arch, process.pid > 0);
console.log(process.cwd());
console.log(Object.getOwnPropertyDescriptor(globalThis, 'process').enumerable, typeof process.exit);`,args,{NONA_TEST:'värde=1',NONA_EMPTY:''});
 assert.equal(r.status,0,r.stderr);
 const lines=r.stdout.split('\n');
 assert.deepEqual(JSON.parse(lines[0]!),args);
 assert.equal(lines[1],'värde=1 true undefined object');
 assert.equal(lines[2],`true true ${process.platform==='win32'?'win32':'linux'} x64 true`);
 assert.equal(lines[3]!.toLowerCase(),r.directory.toLowerCase());
 assert.equal(lines[4],'false function');
});

test('process.exit and process.exitCode set the exit status',()=>{
 assert.equal(run(`console.log('before'); process.exit(7); console.log('after');`).status,7);
 const pending=run(`process.exitCode = 3; Promise.resolve().then(() => console.log('job'));`);
 assert.equal(pending.status,3);assert.equal(pending.stdout,'job\n');
 assert.equal(run(`process.exitCode = 0;`).status,0);
 assert.equal(run(`console.log(1);`).status,0);
});

test('node:process and nona:process modules',()=>{
 const r=run(`import process, {argv, env, platform, exit, cwd} from 'node:process';
import * as nona from 'nona:process';
console.log(process === globalThis.process, argv === process.argv, env === process.env, platform === process.platform, typeof cwd(), nona.default === process);
exit(4);`,['x'],{},true);
 assert.equal(r.stdout,'true true true true string true\n');
 assert.equal(r.status,4);
});

test('programs that never touch process do not build it',()=>{
 const r=run(`console.log(Object.getOwnPropertyNames(globalThis).includes('process'), Object.keys(globalThis).includes('process'));`);
 assert.equal(r.stdout,'true false\n');
});

test('one generated program links as both PE and ELF',async()=>{
 const {generate}=await import('../src/backend/x64/codegen.js');
 const {linkPe}=await import('../src/backend/pe/writer.js');
 const {linkLinux}=await import('../src/backend/linux/index.js');
 const {compileToIR}=await import('../src/compiler.js');
 const {readPe}=await import('./helpers/pe-reader.js');
 const program=generate(compileToIR('console.log(process.platform);'));
 const pe=readPe(linkPe(program)).imports();
 assert.ok(pe.every(name=>!name.startsWith('syscall!')));
 assert.ok(pe.some(name=>/!GetCommandLineW$/i.test(name)));
 assert.ok(linkLinux(program).length>0);
});
