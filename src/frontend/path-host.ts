import {getTarget,type Target} from '../target.js';

/** Path reads cwd and Windows drive directories without building process. */
export function pathHostSource(target:Target):string {
 const os=getTarget(target)!.os;
 const overrides=String.raw`
// Observe an explicitly initialized process without requesting its prelude.
// The split key keeps this optional query out of lexical runtime selection.
const pathProcessKey='pro'+'cess',pathOwnDescriptor=Object.getOwnPropertyDescriptor;
function pathExistingProcess(){const descriptor=pathOwnDescriptor(globalThis,pathProcessKey);return descriptor&&descriptor.value;}
`;
 if(os==='win32')return `import {define} from 'nona:ffi';\n${overrides}`+String.raw`
const pathGetCwd=define('KERNEL32.dll','GetCurrentDirectoryW','u32(u32,buf)');
const pathGetDrive=define('KERNEL32.dll','GetEnvironmentVariableW','u32(buf,buf,u32)');
function pathFromWide(units,length){let text='';for(let i=0;i<length;i++)text+=String.fromCharCode(units[i]);return text;}
function pathWideKey(text){const units=new Uint16Array(text.length+1);for(let i=0;i<text.length;i++)units[i]=text.charCodeAt(i);return units;}
const pathHost={platform:'win32',env:{},cwd:function(){
 const initialized=pathExistingProcess();if(initialized&&typeof initialized.cwd==='function')return initialized.cwd();
 let size=256;while(size<=1048576){const buffer=new Uint16Array(size),length=pathGetCwd(size,buffer);if(!length)throw new Error('Unable to read current working directory');if(length<size)return pathFromWide(buffer,length);size=length+1;}
 throw new RangeError('Current working directory exceeds supported buffer size');
},driveDirectory:function(device){
 const key='='+device,initialized=pathExistingProcess();if(initialized&&initialized.env)return initialized.env[key];
 const name=pathWideKey(key);let size=256;
 while(size<=1048576){const buffer=new Uint16Array(size),length=pathGetDrive(name,buffer,size);if(!length)return undefined;if(length<size)return pathFromWide(buffer,length);size=length+1;}
 throw new RangeError('Drive working directory exceeds supported buffer size');
}};
`;
 if(os==='linux')return `import {define} from 'nona:ffi';\n${overrides}
const pathGetCwd=define('syscall','${target==='linux-arm64'?17:79}','i64(buf,u64)');
const pathHost={platform:'linux',env:{},driveDirectory:function(device){const initialized=pathExistingProcess();return initialized&&initialized.env?initialized.env['='+device]:undefined;},cwd:function(){
 const initialized=pathExistingProcess();if(initialized&&typeof initialized.cwd==='function')return initialized.cwd();
 let size=4096;
 while(size<=1048576){
  const buffer=new Uint8Array(size),result=pathGetCwd(buffer,size);
  if(result>=0){let end=0;while(end<buffer.length&&buffer[end]!==0)end++;return new TextDecoder().decode(buffer.subarray(0,end));}
  if(result===-34||result===-12){size*=2;continue;}
  const error=new Error('Unable to read current working directory');error.code=result===-2?'ENOENT':result===-13?'EACCES':'UNKNOWN';error.errno=result;error.syscall='getcwd';throw error;
 }
 throw new RangeError('Current working directory exceeds supported buffer size');
}};\n`;
 const declarations=os==='darwin'?String.raw`
const pathOpen=define('syscall','5','i64(buf,i32,i32)');
const pathFcntl=define('syscall','92','i64(i32,i32,buf)');
const pathClose=define('syscall','6','i64(i32)');
function pathGetCwd(buffer) {
 const fd=pathOpen(new Uint8Array([46,0]),0,0);
 if(fd<0)return fd;
 try{return pathFcntl(fd,50,buffer);}finally{pathClose(fd);}
}
`:`const pathGetCwd=define('syscall','${os==='freebsd'?326:304}','i64(buf,u64)');\n`;
 return `import {define} from 'nona:ffi';\n${overrides}${declarations}
const pathHost={platform:'${os}',env:{},driveDirectory:function(device){const initialized=pathExistingProcess();return initialized&&initialized.env?initialized.env['='+device]:undefined;},cwd:function(){
 const initialized=pathExistingProcess();if(initialized&&typeof initialized.cwd==='function')return initialized.cwd();
 let size=4096;
 while(size<=1048576){
  const buffer=new Uint8Array(size),result=pathGetCwd(buffer,size);
  if(result>=0){let end=0;while(end<buffer.length&&buffer[end]!==0)end++;return new TextDecoder().decode(buffer.subarray(0,end));}
  if(result===-34||result===-12){size*=2;continue;}
  const error=new Error('Unable to read current working directory');
  error.code=result===-2?'ENOENT':result===-13?'EACCES':'UNKNOWN';error.errno=result;error.syscall='getcwd';throw error;
 }
 const error=new Error('Current working directory exceeds supported buffer size');error.code='ERANGE';error.syscall='getcwd';throw error;
}};\n`;
}
