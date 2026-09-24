import test from 'node:test';
import assert from 'node:assert/strict';
import { Assembler } from '../src/backend/x64/assembler.js';
import { linkPe } from '../src/backend/pe/writer.js';
import { RuntimeBuilder } from '../src/runtime/abi.js';
import { emitMemory } from '../src/runtime/memory.js';
import { emitIo } from '../src/runtime/io.js';
import { emitStrings } from '../src/runtime/strings.js';
// This fixture exercises raw OS output without the JS value/exception runtime.
// Neither log nor concat is reachable from write; exclude their dependencies.
function emitRuntime(_request?:unknown){const b=new RuntimeBuilder();emitMemory(b);emitStrings(b);emitIo(b);const omitted=new Set(['rt.log','rt.concat']);b.bundle.fragments=b.bundle.fragments.filter(f=>!omitted.has(f.name));b.bundle.functions=b.bundle.functions.filter(f=>!omitted.has(f.begin));return b.bundle;}
import { stringLiteral } from '../src/runtime/value.js';
import { runNative, replaceImport } from './helpers/native.js';
test('runtime writes Unicode and embedded NUL as UTF8', () => {
 const r=emitRuntime({operations:new Set()}); const a=new Assembler('entry');
 a.sub('rsp',40);a.call('rt.init');a.lea('rcx',{rip:'literal'});a.call('rt.write');a.call('rt.dispose');a.mov('rcx',0);a.callImport('ExitProcess');a.label('entry.end');
 const image=linkPe({ ...r,entry:'entry',fragments:[...r.fragments,{...a.finish(),name:'entry',section:'.text'},stringLiteral('literal','Привет\0世界\n')],functions:[...r.functions,{begin:'entry',end:'entry.end',prologSize:4,stackAllocation:40,savedRegisters:[]}]});
 const result=runNative(image);assert.equal(result.status,0);assert.equal(result.stdout.toString('utf8'),'Привет\0世界\n');
 const file=runNative(image,5000,true);assert.equal(file.status,0);assert.equal(file.stdout.toString('utf8'),'Привет\0世界\n');
});

test('partial writes advance offsets until all bytes are emitted',()=>{
 const r=emitRuntime();const a=new Assembler('entry');a.sub('rsp',40);a.call('rt.init');a.lea('rcx',{rip:'literal'});a.call('rt.write');a.call('rt.dispose');a.mov('rcx',0);a.callImport('ExitProcess');a.label('entry.end');
 const p={...r,entry:'entry',fragments:[...r.fragments,{...a.finish(),name:'entry',section:'.text' as const},stringLiteral('literal','abcdef\n')],functions:[...r.functions,{begin:'entry',end:'entry.end',prologSize:4,stackAllocation:40,savedRegisters:[]}]};
 // Force file path; call the real API with at most two bytes each time.
 const stub=new Assembler('partial');stub.sub('rsp',40);const sp=stub.offset;stub.mov('rax',0);stub.store({base:'rsp',disp:32},'rax');stub.cmp('r8',2);stub.jcc('be','partial.call');stub.mov('r8',2);stub.label('partial.call');stub.callImport('realWriteFile');stub.add('rsp',40);stub.ret();stub.label('partial.end');p.fragments.push({...stub.finish(),name:'partial',section:'.text'});p.functions.push({begin:'partial',end:'partial.end',prologSize:sp,stackAllocation:40,savedRegisters:[]});p.imports.push({dll:'KERNEL32.dll',name:'WriteFile',symbol:'realWriteFile'});replaceImport(p,'WriteFile','partial');
 const run=runNative(linkPe(p));assert.equal(run.status,0);assert.equal(run.stdout.toString(),'abcdef\n');
});
for(const mode of ['zero','failed','allocation'] as const)test('runtime terminates on '+mode+' failure, including unavailable stderr',()=>{
 const r=emitRuntime();const a=new Assembler('entry');a.sub('rsp',40);a.call('rt.init');a.lea('rcx',{rip:'literal'});a.call('rt.write');a.mov('rcx',0);a.callImport('ExitProcess');a.label('entry.end');const p={...r,entry:'entry',fragments:[...r.fragments,{...a.finish(),name:'entry',section:'.text' as const},stringLiteral('literal','x')],functions:[...r.functions,{begin:'entry',end:'entry.end',prologSize:4,stackAllocation:40,savedRegisters:[]}]};
 const stub=new Assembler('failure');stub.mov('rax',0);if(mode==='zero'){stub.store({base:'r9'},'rax',32);stub.mov('rax',1);}stub.ret();p.fragments.push({...stub.finish(),name:'failure',section:'.text'});replaceImport(p,mode==='allocation'?'HeapAlloc':'WriteFile','failure');if(mode==='allocation')replaceImport(p,'WriteFile','failure');const run=runNative(linkPe(p));assert.equal(run.status,1,run.error?.message ?? "unexpected status");
});





test('isolated surrogates become U+FFFD while paired surrogates survive UTF8 output',()=>{
 const r=emitRuntime();const a=new Assembler('entry');a.sub('rsp',40);a.call('rt.init');a.lea('rcx',{rip:'literal'});a.call('rt.write');a.call('rt.dispose');a.mov('rcx',0);a.callImport('ExitProcess');a.label('entry.end');
 const p={...r,entry:'entry',fragments:[...r.fragments,{...a.finish(),name:'entry',section:'.text' as const},stringLiteral('literal','\ud800x\udc00😀')],functions:[...r.functions,{begin:'entry',end:'entry.end',prologSize:4,stackAllocation:40,savedRegisters:[]}]};
 const run=runNative(linkPe(p));assert.equal(run.status,0);assert.equal(run.stdout.toString(),'�x�😀');
});
