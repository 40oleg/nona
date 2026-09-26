import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Assembler} from '../src/backend/x64/assembler.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {linkLinux} from '../src/backend/linux/index.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {GeneratorKind,GeneratorLayout as G} from '../src/runtime/generator.js';
import {FunctionLayout} from '../src/runtime/functions.js';
import {ValueListLayout as L} from '../src/runtime/heap-layout.js';
import {ObjectLayout as O} from '../src/runtime/object-layout.js';
import {runNative} from './helpers/native.js';

function generatorProgram(){
 const program=generate(compileToIR('console.log("unused");'));
 const a=new Assembler('test.entry');a.sub('rsp',152);const prologSize=a.offset;
 a.call('rt.init');
 a.lea('r10',{rip:'rt.functionPrototype'});a.mov('rax',1);a.store({base:'r10',disp:FunctionLayout.generator},'rax');
 a.lea('rax',{rip:'test.body'});a.store({base:'r10',disp:FunctionLayout.code},'rax');
 a.mov('rax',5);a.store({base:'rsp',disp:56},'rax');a.lea('rax',{rip:'rt.functionPrototype'});a.store({base:'rsp',disp:64},'rax');
 a.mov('rax',0);a.store({base:'rsp',disp:72},'rax');a.store({base:'rsp',disp:80},'rax');
 a.mov('rax',2);a.store({base:'rsp',disp:88},'rax');a.mov('rax',1);a.store({base:'rsp',disp:96},'rax');
 a.mov('rax',2);a.store({base:'rsp',disp:104},'rax');a.mov('rax',0);a.store({base:'rsp',disp:112},'rax');
 a.lea('rax',{base:'rsp',disp:72});a.store({base:'rsp',disp:32},'rax');
 a.lea('rcx',{base:'rsp',disp:40});a.lea('rdx',{base:'rsp',disp:56});a.mov('r8',2);a.lea('r9',{base:'rsp',disp:88});a.call('rt.invoke');
 a.load('r10',{base:'rsp',disp:40});a.cmp('r10',5);a.jcc('ne','test.bad');
 a.lea('r10',{base:'rsp',disp:40});a.store({rip:'rt.gcGlobals'},'r10');a.mov('r10',1);a.store({rip:'rt.gcGlobalCount'},'r10');
 a.call('rt.collect');
 a.load('r10',{base:'rsp',disp:48});a.load('r11',{base:'r10',disp:O.kind});a.cmp('r11',GeneratorKind);a.jcc('ne','test.bad');
 a.load('r11',{base:'r10',disp:G.arguments});a.load('rax',{base:'r11',disp:L.count});a.cmp('rax',2);a.jcc('ne','test.bad');
 a.load('rax',{base:'r11',disp:L.values});a.cmp('rax',2);a.jcc('ne','test.bad');
 a.load('rax',{base:'r11',disp:L.values+8});a.cmp('rax',1);a.jcc('ne','test.bad');
 a.load('rax',{base:'r11',disp:L.values+16});a.cmp('rax',2);a.jcc('ne','test.bad');
 a.mov('rax',0);a.store({base:'rsp',disp:32},'rax');a.lea('rcx',{base:'rsp',disp:120});a.lea('rdx',{base:'rsp',disp:40});a.lea('r8',{base:'rsp',disp:72});a.lea('r9',{base:'rsp',disp:136});a.call('rt.resumeGenerator');
 a.load('rax',{base:'rsp',disp:120});a.cmp('rax',2);a.jcc('ne','test.bad');a.load('rax',{base:'rsp',disp:128});a.cmp('rax',1);a.jcc('ne','test.bad');
 a.load('rax',{base:'rsp',disp:136});a.test('rax','rax');a.jcc('ne','test.bad');
 a.mov('rax',2);a.store({base:'rsp',disp:72},'rax');a.mov('rax',0);a.store({base:'rsp',disp:80},'rax');
 a.mov('rax',0);a.store({base:'rsp',disp:32},'rax');a.lea('rcx',{base:'rsp',disp:120});a.lea('rdx',{base:'rsp',disp:40});a.lea('r8',{base:'rsp',disp:72});a.lea('r9',{base:'rsp',disp:136});a.call('rt.resumeGenerator');
 a.load('rax',{base:'rsp',disp:120});a.cmp('rax',2);a.jcc('ne','test.bad');a.load('rax',{base:'rsp',disp:128});a.test('rax','rax');a.jcc('ne','test.bad');
 a.load('rax',{base:'rsp',disp:136});a.cmp('rax',1);a.jcc('ne','test.bad');
 a.mov('rax',0);a.store({rip:'rt.gcGlobalCount'},'rax');a.call('rt.collect');a.call('rt.dispose');
 a.mov('rcx',0);a.callImport('ExitProcess');
 a.label('test.bad');a.mov('rcx',1);a.callImport('ExitProcess');a.label('test.entry.end');
 program.fragments.push({...a.finish(),name:'test.entry',section:'.text'});
 program.functions.push({begin:'test.entry',end:'test.entry.end',prologSize,allocationCodeOffset:prologSize,stackAllocation:152,savedRegisters:[]});
 const body=new Assembler('test.body');body.sub('rsp',104);const bodyProlog=body.offset;
 body.store({base:'rsp',disp:40},'rcx');body.mov('rax',2);body.store({base:'rsp',disp:48},'rax');body.mov('rax',1);body.store({base:'rsp',disp:56},'rax');
 body.call('rt.generatorInitialSuspend');
 body.lea('rcx',{base:'rsp',disp:64});body.lea('rdx',{base:'rsp',disp:48});body.call('rt.generatorYield');
 body.load('r10',{base:'rsp',disp:40});for(const offset of [0,8]){body.load('rax',{base:'rsp',disp:64+offset});body.store({base:'r10',disp:offset},'rax');}
 body.add('rsp',104);body.ret();body.label('test.body.end');
 program.fragments.push({...body.finish(),name:'test.body',section:'.text'});
 program.functions.push({begin:'test.body',end:'test.body.end',prologSize:bodyProlog,allocationCodeOffset:bodyProlog,stackAllocation:104,savedRegisters:[]});
 program.entry='test.entry';
 return program;
}

test('generator state owns copied arguments and survives then releases GC on Windows',()=>{
 const run=runNative(linkPe(generatorProgram()));assert.equal(run.error,undefined);assert.equal(run.status,0,String(run.stderr));
});

test('generator state owns copied arguments and survives then releases GC on Linux',(t:TestContext)=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-generator-'));
 try{
  const file=join(directory,'program');writeFileSync(file,linkLinux(generatorProgram()));
  let run;
  if(process.platform==='linux'){
   chmodSync(file,0o700);run=spawnSync(file,[],{timeout:10000});
  }else if(process.platform==='win32'){
   const probe=spawnSync('wsl.exe',['--exec','/bin/true'],{timeout:15000});
   if(probe.error||probe.status!==0){t.skip('WSL Linux is unavailable');return;}
   const translated=spawnSync('wsl.exe',['--exec','wslpath','-a',file],{encoding:'utf8',timeout:5000});
   assert.equal(translated.status,0,translated.stderr);
   run=spawnSync('wsl.exe',['--exec','/bin/sh','-c','target=$(mktemp /tmp/nona-generator-XXXXXX); trap \'rm -f "$target"\' EXIT; cp "$1" "$target"; chmod 700 "$target"; "$target"','sh',translated.stdout.trim()],{timeout:10000});
  }else{t.skip('No Linux execution environment');return;}
  assert.equal(run.error,undefined);assert.equal(run.status,0,String(run.stderr));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
