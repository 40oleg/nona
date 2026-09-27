import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {compile} from '../dist/src/compiler.js';

if(!['win32','linux'].includes(process.platform))throw new Error('Linux or Windows with WSL is required');
const directory=mkdtempSync(join(tmpdir(),'nona-weak-memory-'));
const limitKiB='98304';
function linuxPath(file){
 if(process.platform==='linux')return file;
 const translated=spawnSync('wsl.exe',['--exec','wslpath','-a',file],{encoding:'utf8',timeout:10000});
 assert.equal(translated.status,0,translated.stderr);
 return translated.stdout.trim();
}
function run(file,limited){
 const script=process.platform==='win32'
  ? 'target=$(mktemp /tmp/nona-weak-memory-XXXXXX) || exit 1; trap \'rm -f "$target"\' EXIT; cp "$1" "$target" || exit 1; chmod 700 "$target" || exit 1; if [ "$2" != none ]; then ulimit -v "$2" || exit 1; fi; "$target"'
  : 'if [ "$2" != none ]; then ulimit -v "$2" || exit 1; fi; "$1"';
 const args=process.platform==='win32'
  ? ['--exec','/bin/sh','-c',script,'sh',linuxPath(file),limited?limitKiB:'none']
  : ['-c',script,'sh',file,limited?limitKiB:'none'];
 return spawnSync(process.platform==='win32'?'wsl.exe':'/bin/sh',args,{encoding:'utf8',timeout:30000});
}
try{
 const files={};
 for(const [name,constructor,insert] of [
  ['weakmap','WeakMap','collection.set(key,new ArrayBuffer(1048576))'],
  ['map','Map','collection.set(key,new ArrayBuffer(1048576))'],
  ['weakset','WeakSet','key.buffer=new ArrayBuffer(1048576);collection.add(key)'],
  ['set','Set','key.buffer=new ArrayBuffer(1048576);collection.add(key)'],
 ]){
  const source=`var collection=new ${constructor}();for(var i=0;i<100;i++){var key={};${insert};key=null}console.log('done')`;
  const result=compile(source,{fileName:`${name}-memory.js`,target:'linux-x64'});
  if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));
  const file=join(directory,name);writeFileSync(file,result.image);if(process.platform==='linux')chmodSync(file,0o700);files[name]=file;
 }
 for(const [weak,strong] of [['weakmap','map'],['weakset','set']]){
  const strongRun=run(files[strong],false),weakLimited=run(files[weak],true),strongLimited=run(files[strong],true);
  assert.equal(strongRun.status,0,strongRun.stderr);assert.equal(strongRun.stdout,'done\n');
  assert.equal(weakLimited.status,0,weakLimited.stderr);assert.equal(weakLimited.stdout,'done\n');
  assert.equal(strongLimited.error,undefined);
  assert.notEqual(strongLimited.status,null,'Strong collection run did not finish');
  assert.notEqual(strongLimited.status,0,`${strong} unexpectedly fit within the memory limit`);
  console.log(`${weak} completed under ${Number(limitKiB)/1024} MiB; ${strong} completed without the limit and failed under it.`);
 }
}finally{
 const target=resolve(directory);
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('nona-weak-memory-'))throw new Error('Refusing to remove unverified temporary directory');
 rmSync(target,{recursive:true,force:true});
}
