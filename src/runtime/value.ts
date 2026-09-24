import type {NamedFragment} from '../backend/pe/model.js';
export const ValueTag={Undefined:0,Null:1,Boolean:2,Number:3,String:4,Object:5,Uninitialized:255} as const;
export const VALUE_SIZE=16;
export function stringLiteral(name:string,text:string):NamedFragment {const bytes=new Uint8Array(8+text.length*2);const d=new DataView(bytes.buffer);d.setBigUint64(0,BigInt(text.length),true);for(let i=0;i<text.length;i++)d.setUint16(8+i*2,text.charCodeAt(i),true);return {name,section:'.rdata',alignment:8,bytes,fixups:[],symbols:{}};}
