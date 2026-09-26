import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,linkSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
const cli=(args:string[])=>spawnSync(process.execPath,['dist/cli.js',...args],{encoding:'utf8',windowsHide:true});
function fixture(body:(dir:string)=>void){const dir=mkdtempSync(join(tmpdir(),'nona-cli-'));try{body(dir);}finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('nona-cli-'));rmSync(dir,{recursive:true,force:true});}}
test('CLI help and version',()=>{assert.equal(cli(['--help']).status,0);assert.match(cli(['--version']).stdout,/0\.3\.0/);});
test('CLI builds nested output and runs executable',()=>fixture(dir=>{const input=join(dir,'in.js'),output=join(dir,'nested','out.exe');writeFileSync(input,'console.log("hello");');const r=cli(['build',input,'-o',output]);assert.equal(r.status,0,r.stderr);const native=spawnSync(output,[],{encoding:'utf8',windowsHide:true});assert.equal(native.status,0);assert.equal(native.stdout,'hello\n');}));
test('CLI emits Linux ELF for linux-x64 target',()=>fixture(dir=>{const input=join(dir,'in.js'),output=join(dir,'out');writeFileSync(input,'console.log("hello");');const r=cli(['build',input,'-o',output,'--target','linux-x64']);assert.equal(r.status,0,r.stderr);const elf=readFileSync(output);assert.equal(elf.subarray(0,4).toString('hex'),'7f454c46');assert.equal(elf.readUInt16LE(18),62);}));
test('CLI rejects missing/unknown/duplicate arguments',()=>{for(const args of [[],['build'],['build','a.js'],['build','a.js','-o','b.exe','--target','linux'],['build','a.js','-o','b','-o','c'],['--wat']])assert.equal(cli(args).status,1);});
test('analysis failure preserves existing output with positioned diagnostic',()=>fixture(dir=>{const input=join(dir,'in.js'),output=join(dir,'out.exe');writeFileSync(input,'var x=1;\n)');writeFileSync(output,'original');const r=cli(['build',input,'-o',output]);assert.equal(r.status,1);assert.match(r.stderr,/in\.js:2:1.*E_SYNTAX/);assert.equal(readFileSync(output,'utf8'),'original');}));
test('source aliases and hardlinks are never overwritten',()=>fixture(dir=>{const input=join(dir,'in.js'),hard=join(dir,'hard.exe');writeFileSync(input,'console.log(1);');linkSync(input,hard);for(const output of [input,input.toUpperCase(),hard])assert.equal(cli(['build',input,'-o',output]).status,1);assert.equal(readFileSync(input,'utf8'),'console.log(1);');}));
test('missing input produces no output',()=>fixture(dir=>{const output=join(dir,'out.exe');assert.equal(cli(['build',join(dir,'missing.js'),'-o',output]).status,1);assert.equal(existsSync(output),false);}));
test('locked output fails without removing previous executable',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nona-cli-')),input=join(dir,'in.js'),output=join(dir,'out.exe');
 writeFileSync(input,'console.log("ok");');writeFileSync(output,'original');
 const script="$nonaLock=[System.IO.File]::Open('"+output.replaceAll("'","''")+"',[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read); [Console]::Out.WriteLine('locked'); [Console]::Out.Flush(); [Console]::ReadLine() | Out-Null; $nonaLock.Dispose()";
 const holder=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'pipe'});
 try {
  await new Promise<void>((res,rej)=>{const timer=setTimeout(()=>rej(new Error('lock helper timed out')),10000);holder.on('error',e=>{clearTimeout(timer);rej(e);});holder.stdout.once('data',()=>{clearTimeout(timer);res();});holder.once('exit',code=>{clearTimeout(timer);rej(new Error('lock helper exited '+code));});});
  const result=cli(['build',input,'-o',output]);assert.equal(result.status,1);assert.equal(readFileSync(output,'utf8'),'original');
 }finally{
  holder.stdin.end('\n');await new Promise<void>(res=>{if(holder.exitCode!==null){res();return;}holder.once('exit',()=>res());setTimeout(()=>{holder.kill();res();},2000).unref();});
  assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('nona-cli-'));rmSync(dir,{recursive:true,force:true});
 }
});
test('symlink aliases are rejected',t=>fixture(dir=>{const input=join(dir,'in.js'),link=join(dir,'link.exe');writeFileSync(input,'console.log(1);');try{symlinkSync(input,link);}catch(e:any){if(e.code==='EPERM'){t.skip('Windows account lacks symlink permission');return;}throw e;}assert.equal(cli(['build',input,'-o',link]).status,1);assert.equal(readFileSync(input,'utf8'),'console.log(1);');}));
