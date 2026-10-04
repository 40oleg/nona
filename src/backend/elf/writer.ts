import type {NativeProgram,NamedFragment} from '../pe/model.js';
import {checkedRel32} from '../x64/encoder.js';
import {isArm64Relocation,relocateArm64} from '../arm64/relocations.js';
import {writeFileSync} from 'node:fs';

const align=(value:number,boundary:number)=>Math.ceil(value/boundary)*boundary;
const u32=(value:number)=>{
 if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new RangeError('ELF32 field out of range');
 return value;
};
type Section={name:NamedFragment['section'];offset:number;length:number;flags:number;fragments:{fragment:NamedFragment;offset:number}[]};
export interface ElfOptions {
 machine?:'x64'|'arm64';
 os?:'linux'|'freebsd'|'openbsd';
 base?:number;
 /** ARM64 uses 64 KiB by default so the image also loads on 16/64 KiB kernels. */
 pageSize?:number;
 /** OpenBSD requires the exact addresses of native syscall instructions. */
 syscallPins?:readonly {symbol:string;offset:number;number:number}[];
}

/** Link a fixed-address ELF64/x86-64 executable from target-independent fragments.
 * Native imports must be replaced by Linux runtime shims before this linker runs.
 */
export function linkElf(program:NativeProgram,options:ElfOptions={}):Uint8Array {
 const machine=options.machine??'x64',os=options.os??'linux';
 if(machine!=='x64'&&machine!=='arm64'||!['linux','freebsd','openbsd'].includes(os))throw new Error('Unsupported ELF target');
 if(os!=='linux'&&machine!=='x64')throw new Error('Unsupported ELF target architecture');
 const page=options.pageSize??(machine==='arm64'?65536:4096),base=options.base??0x400000;
 if(!Number.isInteger(page)||page<4096||page>65536||(page&(page-1)))throw new Error('Invalid ELF page alignment');
 if(!Number.isSafeInteger(base)||base<0||base%page)throw new Error('Invalid ELF base alignment');
 if(options.syscallPins?.length&&os!=='openbsd')throw new Error('ELF syscall pins require OpenBSD');
 if(program.imports.length)throw new Error('ELF requires resolved native imports');
 const sections:Section[]=[];
 let next=page;
 for(const [name,flags] of [['.text',5],['.rdata',4],['.data',6]] as const){
  const members=program.fragments.filter(fragment=>fragment.section===name);
  if(!members.length)continue;
  let length=0;const fragments=members.map(fragment=>{
   const alignment=fragment.alignment??(name==='.text'?16:8);
   if(!Number.isInteger(alignment)||alignment<1||alignment>page||(alignment&(alignment-1)))throw new Error('Invalid fragment alignment');
   length=align(length,alignment);const offset=length;length+=fragment.bytes.length;
   return {fragment,offset};
  });
  sections.push({name,offset:next,length,flags,fragments});next=align(next+Math.max(length,1),page);
 }
 if(sections.reduce((sum,section)=>sum+section.fragments.length,0)!==program.fragments.length)throw new Error('Unsupported ELF section');
 if(!Number.isSafeInteger(base+next)||next>0xffffffff)throw new RangeError('ELF address range exceeds exact representation');
 const symbols=new Map<string,number>();
 const put=(name:string,address:number)=>{if(symbols.has(name))throw new Error(`Duplicate symbol ${name}`);symbols.set(name,address);};
 for(const section of sections)for(const {fragment,offset} of section.fragments){
  const address=base+section.offset+offset;put(fragment.name,address);
  for(const [label,position] of Object.entries(fragment.symbols)){
   if(!Number.isInteger(position)||position<0||position>fragment.bytes.length)throw new Error('Symbol offset out of bounds');
   if(label!==fragment.name||position!==0)put(label,address+position);
  }
 }
 // NONA_ELF_MAP=<file>: write the symbol table as JSON, for profiling tools.
 if(process.env.NONA_ELF_MAP)writeFileSync(process.env.NONA_ELF_MAP,JSON.stringify(Object.fromEntries(symbols)));
 const entry=symbols.get(program.entry);
 const code=sections.find(section=>section.name==='.text');
 if(entry===undefined||!code||entry<base+code.offset||entry>=base+code.offset+code.length)throw new Error('ELF entry is outside executable code');
 const pins=options.syscallPins??[];
 if(os==='openbsd'&&!pins.length)throw new Error('OpenBSD ELF requires syscall locations');
 const pinOffset=next,pinSize=pins.length*8;
 const image=new Uint8Array(next+pinSize),view=new DataView(image.buffer);
 for(const section of sections)for(const {fragment,offset} of section.fragments){
  const file=section.offset+offset;image.set(fragment.bytes,file);
  for(const fixup of fragment.fixups){
   const width=fixup.kind==='va64'?8:4;
   if(!Number.isInteger(fixup.offset)||fixup.offset<0||fixup.offset+width>fragment.bytes.length)throw new Error('Fixup out of bounds');
   if(!Number.isSafeInteger(fixup.addend))throw new Error('Fixup addend out of range');
   const target=symbols.get(fixup.target);
   if(target===undefined)throw new Error(`Unknown symbol ${fixup.target}`);
   const place=base+file+fixup.offset,at=file+fixup.offset,resolved=target+fixup.addend;
   if(!Number.isSafeInteger(resolved)||resolved<0)throw new RangeError('ELF relocation address out of range');
   if(fixup.kind==='rel32')view.setInt32(at,checkedRel32(resolved-place-4),true);
   else if(fixup.kind==='rva32')view.setUint32(at,u32(resolved-base),true);
   else if(fixup.kind==='va64')view.setBigUint64(at,BigInt(resolved),true);
   else if(isArm64Relocation(fixup.kind)){
    if(machine!=='arm64')throw new Error('ARM64 relocation requires ARM64 architecture');
    view.setUint32(at,relocateArm64(fixup.kind,view.getUint32(at,true),place,resolved),true);
   }
   else throw new Error('Unknown ELF fixup');
  }
 }
 for(const [index,pin] of pins.entries()){
  const address=symbols.get(pin.symbol),resolved=address===undefined?undefined:address+pin.offset;
  if(!Number.isInteger(pin.offset)||pin.offset<0||resolved===undefined||!code||resolved<base+code.offset||resolved+2>base+code.offset+code.length||
     !Number.isInteger(pin.number)||pin.number<=0||pin.number>=65536)throw new Error('Invalid ELF syscall location');
  const instruction=resolved-base;
  if(image[instruction]!==0x0f||image[instruction+1]!==0x05)throw new Error('ELF syscall location is not a syscall instruction');
  // ET_EXEC locations are absolute virtual addresses; the OpenBSD loader
  // subtracts its executable text base when constructing the pin table.
  view.setUint32(pinOffset+index*8,u32(resolved),true);view.setUint32(pinOffset+index*8+4,pin.number,true);
 }
 const headers=sections.length+1+(pins.length?1:0)+(os==='openbsd'?1:0);
 const noteOffset=64+56*headers;
 if(noteOffset+(os==='openbsd'?24:0)>page)throw new Error('ELF program headers exceed first page');
 image.set([0x7f,0x45,0x4c,0x46,2,1,1],0);
 image[7]=os==='freebsd'?9:os==='openbsd'?12:0;
 view.setUint16(16,2,true);view.setUint16(18,machine==='arm64'?183:62,true);view.setUint32(20,1,true);
 view.setBigUint64(24,BigInt(entry),true);view.setBigUint64(32,64n,true);
 view.setUint16(52,64,true);view.setUint16(54,56,true);view.setUint16(56,headers,true);
 const segment=(index:number,offset:number,length:number,flags:number)=>{
  const at=64+index*56;view.setUint32(at,1,true);view.setUint32(at+4,flags,true);
  view.setBigUint64(at+8,BigInt(offset),true);view.setBigUint64(at+16,BigInt(base+offset),true);
  view.setBigUint64(at+24,BigInt(base+offset),true);view.setBigUint64(at+32,BigInt(length),true);
  view.setBigUint64(at+40,BigInt(length),true);view.setBigUint64(at+48,BigInt(page),true);
 };
 segment(0,0,page,4);sections.forEach((section,index)=>segment(index+1,section.offset,section.length,section.flags));
 if(os==='openbsd'){
  // Released kernels validate the OpenBSD PT_NOTE before checking EI_OSABI.
  const at=64+(sections.length+1)*56;view.setUint32(at,4,true);view.setUint32(at+4,4,true);
  view.setBigUint64(at+8,BigInt(noteOffset),true);view.setBigUint64(at+16,BigInt(base+noteOffset),true);
  view.setBigUint64(at+32,24n,true);view.setBigUint64(at+40,24n,true);view.setBigUint64(at+48,4n,true);
  view.setUint32(noteOffset,8,true);view.setUint32(noteOffset+4,4,true);view.setUint32(noteOffset+8,1,true);
  image.set(new TextEncoder().encode('OpenBSD\0'),noteOffset+12);
 }
 if(pins.length){
  const at=64+(headers-1)*56;view.setUint32(at,0x65a3dbe9,true);view.setUint32(at+4,4,true);
  view.setBigUint64(at+8,BigInt(pinOffset),true);view.setBigUint64(at+32,BigInt(pinSize),true);view.setBigUint64(at+48,4n,true);
 }
 return image;
}
