import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import type {Assembler} from './assembler.js';
import type {ModuleIR} from '../../ir/model.js';
import type {NamedFragment,NativeProgram} from '../pe/model.js';

/**
 * Coverage builds (roadmap item 19): every function of the program counts its
 * calls (`inc` at entry, emitted by codegen), and when the program ends, or
 * a runtime error ends it, the counts are written as one V8 coverage file,
 * `<directory>/coverage-<pid>-<counter>-0.json`, the format NODE_V8_COVERAGE
 * produces and c8 reports from. Coverage is per function (V8's "best effort"
 * mode, isBlockCoverage false): every function's range with its call count,
 * the script itself as an unnamed function.
 *
 * Everything but the counts is known at compile time, so the file is a list
 * of UTF-8 chunks with a counter after each one (cov.table), written by
 * cov.write through CreateFileW/WriteFile/CloseHandle (Linux: shims).
 */
export interface CoverageOptions {
  /** Directory the coverage file is written to (it must exist). */
  directory:string;
  /** Script URLs by ModuleIR.scripts index; a script without one is left out. */
  urls:(string|undefined)[];
}

const imports=['CreateFileW','CloseHandle','WriteFile','GetCurrentProcessId','QueryPerformanceCounter'];

function record(text:string):Uint8Array {
  const bytes=new TextEncoder().encode(text),out=new Uint8Array(8+bytes.length);
  new DataView(out.buffer).setBigUint64(0,BigInt(bytes.length),true);out.set(bytes,8);return out;
}

export function addCoverage(module:ModuleIR,program:NativeProgram,options:CoverageOptions):NativeProgram {
  const fragments:NamedFragment[]=[];
  // Functions grouped by script, in source order.
  const scripts=new Map<number,{id:string;source:NonNullable<ModuleIR['functions'][number]['source']>}[]>();
  for(const fn of module.functions){
    if(!fn.source||options.urls[fn.source.script]===undefined)continue;
    const list=scripts.get(fn.source.script)??[];list.push({id:fn.id,source:fn.source});scripts.set(fn.source.script,list);
  }
  // JSON text up to each count, and the counter that follows it.
  const pieces:{text:string;counter:string}[]=[];let text='{"result":[';let firstScript=true;
  for(const [script,list] of [...scripts].sort((x,y)=>x[0]-y[0])){
    list.sort((x,y)=>x.source.start-y.source.start||y.source.end-x.source.end);
    text+=(firstScript?'':',')+'{"scriptId":'+JSON.stringify(String(script+1))+',"url":'+JSON.stringify(options.urls[script])+',"functions":[';firstScript=false;
    list.forEach(({id,source},i)=>{
      text+=(i?',':'')+'{"functionName":'+JSON.stringify(source.name)+',"ranges":[{"startOffset":'+source.start+',"endOffset":'+source.end+',"count":';
      pieces.push({text,counter:'cov.'+id});text='}],"isBlockCoverage":false}';
    });
    text+=']}';
  }
  text+=']}\n';
  // Counters (codegen increments cov.<function id>), chunks, table.
  for(const {counter} of pieces)fragments.push({name:counter,section:'.data',alignment:8,bytes:new Uint8Array(8),fixups:[],symbols:{}});
  const table=new Uint8Array(8+16*pieces.length+8),tableFixups:NamedFragment['fixups']=[];
  new DataView(table.buffer).setBigUint64(0,BigInt(pieces.length),true);
  pieces.forEach((piece,i)=>{
    fragments.push({name:'cov.chunk.'+i,section:'.rdata',alignment:8,bytes:record(piece.text),fixups:[],symbols:{}});
    tableFixups.push({offset:8+16*i,kind:'va64',target:'cov.chunk.'+i,addend:0},{offset:16+16*i,kind:'va64',target:piece.counter,addend:0});
  });
  fragments.push({name:'cov.chunk.last',section:'.rdata',alignment:8,bytes:record(text),fixups:[],symbols:{}});
  tableFixups.push({offset:8+16*pieces.length,kind:'va64',target:'cov.chunk.last',addend:0});
  fragments.push({name:'cov.table',section:'.rdata',alignment:8,bytes:table,fixups:tableFixups,symbols:{}});
  // The file name prefix as UTF-16 code units (length, then units).
  const prefix=options.directory.replace(/[\\/]+$/,'')+'/coverage-',directory=new Uint8Array(8+2*prefix.length);
  new DataView(directory.buffer).setBigUint64(0,BigInt(prefix.length),true);
  for(let i=0;i<prefix.length;i++)new DataView(directory.buffer).setUint16(8+2*i,prefix.charCodeAt(i),true);
  fragments.push({name:'cov.directory',section:'.rdata',alignment:8,bytes:directory,fixups:[],symbols:{}});

  const b=new RuntimeBuilder();
  // RAX value -> decimal ASCII ending at slot 112: R11 first digit, R9 count.
  const digits=(a:Assembler)=>{
    const loop=a.unique('digit');a.lea('r11',slot(112));a.mov('r10',10);
    a.label(loop);a.mov('rdx',0);a.div('r10');a.add('rdx',48);a.sub('r11',1);a.store({base:'r11'},'rdx',8);a.test('rax','rax');a.jcc('ne',loop);
    a.lea('r9',slot(112));a.sub('r9','r11');
  };
  // Appends the digits as UTF-16 units at the path cursor (slot 56).
  const appendNumber=(a:Assembler)=>{
    digits(a);const loop=a.unique('unit'),done=a.unique('units');a.load('r8',slot(56));
    a.label(loop);a.test('r9','r9');a.jcc('e',done);a.load('rax',{base:'r11'},8);a.store({base:'r8'},'rax',16);a.add('r11',1);a.add('r8',2);a.sub('r9',1);a.jmp(loop);
    a.label(done);a.store(slot(56),'r8');
  };
  const appendText=(a:Assembler,value:string)=>{a.load('r8',slot(56));for(const c of value){a.mov('rax',c.charCodeAt(0));a.store({base:'r8'},'rax',16);a.add('r8',2);}a.store(slot(56),'r8');};
  // RDX bytes, R8 length: WriteFile to the handle at slot 40.
  const write=(a:Assembler)=>{a.load('rcx',slot(40));a.lea('r9',slot(48));a.mov('rax',0);a.store(slot(32),'rax');a.callImport('WriteFile');};
  // Slots: 40 handle, 48 written, 56 path cursor / table cursor, 64 entries
  // left, 72 counter value, 80..111 digits, 128.. the path (UTF-16).
  b.fn('cov.write',2200,a=>{
    const done=a.unique('done'),copy=a.unique('copy'),copied=a.unique('copied'),loop=a.unique('entry'),last=a.unique('last');
    a.lea('r11',slot(128));a.lea('r10',{rip:'cov.directory'});a.load('rcx',{base:'r10'});a.add('r10',8);
    a.label(copy);a.test('rcx','rcx');a.jcc('e',copied);a.load('rax',{base:'r10'},16);a.store({base:'r11'},'rax',16);a.add('r10',2);a.add('r11',2);a.sub('rcx',1);a.jmp(copy);
    a.label(copied);a.store(slot(56),'r11');
    a.callImport('GetCurrentProcessId');a.mov('r10',0xffffffff);a.and('rax','r10');appendNumber(a);appendText(a,'-');
    a.lea('rcx',slot(72));a.callImport('QueryPerformanceCounter');a.load('rax',slot(72));appendNumber(a);appendText(a,'-0.json\0');
    // CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL)
    a.lea('rcx',slot(128));a.mov('rdx',0x40000000);a.mov('r8',0);a.mov('r9',0);a.mov('rax',2);a.store(slot(32),'rax');a.mov('rax',0x80);a.store(slot(40),'rax');a.mov('rax',0);a.store(slot(48),'rax');
    a.callImport('CreateFileW');a.cmp('rax',-1);a.jcc('e',done);a.store(slot(40),'rax');
    a.lea('r10',{rip:'cov.table'});a.load('rax',{base:'r10'});a.store(slot(64),'rax');a.add('r10',8);a.store(slot(56),'r10');
    a.label(loop);a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',last);
    a.load('r10',slot(56));a.load('r10',{base:'r10'});a.load('r8',{base:'r10'});a.lea('rdx',{base:'r10',disp:8});write(a);
    a.load('r10',slot(56));a.load('r10',{base:'r10',disp:8});a.load('rax',{base:'r10'});digits(a);a.mov('rdx','r11');a.mov('r8','r9');write(a);
    a.load('r10',slot(56));a.add('r10',16);a.store(slot(56),'r10');a.load('rax',slot(64));a.sub('rax',1);a.store(slot(64),'rax');a.jmp(loop);
    a.label(last);a.load('r10',slot(56));a.load('r10',{base:'r10'});a.load('r8',{base:'r10'});a.lea('rdx',{base:'r10',disp:8});write(a);
    a.load('rcx',slot(40));a.callImport('CloseHandle');
    a.label(done);
  });
  program.fragments.push(...fragments,...b.bundle.fragments);
  program.functions.push(...b.bundle.functions);
  for(const name of imports)if(!program.imports.some(i=>i.symbol===name))program.imports.push({dll:'KERNEL32.dll',name,symbol:name});
  const hook=program.fragments.find(f=>f.name==='rt.exitHook')!;
  hook.fixups=[{offset:0,kind:'va64',target:'cov.write',addend:0}];
  return program;
}
