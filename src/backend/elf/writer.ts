import type {NativeProgram,NamedFragment} from '../pe/model.js';
import {checkedRel32} from '../x64/encoder.js';

const base=0x400000;
const page=4096;
const align=(value:number,boundary:number)=>Math.ceil(value/boundary)*boundary;
const u32=(value:number)=>{
 if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new RangeError('ELF32 field out of range');
 return value;
};
type Section={name:NamedFragment['section'];offset:number;length:number;flags:number;fragments:{fragment:NamedFragment;offset:number}[]};

/** Link a fixed-address ELF64/x86-64 executable from target-independent fragments.
 * Native imports must be replaced by Linux runtime shims before this linker runs.
 */
export function linkElf(program:NativeProgram):Uint8Array {
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
 const symbols=new Map<string,number>();
 const put=(name:string,address:number)=>{if(symbols.has(name))throw new Error(`Duplicate symbol ${name}`);symbols.set(name,address);};
 for(const section of sections)for(const {fragment,offset} of section.fragments){
  const address=base+section.offset+offset;put(fragment.name,address);
  for(const [label,position] of Object.entries(fragment.symbols)){
   if(!Number.isInteger(position)||position<0||position>fragment.bytes.length)throw new Error('Symbol offset out of bounds');
   if(label!==fragment.name||position!==0)put(label,address+position);
  }
 }
 const entry=symbols.get(program.entry);
 const code=sections.find(section=>section.name==='.text');
 if(entry===undefined||!code||entry<base+code.offset||entry>=base+code.offset+code.length)throw new Error('ELF entry is outside executable code');
 const image=new Uint8Array(next),view=new DataView(image.buffer);
 for(const section of sections)for(const {fragment,offset} of section.fragments){
  const file=section.offset+offset;image.set(fragment.bytes,file);
  for(const fixup of fragment.fixups){
   const width=fixup.kind==='va64'?8:4;
   if(!Number.isInteger(fixup.offset)||fixup.offset<0||fixup.offset+width>fragment.bytes.length)throw new Error('Fixup out of bounds');
   if(!Number.isSafeInteger(fixup.addend))throw new Error('Fixup addend out of range');
   const target=symbols.get(fixup.target);
   if(target===undefined)throw new Error(`Unknown symbol ${fixup.target}`);
   const place=base+file+fixup.offset,at=file+fixup.offset,resolved=target+fixup.addend;
   if(fixup.kind==='rel32')view.setInt32(at,checkedRel32(resolved-place-4),true);
   else if(fixup.kind==='rva32')view.setUint32(at,u32(resolved-base),true);
   else if(fixup.kind==='va64')view.setBigUint64(at,BigInt(resolved),true);
   else throw new Error('Unknown ELF fixup');
  }
 }
 const headers=sections.length+1;
 if(64+56*headers>page)throw new Error('ELF program headers exceed first page');
 image.set([0x7f,0x45,0x4c,0x46,2,1,1],0);
 view.setUint16(16,2,true);view.setUint16(18,62,true);view.setUint32(20,1,true);
 view.setBigUint64(24,BigInt(entry),true);view.setBigUint64(32,64n,true);
 view.setUint16(52,64,true);view.setUint16(54,56,true);view.setUint16(56,headers,true);
 const segment=(index:number,offset:number,length:number,flags:number)=>{
  const at=64+index*56;view.setUint32(at,1,true);view.setUint32(at+4,flags,true);
  view.setBigUint64(at+8,BigInt(offset),true);view.setBigUint64(at+16,BigInt(base+offset),true);
  view.setBigUint64(at+24,BigInt(base+offset),true);view.setBigUint64(at+32,BigInt(length),true);
  view.setBigUint64(at+40,BigInt(length),true);view.setBigUint64(at+48,BigInt(page),true);
 };
 segment(0,0,page,4);sections.forEach((section,index)=>segment(index+1,section.offset,section.length,section.flags));
 return image;
}
