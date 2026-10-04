import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkElf} from '../src/backend/elf/writer.js';
import type {NativeProgram} from '../src/backend/pe/model.js';

function fixture():NativeProgram {
  return {entry:'entry',imports:[],functions:[],fragments:[
    {name:'entry',section:'.text',bytes:Uint8Array.from([0x90,0x0f,0x05,0xc3]),fixups:[],symbols:{}},
    {name:'pointer',section:'.rdata',bytes:new Uint8Array(8),symbols:{},fixups:[{offset:0,kind:'va64',target:'entry',addend:1}]},
    {name:'state',section:'.data',bytes:new Uint8Array(8),symbols:{},fixups:[]},
  ]};
}
const link=(program:NativeProgram,options:object)=>Reflect.apply(linkElf,undefined,[program,options]) as Uint8Array;
const view=(image:Uint8Array)=>new DataView(image.buffer,image.byteOffset,image.byteLength);
function headers(image:Uint8Array){
  const v=view(image),start=Number(v.getBigUint64(32,true)),size=v.getUint16(54,true),count=v.getUint16(56,true);
  return Array.from({length:count},(_,i)=>{
    const at=start+size*i;
    return {type:v.getUint32(at,true),flags:v.getUint32(at+4,true),offset:Number(v.getBigUint64(at+8,true)),address:v.getBigUint64(at+16,true),length:Number(v.getBigUint64(at+32,true)),align:Number(v.getBigUint64(at+48,true))};
  });
}

test('ARM64 ELF uses its machine ID and 64 KiB compatible load alignment',()=>{
  const image=link(fixture(),{machine:'arm64',os:'linux'}),v=view(image);
  assert.equal(v.getUint16(18,true),183);
  assert.equal(v.getBigUint64(24,true),0x410000n);
  for(const h of headers(image).filter(h=>h.type===1)){
    assert.equal(h.align,65536);assert.equal(Number(h.address)%65536,h.offset%65536);
    assert.equal(h.flags&3, h.flags===6?2:h.flags===5?1:0);
  }
  const data=headers(image).find(h=>h.flags===4&&h.offset!==0)!;
  assert.equal(v.getBigUint64(data.offset,true),0x410001n);
});

test('BSD ELF identifies its native OS without an interpreter',()=>{
  for(const [os,want] of [['freebsd',9],['openbsd',12]] as const){
    const image=link(fixture(),{os,...(os==='openbsd'?{syscallPins:[{symbol:'entry',offset:1,number:1}]}:{})});
    assert.equal(image[7],want);assert.equal(view(image).getUint16(18,true),62);
    assert.equal(headers(image).some(h=>h.type===3),false);
  }
});

test('OpenBSD syscall locations are registered in executable code',()=>{
  const image=link(fixture(),{os:'openbsd',syscallPins:[{symbol:'entry',offset:1,number:1}]}),v=view(image);
  const pins=headers(image).find(h=>h.type===0x65a3dbe9);assert.ok(pins);
  assert.equal(pins.length,8);
  assert.equal(v.getUint32(pins.offset,true),0x401001);
  assert.equal(v.getUint32(pins.offset+4,true),1);
  assert.throws(()=>link(fixture(),{os:'openbsd',syscallPins:[{symbol:'state',offset:1,number:1}]}),/syscall/i);
  assert.throws(()=>link(fixture(),{os:'openbsd',syscallPins:[{symbol:'entry',offset:0,number:1}]}),/syscall/i);
});

test('invalid ELF target geometry is rejected instead of truncated',()=>{
  for(const options of [{machine:'mips'},{os:'mint'},{pageSize:3},{pageSize:2048},{base:0x400001},{base:-1}])
    assert.throws(()=>link(fixture(),options),/ELF|target|alignment/i);
});

test('absolute ELF relocations cannot wrap through negative or imprecise addresses',()=>{
  const negative=fixture();negative.fragments[1]!.fixups[0]!.addend=-0x500000;
  assert.throws(()=>linkElf(negative),/address|range/i);
  assert.throws(()=>link(fixture(),{base:9007199254736896}),/address|range/i);
});
