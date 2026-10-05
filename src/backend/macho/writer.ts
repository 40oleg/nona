import type {NativeProgram,NamedFragment} from '../pe/model.js';
import {checkedRel32} from '../x64/encoder.js';
import {isArm64Relocation,relocateArm64} from '../arm64/relocations.js';
import {adHocSignature,signatureSize} from './signature.js';

export interface MachOOptions {arch?:'x64'|'arm64'}
const base=0x100000000;
const align=(value:number,boundary:number)=>Math.ceil(value/boundary)*boundary;
type Segment={name:string;section:string;offset:number;length:number;size:number;protection:number;members:{fragment:NamedFragment;offset:number}[]};
const u32=(value:number)=>{
  if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new RangeError('Mach-O field out of range');
  return value;
};

/** Intel uses direct kernel startup; Apple Silicon uses the system dyld/libSystem. */
export function linkMachO(program:NativeProgram,options:MachOOptions={}):Uint8Array {
  const arch=options.arch??'x64';
  if(arch!=='x64'&&arch!=='arm64')throw new Error('Unsupported Mach-O architecture');
  const dynamic=arch==='arm64';
  if(program.imports.length&&!dynamic)throw new Error('Mach-O requires resolved native imports');
  if(program.imports.some(i=>i.dll!=='/usr/lib/libSystem.B.dylib'||!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(i.name)))throw new Error('Mach-O imports must name libSystem functions');
  const imported=program.imports.map(i=>({name:i.symbol,section:'.data' as const,alignment:8,bytes:new Uint8Array(8),symbols:{},fixups:[]}));
  program={...program,fragments:[...program.fragments,...imported]};
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
  const uleb=(value:number):number[]=>{const bytes:number[]=[];do{const low=value%128;value=Math.floor(value/128);bytes.push(low|(value?128:0));}while(value);return bytes;};
  const rebases:number[]=[],bindings:number[]=[];
  if(dynamic){
    for(let i=0;i<segments.length;i++)for(const {fragment,offset} of segments[i]!.members)for(const fixup of fragment.fixups){
      if(fixup.kind!=='va64')continue;
      if(segments[i]!.section==='.text')throw new Error('Mach-O dynamic absolute pointers must be in data');
      rebases.push(0x11,0x20|(i+1),...uleb(offset+fixup.offset),0x51);
    }
    rebases.push(0);
    for(const imported of program.imports){
      const segment=segments.findIndex(s=>s.members.some(m=>m.fragment.name===imported.symbol));
      const member=segments[segment]!.members.find(m=>m.fragment.name===imported.symbol)!;
      bindings.push(0x11,0x40,...new TextEncoder().encode('_'+imported.name),0,0x51,0x70|(segment+1),...uleb(member.offset),0x90);
    }
    bindings.push(0);
  }
  const linkeditStart=next,rebaseOffset=next;next+=rebases.length;
  const bindOffset=next;next+=bindings.length;next=align(next,8);
  const symbolOffset=next;next+=dynamic?program.imports.length*16:0;
  const strings:number[]=[0],stringIndices:number[]=[];
  for(const imported of program.imports){stringIndices.push(strings.length);strings.push(...new TextEncoder().encode('_'+imported.name),0);}
  const stringOffset=next;if(dynamic)next+=strings.length;
  const codeLimit=dynamic?align(next,16):next,signSize=signatureSize(codeLimit);
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
      else if(isArm64Relocation(fixup.kind)){
        if(arch!=='arm64')throw new Error('ARM64 relocation requires ARM64 architecture');
        v.setUint32(at+fixup.offset,relocateArm64(fixup.kind,v.getUint32(at+fixup.offset,true),place,resolved),true);
      }
      else throw new Error('Unknown Mach-O fixup');
    }
  }
  v.setUint32(0,0xfeedfacf,true);v.setUint32(4,arch==='arm64'?0x100000c:0x1000007,true);
  if(dynamic){
    image.set(rebases,rebaseOffset);image.set(bindings,bindOffset);image.set(strings,stringOffset);
    for(let i=0;i<program.imports.length;i++){const at=symbolOffset+i*16;v.setUint32(at,stringIndices[i]!,true);image[at+4]=1;v.setUint16(at+6,0x100,true);}
  }
  v.setUint32(8,arch==='arm64'?0:3,true);v.setUint32(12,2,true);v.setUint32(24,dynamic?0x200085:1,true);
  let command=32,count=0;
  const name=(at:number,value:string)=>image.set(new TextEncoder().encode(value),at);
  const segmentCommand=(value:string,address:number,vmSize:number,fileOffset:number,fileSize:number,protection:number,section?:Segment)=>{
    const at=command,size=72+(section?80:0);command+=size;count++;
    v.setUint32(at,0x19,true);v.setUint32(at+4,size,true);name(at+8,value);
    v.setBigUint64(at+24,BigInt(address),true);v.setBigUint64(at+32,BigInt(vmSize),true);
    v.setBigUint64(at+40,BigInt(fileOffset),true);v.setBigUint64(at+48,BigInt(fileSize),true);
    const constant=dynamic&&value==='__DATA_CONST';
    v.setUint32(at+56,constant?3:protection,true);v.setUint32(at+60,constant?3:protection,true);
    if(constant)v.setUint32(at+68,0x10,true); // SG_READ_ONLY after dyld fixups
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
  segmentCommand('__LINKEDIT',base+linkeditStart,align(codeLimit-linkeditStart+signSize,page),linkeditStart,codeLimit-linkeditStart+signSize,1);
  if(dynamic){
    const pathCommand=(type:number,path:string,header:number)=>{
      const bytes=new TextEncoder().encode(path+'\0'),size=align(header+bytes.length,8),at=command;command+=size;count++;
      v.setUint32(at,type,true);v.setUint32(at+4,size,true);v.setUint32(at+8,header,true);image.set(bytes,at+header);
      if(type===0xc){v.setUint32(at+16,1<<16,true);v.setUint32(at+20,1<<16,true);}
    };
    pathCommand(0xe,'/usr/lib/dyld',12);pathCommand(0xc,'/usr/lib/libSystem.B.dylib',24);
    const main=command;command+=24;count++;v.setUint32(main,0x80000028,true);v.setUint32(main+4,24,true);v.setBigUint64(main+8,BigInt(entry-base),true);
    const info=command;command+=48;count++;v.setUint32(info,0x80000022,true);v.setUint32(info+4,48,true);
    for(const [offset,value] of [[8,rebaseOffset],[12,rebases.length],[16,bindOffset],[20,bindings.length]])v.setUint32(info+offset!,value!,true);
    const symtab=command;command+=24;count++;v.setUint32(symtab,2,true);v.setUint32(symtab+4,24,true);
    for(const [offset,value] of [[8,symbolOffset],[12,program.imports.length],[16,stringOffset],[20,strings.length]])v.setUint32(symtab+offset!,value!,true);
    const dysym=command;command+=80;count++;v.setUint32(dysym,0xb,true);v.setUint32(dysym+4,80,true);v.setUint32(dysym+28,program.imports.length,true);
  }else{
  const thread=command,threadSize=184;command+=threadSize;count++;
  v.setUint32(thread,5,true);v.setUint32(thread+4,threadSize,true);
  v.setUint32(thread+8,4,true);v.setUint32(thread+12,42,true);
  v.setBigUint64(thread+16+128,BigInt(entry),true);
  }
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
