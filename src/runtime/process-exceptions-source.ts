/** Original process exception dispatch, installed only by the lazy process build. */
export const processExceptionsSource=String.raw`
    var captureCallback=null,captureCallbacks=[],dispatchingException=false;
    value('addUncaughtExceptionCaptureCallback',function(callback){
      if(typeof callback!=='function')throw argumentError('ERR_INVALID_ARG_TYPE','The callback must be a function');
      captureCallbacks.push(callback)
    });
    value('hasUncaughtExceptionCaptureCallback',function(){return captureCallback!==null});
    value('setUncaughtExceptionCaptureCallback',function(callback){
      if(callback!==null&&typeof callback!=='function')throw argumentError('ERR_INVALID_ARG_TYPE','The callback must be a function or null');
      if(callback!==null&&captureCallback!==null){var error=new Error('An uncaught exception capture callback is already set');error.code='ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET';throw error}
      captureCallback=callback
    });
    function fatalException(error,code){
      try{err.write(String(error&&error.stack||error)+'\n')}catch(ignored){}
      process.exitCode=code;
      if(code===7)exitEmitted=true;
      else if(!exitEmitted){exitEmitted=true;try{if(exitCallback)exitCallback(code);code=process.exitCode===undefined?0:process.exitCode}catch(exitError){code=7}}
      if(windows)host.ExitProcess(code);else host.sys_exit(code);
      throw error
    }
    __nonaRegexpVm.dispatchUncaught=function(error,origin){
      if(origin===undefined)origin='uncaughtException';
      if(dispatchingException)return fatalException(error,7);
      dispatchingException=true;
      try{
        process.emit('uncaughtExceptionMonitor',error,origin);
        if(captureCallback!==null){captureCallback(error);return true}
        for(var index=captureCallbacks.length-1;index>=0;index--)if(captureCallbacks[index](error)===true)return true;
        if(process.emit('uncaughtException',error,origin))return true
      }catch(handlerError){return fatalException(handlerError,7)}
      finally{dispatchingException=false}
      return fatalException(error,1)
    };
    __nonaRegexpVm.reportUnhandledRejection=function(reason,promise,fail){
      try{if(process.emit('unhandledRejection',reason,promise))return}catch(error){__nonaRegexpVm.dispatchUncaught(error,'uncaughtException');return}
      if(!fail)return;
      var branded;try{branded=__nonaRegexpVm.isRejectionError(reason)}catch(error){__nonaRegexpVm.dispatchUncaught(error,'uncaughtException');return}
      if(!branded){
        var description=reason!==null&&(typeof reason==='object'||typeof reason==='function')?'[object '+(typeof reason==='function'?'Function':'Object')+']':String(reason);
        var error=new Error('The promise rejected with the reason "'+description+'".');error.name='UnhandledPromiseRejection';error.code='ERR_UNHANDLED_REJECTION';reason=error
      }
      __nonaRegexpVm.dispatchUncaught(reason,'unhandledRejection')
    };
    __nonaRegexpVm.reportRejectionHandled=function(promise){try{process.emit('rejectionHandled',promise)}catch(error){__nonaRegexpVm.dispatchUncaught(error,'uncaughtException')}};
`;
