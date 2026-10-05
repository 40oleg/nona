// The global `process` object and common process control/timing APIs.
// Host functions are FFI thunks installed per target by the code
// generator as __nonaHost_* globals; the prelude captures and removes them.
// It wraps the Promise drain (or event loop) so a set exitCode is used at exit.
import {processExtensionsSource} from './process-extensions-source.js';
export const processPreludeSource=String.raw`
__nonaPromiseDrainJobs=(function(drain){
  var names=__NONA_PROCESS_HOST_NAMES__;
  var host={},found=false;
  for(var i=0;i<names.length;i++){
    var name='__nonaHost_'+names[i];
    if(typeof globalThis[name]==='function'){host[names[i]]=globalThis[name];found=true;delete globalThis[name]}
  }
  // Cloned realms (Test262) have no host functions.
  if(!found)return drain;
  var hostNow=__nonaProcessNow,origin=hostNow();delete globalThis.__nonaProcessNow;
  var ticks=[],tickHead=0;
  var beforeExitCallback=null,exitCallback=null,exitEmitted=false;
  var defineProperty=Object.defineProperty,fromCharCode=String.fromCharCode,apply=Reflect.apply;
  // The foreign OS boundary returns 0; native helpers are bound in the image.
  var windows=host.GetCommandLineW()!==0;
  var platform=windows?'win32':'__NONA_PROCESS_PLATFORM__';
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
    function nativeString(pointer){var bytes=new Uint8Array(host.length(pointer));host.copy(bytes,pointer,bytes.length);return decoder.decode(bytes)}
    function nativeVector(pointer){
      var list=[],word=new Uint32Array(2);
      if(!pointer)return list;
      for(;;){host.copy(word,pointer,8);var address=word[0]+word[1]*4294967296;if(!address)break;list[list.length]=nativeString(address);pointer+=8}
      return list
    }
    function textBuffer(bytes){var end=0;while(end<bytes.length&&bytes[end]!==0)end++;return decoder.decode(bytes.subarray(0,end))}
    function sysctlString(mib){var bytes=new Uint8Array(65536),length=new Uint32Array([bytes.length,0]);var r=host.sys_sysctl(new Int32Array(mib),mib.length,bytes,length,null,0);if(r<0)throw hostError('sysctl',-r);return textBuffer(bytes)}
    function hostError(syscall,number,path){
      var codes={1:'EPERM',2:'ENOENT',3:'ESRCH',4:'EINTR',5:'EIO',9:'EBADF',13:'EACCES',20:'ENOTDIR',22:'EINVAL',32:'EPIPE',34:'ERANGE',36:'ENAMETOOLONG'};
      var code=codes[number]||'UNKNOWN',error=new Error(code+': '+syscall+(path===undefined?'':" '"+path+"'"));error.code=code;error.errno=-number;error.syscall=syscall;if(path!==undefined)error.path=path;return error
    }
    function argumentError(code,message,range){var error=range?new RangeError(message):new TypeError(message);error.code=code;return error}
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
    }else if(platform==='linux'){
      var link=new Uint8Array(4096),linkLength=host.sys_readlink(cstring('/proc/self/exe'),link,link.length);
      execPath=linkLength>0?decoder.decode(link.subarray(0,linkLength)):'';
      commandLine=splitNul(readProc('/proc/self/cmdline'));
      environment=splitNul(readProc('/proc/self/environ'));
    }else{
      commandLine=nativeVector(host.startupArgv());environment=nativeVector(host.startupEnv());
      if(platform==='darwin'){
        var executable=new Uint8Array(4096),result=host.sys_procinfo(2,host.sys_getpid(),11,0,executable,executable.length);
        execPath=result>0?textBuffer(executable):commandLine[0];
      }else if(platform==='freebsd')execPath=sysctlString([1,14,12,-1]);
      else execPath=commandLine[0];
      if(execPath&&execPath[0]!=='/')execPath=cwd()+'/'+execPath;
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
      defineProperty(env,key,{value:entry.slice(eq+1),writable:true,enumerable:true,configurable:true})
    }
    function exitStatus(code){
      if(code===undefined||code===null)return undefined;
      if(typeof code==='string'&&code!==''&&!Number.isNaN(Number(code)))code=Number(code);
      if(typeof code!=='number')throw argumentError('ERR_INVALID_ARG_TYPE','The code argument must be a number or an integer string');
      if(!Number.isSafeInteger(code))throw argumentError('ERR_OUT_OF_RANGE','The code argument must be a safe integer',true);
      return code|0
    }
    function exitNow(code){
      code=code===undefined?(created.exitCode===undefined?0:created.exitCode):code;
      code=(exitStatus(code)||0)>>>0;
      if(!exitEmitted){exitEmitted=true;if(exitCallback)exitCallback(code|0)}
      if(windows)host.ExitProcess(code);else host.sys_exit(code&255);
      throw new Error('exit failed')
    }
    function cwd(){
      if(windows){
        var buffer=new Uint16Array(32768),n=host.GetCurrentDirectoryW(32768,buffer);return fromUnits(buffer,n)
      }
      if(platform==='openbsd')return sysctlString([1,78,host.sys_getpid()]);
      var bytes=new Uint8Array(65536),r;
      if(platform==='darwin'){
        var fd=host.sys_open(cstring('.'),0,0);if(fd<0)throw hostError('cwd',-fd);
        r=host.sys_fcntl(fd,50,bytes);host.sys_close(fd);
      }else r=host.sys_getcwd(bytes,bytes.length);
      if(r<0)throw hostError('cwd',-r);
      return textBuffer(bytes)
    }
    function chdir(directory){
      if(typeof directory!=='string')throw argumentError('ERR_INVALID_ARG_TYPE','The directory argument must be a string');
      if(directory.indexOf('\0')!==-1)throw argumentError('ERR_INVALID_ARG_VALUE','The directory argument must not contain null bytes');
      if(windows){
        var widePath=new Uint16Array(directory.length+1);for(var i=0;i<directory.length;i++)widePath[i]=directory.charCodeAt(i);
        if(!host.SetCurrentDirectoryW(widePath)){var status=host.GetLastError(),errno=status===5?13:status===267?20:status===206?36:2;throw hostError('chdir',errno,directory)}
      }else{var r=host.sys_chdir(cstring(directory));if(r<0)throw hostError('chdir',-r,directory)}
    }
    function parentPid(){
      if(!windows)return host.sys_getppid();
      var info=new Uint32Array(12);if(host.NtQueryInformationProcess(-1,0,info,48,null)<0)return 0;return info[10]
    }
    function hrtime(previous){
      var ns=Math.floor(hostNow()*1000000),seconds=Math.floor(ns/1000000000),nanos=ns-seconds*1000000000;
      if(previous!==undefined){
        if(!Array.isArray(previous))throw argumentError('ERR_INVALID_ARG_TYPE','The time argument must be an array');
        if(previous.length!==2)throw argumentError('ERR_OUT_OF_RANGE','The time array must contain two entries',true);
        seconds-=previous[0];nanos-=previous[1];if(nanos<0){seconds--;nanos+=1000000000}
      }
      return [seconds,nanos]
    }
    hrtime.bigint=function(){return BigInt(Math.floor(hostNow()*1000000))};
    function nextTick(callback){
      if(typeof callback!=='function')throw argumentError('ERR_INVALID_ARG_TYPE','The callback argument must be a function');
      var args=[];for(var i=1;i<arguments.length;i++)args[args.length]=arguments[i];ticks[ticks.length]={callback:callback,args:args}
    }
    var process={};
    function value(name,v){defineProperty(process,name,{value:v,writable:true,enumerable:true,configurable:true})}
    value('argv',argv);value('env',env);value('execPath',execPath);
    value('platform',platform);value('arch','__NONA_PROCESS_ARCH__');
    value('pid',windows?host.GetCurrentProcessId():host.sys_getpid());
    value('ppid',parentPid());value('argv0',commandLine[0]);value('execArgv',[]);
    var exitCode;defineProperty(process,'exitCode',{enumerable:true,configurable:true,get:function(){return exitCode},set:function(code){exitCode=exitStatus(code)}});
    value('exit',function exit(code){return exitNow(code)});
    value('cwd',function cwd_(){return cwd()});
    value('chdir',chdir);value('hrtime',hrtime);value('uptime',function uptime(){return (hostNow()-origin)/1000});value('nextTick',nextTick);
${processExtensionsSource}
    return process
  }
  function install(v){defineProperty(globalThis,'process',{value:v,writable:true,enumerable:false,configurable:true})}
  defineProperty(globalThis,'process',{enumerable:false,configurable:true,
    get:function(){if(created===null)created=build();install(created);return created},
    set:function(v){install(v)}});
  function flush(){
    do{
      while(tickHead<ticks.length){var job=ticks[tickHead++];apply(job.callback,undefined,job.args)}
      ticks=[];tickHead=0;drain();
    }while(ticks.length);
  }
  return function(){
    flush();
    if(created===null)return;
    if(typeof __nonaRegexpVm.hasPendingTimers==='function'&&__nonaRegexpVm.hasPendingTimers())return;
    if(typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO())return;
    if(!exitEmitted&&beforeExitCallback){beforeExitCallback();flush();
      if(typeof __nonaRegexpVm.hasPendingTimers==='function'&&__nonaRegexpVm.hasPendingTimers())return;
      if(typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO())return
    }
    var code=created.exitCode;
    if(!exitEmitted){exitEmitted=true;if(exitCallback)exitCallback(code||0)}
    code=created.exitCode;
    if(code!==undefined&&code!==0)created.exit(code)
  }
})(__nonaPromiseDrainJobs);
`;

import type {FfiDeclaration} from '../ffi.js';
import type {Target} from '../target.js';
/** Host functions used by the process prelude, per target. */
export function processHostDeclarations(target:Target):{name:string;declaration:FfiDeclaration}[] {
  const windows:[string,string,string,string][]=[
    ['lstrlenW','KERNEL32.dll','lstrlenW','i32(ptr)'],
    ['RtlMoveMemory','KERNEL32.dll','RtlMoveMemory','void(buf,ptr,u64)'],
    ['GetCommandLineW','KERNEL32.dll','GetCommandLineW','ptr()'],
    ['GetEnvironmentStringsW','KERNEL32.dll','GetEnvironmentStringsW','ptr()'],
    ['FreeEnvironmentStringsW','KERNEL32.dll','FreeEnvironmentStringsW','bool(ptr)'],
    ['GetModuleFileNameW','KERNEL32.dll','GetModuleFileNameW','u32(ptr,buf,u32)'],
    ['ExitProcess','KERNEL32.dll','ExitProcess','void(u32)'],
    ['GetCurrentProcessId','KERNEL32.dll','GetCurrentProcessId','u32()'],
    ['GetCurrentDirectoryW','KERNEL32.dll','GetCurrentDirectoryW','u32(u32,buf)'],
    ['SetCurrentDirectoryW','KERNEL32.dll','SetCurrentDirectoryW','bool(buf)'],
    ['GetLastError','KERNEL32.dll','GetLastError','u32()'],
    ['NtQueryInformationProcess','ntdll.dll','NtQueryInformationProcess','i32(ptr,u32,buf,u32,ptr)'],
    ['SetEnvironmentVariableW','KERNEL32.dll','SetEnvironmentVariableW','bool(buf,buf)'],
    ['GetStdHandle','KERNEL32.dll','GetStdHandle','ptr(i32)'],
    ['ReadFile','KERNEL32.dll','ReadFile','bool(ptr,buf,u32,buf,ptr)'],
    ['WriteFile','KERNEL32.dll','WriteFile','bool(ptr,buf,u32,buf,ptr)'],
    ['GetFileType','KERNEL32.dll','GetFileType','u32(ptr)'],
    ['PeekNamedPipe','KERNEL32.dll','PeekNamedPipe','bool(ptr,ptr,u32,ptr,buf,ptr)'],
    ['WaitForSingleObject','KERNEL32.dll','WaitForSingleObject','u32(ptr,u32)'],
    ['OpenProcess','KERNEL32.dll','OpenProcess','ptr(u32,bool,u32)'],
    ['TerminateProcess','KERNEL32.dll','TerminateProcess','bool(ptr,u32)'],
    ['CloseHandle','KERNEL32.dll','CloseHandle','bool(ptr)'],
    ['GetProcessTimes','KERNEL32.dll','GetProcessTimes','bool(ptr,buf,buf,buf,buf)'],
    ['K32GetProcessMemoryInfo','KERNEL32.dll','K32GetProcessMemoryInfo','bool(ptr,buf,u32)'],
    ['CreateFileW','KERNEL32.dll','CreateFileW','ptr(buf,u32,u32,ptr,u32,u32,ptr)'],
    ['GlobalMemoryStatusEx','KERNEL32.dll','GlobalMemoryStatusEx','bool(buf)'],
    ['QueryInformationJobObject','KERNEL32.dll','QueryInformationJobObject','bool(ptr,i32,buf,u32,ptr)'],
    ['IsProcessInJob','KERNEL32.dll','IsProcessInJob','bool(ptr,ptr,buf)'],
  ];
  const posix:[string,string,string,string][]=[
    ['sys_read','syscall','0','i64(i64,buf,i64)'],
    ['sys_open','syscall','2','i64(buf,i64,i64)'],
    ['sys_close','syscall','3','i64(i64)'],
    ['sys_getpid','syscall','39','i64()'],
    ['sys_getcwd','syscall','79','i64(buf,i64)'],
    ['sys_readlink','syscall','89','i64(buf,buf,i64)'],
    ['sys_exit','syscall','231','i64(i64)'],
    ['sys_getppid','syscall','110','i64()'],
    ['sys_chdir','syscall','80','i64(buf)'],
    ['sys_write','syscall','1','i64(i64,buf,i64)'],
    ['sys_poll','syscall','7','i32(buf,u64,i32)'],
    ['sys_getrusage','syscall','98','i32(i32,buf)'],
    ['sys_kill','syscall','62','i32(i32,i32)'],
    ['sys_getuid','syscall','102','u32()'],['sys_geteuid','syscall','107','u32()'],
    ['sys_getgid','syscall','104','u32()'],['sys_getegid','syscall','108','u32()'],
    ['sys_umask','syscall','95','u32(u32)'],
    ['sys_getgroups','syscall','115','i32(u32,buf)'],['sys_setgroups','syscall','116','i32(u32,buf)'],
    ['sys_setuid','syscall','105','i32(u32)'],['sys_setgid','syscall','106','i32(u32)'],
    ['sys_setresuid','syscall','117','i32(u32,u32,u32)'],['sys_setresgid','syscall','119','i32(u32,u32,u32)'],
    ['sys_getrlimit','syscall','97','i32(i32,buf)'],
  ];
  if(target==='linux-arm64'){
    const numbers:Record<string,string>={sys_read:'63',sys_open:'56',sys_close:'57',sys_getpid:'172',sys_getppid:'173',sys_chdir:'49',sys_getcwd:'17',sys_readlink:'78',sys_exit:'94',sys_write:'64',sys_poll:'73',sys_getrusage:'165',sys_kill:'129',sys_getuid:'174',sys_geteuid:'175',sys_getgid:'176',sys_getegid:'177',sys_umask:'166'};
    Object.assign(numbers,{sys_getgroups:'158',sys_setgroups:'159',sys_setuid:'146',sys_setgid:'144',sys_setresuid:'147',sys_setresgid:'149',sys_getrlimit:'163'});
    for(const entry of posix){entry[2]=numbers[entry[0]]!;if(entry[0]==='sys_open')entry[3]='i64(i64,buf,i64,i64)';if(entry[0]==='sys_readlink')entry[3]='i64(i64,buf,buf,i64)';if(entry[0]==='sys_poll')entry[3]='i32(buf,u64,buf,ptr,u64)';}
  }else if(target.startsWith('darwin-')||target.startsWith('freebsd-')||target.startsWith('openbsd-')){
    const numbers:Record<string,string>={sys_read:'3',sys_open:'5',sys_close:'6',sys_getpid:'20',sys_getppid:'39',sys_chdir:'12',sys_readlink:'58',sys_exit:'1',sys_getcwd:'326',sys_write:'4',sys_poll:target.startsWith('darwin-')?'230':target.startsWith('freebsd-')?'209':'252',sys_getrusage:target.startsWith('openbsd-')?'19':'117',sys_kill:target.startsWith('openbsd-')?'122':'37',sys_getuid:'24',sys_geteuid:'25',sys_getgid:'47',sys_getegid:'43',sys_umask:'60'};
    Object.assign(numbers,{sys_getgroups:'79',sys_setgroups:'80',sys_setuid:'23',sys_setgid:'181',sys_setresuid:'0',sys_setresgid:'0',sys_getrlimit:'194'});
    for(const entry of posix)entry[2]=numbers[entry[0]]!;
    for(const name of ['sys_setresuid','sys_setresgid'])posix.splice(posix.findIndex(e=>e[0]===name),1);
    posix.push(['sys_seteuid','syscall','183','i32(u32)'],['sys_setegid','syscall','182','i32(u32)']);
    if(!target.startsWith('freebsd-'))posix.splice(posix.findIndex(e=>e[0]==='sys_getcwd'),1);
    if(target.startsWith('darwin-'))posix.push(['sys_fcntl','syscall','92','i64(i64,i64,buf)'],['sys_procinfo','syscall','336','i64(i32,i32,u32,u64,buf,i32)']);
    else posix.push(['sys_sysctl','syscall','202','i64(buf,u32,buf,buf,buf,u64)']);
  }
  const list:[string,string,string,string][]=[...windows,...posix,
    ['startupArgv','nona.internal','startupArgv','ptr()'],['startupEnv','nona.internal','startupEnv','ptr()'],
    ['copy','nona.internal','copy','void(buf,ptr,u64)'],['length','nona.internal','length','u64(ptr)'],
    ['heapSnapshot','nona.internal','heapSnapshot','void(buf)'],
    ['replaceEnvironment','nona.internal','replaceEnvironment','void(buf,u64,u64)'],['environmentVector','nona.internal','environmentVector','ptr()'],
    ['environmentContains','nona.internal','environmentContains','bool(buf)'],
  ];
  if(target.startsWith('darwin-'))list.push(['mach_host_self','/usr/lib/libSystem.B.dylib','mach_host_self','u32()'],['host_page_size','/usr/lib/libSystem.B.dylib','host_page_size','i32(u32,buf)'],['host_statistics64','/usr/lib/libSystem.B.dylib','host_statistics64','i32(u32,i32,buf,buf)'],['setenv','/usr/lib/libSystem.B.dylib','setenv','i32(buf,buf,i32)'],['unsetenv','/usr/lib/libSystem.B.dylib','unsetenv','i32(buf)']);
  if(target.startsWith('darwin-'))list.push(['getenv','/usr/lib/libSystem.B.dylib','getenv','ptr(buf)'],['__error','/usr/lib/libSystem.B.dylib','__error','ptr()']);
  if(target.startsWith('darwin-'))list.push(['getpwnam','/usr/lib/libSystem.B.dylib','getpwnam','ptr(buf)'],['getpwuid','/usr/lib/libSystem.B.dylib','getpwuid','ptr(u32)'],['getgrnam','/usr/lib/libSystem.B.dylib','getgrnam','ptr(buf)'],['getgrgid','/usr/lib/libSystem.B.dylib','getgrgid','ptr(u32)'],['initgroups','/usr/lib/libSystem.B.dylib','initgroups','i32(buf,u32)']);
  return list.map(([name,dll,exported,signature])=>({name,declaration:{dll,name:exported,signature}}));
}

/** Target-specific host boundary without introducing prelude global bindings. */
export function processPreludeForTarget(target:string|undefined):string {
 const source=processPreludeSource.replace('__NONA_PROCESS_HOST_NAMES__',JSON.stringify(processHostDeclarations((target??'win32-x64') as Target).map(h=>h.name))).replace('__NONA_PROCESS_PLATFORM__',target?.startsWith('win32-')?'linux':target?.split('-')[0]??'linux').replace('__NONA_PROCESS_ARCH__',target?.endsWith('-arm64')?'arm64':'x64');
 if(target!=='linux-arm64')return source;
 return source.replace('var windows=host.GetCommandLineW()!==0;',
  'var windows=host.GetCommandLineW()!==0;var openat=host.sys_open,readlinkat=host.sys_readlink,ppoll=host.sys_poll;host.sys_open=function(path,flags,mode){return openat(-100,path,flags,mode)};host.sys_readlink=function(path,buffer,size){return readlinkat(-100,path,buffer,size)};host.sys_poll=function(fds,count){return ppoll(fds,count,new Uint32Array(4),null,8)};');
}
