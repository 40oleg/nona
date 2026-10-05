import {getTarget,type Target} from '../target.js';

/** Only cwd/platform are needed by path; Darwin/BSD do not require process. */
export function pathHostSource(target:Target):string {
 const os=getTarget(target)!.os;
 if(os==='win32'||os==='linux')return 'const pathHost=globalThis.process;\n';
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
 return `import {define} from 'nona:ffi';\n${declarations}
const pathHost={platform:'${os}',env:{},cwd:function(){
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
