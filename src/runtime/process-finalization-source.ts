/** Original process lifecycle finalization with native GC-owned callback metadata. */
export const processFinalizationSource=String.raw`
    var finalizationMap=WeakMap,finalizationSet=WeakMap.prototype.set,finalizationHas=WeakMap.prototype.has;
    var finalizationApply=Reflect.apply,finalizationOn=process.on,finalizationOff=process.removeListener;
    var finalizationExit=[],finalizationBefore=[],finalizationExitListening=false,finalizationBeforeListening=false,finalizationExitDepth=0,finalizationBeforeDepth=0;
    function finalizationClear(entry){entry.active=false;finalizationNative(entry.map,2,undefined)}
    function finalizationRun(entries,event){
      if(event==='exit')finalizationExitDepth++;else finalizationBeforeDepth++;
      try{
      for(var index=0;index<entries.length;index++){
        var entry=entries[index];if(!entry.active)continue;
        var target=finalizationNative(entry.map,0);
        if(target!==undefined){var callback=finalizationNative(entry.map,1);finalizationApply(callback,undefined,[target,event])}
        target=undefined;callback=undefined;
      }
      for(var index=0;index<entries.length;index++)finalizationClear(entries[index]);
      entries.length=0;
      }finally{
        if(event==='exit')finalizationExitDepth--;else finalizationBeforeDepth--;
        finalizationDetachEmpty(entries,event,event==='exit'?finalizeExit:finalizeBefore);
      }
    }
    function finalizeExit(){finalizationRun(finalizationExit,'exit');finalizationApply(finalizationOff,process,['exit',finalizeExit]);finalizationExitListening=false}
    function finalizeBefore(){finalizationRun(finalizationBefore,'beforeExit');finalizationApply(finalizationOff,process,['beforeExit',finalizeBefore]);finalizationBeforeListening=false}
    function finalizationRegister(target,callback,before){
      if(target===null||(typeof target!=='object'&&typeof target!=='function'))throw argumentError('ERR_INVALID_ARG_TYPE','The finalization reference must be an object or function');
      var map=new finalizationMap();finalizationApply(finalizationSet,map,[target,true]);finalizationNative(map,2,callback);
      var entry={map:map,active:true};
      if(before){finalizationBefore.push(entry);if(!finalizationBeforeListening){finalizationBeforeListening=true;finalizationApply(finalizationOn,process,['beforeExit',finalizeBefore])}}
      else{finalizationExit.push(entry);if(!finalizationExitListening){finalizationExitListening=true;finalizationApply(finalizationOn,process,['exit',finalizeExit])}}
    }
    function finalizationDetachEmpty(entries,event,listener){
      // Preserve indices while a callback is dispatching; outside dispatch,
      // unregister also releases its WeakMap and bookkeeping immediately.
      if((event==='exit'?finalizationExitDepth:finalizationBeforeDepth)===0)for(var index=entries.length-1;index>=0;index--)if(!entries[index].active)entries.splice(index,1);
      for(var index=0;index<entries.length;index++)if(entries[index].active)return;
      finalizationApply(finalizationOff,process,[event,listener]);
      if(event==='exit')finalizationExitListening=false;else finalizationBeforeListening=false;
    }
    value('finalization',{
      register:function register(target,callback){finalizationRegister(target,callback,false)},
      registerBeforeExit:function registerBeforeExit(target,callback){finalizationRegister(target,callback,true)},
      unregister:function unregister(target){
        for(var lists=[finalizationExit,finalizationBefore],list=0;list<lists.length;list++)for(var index=0;index<lists[list].length;index++){
          var entry=lists[list][index];if(entry.active&&finalizationApply(finalizationHas,entry.map,[target]))finalizationClear(entry)
        }
        finalizationDetachEmpty(finalizationExit,'exit',finalizeExit);finalizationDetachEmpty(finalizationBefore,'beforeExit',finalizeBefore);
      }
    });
`;
