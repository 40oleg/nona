import {createHash} from 'node:crypto';

const page=4096,header=88,identifier=new TextEncoder().encode('nona\0');
const hashOffset=Math.ceil((header+identifier.length)/8)*8;
/** One CodeDirectory in a SuperBlob, padded to 16 bytes for LC_CODE_SIGNATURE. */
export function signatureSize(codeLimit:number):number {
  return Math.ceil((20+hashOffset+32*Math.ceil(codeLimit/page))/16)*16;
}
/** Ad-hoc SHA-256 signature over final, relocated bytes; no signing identity. */
export function adHocSignature(code:Uint8Array,textSize:number):Uint8Array {
  const slots=Math.ceil(code.length/page),directorySize=hashOffset+32*slots;
  const bytes=new Uint8Array(signatureSize(code.length)),v=new DataView(bytes.buffer),directory=20;
  v.setUint32(0,0xfade0cc0);v.setUint32(4,20+directorySize);v.setUint32(8,1);
  v.setUint32(12,0);v.setUint32(16,directory);
  v.setUint32(directory,0xfade0c02);v.setUint32(directory+4,directorySize);
  v.setUint32(directory+8,0x20400);v.setUint32(directory+12,2);
  v.setUint32(directory+16,hashOffset);v.setUint32(directory+20,header);
  v.setUint32(directory+28,slots);v.setUint32(directory+32,code.length);
  bytes[directory+36]=32;bytes[directory+37]=2;bytes[directory+39]=12;
  v.setBigUint64(directory+64,0n);v.setBigUint64(directory+72,BigInt(textSize));v.setBigUint64(directory+80,1n);
  bytes.set(identifier,directory+header);
  for(let i=0;i<slots;i++)bytes.set(createHash('sha256').update(code.subarray(i*page,Math.min((i+1)*page,code.length))).digest(),directory+hashOffset+i*32);
  return bytes;
}
