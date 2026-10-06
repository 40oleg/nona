/** Original diagnostic snapshots of the Nona runtime and its OS process. */
export const processReportSource=String.raw`
    var reportDirectory='',reportFilename='',reportCompact=false,reportExcludeEnv=false,reportExcludeNetwork=false;
    var reportSignal='SIGUSR2',reportFatal=false,reportOnSignal=false,reportUncaught=false,reportSequence=0;
    var reportMemory=process.memoryUsage,reportResources=process.resourceUsage,reportThread=process.threadCpuUsage,reportActive=process.getActiveResourcesInfo;
    function reportArgument(error){if(error!==undefined&&(error===null||typeof error!=='object'||reportIntrinsics.isArray(error)))throw argumentError('ERR_INVALID_ARG_TYPE','The err argument must be an object');return error}
    function reportStack(error){
      if(error===undefined)error=new reportIntrinsics.Error('JavaScript Callstack');
      var stack=error.stack,properties={},result;
      if(typeof stack!=='string'){var message='No stack.';if(error instanceof reportIntrinsics.Error&&typeof error.message==='string')message=(typeof error.name==='string'?error.name:'Error')+': '+error.message;result={message:message,stack:['Unavailable.'],errorProperties:properties}}
      else{var newline=stack.indexOf('\n');result={message:newline<0?stack:stack.slice(0,newline),errorProperties:properties};
       if(newline>=0){var frames=[],start=newline+1,end;while((end=stack.indexOf('\n',start))>=0){var frame=apply(reportIntrinsics.trim,stack.slice(start,end),[]);apply(reportIntrinsics.push,frames,[frame]);start=end+1}result.stack=frames}}
      for(var key of reportIntrinsics.keys(error))if(key!=='stack'&&key!=='message')defineProperty(properties,key,{value:reportIntrinsics.String(error[key]),writable:true,enumerable:true,configurable:true});return result
    }
    function reportSnapshot(error,event,trigger,filename){
      var date=new reportIntrinsics.Date(),memory=apply(reportMemory,process,[]),resources=apply(reportResources,process,[]);
      var header={runtime:'nona',reportVersion:1,event:event,trigger:trigger,filename:filename,dumpEventTime:apply(reportIntrinsics.iso,date,[]),dumpEventTimeStamp:reportIntrinsics.String(apply(reportIntrinsics.time,date,[])),processId:process.pid,commandLine:[],cwd:cwd(),nonaVersion:process.version,arch:process.arch,platform:platform,componentVersions:{},release:{}};
      for(var item of process.argv)apply(reportIntrinsics.push,header.commandLine,[item]);
      for(var key of reportIntrinsics.keys(process.versions))header.componentVersions[key]=process.versions[key];
      for(var key of reportIntrinsics.keys(process.release))header.release[key]=process.release[key];
      if(!reportExcludeNetwork){if(typeof __nonaRegexpVm.processReportNetworkInterfaces!=='function')throw new Error('Nona report network adapter is not installed');header.networkInterfaces=__nonaRegexpVm.processReportNetworkInterfaces()}
      var result={header:header,javascriptStack:reportStack(error),javascriptHeap:{totalMemory:memory.heapTotal,usedMemory:memory.heapUsed,externalMemory:memory.external,arrayBuffers:memory.arrayBuffers},resourceUsage:{rss:memory.rss},threadResourceUsage:apply(reportThread,process,[]),activeResources:apply(reportActive,process,[])};
      for(var key of reportIntrinsics.keys(resources))result.resourceUsage[key]=resources[key];
      if(!reportExcludeEnv){var environment={};for(var key of reportIntrinsics.keys(process.env))defineProperty(environment,key,{value:reportIntrinsics.String(process.env[key]),writable:true,enumerable:true,configurable:true});result.environmentVariables=environment}
      return result
    }
    function reportPad(number,width){var text=reportIntrinsics.String(number);while(text.length<width)text='0'+text;return text}
    function reportDefaultFilename(){var date=new reportIntrinsics.Date();return 'report.'+apply(reportIntrinsics.year,date,[])+reportPad(apply(reportIntrinsics.month,date,[])+1,2)+reportPad(apply(reportIntrinsics.date,date,[]),2)+'.'+reportPad(apply(reportIntrinsics.hour,date,[]),2)+reportPad(apply(reportIntrinsics.minute,date,[]),2)+reportPad(apply(reportIntrinsics.second,date,[]),2)+'.'+process.pid+'.0.'+reportPad(++reportSequence,3)+'.json'}
    function reportPath(filename,directory){if(directory===undefined)directory=reportDirectory;if(!directory||filename[0]==='/'||windows&&(filename[0]==='\\'||filename.length>1&&filename[1]===':'))return filename;var last=directory[directory.length-1];return directory+(last==='/'||windows&&last==='\\'?'':windows?'\\':'/')+filename}
    function reportWriteBytes(filename,bytes){
      if(filename==='stdout'||filename==='stderr'){nativeWrite(filename==='stdout'?1:2,bytes);return}
      var path=reportPath(filename),handle=windows?host.CreateFileW(wideString(path),1073741824,7,null,2,128,null):host.sys_open(cstring(path),platform==='linux'?577:1537,420);
      if(windows?(handle<0||handle===18446744073709551616):handle<0)throw hostError('open',windows?host.GetLastError():-handle,path);
      try{var offset=0,counter=new reportIntrinsics.Uint32Array(1);while(offset<bytes.length){var part=apply(reportIntrinsics.subarray,bytes,[offset,reportIntrinsics.min(offset+1048576,bytes.length)]),written;
        if(windows){if(!host.WriteFile(handle,part,part.length,counter,null))throw hostError('write',host.GetLastError(),path);written=counter[0]}
        else{written=host.sys_write(handle,part,part.length);if(written===-4)continue;if(written<0)throw hostError('write',-written,path)}
        if(written<=0||written>part.length)throw hostError('write',5,path);offset+=written
      }}finally{if(windows)host.CloseHandle(handle);else host.sys_close(handle)}
    }
    function reportWrite(filename,error,event,trigger){
      filename=filename||reportFilename||reportDefaultFilename();
      var snapshot=reportSnapshot(error,event,trigger,filename),bytes=encoder.encode(reportIntrinsics.stringify(snapshot,null,reportCompact?undefined:2)+'\n');
      try{nativeWrite(2,encoder.encode('\nWriting Nona report to file: '+filename+'\n'))}catch(ignored){}
      try{reportWriteBytes(filename,bytes)}catch(failure){try{nativeWrite(2,encoder.encode('Failed to write report to '+filename+': '+reportIntrinsics.String(failure)+'\n'))}catch(ignored){}return ''}
      try{nativeWrite(2,encoder.encode('Nona report completed\n'))}catch(ignored){}
      return filename
    }
    function reportAutomatic(error,event,trigger){try{return reportWrite('',error,event,trigger)}catch(failure){try{nativeWrite(2,encoder.encode('Failed to generate report: '+reportIntrinsics.String(failure)+'\n'))}catch(ignored){}return ''}}
    var report={writeReport:function writeReport(filename,error){if(filename!==null&&typeof filename==='object'&&!reportIntrinsics.isArray(filename)){error=filename;filename=undefined}if(filename!==undefined&&typeof filename!=='string')throw argumentError('ERR_INVALID_ARG_TYPE','The filename must be a string');reportArgument(error);return reportWrite(filename,error,'JavaScript API','API')},getReport:function getReport(error){reportArgument(error);return reportSnapshot(error,'JavaScript API','GetReport',null)}};
    function reportSetting(name,kind,get,set){defineProperty(report,name,{enumerable:true,configurable:true,get:get,set:function(value){if(typeof value!==kind)throw argumentError('ERR_INVALID_ARG_TYPE','The '+name+' must be a '+kind);set(value)}})}
    reportSetting('directory','string',function(){return reportDirectory},function(value){if(reportFatal)reportFatalUpdate(true,reportFilename,value);reportDirectory=value});
    reportSetting('filename','string',function(){return reportFilename},function(value){if(reportFatal)reportFatalUpdate(true,value,reportDirectory);reportFilename=value});
    reportSetting('compact','boolean',function(){return reportCompact},function(value){reportCompact=value});
    reportSetting('excludeNetwork','boolean',function(){return reportExcludeNetwork},function(value){reportExcludeNetwork=value});
    reportSetting('signal','string',function(){return reportSignal},function(value){if(typeof signals[value]!=='number')throw argumentError('ERR_UNKNOWN_SIGNAL','Unknown signal: '+value);if(reportOnSignal&&!windows)reportSignalUpdate(value,true);reportSignal=value});
    reportSetting('reportOnFatalError','boolean',function(){return reportFatal},function(value){reportFatalUpdate(value);reportFatal=value});
    reportSetting('reportOnSignal','boolean',function(){return reportOnSignal},function(value){if(!windows)reportSignalUpdate(reportSignal,value);reportOnSignal=value});
    reportSetting('reportOnUncaughtException','boolean',function(){return reportUncaught},function(value){reportUncaught=value});
    reportSetting('excludeEnv','boolean',function(){return reportExcludeEnv},function(value){reportExcludeEnv=value});
    function reportSignalUpdate(name,enabled){if(typeof __nonaRegexpVm.processReportSignalWatch!=='function')throw new Error('Nona report signal adapter is not installed');__nonaRegexpVm.processReportSignalWatch(name,enabled)}
    function reportFatalUpdate(enabled,filename,directory){
      if(typeof host.reportConfigure!=='function')throw new Error('Nona fatal report adapter is not installed');
      if(!enabled){host.reportConfigure(new reportIntrinsics.Uint8Array(0),0,new reportIntrinsics.Uint8Array(0),0);return}
      if(filename===undefined)filename=reportFilename;filename=filename||reportDefaultFilename();var path=reportPath(filename,directory);
      var nativePath=filename==='stdout'||filename==='stderr'?new reportIntrinsics.Uint8Array([0,filename==='stdout'?1:2]):windows?wideString(path):cstring(path),header=encoder.encode('{"header":'+reportIntrinsics.stringify({runtime:'nona',reportVersion:1,event:'FatalError',trigger:'FatalError',filename:filename,nonaVersion:process.version,platform:platform,arch:process.arch,configurationTime:apply(reportIntrinsics.iso,new reportIntrinsics.Date(),[])})+',"javascriptHeap":{');
      var status=host.reportConfigure(nativePath,nativePath.byteLength,header,header.byteLength);if(status)throw hostError('reportConfigure',status,path)
    }
    __nonaRegexpVm.processReportSignal=function(name){if(reportOnSignal&&name===reportSignal)reportAutomatic(undefined,name,'Signal')};
    value('report',report);
`;
