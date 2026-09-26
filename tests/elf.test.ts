import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Assembler} from '../src/backend/x64/assembler.js';
import {linkElf} from '../src/backend/elf/writer.js';
import {compile} from '../src/compiler.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkLinux} from '../src/backend/linux/index.js';
import {runOracle} from './helpers/oracle.js';
import type {NativeProgram} from '../src/backend/pe/model.js';

function helloElf():Uint8Array {
 const code=new Assembler('linux.hello');
 code.mov('rax',1);code.mov('rdi',1);code.lea('rsi',{rip:'linux.message'});code.mov('rdx',6);code.emit([0x0f,0x05]);
 code.mov('rax',60);code.mov('rdi',0);code.emit([0x0f,0x05]);
 const program:NativeProgram={fragments:[
  {...code.finish(),name:'linux.hello',section:'.text'},
  {name:'linux.message',section:'.rdata',bytes:new TextEncoder().encode('hello\n'),fixups:[],symbols:{}},
 ],imports:[],entry:'linux.hello',functions:[]};
 return linkElf(program);
}

function executeLinux(image:Uint8Array,t:TestContext):string|null {
 const directory=mkdtempSync(join(tmpdir(),'nona-linux-'));
 try{
  const file=join(directory,'program');writeFileSync(file,image);
  let run;
  if(process.platform==='linux'){
   chmodSync(file,0o700);run=spawnSync(file,[],{encoding:'utf8',timeout:10000});
  }else if(process.platform==='win32'){
   const probe=spawnSync('wsl.exe',['--exec','/bin/true'],{timeout:3000});
   if(probe.error||probe.status!==0){t.skip('WSL Linux is unavailable');return null;}
   const translated=spawnSync('wsl.exe',['--exec','wslpath','-a',file],{encoding:'utf8',timeout:5000});
   assert.equal(translated.status,0,translated.stderr);
   run=spawnSync('wsl.exe',['--exec','/bin/sh','-c','target=$(mktemp /tmp/nona-linux-XXXXXX); trap \'rm -f "$target"\' EXIT; cp "$1" "$target"; chmod 700 "$target"; "$target"','sh',translated.stdout.trim()],{encoding:'utf8',timeout:10000});
  }else{t.skip('No Linux execution environment');return null;}
  assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);return run.stdout;
 }finally{rmSync(directory,{recursive:true,force:true});}
}

test('ELF64 linker resolves x64 RIP references',()=>{
 const image=helloElf(),view=new DataView(image.buffer);
 assert.equal(view.getUint32(0,true),0x464c457f);assert.equal(view.getUint16(18,true),62);
 assert.equal(view.getBigUint64(24,true),0x401000n);
 assert.equal(view.getUint32(64,true),1);assert.equal(view.getUint32(64+56+4,true),5);
 const lea=image.findIndex((byte,index)=>byte===0x48&&image[index+1]===0x8d&&image[index+2]===0x35);
 assert.ok(lea>0);const target=lea+7+view.getInt32(lea+3,true);
 assert.equal(new TextDecoder().decode(image.subarray(target,target+6)),'hello\n');
});

test('ELF64 executable runs under Linux when available',t=>{
 const output=executeLinux(helloElf(),t);if(output!==null)assert.equal(output,'hello\n');
});

test('Linux native compiler executes a JavaScript program',t=>{
 const result=compile('console.log("hello", 42);',{fileName:'hello.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,'hello 42\n');
});

test('Linux native output encodes UTF-16 as UTF-8',t=>{
 const source=`console.log('Привет','😀','\ud800');`;
 const result=compile(source,{fileName:'unicode.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native runtime survives GC stress and class construction',t=>{
 const source=`class B extends Array{}let a=new B(1,2);for(let i=0;i<40;i++)({x:String(i)});console.log(a instanceof B,a.length,a[1]);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.forEach calls back under GC stress',t=>{
 const source=`let a=[1,,3],s='';a.forEach(function(v,i){for(let j=0;j<20;j++)({x:j});s+=v+':'+i+';';});console.log(s);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.some and every call back under GC stress',t=>{
 const source=`let a=[1,,3];console.log(a.some(function(v){for(let j=0;j<20;j++)({x:j});return v===3}),a.every(function(v){for(let j=0;j<20;j++)({x:j});return v>0}));`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.find and findIndex visit holes under GC stress',t=>{
 const source=`let a=[,{x:2}],s='';console.log(a.find(function(v,i){for(let j=0;j<20;j++)({x:j});s+=i;return v&&v.x===2}).x,a.findIndex(function(v,i){for(let j=0;j<20;j++)({x:j});return v&&v.x===2}),s);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.reduce and reduceRight call back under GC stress',t=>{
 const source=`let a=[1,,3];console.log(a.reduce(function(x,y){for(let j=0;j<20;j++)({x:j});return x+y},0),a.reduceRight(function(x,y){for(let j=0;j<20;j++)({x:j});return x-y},0));`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
