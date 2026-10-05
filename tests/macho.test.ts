import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {NativeProgram} from '../src/backend/pe/model.js';
const writerPath='../src/backend/macho/writer.js';
const writer=await import(writerPath).catch(()=>undefined);
function fixture():NativeProgram {return {entry:'start',imports:[],functions:[],fragments:[
  {name:'start',section:'.text',bytes:Uint8Array.from([0xc3,0,0,0]),symbols:{},fixups:[]},
  {name:'message',section:'.rdata',bytes:Uint8Array.from([65,66,67,0]),symbols:{},fixups:[]},
  {name:'state',section:'.data',bytes:new Uint8Array(8),symbols:{},fixups:[{offset:0,kind:'va64',target:'message',addend:1}]},
]};}
function link(program=fixture(),arch='x64'):Uint8Array {assert.ok(writer,'Mach-O writer must exist');return writer.linkMachO(program,{arch});}
const view=(image:Uint8Array)=>new DataView(image.buffer,image.byteOffset,image.byteLength);
function commands(image:Uint8Array){
  const v=view(image);let at=32;
  return Array.from({length:v.getUint32(16,true)},()=>{const command={type:v.getUint32(at,true),size:v.getUint32(at+4,true),offset:at};at+=command.size;return command;});
}

test('Mach-O maps text, constants and mutable data with separate permissions',()=>{
  const image=link(),v=view(image);assert.equal(v.getUint32(0,true),0xfeedfacf);
  assert.equal(v.getUint32(4,true),0x1000007);assert.equal(v.getUint32(12,true),2);
  const segments=commands(image).filter(c=>c.type===0x19).map(c=>({
    name:new TextDecoder().decode(image.subarray(c.offset+8,c.offset+24)).replace(/\0.*$/s,''),
    address:v.getBigUint64(c.offset+24,true),offset:Number(v.getBigUint64(c.offset+40,true)),protection:v.getUint32(c.offset+60,true),
  }));
  assert.equal(segments.find(s=>s.name==='__PAGEZERO')?.protection,0);
  assert.equal(segments.find(s=>s.name==='__TEXT')?.protection,5);
  assert.equal(segments.find(s=>s.name==='__DATA_CONST')?.protection,1);
  const data=segments.find(s=>s.name==='__DATA')!;assert.equal(data.protection,3);
  const constants=segments.find(s=>s.name==='__DATA_CONST')!;
  assert.equal(v.getBigUint64(data.offset,true),constants.address+1n);
  const thread=commands(image).find(c=>c.type===5)!;
  assert.equal(v.getUint32(thread.offset+8,true),4);assert.equal(v.getUint32(thread.offset+12,true),42);
  assert.equal(v.getBigUint64(thread.offset+16+16*8,true),0x100001000n);
});

test('ARM64 Mach-O uses dyld startup and 16 KiB segment alignment',()=>{
  const image=link(fixture(),'arm64'),v=view(image);
  assert.equal(v.getUint32(4,true),0x100000c);
  const main=commands(image).find(c=>c.type===0x80000028);
  assert.ok(main);assert.equal(v.getBigUint64(main.offset+8,true),0x4000n);
  assert.ok(commands(image).some(c=>c.type===0xe));
  const library=commands(image).find(c=>c.type===0xc);assert.ok(library);
  const nameOffset=library.offset+v.getUint32(library.offset+8,true);
  assert.equal(new TextDecoder().decode(image.subarray(nameOffset,nameOffset+27)), '/usr/lib/libSystem.B.dylib\0');
  assert.equal(commands(image).some(c=>c.type===5),false);
  for(const c of commands(image).filter(c=>c.type===0x19))assert.equal(v.getBigUint64(c.offset+24,true)%16384n,0n);
});

test('ARM64 Mach-O binds only system-library imports and rebases absolute data pointers',()=>{
  const program=fixture();program.imports=[{dll:'/usr/lib/libSystem.B.dylib',name:'clock_gettime',symbol:'system.clock'}];
  const image=link(program,'arm64'),v=view(image);
  const info=commands(image).find(c=>c.type===0x80000022);assert.ok(info);
  const rebaseOffset=v.getUint32(info.offset+8,true),rebaseSize=v.getUint32(info.offset+12,true);
  assert.ok(rebaseSize>0);assert.equal(image[rebaseOffset],0x11);
  const bindOffset=v.getUint32(info.offset+16,true),bindSize=v.getUint32(info.offset+20,true);
  assert.ok(bindSize>0);assert.ok(new TextDecoder().decode(image.subarray(bindOffset,bindOffset+bindSize)).includes('_clock_gettime\0'));
  program.imports[0]!.dll='third-party.dylib';assert.throws(()=>link(program,'arm64'),/libSystem/);
});

test('Mach-O embedded ad-hoc signature hashes the final image including load commands',()=>{
  const image=link(fixture(),'arm64'),v=view(image),signature=commands(image).find(c=>c.type===0x1d)!;
  const offset=v.getUint32(signature.offset+8,true);
  assert.equal(v.getUint32(offset,false),0xfade0cc0);assert.equal(v.getUint32(offset+8,false),1);
  assert.equal(v.getUint32(offset+12,false),0);
  const directory=offset+v.getUint32(offset+16,false);
  assert.equal(v.getUint32(directory,false),0xfade0c02);assert.equal(v.getUint32(directory+12,false)&2,2);
  assert.equal(v.getUint32(directory+32,false),offset);assert.equal(image[directory+37],2);
  assert.equal(image[directory+39],12);
  const slots=v.getUint32(directory+28,false),hashes=directory+v.getUint32(directory+16,false);
  assert.equal(slots,Math.ceil(offset/4096));
  for(let i=0;i<slots;i++)assert.deepEqual(image.subarray(hashes+i*32,hashes+(i+1)*32),new Uint8Array(createHash('sha256').update(image.subarray(i*4096,Math.min((i+1)*4096,offset))).digest()));
});

test('Mach-O rejects unresolved imports, invalid entries and relocation bounds',()=>{
  const imports=fixture();imports.imports.push({dll:'x',name:'f',symbol:'f'});assert.throws(()=>link(imports),/import/i);
  const entry=fixture();entry.entry='state';assert.throws(()=>link(entry),/entry/i);
  const fixup=fixture();fixup.fragments[2]!.fixups[0]!.offset=1;assert.throws(()=>link(fixup),/fixup|bounds/i);
  const duplicate=fixture();duplicate.fragments[1]!.name='start';assert.throws(()=>link(duplicate),/duplicate/i);
});
