import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Assembler} from '../src/backend/x64/assembler.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {linkLinux} from '../src/backend/linux/index.js';
import type {NativeProgram} from '../src/backend/pe/model.js';
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {GeneratorStack,emitGeneratorStack} from '../src/runtime/generator-stack.js';
import {runNative} from './helpers/native.js';

function program():NativeProgram {
 const b=new RuntimeBuilder();emitGeneratorStack(b);
 b.bundle.imports.push({dll:'KERNEL32.dll',name:'ExitProcess',symbol:'ExitProcess'});
 const a=new Assembler('entry');a.sub('rsp',40);a.call('rt.allocGeneratorStack');
 a.test('rax','rax');a.jcc('e','bad');a.mov('r12','rax');
 a.mov('r10','rax');a.and('r10',4095);a.jcc('ne','bad');
 a.mov('r10',123);a.store({base:'r12',disp:GeneratorStack.guard},'r10');
 a.mov('r10',456);a.store({base:'r12',disp:GeneratorStack.bytes-8},'r10');
 a.mov('rcx','r12');a.call('rt.freeGeneratorStack');
 a.mov('rcx',0);a.callImport('ExitProcess');
 a.label('bad');a.mov('rcx',1);a.callImport('ExitProcess');a.label('entry.end');
 return {...b.bundle,fragments:[...b.bundle.fragments,{...a.finish(),name:'entry',section:'.text'}],entry:'entry',functions:[...b.bundle.functions,{begin:'entry',end:'entry.end',prologSize:4,stackAllocation:40,savedRegisters:[]}]};
}

test('Windows allocates and frees a page-aligned guarded generator stack',()=>{
 const run=runNative(linkPe(program()));assert.equal(run.error,undefined);assert.equal(run.status,0,String(run.stderr));
});

test('Linux allocates and frees a page-aligned guarded generator stack',t=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-stack-'));
 try{
  const file=join(directory,'program');writeFileSync(file,linkLinux(program()));
  let run;
  if(process.platform==='linux'){
   chmodSync(file,0o700);run=spawnSync(file,[],{timeout:10000});
  }else if(process.platform==='win32'){
   const probe=spawnSync('wsl.exe',['--exec','/bin/true'],{timeout:15000});
   if(probe.error||probe.status!==0){t.skip('WSL Linux is unavailable');return;}
   const translated=spawnSync('wsl.exe',['--exec','wslpath','-a',file],{encoding:'utf8',timeout:5000});
   assert.equal(translated.status,0,translated.stderr);
   run=spawnSync('wsl.exe',['--exec','/bin/sh','-c','target=$(mktemp /tmp/nona-stack-XXXXXX); trap \'rm -f "$target"\' EXIT; cp "$1" "$target"; chmod 700 "$target"; "$target"','sh',translated.stdout.trim()],{timeout:10000});
  }else{t.skip('No Linux execution environment');return;}
  assert.equal(run.error,undefined);assert.equal(run.status,0,String(run.stderr));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
