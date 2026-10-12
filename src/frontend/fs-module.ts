import type {Target} from '../target.js';
import {CompileError} from '../diagnostics.js';
import {patchSource} from '../source-patch.js';
import {modulesFsCommon,modulesFsWin32,modulesFsLinux} from '../lib/sources.generated.js';
/**
 * Source of the built-in `nona:fs` (alias `node:fs`) module: a synchronous
 * subset of Node.js fs. A small platform layer (Win32 through nona:ffi, Linux
 * through raw system calls) sits under a shared JavaScript implementation.
 */
const common=modulesFsCommon;

const win32=modulesFsWin32;

const linux=modulesFsLinux;


/** AArch64's asm-generic table uses *at calls and a distinct stat layout. */
function linuxArm64Source():string {
 const replacements:Record<string,string>={
  "const sysRead = define('syscall', '0'":"const sysRead = define('syscall', '63'",
  "const sysWrite = define('syscall', '1'":"const sysWrite = define('syscall', '64'",
  "const sysClose = define('syscall', '3'":"const sysClose = define('syscall', '57'",
  "const sysFstat = define('syscall', '5'":"const sysFstat = define('syscall', '80'",
  "const sysGetdents = define('syscall', '217'":"const sysGetdents = define('syscall', '61'",
  "const sysOpen = define('syscall', '2', 'i64(buf,i64,i64)');":"const openat = define('syscall', '56', 'i64(i64,buf,i64,i64)');function sysOpen(path,flags,mode){return openat(-100,path,flags,mode)}",
  "const sysStat = define('syscall', '4', 'i64(buf,buf)');":"const statat = define('syscall', '79', 'i64(i64,buf,buf,i64)');function sysStat(path,buffer){return statat(-100,path,buffer,0)}",
  "const sysLstat = define('syscall', '6', 'i64(buf,buf)');":"function sysLstat(path,buffer){return statat(-100,path,buffer,256)}",
  "const sysReadlink = define('syscall','89','i64(buf,buf,i64)');":"const readlinkat=define('syscall','78','i64(i64,buf,buf,i64)');function sysReadlink(path,buffer,size){return readlinkat(-100,path,buffer,size)}",
  "const sysRename = define('syscall', '82', 'i64(buf,buf)');":"const renameat = define('syscall', '276', 'i64(i64,buf,i64,buf,i64)');function sysRename(from,to){return renameat(-100,from,-100,to,0)}",
  "const sysMkdir = define('syscall', '83', 'i64(buf,i64)');":"const mkdirat = define('syscall', '34', 'i64(i64,buf,i64)');function sysMkdir(path,mode){return mkdirat(-100,path,mode)}",
  "const sysRmdir = define('syscall', '84', 'i64(buf)');":"const unlinkat = define('syscall', '35', 'i64(i64,buf,i64)');function sysRmdir(path){return unlinkat(-100,path,512)}",
  "const sysUnlink = define('syscall', '87', 'i64(buf)');":"function sysUnlink(path){return unlinkat(-100,path,0)}",
  'getUint32(24, true)':'getUint32(16, true)',
  'O_DIRECTORY = 0x10000':'O_DIRECTORY = 0x4000',
 };
 let source=linux;for(const [from,to] of Object.entries(replacements))source=patchSource(source,from,to);return source;
}

/** Native 64-bit BSD/Darwin ABIs; filesystem algorithms remain our own. */
function bsdSource(target:Target):string {
 const darwin=target.startsWith('darwin-'),freebsd=target==='freebsd-x64';
 const calls:Record<string,string>={sysRead:'3',sysWrite:'4',sysOpen:'5',sysClose:'6',sysFstat:darwin?'339':freebsd?'551':'53',sysRename:'128',sysMkdir:'136',sysRmdir:'137',sysUnlink:'10',sysReadlink:'58'};
 let source=linux;
 for(const [name,number] of Object.entries(calls))source=patchSource(source,new RegExp("const "+name+" =? ?define\\('syscall', ?'\\d+'"),"const "+name+" = define('syscall', '"+number+"'");
 if(freebsd){
  source=patchSource(source,"const sysStat = define('syscall', '4', 'i64(buf,buf)');","const statat=define('syscall','552','i64(i64,buf,buf,i64)');function sysStat(path,buffer){return statat(-100,path,buffer,0)}");
  source=patchSource(source,"const sysLstat = define('syscall', '6', 'i64(buf,buf)');","function sysLstat(path,buffer){return statat(-100,path,buffer,512)}");
 }else{
  source=patchSource(source,"const sysStat = define('syscall', '4'","const sysStat = define('syscall', '"+(darwin?'338':'38')+"'");
  source=patchSource(source,"const sysLstat = define('syscall', '6'","const sysLstat = define('syscall', '"+(darwin?'340':'40')+"'");
 }
 source=patchSource(source,"const sysGetdents = define('syscall', '217', 'i64(i64,buf,i64)');",darwin||freebsd?
  "const getdirentries=define('syscall','"+(darwin?'344':'554')+"','i64(i64,buf,i64,buf)');const directoryPosition=new Uint8Array(8);function sysGetdents(fd,buffer,size){return getdirentries(fd,buffer,size,directoryPosition)}":
  "const sysGetdents=define('syscall','99','i64(i64,buf,i64)');");
 source=patchSource(source,'O_CREAT = 0x40, O_TRUNC = 0x200, O_APPEND = 0x400, O_DIRECTORY = 0x10000, O_CLOEXEC = 0x80000',
  'O_CREAT = 0x200, O_TRUNC = 0x400, O_APPEND = 8, O_DIRECTORY = '+(darwin?'0x100000':'0x20000')+', O_CLOEXEC = '+(darwin?'0x1000000':freebsd?'0x100000':'0x10000'));
 source=patchSource(patchSource(source,'exclusive?0x80:0','exclusive?0x800:0'),"39: 'ENOTEMPTY'","66: 'ENOTEMPTY'");
 source=patchSource(source,'const statBuffer = new Uint8Array(144)','const statBuffer = new Uint8Array(256)');
 const modeOffset=darwin?4:freebsd?24:0,sizeOffset=darwin?96:freebsd?112:80,timeOffset=freebsd?64:48;
 const modeRead=darwin||freebsd?'getUint16':'getUint32';
 source=patchSource(source,/function statResult\(\) \{[\s\S]*?\n\}/,`function statResult(){
  const mode=statView.${modeRead}(${modeOffset},true),type=mode&0o170000;
  return {kind:type===0o040000?'dir':type===0o100000?'file':type===0o120000?'link':'other',
   size:Number(statView.getBigInt64(${sizeOffset},true)),mtimeMs:Number(statView.getBigInt64(${timeOffset},true))*1000+Number(statView.getBigInt64(${timeOffset+8},true))/1e6,mode,
   dev:${freebsd?'statView.getBigUint64(0,true)':'BigInt(statView.getUint32('+(darwin?0:4)+',true))'},ino:statView.getBigUint64(8,true)};
 }`);
 // d_name starts after the ABI-specific directory entry header, not Linux's.
 const nameOffset=darwin?21:24;
 source=patchSource(source,'offset + 19','offset + '+nameOffset,{all:true});
 return source;
}

export function fsModuleSource(target:Target):string {
  if(target.startsWith('darwin-')||target==='freebsd-x64'||target==='openbsd-x64')return bsdSource(target)+common;
  const supported:string[]=['win32-x64','win32-arm64','linux-x64','linux-arm64','darwin-x64','darwin-arm64','freebsd-x64','openbsd-x64'];
  if(!supported.includes(target))throw new CompileError([{code:'E_HOST_MODULE',file:'node:fs',span:{start:0,end:0},message:`Filesystem adapter is not implemented for ${target}`}]);
  return (target==='linux-arm64'?linuxArm64Source():target==='linux-x64'?linux:win32)+common;
}
