import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
test('generated EXE runs alone with only Windows system PATH',()=>{
 const result=compile('function f(n){return n<2?1:n*f(n-1);}console.log(f(6),"Привет 😀");',{fileName:'standalone.js',target:'win32-x64'});
 assert.ok(result.ok);assert.ok(result.imports.every(i=>i.startsWith('KERNEL32.dll!')));
 const dir=mkdtempSync(join(tmpdir(),'nona-alone-'));
 try {const exe=join(dir,'standalone.exe');writeFileSync(exe,result.image);const run=spawnSync(exe,[],{cwd:dir,env:{SystemRoot:process.env.SystemRoot,PATH:join(process.env.SystemRoot!,'System32')},encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,'720 Привет 😀\n');}
 finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('nona-alone-'));rmSync(dir,{recursive:true,force:true});}
});
test('power adds no non-system import',()=>{
 const result=compile('console.log(2**10);',{fileName:'power.js',target:'win32-x64'});
 assert.ok(result.ok);
 assert.ok(result.imports.every(i=>i.startsWith('KERNEL32.dll!')));
});
