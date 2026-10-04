import type {NativeProgram,NamedFragment} from '../pe/model.js';
import {checkedRel32} from '../x64/encoder.js';
import {adHocSignature,signatureSize} from './signature.js';

export interface MachOOptions {arch?:'x64'|'arm64'}
const base=0x100000000;
const align=(value:number,boundary:number)=>Math.ceil(value/boundary)*boundary;
type Segment={name:string;section:string;offset:number;length:number;size:number;protection:number;members:{fragment:NamedFragment;offset:number}[]};
const u32=(value:number)=>{
  if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new RangeError('Mach-O field out of range');
  return value;
};

/** Fixed-address Mach-O64 executable with direct kernel startup and no dylibs. */
export function linkMachO(program:NativeProgram,options:MachOOptions={}):Uint8Array {
  const arch=options.arch??'x64';
  if(arch!=='x64'&&arch!=='arm64')throw new Error('Unsupported Mach-O architecture');
  if(program.imports.length)throw new Error('Mach-O requires resolved native imports');
  const page=arch==='arm64'?16384:4096,segments:Segment[]=[];
  let next=page;
  for(const [section,name,protection] of [['.text','__TEXT',5],['.rdata','__DATA_CONST',1],['.data','__DATA',3]] as const){
    const fragments=program.fragments.filter(f=>f.section===section);
    if(!fragments.length)continue;
    let length=0;
    const members=fragments.map(fragment=>{
      const alignment=fragment.alignment??(section==='.text'?16:8);
      if(!Number.isInteger(alignment)||alignment<1||alignment>page||(alignment&(alignment-1)))throw new Error('Invalid Mach-O fragment alignment');
      length=align(length,alignment);const offset=length;length+=fragment.bytes.length;
      return {fragment,offset};
    });
    const size=align(Math.max(length,1),page);segments.push({name,section,offset:next,length,size,protection,members});next+=size;
  }
  u32(next);
  if(segments.reduce((n,s)=>n+s.members.length,0)!==program.fragments.length)throw new Error('Unsupported Mach-O section');
  const symbols=new Map<string,number>();
  const put=(name:string,address:number)=>{if(symbols.has(name))throw new Error(`Duplicate Mach-O symbol ${name}`);symbols.set(name,address);};
  for(const segment of segments)for(const {fragment,offset} of segment.members){
    const address=base+segment.offset+offset;put(fragment.name,address);
    for(const [name,position] of Object.entries(fragment.symbols)){
      if(!Number.isInteger(position)||position<0||position>fragment.bytes.length)throw new Error('Mach-O symbol offset out of bounds');
      if(name!==fragment.name||position!==0)put(name,address+position);
    }
  }
  const entry=symbols.get(program.entry),text=segments.find(s=>s.section==='.text');
  if(entry===undefined||!text||entry<base+text.offset||entry>=base+text.offset+text.length||arch==='arm64'&&entry%4)throw new Error('Mach-O entry is outside executable code or unaligned');
  const codeLimit=next,signSize=signatureSize(codeLimit);
  const image=new Uint8Array(codeLimit+signSize),v=new DataView(image.buffer);
  for(const segment of segments)for(const {fragment,offset} of segment.members){
    const at=segment.offset+offset;image.set(fragment.bytes,at);
    for(const fixup of fragment.fixups){
      const width=fixup.kind==='va64'?8:4;
      if(!Number.isInteger(fixup.offset)||fixup.offset<0||fixup.offset+width>fragment.bytes.length)throw new Error('Mach-O fixup out of bounds');
      const target=symbols.get(fixup.target);
      if(target===undefined)throw new Error(`Unknown Mach-O symbol ${fixup.target}`);
      const resolved=target+fixup.addend,place=base+at+fixup.offset;
      if(!Number.isSafeInteger(fixup.addend)||!Number.isSafeInteger(resolved)||resolved<0)throw new RangeError('Mach-O relocation address out of range');
      if(fixup.kind==='va64')v.setBigUint64(at+fixup.offset,BigInt(resolved),true);
      else if(fixup.kind==='rva32')v.setUint32(at+fixup.offset,u32(resolved-base),true);
      else if(fixup.kind==='rel32')v.setInt32(at+fixup.offset,checkedRel32(resolved-place-4),true);
      else throw new Error('Unknown Mach-O fixup');
    }
  }
  v.setUint32(0,0xfeedfacf,true);v.setUint32(4,arch==='arm64'?0x100000c:0x1000007,true);
  v.setUint32(8,arch==='arm64'?0:3,true);v.setUint32(12,2,true);v.setUint32(24,1,true);
  let command=32,count=0;
  const name=(at:number,value:string)=>image.set(new TextEncoder().encode(value),at);
  const segmentCommand=(value:string,address:number,vmSize:number,fileOffset:number,fileSize:number,protection:number,section?:Segment)=>{
    const at=command,size=72+(section?80:0);command+=size;count++;
    v.setUint32(at,0x19,true);v.setUint32(at+4,size,true);name(at+8,value);
    v.setBigUint64(at+24,BigInt(address),true);v.setBigUint64(at+32,BigInt(vmSize),true);
    v.setBigUint64(at+40,BigInt(fileOffset),true);v.setBigUint64(at+48,BigInt(fileSize),true);
    v.setUint32(at+56,protection,true);v.setUint32(at+60,protection,true);
    if(section){
      v.setUint32(at+64,1,true);const s=at+72;
      name(s,section.section==='.text'?'__text':section.section==='.data'?'__data':'__const');name(s+16,value);
      v.setBigUint64(s+32,BigInt(base+section.offset),true);v.setBigUint64(s+40,BigInt(section.length),true);
      v.setUint32(s+48,section.offset,true);v.setUint32(s+52,section.section==='.text'?4:3,true);
      if(section.section==='.text')v.setUint32(s+64,0x80000400,true);
    }
  };
  segmentCommand('__PAGEZERO',0,base,0,0,0);
  for(const segment of segments){
    if(segment.section==='.text')segmentCommand(segment.name,base,segment.offset+segment.size,0,segment.offset+segment.size,segment.protection,segment);
    else segmentCommand(segment.name,base+segment.offset,segment.size,segment.offset,segment.size,segment.protection,segment);
  }
  segmentCommand('__LINKEDIT',base+codeLimit,align(signSize,page),codeLimit,signSize,1);
  const thread=command,threadSize=16+(arch==='arm64'?272:168);command+=threadSize;count++;
  v.setUint32(thread,5,true);v.setUint32(thread+4,threadSize,true);
  v.setUint32(thread+8,arch==='arm64'?6:4,true);v.setUint32(thread+12,arch==='arm64'?68:42,true);
  v.setBigUint64(thread+16+(arch==='arm64'?256:128),BigInt(entry),true);
  const build=command;command+=24;count++;
  v.setUint32(build,0x32,true);v.setUint32(build+4,24,true);v.setUint32(build+8,1,true);
  v.setUint32(build+12,11<<16,true);v.setUint32(build+16,11<<16,true);
  const signature=command;command+=16;count++;
  v.setUint32(signature,0x1d,true);v.setUint32(signature+4,16,true);
  v.setUint32(signature+8,codeLimit,true);v.setUint32(signature+12,signSize,true);
  if(command>page)throw new Error('Mach-O load commands exceed header page');
  v.setUint32(16,count,true);v.setUint32(20,command-32,true);
  image.set(adHocSignature(image.subarray(0,codeLimit),text.offset+text.size),codeLimit);
  return image;
}
