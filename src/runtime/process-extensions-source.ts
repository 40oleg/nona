/** Original process I/O, events and OS controls; inserted inside build(). */
import {processSystemSource} from './process-system-source.js';
import {processExceptionsSource} from './process-exceptions-source.js';
import {processFinalizationSource} from './process-finalization-source.js';
import {processSignalsSource} from './process-signals-source.js';
export const processExtensionsSource=String.raw`
    function wideString(text){var bytes=new Uint16Array(text.length+1);for(var i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return bytes}
    function environmentString(text){var nul=text.indexOf('\0');return nul<0?text:text.slice(0,nul)}
    function normalizedKey(target,key){if(typeof key==='string'){key=environmentString(key);if(windows){var upper=key.toUpperCase();for(var name in target)if(name.toUpperCase()===upper)return name}}return key}
    function syncEnvironment(target){var entries=[];for(var key in target)entries.push(key+'='+target[key]);var bytes=encoder.encode(entries.length?entries.join('\0')+'\0':'');host.replaceEnvironment(bytes,bytes.length,entries.length)}
    syncEnvironment(env);__nonaRegexpVm.processEnvironmentVector=function(){return host.environmentVector()};
    __nonaRegexpVm.processEnvironmentHas=function(key,value){return host.environmentContains(cstring(key+'='+value))};
    function darwinEnvironmentError(operation,key){var number=new Uint32Array(1);host.copy(number,host.__error(),4);return hostError(operation,number[0],key)}
    if(platform==='darwin')__nonaRegexpVm.processOSGetenv=function(key){var pointer=host.getenv(cstring(key));if(!pointer)return undefined;var bytes=new Uint8Array(host.length(pointer));host.copy(bytes,pointer,bytes.length);return decoder.decode(bytes)};
    function setEnvironment(target,key,value){
      if(typeof key!=='string'||typeof value==='symbol')throw argumentError('ERR_INVALID_ARG_TYPE','Environment names and values must be strings');
      key=environmentString(key);value=environmentString(String(value));if(!key||key.indexOf('=')!==-1)return true;
      if(windows&&!host.SetEnvironmentVariableW(wideString(key),wideString(value)))throw hostError('setenv',22,key);
      if(platform==='darwin'&&host.setenv(cstring(key),cstring(value),1)!==0)throw darwinEnvironmentError('setenv',key);
      defineProperty(target,normalizedKey(target,key),{value:value,writable:true,enumerable:true,configurable:true});syncEnvironment(target);return true
    }
    env=new Proxy(env,{
      get:function(target,key){return Reflect.get(target,normalizedKey(target,key))},
      has:function(target,key){return Reflect.has(target,normalizedKey(target,key))},
      getOwnPropertyDescriptor:function(target,key){return Reflect.getOwnPropertyDescriptor(target,normalizedKey(target,key))},
      set:setEnvironment,
      defineProperty:function(target,key,descriptor){if(!descriptor.writable||!descriptor.enumerable||!descriptor.configurable||!('value' in descriptor)||'get' in descriptor||'set' in descriptor)throw argumentError('ERR_INVALID_OBJECT_DEFINE_PROPERTY','Environment descriptors must be configurable, writable and enumerable data properties');return setEnvironment(target,key,descriptor.value)},
      deleteProperty:function(target,key){key=normalizedKey(target,key);if(typeof key==='string'&&(!key||key.indexOf('=')!==-1))return true;if(windows&&typeof key==='string'&&!host.SetEnvironmentVariableW(wideString(key),null)&&host.GetLastError()!==203)throw hostError('unsetenv',22,key);if(platform==='darwin'&&typeof key==='string'&&host.unsetenv(cstring(key))!==0)throw darwinEnvironmentError('unsetenv',key);var deleted=Reflect.deleteProperty(target,key);syncEnvironment(target);return deleted}
    });
    process.env=env;var signalListenerCount=processEmitter.prototype.listenerCount,signalEmit=processEmitter.prototype.emit;
    function ioError(operation,number){return hostError(operation,number===109?0:number===5?13:number===6?9:number)}
    function nativeWrite(fd,bytes){
      var offset=0,counter=new Uint32Array(1);
      while(offset<bytes.length){var part=bytes.subarray(offset,Math.min(bytes.length,offset+1048576)),n;
        if(windows){if(!host.WriteFile(host.GetStdHandle(-10-fd),part,part.length,counter,null))throw ioError('write',host.GetLastError());n=counter[0]}
        else{n=host.sys_write(fd,part,part.length);if(n===-4)continue;if(n<0)throw hostError('write',-n)}
        if(n<=0)throw hostError('write',5);offset+=n
      }
    }
    var out,err,input,processStreams,inputRef=true,inputRequested=false,inputEOF=false,inputReadSize=65536;
    function initializeIO(){
      if(input)return;
      processStreams=initializeStreams();
      out=output(1);err=output(2);
      input=new processStreams.Readable({autoDestroy:false,read:function(size){inputRequested=true;inputReadSize=Math.max(1,size);try{if(inputReady()){var chunk=readInput(inputReadSize);inputRequested=false;input.push(chunk)}}catch(error){inputRequested=false;input.destroy(error)}},destroy:function(error,callback){inputRequested=false;callback(error)}});
      defineProperty(input,'fd',{value:0,writable:true,enumerable:true,configurable:true});
      var inputPause=processStreams.Readable.prototype.pause;
      input.pause=function(){inputRequested=false;return apply(inputPause,input,[])};
      input.ref=function(){inputRef=true;return input};input.unref=function(){inputRef=false;return input};
      input[Symbol.for('nodejs.ref')]=input.ref;input[Symbol.for('nodejs.unref')]=input.unref;
    }
    function output(fd){
      var stream=new processStreams.Writable({autoDestroy:false,write:function(bytes,encoding,callback){try{nativeWrite(fd,bytes);callback()}catch(error){callback(error)}}});
      defineProperty(stream,'fd',{value:fd,writable:true,enumerable:true,configurable:true});
      return stream
    }
    __nonaRegexpVm.isProcessOutput=function(stream){return stream===out||stream===err};
    function readInput(size){
      size=size===undefined?65536:size;if(!Number.isInteger(size)||size<0||size>0x40000000)throw argumentError('ERR_OUT_OF_RANGE','The size must be a nonnegative integer',true);
      if(size===0||inputEOF||input.destroyed)return null;
      var bytes=new Uint8Array(size),n,counter=new Uint32Array(1);
      if(windows){if(!host.ReadFile(host.GetStdHandle(-10),bytes,size,counter,null)){var code=host.GetLastError();if(code===109)n=0;else throw ioError('read',code)}else n=counter[0]}
      else{do{n=host.sys_read(0,bytes,size)}while(n===-4);if(n<0)throw hostError('read',-n)}
      if(!n){inputEOF=true;return null}
      return __nonaRegexpVm.bufferModule.Buffer.from(bytes.subarray(0,n))
    }
    function inputReady(){
      if(windows){var handle=host.GetStdHandle(-10),type=host.GetFileType(handle);
        if(type===1)return true;if(type===2)return host.WaitForSingleObject(handle,0)===0;
        var count=new Uint32Array(1);if(host.PeekNamedPipe(handle,null,0,null,count,null))return count[0]>0;
        return host.GetLastError()===109||host.GetLastError()===6
      }
      var poll=new Int32Array([0,1]),r=host.sys_poll(poll,1,0);if(r<0&&r!==-4)throw hostError('poll',-r);return r>0
    }
    __nonaRegexpVm.hasReadableIO=function(){return !!input&&(inputRequested||input.readableFlowing===true)&&!inputEOF&&!input.destroyed};
    __nonaRegexpVm.hasPendingIO=function(){return inputRef&&__nonaRegexpVm.hasReadableIO()};
    __nonaRegexpVm.pumpIO=function(){
      if(!__nonaRegexpVm.hasReadableIO())return;
      try{if(!inputReady())return;var chunk=readInput(inputReadSize);inputRequested=false;input.push(chunk)}catch(error){inputRequested=false;input.destroy(error)}
    };
    for(var stdio of ['stdout','stderr','stdin'])(function(name){defineProperty(process,name,{enumerable:true,configurable:true,get:function(){initializeIO();return name==='stdout'?out:name==='stderr'?err:input}})})(stdio);
    value('openStdin',function(){initializeIO();return input.resume()});
    value('emitWarning',function(warning,type,code){
      var options=type&&typeof type==='object'?type:{type:type,code:code};
      if(typeof warning==='string'){var error=new Error(warning);error.name=options.type===undefined?'Warning':options.type;if(options.code!==undefined)error.code=options.code;if(options.detail!==undefined)error.detail=options.detail;warning=error}
      else if(!(warning instanceof Error))throw argumentError('ERR_INVALID_ARG_TYPE','The warning must be a string or Error');
      if(warning.name==='DeprecationWarning'&&process.noDeprecation)return;
      nextTick(function(){if(warning.name==='DeprecationWarning'&&process.throwDeprecation)throw warning;
        process.emit('warning',warning);process.stderr.write('(nona:'+process.pid+') '+(warning.code?'['+warning.code+'] ':'')+warning.name+': '+warning.message+'\n'+(warning.detail?warning.detail+'\n':''))})
    });
    var signals=platform==='linux'?{SIGHUP:1,SIGINT:2,SIGQUIT:3,SIGILL:4,SIGTRAP:5,SIGABRT:6,SIGBUS:7,SIGFPE:8,SIGKILL:9,SIGUSR1:10,SIGSEGV:11,SIGUSR2:12,SIGPIPE:13,SIGALRM:14,SIGTERM:15,SIGCHLD:17,SIGCONT:18,SIGSTOP:19,SIGTSTP:20,SIGTTIN:21,SIGTTOU:22}:{SIGHUP:1,SIGINT:2,SIGQUIT:3,SIGILL:4,SIGTRAP:5,SIGABRT:6,SIGFPE:8,SIGKILL:9,SIGBUS:10,SIGSEGV:11,SIGPIPE:13,SIGALRM:14,SIGTERM:15,SIGURG:16,SIGSTOP:17,SIGTSTP:18,SIGCONT:19,SIGCHLD:20,SIGTTIN:21,SIGTTOU:22,SIGUSR1:30,SIGUSR2:31};
${processSignalsSource}
    value('kill',function(pid,signal){
      if(!Number.isInteger(pid)||pid<-2147483648||pid>2147483647)throw argumentError('ERR_INVALID_ARG_TYPE','The pid must be a signed 32-bit integer');
      signal=signal===undefined?'SIGTERM':signal;if(typeof signal==='string'){if(signals[signal]===undefined)throw argumentError('ERR_UNKNOWN_SIGNAL','Unknown signal '+signal);signal=signals[signal]}
      if(!Number.isInteger(signal)||signal<0)throw argumentError('ERR_OUT_OF_RANGE','Invalid signal',true);
      if(windows){
        if(signal!==0&&signal!==2&&signal!==9&&signal!==15)throw argumentError('ERR_UNKNOWN_SIGNAL','This signal is unsupported on Windows');
        var handle=host.OpenProcess(signal===0?0x1000:1,false,pid);if(!handle)throw hostError('kill',host.GetLastError()===5?1:3);
        var success=true;if(signal!==0)success=host.TerminateProcess(handle,1);host.CloseHandle(handle);if(!success)throw hostError('kill',1)
      }else{var r=host.sys_kill(pid,signal);if(r<0)throw hostError('kill',-r)}return true
    });
    function unsigned64(words,index){return words[index]+words[index+1]*4294967296}
    function usage(){
      var words=new Uint32Array(36),result={};
      if(windows){var creation=new Uint32Array(2),exit=new Uint32Array(2),kernel=new Uint32Array(2),user=new Uint32Array(2);
        if(!host.GetProcessTimes(-1,creation,exit,kernel,user))throw hostError('cpuUsage',5);
        result.userCPUTime=Math.floor(unsigned64(user,0)/10);result.systemCPUTime=Math.floor(unsigned64(kernel,0)/10);
        var memory=new Uint32Array(20);memory[0]=80;if(!host.K32GetProcessMemoryInfo(-1,memory,80))throw hostError('resourceUsage',5);
        result.maxRSS=Math.floor(unsigned64(memory,2)/1024);result.minorPageFault=memory[1];
        return result
      }
      var r=host.sys_getrusage(0,words);if(r<0)throw hostError('resourceUsage',-r);
      result.userCPUTime=unsigned64(words,0)*1000000+(platform==='darwin'?words[2]:unsigned64(words,2));result.systemCPUTime=unsigned64(words,4)*1000000+(platform==='darwin'?words[6]:unsigned64(words,6));
      var keys=['maxRSS','sharedMemorySize','unsharedDataSize','unsharedStackSize','minorPageFault','majorPageFault','swappedOut','fsRead','fsWrite','ipcSent','ipcReceived','signalsCount','voluntaryContextSwitches','involuntaryContextSwitches'];
      for(var i=0;i<keys.length;i++)result[keys[i]]=unsigned64(words,8+i*2);if(platform==='darwin')result.maxRSS=Math.floor(result.maxRSS/1024);return result
    }
    value('resourceUsage',usage);value('cpuUsage',function(previous){var r=usage(),value={user:r.userCPUTime,system:r.systemCPUTime};
      if(previous!==undefined){if(previous===null||typeof previous!=='object'||typeof previous.user!=='number'||typeof previous.system!=='number'||previous.user<0||previous.system<0)throw argumentError('ERR_INVALID_ARG_TYPE','The previous CPU usage must contain nonnegative numbers');value.user-=previous.user;value.system-=previous.system}return value});
    if(!windows){
      for(var pair of [['getuid','sys_getuid'],['geteuid','sys_geteuid'],['getgid','sys_getgid'],['getegid','sys_getegid']]){(function(name,hostName){value(name,function(){return host[hostName]()})})(pair[0],pair[1])}
      value('umask',function(mask){if(mask===undefined){var current=host.sys_umask(0);host.sys_umask(current);return current}if(typeof mask==='string'&&/^[0-7]+$/.test(mask))mask=parseInt(mask,8);if(!Number.isInteger(mask)||mask<0||mask>0xffffffff)throw argumentError('ERR_OUT_OF_RANGE','Invalid mask',true);return host.sys_umask(mask)});
    }
${processSystemSource}
    beforeExitCallback=function(){process.emit('beforeExit',process.exitCode||0)};
    exitCallback=function(code){process.emit('exit',code)};
${processExceptionsSource}
${processFinalizationSource}
`;
