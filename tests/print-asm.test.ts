import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compile} from '../src/compiler.js';
import {Assembler,setAssemblyListing} from '../src/backend/x64/assembler.js';
import {formatInstruction} from '../src/backend/x64/listing.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

// nona build --print-asm (#145): the x86-64 assembly of the program's own
// functions, not the runtime or the preludes.

const source='function add(a,b){return a+b}\nconsole.log(add(1,2));\n';

test('printAsm lists the program functions with offsets, bytes and instructions',()=>{
 const result=compile(source,{fileName:'/app.js',target:'linux-x64',printAsm:true});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
 const assembly=result.assembly!;
 assert.match(assembly,/^js\.main:$/m);
 assert.match(assembly,/^js\.fn\.0:$/m,'the function add');
 assert.match(assembly,/^ {2}[0-9a-f]{6} {2}(?:[0-9a-f]{2} )+ *call rt\.enterFrame$/m);
 assert.match(assembly,/addsd xmm0, /,'the number fast path of a+b');
 // Only the program: no runtime routine or prelude function is listed.
 assert.doesNotMatch(assembly,/^rt\./m);
 assert.doesNotMatch(assembly,/^js\.regexpVm\./m);
 // Every line is a label or an instruction with its offset and encoding.
 for(const line of assembly.split('\n'))if(line)assert.match(line,/^(?:\S+:|  [0-9a-f]{6}  (?:[0-9a-f]{2} )+ *\S.*)$/);
});

test('the listing does not change the generated code',()=>{
 const plain=compile(source,{fileName:'/app.js',target:'linux-x64'});
 const listed=compile(source,{fileName:'/app.js',target:'linux-x64',printAsm:true});
 assert.ok(plain.ok&&listed.ok);
 assert.equal(plain.assembly,undefined);
 assert.deepEqual(listed.image,plain.image);
});

test('assemblers record top-level instruction calls only while listing is on',()=>{
 setAssemblyListing(true);
 let a:Assembler;
 try{a=new Assembler('f');}finally{setAssemblyListing(false);}
 a.label('top');a.mov('rax',5);a.mov('r8',-1);a.store({base:'rbp',disp:-16},'rax');a.load('rcx',{rip:'x',addend:8},8);
 a.call('rt.f');a.jcc('ne','top');a.callUnless('e','rt.collect');
 assert.deepEqual(a.finish().listing,[
  {offset:0,text:'top:'},
  {offset:0,text:'mov eax, 5'},
  {offset:5,text:'mov r8, -1'},
  {offset:12,text:'mov [rbp-0x10], rax'},
  {offset:16,text:'movzx ecx, byte [rip+x+8]'},
  {offset:23,text:'call rt.f'},
  {offset:28,text:'jne top'},
  {offset:34,text:'je $+7 ; call rt.collect'},
 ]);
 const plain=new Assembler('g');plain.mov('rax',1);
 assert.equal(plain.finish().listing,undefined);
 assert.equal(formatInstruction('store',[{base:'rax'},'rsi',8]),'mov [rax], sil');
 assert.equal(formatInstruction('store',[{base:'rax'},'r9',32]),'mov [rax], r9d');
});

test('printAsm requires an x86-64 target',()=>{
 const result=compile(source,{fileName:'/app.js',target:'linux-arm64',printAsm:true});
 assert.ok(!result.ok);
 assert.match(result.diagnostics[0]!.message,/x86-64/);
});

test('nona build --print-asm prints the listing; without -o it writes nothing',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-asm-'));
 try{
  const input=join(directory,'in.js'),output=join(directory,'out');writeFileSync(input,source);
  const listed=spawnSync(process.execPath,['dist/cli.js','build',input,'--print-asm','--target','linux-x64'],{encoding:'utf8',windowsHide:true});
  assert.equal(listed.status,0,listed.stderr);
  assert.match(listed.stdout,/^js\.main:$/m);
  assert.ok(!existsSync(output));
  const both=spawnSync(process.execPath,['dist/cli.js','build',input,'-o',output,'--print-asm','--target','linux-x64'],{encoding:'utf8',windowsHide:true});
  assert.equal(both.status,0,both.stderr);
  assert.match(both.stdout,/^js\.fn\.0:$/m);
  assert.ok(existsSync(output));
 }finally{removeTemporaryDirectory(directory);}
});
