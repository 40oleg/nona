
__nonaPromiseDrainJobs=(function(drain){
  var nativeUnits=globalThis.__nonaProcessUnits;delete globalThis.__nonaProcessUnits;
  var finalizationNative=globalThis.__nonaProcessFinalization;delete globalThis.__nonaProcessFinalization;
  var processMain=typeof globalThis.__nonaAgentReceiveBroadcast!=='function';
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
  var defineProperty=Object.defineProperty,freeze=Object.freeze,fromCharCode=String.fromCharCode,apply=Reflect.apply,createObject=Object.create,setPrototype=Object.setPrototypeOf;
  var processEmitter=null,initializeStreams=__nonaRegexpVm.initializeStreams;
  function enqueueTick(callback,args){var context=__nonaRegexpVm.asyncContext;ticks[ticks.length]={callback:callback,args:args,context:context?context.activeRecord:undefined}}
  __nonaRegexpVm.enqueueNextTick=enqueueTick;
  var finalizationMap=WeakMap,finalizationSet=WeakMap.prototype.set,finalizationHas=WeakMap.prototype.has,finalizationPush=Array.prototype.push,finalizationSplice=Array.prototype.splice,finalizationApply=apply;
  var reportIntrinsics={Error:Error,Uint8Array:Uint8Array,Uint32Array:Uint32Array,subarray:Uint8Array.prototype.subarray,min:Math.min,Date:Date,keys:Object.keys,isArray:Array.isArray,stringify:JSON.stringify,String:String,push:Array.prototype.push,trim:String.prototype.trim,time:Date.prototype.getTime,iso:Date.prototype.toISOString,year:Date.prototype.getFullYear,month:Date.prototype.getMonth,date:Date.prototype.getDate,hour:Date.prototype.getHours,minute:Date.prototype.getMinutes,second:Date.prototype.getSeconds};
${processReportNetworkIntrinsicsSource}
  // The foreign OS boundary returns 0; native helpers are bound in the image.
  var windows=host.GetCommandLineW()!==0;
  var platform=windows?'win32':'__NONA_PROCESS_PLATFORM__';
  function wide(pointer,length){
    var units=new Uint16Array(length);host.RtlMoveMemory(units,pointer,length*2);
    if(typeof nativeUnits==='function')return nativeUnits(units,length);
    var out='',chunk=[],k=0;
    for(var i=0;i<length;i++){chunk[k++]=units[i];if(k===4096){out+=apply(fromCharCode,undefined,chunk);chunk=[];k=0}}
    return out+apply(fromCharCode,undefined,chunk)
  }
  function fromUnits(units,length){
    if(typeof nativeUnits==='function')return nativeUnits(units,length);
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
    function copyProcessBytes(source,target,offset){__nonaRegexpVm.arrayBufferCopy(source.buffer,target.buffer,source.byteOffset,source.byteLength,target.byteOffset+(offset||0))}
    function cstring(text){var bytes=encoder.encode(text),out=new Uint8Array(bytes.length+1);copyProcessBytes(bytes,out,0);return out}
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
      for(var j=0;j<chunks.length;j++){copyProcessBytes(chunks[j],out,offset);offset+=chunks[j].length}
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
      var codes={1:'EPERM',2:'ENOENT',3:'ESRCH',4:'EINTR',5:'EIO',7:'E2BIG',8:'ENOEXEC',9:'EBADF',12:'ENOMEM',13:'EACCES',14:'EFAULT',20:'ENOTDIR',22:'EINVAL',24:'EMFILE',26:'ETXTBSY',30:'EROFS',32:'EPIPE',34:'ERANGE'};
      if(platform==='linux'){codes[36]='ENAMETOOLONG';codes[38]='ENOSYS';codes[40]='ELOOP'}else{codes[62]='ELOOP';codes[63]='ENAMETOOLONG';codes[78]='ENOSYS'}
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
      var args=[];for(var i=1;i<arguments.length;i++)args[args.length]=arguments[i];enqueueTick(callback,args)
    }
    processEmitter=__nonaRegexpVm.eventEmitterModule;
    function Process(){apply(processEmitter,this,[])}
    Process.prototype=createObject(processEmitter.prototype);defineProperty(Process.prototype,'constructor',{value:Process,writable:true,configurable:true});setPrototype(Process,processEmitter);defineProperty(Process,'name',{value:'process',configurable:true});
    var process=new Process();defineProperty(process,Symbol.toStringTag,{value:'process',writable:true,enumerable:false,configurable:false});
    function value(name,v){defineProperty(process,name,{value:v,writable:true,enumerable:true,configurable:true})}
    value('argv',argv);value('env',env);value('execPath',execPath);
    defineProperty(process,'platform',{value:platform,enumerable:true,configurable:true});defineProperty(process,'arch',{value:'__NONA_PROCESS_ARCH__',enumerable:true,configurable:true});
${processMetadataSource(undefined,true)}
    value('getBuiltinModule',function getBuiltinModule(id){return __nonaRegexpVm.getBuiltinModule(id)});
    value('abort',function abort(){if(windows)host.ExitProcess(134);else host.abort()});
    defineProperty(process,'pid',{value:windows?host.GetCurrentProcessId():host.sys_getpid(),enumerable:true,configurable:true});
    value('ppid',parentPid());defineProperty(process,'argv0',{value:commandLine[0],enumerable:true});value('execArgv',[]);
    var exitCode;defineProperty(process,'exitCode',{enumerable:true,configurable:true,get:function(){return exitCode},set:function(code){exitCode=exitStatus(code)}});
    value('exit',function exit(code){return exitNow(code)});
    value('cwd',function cwd_(){return cwd()});
    value('chdir',chdir);value('hrtime',hrtime);value('uptime',function uptime(){return (hostNow()-origin)/1000});value('nextTick',nextTick);
${processExtensionsSource}
${processReportNetworkSource}
${processReportSource}
    return process
  }
  function install(v){defineProperty(globalThis,'process',{value:v,writable:true,enumerable:false,configurable:true})}
  function processBuiltin(){if(created===null)created=build();return created}
  __nonaRegexpVm.processBuiltin=processBuiltin;
  defineProperty(globalThis,'process',{enumerable:false,configurable:true,
    get:function(){var result=processBuiltin();install(result);return result},
    set:function(v){install(v)}});
  function flush(){
    do{
      while(tickHead<ticks.length){var job=ticks[tickHead++],context=__nonaRegexpVm.asyncContext,previous=context?context.activeRecord:undefined,captured=job.context||(context?context.defaultRecord:undefined);try{if(context&&captured&&captured!==previous)context.runCaptured(captured,job.callback,undefined,job.args);else apply(job.callback,undefined,job.args)}catch(error){if(typeof __nonaRegexpVm.dispatchUncaught!=='function')throw error;__nonaRegexpVm.dispatchUncaught(error,'uncaughtException')}finally{if(!context){context=__nonaRegexpVm.asyncContext;previous=context?context.defaultRecord:undefined}if(context&&context.activeRecord!==previous)context.restoreRecord(previous)}}
      ticks=[];tickHead=0;drain();
    }while(ticks.length||(typeof __nonaRegexpVm.hasPendingPromiseJobs==='function'&&__nonaRegexpVm.hasPendingPromiseJobs()));
  }
  return function(){
    flush();
    if(created===null)return;
    if(typeof __nonaRegexpVm.hasPendingTimers==='function'&&__nonaRegexpVm.hasPendingTimers())return;
    if(typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO())return;
    if(typeof __nonaRegexpVm.hasPendingNetworkIO==='function'&&__nonaRegexpVm.hasPendingNetworkIO())return;
    if(!exitEmitted&&beforeExitCallback){beforeExitCallback();flush();
      if(typeof __nonaRegexpVm.hasPendingTimers==='function'&&__nonaRegexpVm.hasPendingTimers())return;
      if(typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO())return;
      if(typeof __nonaRegexpVm.hasPendingNetworkIO==='function'&&__nonaRegexpVm.hasPendingNetworkIO())return
    }
    // An entry module whose top-level await never settles (top-level-await.js).
    if(typeof __nonaRegexpVm.unsettledTopLevelAwait==='function'&&__nonaRegexpVm.unsettledTopLevelAwait())created.exitCode=13;
    var code=created.exitCode;
    if(!exitEmitted){exitEmitted=true;if(exitCallback)exitCallback(code||0)}
    code=created.exitCode;
    if(code!==undefined&&code!==0)created.exit(code)
  }
})(__nonaPromiseDrainJobs);
