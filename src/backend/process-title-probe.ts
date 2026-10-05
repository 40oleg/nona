import type {Target} from '../target.js';

/** Query independent OS title state, so a cached JavaScript value cannot pass. */
export function processTitleProbe(target:Target):{source:string;expected:string} {
 const common='const wanted="ntit_729",argv=JSON.stringify(process.argv),env=process.env.NONA_TITLE_KEEP;process.title=wanted;console.log(process.title===wanted,JSON.stringify(process.argv)===argv,process.env.NONA_TITLE_KEEP===env);';
 const decode='function text(bytes,start=0){let end=start;while(end<bytes.length&&bytes[end]!==0)end++;return new TextDecoder().decode(bytes.subarray(start,end))}';
 if(target.startsWith('win32-'))return {source:`import {define} from 'nona:ffi';
 console.log(process.title===process.execPath);process.title='headless title';console.log(process.title==='headless title');
 const getTitle=define('KERNEL32.dll','GetConsoleTitleW','u32(buf,u32)'),allocate=define('KERNEL32.dll','AllocConsole','bool()'),getHandle=define('KERNEL32.dll','GetStdHandle','ptr(i32)'),setHandle=define('KERNEL32.dll','SetStdHandle','bool(i32,ptr)'),getError=define('KERNEL32.dll','GetLastError','u32()'),clearError=define('KERNEL32.dll','SetLastError','void(u32)');
 let saved=new Uint16Array(65536);clearError(0);let n=getTitle(saved,saved.length);if(!n&&getError()!==0){let out=getHandle(-11),err=getHandle(-12);if(!allocate())throw Error('AllocConsole failed');if(!setHandle(-11,out)||!setHandle(-12,err))throw Error('SetStdHandle failed')}
 ${common}
 let units=new Uint16Array(65536),length=getTitle(units,units.length),actual='';for(let i=0;i<length;i++)actual+=String.fromCharCode(units[i]);console.log(actual===wanted);let original='';for(let i=0;i<n;i++)original+=String.fromCharCode(saved[i]);process.title=original;`,expected:'true\ntrue\ntrue true true\ntrue\n'};
 if(target.startsWith('linux-'))return {source:`import {define} from 'nona:ffi';import {readFileSync} from 'node:fs';
 const prctl=define('syscall','${target==='linux-arm64'?167:157}','i32(i32,buf,u64,u64,u64)');${common}${decode}
 let kernel=new Uint8Array(16);if(prctl(16,kernel,0,0,0)!==0)throw Error('prctl failed');console.log(text(kernel)===wanted,text(readFileSync('/proc/self/cmdline'))===wanted);`,expected:'true true true\ntrue true\n'};
 const query=`import {define} from 'nona:ffi';const sysctl=define('syscall','202','i32(buf,u32,buf,buf,buf,u64)');${common}${decode}`;
 if(target==='freebsd-x64')return {source:query+`let bytes=new Uint8Array(4096),length=new Uint32Array([bytes.length,0]);if(sysctl(new Int32Array([1,14,7,-1]),4,bytes,length,null,0)!==0)throw Error('sysctl title failed');console.log(text(bytes)===wanted);`,expected:'true true true\ntrue\n'};
 if(target.startsWith('darwin-'))return {source:query+`let mib=new Int32Array([1,49,process.pid]),length=new Uint32Array(2);if(sysctl(mib,3,null,length,null,0)!==0||length[1]!==0||length[0]<4||length[0]>1048576)throw Error('sysctl title size failed');let bytes=new Uint8Array(length[0]);if(sysctl(mib,3,bytes,length,null,0)!==0)throw Error('sysctl title failed');let i=4;while(i<bytes.length&&bytes[i]!==0)i++;while(i<bytes.length&&bytes[i]===0)i++;console.log(text(bytes,i)===wanted);`,expected:'true true true\ntrue\n'};
 return {source:query+`const write=define('syscall','4','i64(i32,ptr,u64)');let bytes=new Uint8Array(4096),length=new Uint32Array([bytes.length,0]);if(sysctl(new Int32Array([1,55,process.pid,1]),4,bytes,length,null,0)!==0)throw Error('sysctl title failed');let words=new Uint32Array(bytes.buffer),address=words[0]+words[1]*4294967296;if(write(1,address,wanted.length)!==wanted.length)throw Error('write title failed');console.log('');console.log(bytes.byteLength===4096);`,expected:'true true true\nntit_729\ntrue\n'};
}
