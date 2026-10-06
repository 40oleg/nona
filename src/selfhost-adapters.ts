import type {Target} from './target.js';

/** Private compiler services; these are not a public node:crypto provider. */
export function compilerCryptoSource(target:Target):string {
 const entropy=target.startsWith('win32-')?String.raw`
import {define} from 'nona:ffi';
const random=define('bcrypt.dll','BCryptGenRandom','i32(ptr,buf,u32,u32)');
function randomBytes(size){const bytes=new Uint8Array(size);if(random(null,bytes,size,2)!==0)throw new Error('Cannot obtain OS entropy');return bytes;}
`:String.raw`
import {define} from 'nona:ffi';
const open=define('syscall','${target==='linux-arm64'?'56':target==='linux-x64'?'2':'5'}','${target==='linux-arm64'?'i64(i64,buf,i64,i64)':'i64(buf,i64,i64)'}');
const read=define('syscall','${target==='linux-arm64'?'63':target==='linux-x64'?'0':'3'}','i64(i64,buf,i64)');
const close=define('syscall','${target==='linux-arm64'?'57':target==='linux-x64'?'3':'6'}','i64(i64)');
function randomBytes(size){
 const path=new TextEncoder().encode('/dev/urandom\0'),fd=${target==='linux-arm64'?'open(-100,path,0,0)':'open(path,0,0)'};
 if(fd<0)throw new Error('Cannot open OS entropy source');
 try{const bytes=new Uint8Array(size);let at=0;while(at<size){const count=read(fd,bytes.subarray(at),size-at);if(count===-4)continue;if(count<=0)throw new Error('Cannot read OS entropy');at+=count;}return bytes;}finally{close(fd);}
}
`;
 return entropy+String.raw`
import {sha256} from './backend/macho/sha256.js';
export function createHash(algorithm){
 if(algorithm!=='sha256')throw new Error('Unsupported compiler hash: '+algorithm);
 const chunks=[];let length=0,finished=false;
 return {update(value){if(finished)throw new Error('Hash already finalized');const bytes=typeof value==='string'?new TextEncoder().encode(value):Uint8Array.from(value);chunks.push(bytes);length+=bytes.length;return this;},
 digest(encoding){if(finished)throw new Error('Hash already finalized');finished=true;const input=new Uint8Array(length);let at=0;for(const chunk of chunks){input.set(chunk,at);at+=chunk.length;}const output=sha256(input);return encoding==='hex'?Buffer.from(output).toString('hex'):Buffer.from(output);}};
}
export function randomUUID(){const bytes=randomBytes(16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const text=Buffer.from(bytes).toString('hex');return text.slice(0,8)+'-'+text.slice(8,12)+'-'+text.slice(12,16)+'-'+text.slice(16,20)+'-'+text.slice(20);}
`;
}

/** File URL construction needed for compiler coverage output. */
export const compilerUrlSource=String.raw`
import {resolve} from 'node:path';
export function pathToFileURL(value){
 let path=resolve(value),host='';
 if(process.platform==='win32'){
  path=path.replaceAll('\\','/');
  if(path.startsWith('//')){const end=path.indexOf('/',2);host=path.slice(2,end<0?undefined:end).toLowerCase();path=end<0?'/':path.slice(end);}
  else path='/'+path;
 }
 path=new TextDecoder().decode(new TextEncoder().encode(path));
 const encoded=encodeURI(path).replaceAll('#','%23').replaceAll('?','%3F');
 return {href:'file://'+host+encoded};
}
`;
