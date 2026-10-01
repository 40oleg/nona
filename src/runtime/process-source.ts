// The global `process` object (argv, env, exit, exitCode, execPath, platform,
// pid, cwd). Host functions are FFI thunks installed per target by the code
// generator as __nonaHost_* globals; the prelude captures and removes them.
// It wraps the Promise drain (or event loop) so a set exitCode is used at exit.
export const processPreludeSource=String.raw`
__nonaPromiseDrainJobs=(function(drain){
  var names=['lstrlenW','RtlMoveMemory','GetCommandLineW','GetEnvironmentStringsW','FreeEnvironmentStringsW','GetModuleFileNameW','ExitProcess','GetCurrentProcessId','GetCurrentDirectoryW',
    'sys_open','sys_read','sys_close','sys_readlink','sys_exit','sys_getpid','sys_getcwd'];
  var host={},found=false;
  for(var i=0;i<names.length;i++){
    var name='__nonaHost_'+names[i];
    if(typeof globalThis[name]==='function'){host[names[i]]=globalThis[name];found=true;delete globalThis[name]}
  }
  // Cloned realms (Test262) have no host functions.
  if(!found)return drain;
  var defineProperty=Object.defineProperty,fromCharCode=String.fromCharCode,apply=Reflect.apply;
  // Both targets' host functions exist; the other target's ones return 0.
  var windows=host.GetCommandLineW()!==0;
  function wide(pointer,length){
    var units=new Uint16Array(length);host.RtlMoveMemory(units,pointer,length*2);
    var out='',chunk=[],k=0;
    for(var i=0;i<length;i++){chunk[k++]=units[i];if(k===4096){out+=apply(fromCharCode,undefined,chunk);chunk=[];k=0}}
    return out+apply(fromCharCode,undefined,chunk)
  }
  function fromUnits(units,length){
    var out='';for(var i=0;i<length;i++)out+=fromCharCode(units[i]);return out
  }
  // CommandLineToArgvW rules: the program name ends at the next quote or
  // whitespace; later arguments handle backslashes before quotes and "".
  function parseCommandLine(line){
    var args=[],i=0,n=line.length,arg='';
    if(line[0]==='"'){i=1;while(i<n&&line[i]!=='"')arg+=line[i++];i++}
    else while(i<n&&line[i]!==' '&&line[i]!=='\t')arg+=line[i++];
    args[args.length]=arg;
    for(;;){
      while(i<n&&(line[i]===' '||line[i]==='\t'))i++;
      if(i>=n)break;
      var quoted=false;arg='';
      while(i<n){
        var c=line[i];
        if(c==='\\'){
          var slashes=0;while(i<n&&line[i]==='\\'){slashes++;i++}
          if(line[i]==='"'){
            for(var s=0;s<slashes>>1;s++)arg+='\\';
            if(slashes%2){arg+='"';i++}
          }else for(var t=0;t<slashes;t++)arg+='\\';
          continue
        }
        if(c==='"'){
          if(quoted&&line[i+1]==='"'){arg+='"';i+=2;continue}
          quoted=!quoted;i++;continue
        }
        if(!quoted&&(c===' '||c==='\t'))break;
        arg+=c;i++
      }
      args[args.length]=arg
    }
    return args
  }
  var decoder=new TextDecoder(),encoder=new TextEncoder(),created=null;
  // Built on first access, so programs that never use process pay nothing at startup.
  function build(){
    function cstring(text){var bytes=encoder.encode(text),out=new Uint8Array(bytes.length+1);out.set(bytes);return out}
    function readProc(path){
      var fd=host.sys_open(cstring(path),0x80000,0);
      if(fd<0)return new Uint8Array(0);
      var chunks=[],total=0;
      for(;;){
        var chunk=new Uint8Array(65536),n=host.sys_read(fd,chunk,chunk.length);
        if(n<=0)break;
        chunks[chunks.length]=chunk.subarray(0,n);total+=n
      }
      host.sys_close(fd);
      var out=new Uint8Array(total),offset=0;
      for(var j=0;j<chunks.length;j++){out.set(chunks[j],offset);offset+=chunks[j].length}
      return out
    }
    function splitNul(bytes){
      var list=[],start=0;
      for(var i=0;i<bytes.length;i++)if(bytes[i]===0){list[list.length]=decoder.decode(bytes.subarray(start,i));start=i+1}
      if(start<bytes.length)list[list.length]=decoder.decode(bytes.subarray(start));
      return list
    }
    var execPath,commandLine,environment;
    if(windows){
      var path=new Uint16Array(32768),length=host.GetModuleFileNameW(null,path,32768);
      execPath=fromUnits(path,length);
      var line=host.GetCommandLineW();
      commandLine=parseCommandLine(wide(line,host.lstrlenW(line)));
      environment=[];
      var block=host.GetEnvironmentStringsW();
      if(block){
        for(var p=block;;){
          var len=host.lstrlenW(p);if(len===0)break;
          environment[environment.length]=wide(p,len);p+=(len+1)*2
        }
        host.FreeEnvironmentStringsW(block)
      }
    }else{
      var link=new Uint8Array(4096),linkLength=host.sys_readlink(cstring('/proc/self/exe'),link,link.length);
      execPath=linkLength>0?decoder.decode(link.subarray(0,linkLength)):'';
      commandLine=splitNul(readProc('/proc/self/cmdline'));
      environment=splitNul(readProc('/proc/self/environ'));
    }
    var argv=[execPath];
    for(var a=1;a<commandLine.length;a++)argv[argv.length]=commandLine[a];
    var env={};
    for(var e=0;e<environment.length;e++){
      var entry=environment[e],eq=entry.indexOf('=',1);
      // Windows keeps per-drive directories as "=C:=C:\\..."; Node.js hides them.
      if(eq<=0)continue;
      var key=entry.slice(0,eq);
      if(windows){var upper=key.toUpperCase(),known=false;for(var existing in env)if(existing.toUpperCase()===upper){known=true;break}if(known)continue}
      env[key]=entry.slice(eq+1)
    }
    function exitNow(code){
      code=code===undefined?(created.exitCode===undefined?0:created.exitCode):code;
      code=(Number(code)|0)>>>0;
      if(windows)host.ExitProcess(code);else host.sys_exit(code&255);
      throw new Error('exit failed')
    }
    function cwd(){
      if(windows){
        var buffer=new Uint16Array(32768),n=host.GetCurrentDirectoryW(32768,buffer);return fromUnits(buffer,n)
      }
      var bytes=new Uint8Array(4096),r=host.sys_getcwd(bytes,bytes.length);
      if(r<0)throw new Error('ENOENT: process.cwd failed');
      var end=0;while(bytes[end]!==0)end++;
      return decoder.decode(bytes.subarray(0,end))
    }
    var process={};
    function value(name,v){defineProperty(process,name,{value:v,writable:true,enumerable:true,configurable:true})}
    value('argv',argv);value('env',env);value('execPath',execPath);
    value('platform',windows?'win32':'linux');value('arch','x64');
    value('pid',windows?host.GetCurrentProcessId():host.sys_getpid());
    value('exitCode',undefined);
    value('exit',function exit(code){return exitNow(code)});
    value('cwd',function cwd_(){return cwd()});
    return process
  }
  function install(v){defineProperty(globalThis,'process',{value:v,writable:true,enumerable:false,configurable:true})}
  defineProperty(globalThis,'process',{enumerable:false,configurable:true,
    get:function(){if(created===null)created=build();install(created);return created},
    set:function(v){install(v)}});
  return function(){
    drain();
    if(created===null)return;
    var code=created.exitCode;
    if(code!==undefined&&code!==0)created.exit(code)
  }
})(__nonaPromiseDrainJobs);
`;

import type {FfiDeclaration} from '../ffi.js';
/** Host functions used by the process prelude, per target. */
export function processHostDeclarations(target:'win32-x64'|'linux-x64'):{name:string;declaration:FfiDeclaration}[] {
  const list:[string,string,string,string][]=target==='win32-x64'?[
    ['lstrlenW','KERNEL32.dll','lstrlenW','i32(ptr)'],
    ['RtlMoveMemory','KERNEL32.dll','RtlMoveMemory','void(buf,ptr,u64)'],
    ['GetCommandLineW','KERNEL32.dll','GetCommandLineW','ptr()'],
    ['GetEnvironmentStringsW','KERNEL32.dll','GetEnvironmentStringsW','ptr()'],
    ['FreeEnvironmentStringsW','KERNEL32.dll','FreeEnvironmentStringsW','bool(ptr)'],
    ['GetModuleFileNameW','KERNEL32.dll','GetModuleFileNameW','u32(ptr,buf,u32)'],
    ['ExitProcess','KERNEL32.dll','ExitProcess','void(u32)'],
    ['GetCurrentProcessId','KERNEL32.dll','GetCurrentProcessId','u32()'],
    ['GetCurrentDirectoryW','KERNEL32.dll','GetCurrentDirectoryW','u32(u32,buf)'],
  ]:[
    ['sys_read','syscall','0','i64(i64,buf,i64)'],
    ['sys_open','syscall','2','i64(buf,i64,i64)'],
    ['sys_close','syscall','3','i64(i64)'],
    ['sys_getpid','syscall','39','i64()'],
    ['sys_getcwd','syscall','79','i64(buf,i64)'],
    ['sys_readlink','syscall','89','i64(buf,buf,i64)'],
    ['sys_exit','syscall','231','i64(i64)'],
  ];
  return list.map(([name,dll,exported,signature])=>({name,declaration:{dll,name:exported,signature}}));
}
