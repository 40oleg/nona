import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkElf} from '../src/backend/elf/writer.js';
import {linkMachO} from '../src/backend/macho/writer.js';
import {linkPe} from '../src/backend/pe/writer.js';
import type {NativeProgram} from '../src/backend/pe/model.js';

function fixture():NativeProgram {
  const bytes=new Uint8Array(16),v=new DataView(bytes.buffer);
  v.setUint32(0,0x90000001,true);v.setUint32(4,0x91000021,true);
  v.setUint32(8,0x14000000,true);v.setUint32(12,0xd65f03c0,true);
  return {entry:'entry',imports:[],functions:[],fragments:[
    {name:'entry',section:'.text',bytes,symbols:{done:12},fixups:[
      {offset:0,kind:'arm64-page21',target:'message',addend:123},
      {offset:4,kind:'arm64-pageoff12',target:'message',addend:123},
      {offset:8,kind:'arm64-branch26',target:'done',addend:0},
    ]},
    {name:'message',section:'.rdata',bytes:new Uint8Array(128),fixups:[],symbols:{}},
  ]};
}

test('ELF and Mach-O resolve native ARM64 instructions without absolute code pointers',()=>{
  for(const [link,page] of [[()=>linkElf(fixture(),{machine:'arm64'}),65536],[()=>linkMachO(fixture(),{arch:'arm64'}),16384]] as const){
    const image=link(),v=new DataView(image.buffer);
    // ADRP x1, +16/+4 pages; ADD x1, x1, #123; B +4 bytes.
    assert.equal(v.getUint32(page,true),page===65536?0x90000081:0x90000021);
    assert.equal(v.getUint32(page+4,true),0x9101ec21);
    assert.equal(v.getUint32(page+8,true),0x14000001);
  }
});

test('x64 images reject ARM64 instruction fixups',()=>{
  assert.throws(()=>linkElf(fixture()),/ARM64|architecture/i);
  assert.throws(()=>linkMachO(fixture()),/ARM64|architecture/i);
});

test('ARM64 executable writers reject entry points inside an instruction',()=>{
  const program=fixture();program.entry='unaligned';program.fragments[0]!.symbols.unaligned=1;
  assert.throws(()=>linkElf(program,{machine:'arm64'}),/entry.*align|align.*entry/i);
  assert.throws(()=>linkPe(program,{arch:'arm64'}),/entry.*align|align.*entry/i);
  assert.throws(()=>linkMachO(program,{arch:'arm64'}),/entry.*align|align.*entry/i);
});
