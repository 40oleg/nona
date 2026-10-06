/** Installed inside process build(), after its signal-name table. */
export const processSignalsSource=String.raw`
    if(windows)signals={SIGHUP:1,SIGINT:2,SIGQUIT:3,SIGILL:4,SIGABRT:22,SIGFPE:8,SIGKILL:9,SIGSEGV:11,SIGTERM:15,SIGBREAK:21,SIGWINCH:28};
    else{signals.SIGIOT=6;signals.SIGXCPU=24;signals.SIGXFSZ=25;signals.SIGVTALRM=26;signals.SIGPROF=27;signals.SIGWINCH=28;
      if(platform==='linux'){signals.SIGURG=23;signals.SIGIO=29;signals.SIGPOLL=29;signals.SIGPWR=30;signals.SIGSYS=31;signals.SIGSTKFLT=16}
      else{signals.SIGEMT=7;signals.SIGSYS=12;signals.SIGIO=23;signals.SIGINFO=29;if(platform==='freebsd'){signals.SIGTHR=32;signals.SIGLWP=32;signals.SIGLIBRT=33}else if(platform==='openbsd')signals.SIGTHR=32}}
    var signalEntries=[],signalNames={},signalQueue=-1,signalCount=0,signalsPrepared=false,reportWatchName,signalStackReady=false;
    for(var signalName in signals)if(signalNames[signals[signalName]]===undefined)signalNames[signals[signalName]]=signalName;
    if(windows){signals.SIGBREAK=21;signalNames[21]='SIGBREAK'}
    function signalResult(result,operation){if(result<0){if(platform==='darwin'){var pointer=host.__error(),words=new Int32Array(1);host.copy(words,pointer,4);throw hostError(operation,words[0])}throw hostError(operation,-result)}return result}
    function signalAction(number,action,previous){return signalResult(host.signalAction(number,action,previous,8),'sigaction')}
    function signalPointer(words,index,pointer){words[index]=pointer%4294967296;words[index+1]=Math.floor(pointer/4294967296)}
    function signalChange(number,add){var words=new Uint32Array(platform==='freebsd'?16:8);words[0]=number;words[2]=65530|((add?33:2)<<16);signalResult(host.signalEvent(signalQueue,words,1,null,0,null),'kevent')}
    function signalNativeWatch(number,enabled){
      var entry=signalEntries[number];if(enabled===!!entry)return;
      if(windows){
        if(number!==1&&number!==2&&number!==21)return;
        if(enabled){host.signalEnable(number,1);if(!signalCount&&!host.SetConsoleCtrlHandler(host.consoleHandlerAddress(),true)){host.signalEnable(number,0);throw hostError('signal',host.GetLastError())}signalEntries[number]={};signalCount++}
        else{host.signalEnable(number,0);signalEntries[number]=undefined;signalCount--;if(!signalCount&&!host.SetConsoleCtrlHandler(host.consoleHandlerAddress(),false))throw hostError('signal',host.GetLastError())}return
      }
      if(enabled){
        if(platform==='linux'&&typeof host.signalStackAddress==='function'&&!signalStackReady){var stack=new Uint32Array(6);signalPointer(stack,0,host.signalStackAddress());stack[4]=65536;signalResult(host.signalStack(stack,null),'sigaltstack');signalStackReady=true}
        if(signalQueue<0&&platform!=='linux'){signalQueue=signalResult(host.signalQueue(),'kqueue');try{signalResult(host.signalFcntl(signalQueue,2,1),'fcntl')}catch(error){host.sys_close(signalQueue);signalQueue=-1;throw error}}
        var previous=new Uint32Array(8),action=new Uint32Array(8);
        if(platform==='linux'){signalPointer(action,0,host.signalHandlerAddress());action[2]=signalStackReady?0x1c000000:0x14000000;signalPointer(action,4,host.signalRestorerAddress())}
        else action[0]=number===20?0:1;
        host.signalEnable(number,1);
        try{signalAction(number,action,previous)}catch(error){host.signalEnable(number,0);if(!signalCount&&signalQueue>=0){host.sys_close(signalQueue);signalQueue=-1}throw error}
        try{if(platform!=='linux')signalChange(number,true)}catch(error){signalAction(number,previous,null);host.signalEnable(number,0);if(!signalCount&&signalQueue>=0){host.sys_close(signalQueue);signalQueue=-1}throw error}
        signalEntries[number]={previous:previous,action:action};signalCount++
      }else{
        signalAction(number,entry.previous,null);if(platform!=='linux')signalChange(number,false);host.signalEnable(number,0);signalEntries[number]=undefined;signalCount--;
        if(!signalCount&&signalQueue>=0){host.sys_close(signalQueue);signalQueue=-1}
      }
    }
    function signalPublicCount(number){var count=0;for(var alias in signals)if(signals[alias]===number)count+=apply(signalListenerCount,process,[alias]);return count}
    function signalListenerChanged(name,adding){if(!processMain)return;if(windows&&name!=='SIGHUP'&&name!=='SIGINT'&&name!=='SIGBREAK')return;var number=signals[name];if(number===undefined)return;var count=signalPublicCount(number)+(reportWatchName!==undefined&&signals[reportWatchName]===number?1:0);if(adding&&count===0)signalNativeWatch(number,true);else if(!adding&&count===0)signalNativeWatch(number,false)}
    __nonaRegexpVm.processSignalEmitter=process;__nonaRegexpVm.processSignalListenerChanged=signalListenerChanged;
    __nonaRegexpVm.processReportSignalWatch=function(name,enabled){if(!processMain||windows)return;var previous=reportWatchName,next=enabled?name:undefined;if(next===previous)return;if(next!==undefined)signalNativeWatch(signals[next],true);try{if(previous!==undefined&&signals[previous]!==signals[next]&&!signalPublicCount(signals[previous]))signalNativeWatch(signals[previous],false)}catch(error){if(next!==undefined&&signals[next]!==signals[previous]&&!signalPublicCount(signals[next]))signalNativeWatch(signals[next],false);throw error}reportWatchName=next};
    __nonaRegexpVm.hasSignalWatches=function(){return signalCount!==0};
    __nonaRegexpVm.pumpSignals=function(){
      if(!signalCount||signalsPrepared)return;
      for(var budget=0;budget<64;budget++){
        if(!signalCount)return;
        var number;
        if(windows||platform==='linux')number=host.signalPoll();
        else{var event=new Uint32Array(platform==='freebsd'?16:8),timeout=new Uint32Array(4),result=host.signalEvent(signalQueue,null,0,event,1,timeout);if(result===-4)return;signalResult(result,'kevent');if(!result)return;number=event[0]}
        if(!number)return;try{if(signalEntries[number]){if(reportWatchName!==undefined&&signals[reportWatchName]===number&&typeof __nonaRegexpVm.processReportSignal==='function')__nonaRegexpVm.processReportSignal(reportWatchName);var aliases=[];for(var alias in signals)if(signals[alias]===number&&apply(signalListenerCount,process,[alias]))apply(finalizationPush,aliases,[alias]);for(var i=0;i<aliases.length;i++)apply(signalEmit,process,[aliases[i],aliases[i]])}}finally{if(windows)host.signalAcknowledge(number)}
      }
    };
    function signalPrepareExec(){if(windows||platform==='linux')return;for(var i=1;i<signalEntries.length;i++)if(signalEntries[i])signalAction(i,signalEntries[i].previous,null);signalsPrepared=true}
    function signalRestoreExec(){if(!signalsPrepared)return;for(var i=1;i<signalEntries.length;i++)if(signalEntries[i])signalAction(i,signalEntries[i].action,null);signalsPrepared=false}
`;
