/** Writable queue and completion state, inserted in the shared stream closure. */
export const streamWritableSource=String.raw`
 var bufferFrom=Bytes.from,bufferIsEncoding=Bytes.isEncoding,bufferIsBuffer=Bytes.isBuffer;
 function later(callback){vm.enqueueNextTick(callback,[])}
 function append(array,value){apply(arrayPush,array,[value])}
 function shift(array){return apply(arrayShift,array,[])}
 function highWaterMark(options,side,objectMode){var value=options.highWaterMark;if(value==null)value=options[side+'HighWaterMark'];if(value==null)return getDefaultHighWaterMark(objectMode);if(typeof value!=='number'||!isInteger(value)||value<0)throw error(TypeError,'ERR_INVALID_ARG_VALUE','Invalid highWaterMark');return value}
 function hook(stream,options,name){var value=options[name];if(value!==undefined){if(typeof value!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE',name+' must be a function');stream['_'+name]=value}}
 function initializeWritable(stream,options){
  var common=state(stream),objectMode=!!(options.objectMode||options.writableObjectMode);
  common.autoDestroy=options.autoDestroy!==false;common.emitClose=options.emitClose!==false;
  common.writable={objectMode:objectMode,decodeStrings:options.decodeStrings!==false,encoding:options.defaultEncoding||'utf8',hwm:highWaterMark(options,'writable',objectMode),length:0,queue:[],corked:0,writing:false,pendingCallbacks:0,ending:false,ended:false,finished:false,finishing:false,finalCalled:false,finalDone:false,needDrain:false,enabled:options.writable!==false,endCallbacks:[]};
  for(var name of ['write','writev','destroy','final','construct'])hook(stream,options,name);
  constructStream(stream);
 }
 function failWritable(stream,reason,entries){var common=state(stream),s=writableState(stream);if(common.errored===null)common.errored=reason;
  for(var entry of entries){s.pendingCallbacks--;entry.callback(reason)}
  while(s.queue.length){var entry=shift(s.queue);s.length-=entry.length;s.pendingCallbacks--;entry.callback(reason)}
  if(s.pendingCallbacks){destroyStream(stream,reason);return}
  var callbacks=s.endCallbacks;s.endCallbacks=[];if(!s.endErrorDeferred)for(var callback of callbacks)callback(reason);destroyStream(stream,reason);if(s.endErrorDeferred)for(var callback of callbacks)callback(reason)
 }
 function constructStream(stream){var common=state(stream);if(common.constructInitialized)return;common.constructInitialized=true;
  if(typeof stream._construct!=='function')return;common.constructing=true;
  later(function(){var called=false;function complete(reason){if(called){destroyStream(stream,error(Error,'ERR_MULTIPLE_CALLBACK','Callback called multiple times'));return}called=true;common.constructing=false;
   if(reason){if(common.writable)failWritable(stream,reason,[]);else destroyStream(stream,reason)}
   if(common.pendingDestroy){var perform=common.pendingDestroy;common.pendingDestroy=null;perform();return}if(reason)return;
   if(common.writable)flushWritable(stream);if(common.readable)scheduleReadableWork(stream)
  }try{stream._construct(complete)}catch(reason){complete(reason)}})
 }
 function writableState(stream){var value=state(stream).writable;if(!value)throw error(TypeError,'ERR_INVALID_THIS','Expected a writable stream');return value}
 function destroyStream(stream,reason,callback){
  var common=state(stream);if(common.destroyed){if(callback)later(function(){callback(reason)});return stream}
  common.destroyed=true;if(reason&&common.errored===null)common.errored=reason;
  if(common.writable&&!common.writable.writing)later(function(){var s=common.writable,fault=common.errored||error(Error,'ERR_STREAM_DESTROYED','Cannot call write after a stream was destroyed');while(s.queue.length){var entry=shift(s.queue);s.length-=entry.length;s.pendingCallbacks--;entry.callback(fault)}if(!s.pendingCallbacks){var callbacks=s.endCallbacks;s.endCallbacks=[];for(var fn of callbacks)fn(fault)}});
  var done=false;
  function complete(cause){if(done)return;done=true;common.closed=true;if(cause&&common.errored===null)common.errored=cause;
   later(function(){if(callback)callback(cause);if(cause&&!common.errorEmitted){common.errorEmitted=true;stream.emit('error',cause)}if(common.emitClose!==false)stream.emit('close')})
  }
  function perform(){try{stream._destroy(reason||common.errored||null,complete)}catch(cause){complete(cause)}}
  if(common.constructing)common.pendingDestroy=perform;else perform();return stream
 }
 function defaultDestroy(reason,callback){callback(reason)}
 Writable.prototype._destroy=defaultDestroy;
 Writable.prototype.destroy=function(reason,callback){return destroyStream(this,reason,callback)};
 Writable.prototype._write=function(chunk,encoding,callback){callback(error(Error,'ERR_METHOD_NOT_IMPLEMENTED','The _write() method is not implemented'))};
 function finishWritable(stream){
  var common=state(stream),s=writableState(stream);
  if(!s.ending||s.writing||s.queue.length||s.finished||common.destroyed||common.constructing)return;
  if(!s.finalCalled){s.finalCalled=true;
   if(typeof stream._final==='function'){var called=false;stream._final(function(reason){if(called){destroyStream(stream,error(Error,'ERR_MULTIPLE_CALLBACK','Callback called multiple times'));return}called=true;if(reason){failWritable(stream,reason,[]);return}s.finalDone=true;stream.emit('prefinish');finishWritable(stream)});return}
   s.finalDone=true;stream.emit('prefinish')
  }
  if(!s.finalDone||s.pendingCallbacks||s.finishing)return;s.finishing=true;
  later(function(){if(common.destroyed||s.finished)return;s.finished=true;s.needDrain=false;var callbacks=s.endCallbacks;s.endCallbacks=[];for(var fn of callbacks)fn();stream.emit('finish');if(common.autoDestroy&&(!common.readable||common.readable.ended))destroyStream(stream)})
 }
 function flushWritable(stream){
  var common=state(stream),s=writableState(stream);if(s.writing||s.corked||common.destroyed||common.constructing||s.flushing)return;
  s.flushing=true;
  try{while(!s.writing&&!s.corked&&!common.destroyed&&s.queue.length){writeEntries(stream)}}finally{s.flushing=false}
  if(!s.writing&&!s.queue.length)finishWritable(stream)
 }
 function writeEntries(stream){var common=state(stream),s=writableState(stream);
  var entries=[];if(typeof stream._writev==='function'&&s.queue.length>1){while(s.queue.length)append(entries,shift(s.queue))}else append(entries,shift(s.queue));
  s.writing=true;var synchronous=true,called=false,failed=false;
  function complete(reason){
   if(called){destroyStream(stream,error(Error,'ERR_MULTIPLE_CALLBACK','Callback called multiple times'));return}called=true;failed=!!reason;if(reason&&common.errored===null)common.errored=reason;s.writing=false;
   for(var entry of entries)s.length-=entry.length;
   function notify(){
    if(reason){failWritable(stream,reason,entries);return}
    if(s.needDrain&&s.length===0&&!s.ending&&!common.destroyed){s.needDrain=false;stream.emit('drain')}
    for(var entry of entries){s.pendingCallbacks--;entry.callback(common.destroyed?null:undefined)}
    if(common.destroyed){var fault=common.errored||error(Error,'ERR_STREAM_DESTROYED','Cannot call write after a stream was destroyed');while(s.queue.length){var entry=shift(s.queue);s.length-=entry.length;s.pendingCallbacks--;entry.callback(fault)}var callbacks=s.endCallbacks;s.endCallbacks=[];for(var callback of callbacks)callback(fault);return}
    finishWritable(stream)
   }
   if(synchronous)later(notify);else{if(!reason)flushWritable(stream);notify()}
  }
  if(entries.length>1||stream._write===Writable.prototype._write&&typeof stream._writev==='function'){var chunks=[];for(var entry of entries)append(chunks,{chunk:entry.chunk,encoding:entry.encoding});stream._writev(chunks,complete)}else stream._write(entries[0].chunk,entries[0].encoding,complete);
  synchronous=false;if(called&&!failed)flushWritable(stream)
 }
 Writable.prototype.write=function(chunk,encoding,callback){
  var stream=this,common=state(stream),s=writableState(stream);
  if(typeof encoding==='function'){callback=encoding;encoding=undefined}if(callback===undefined)callback=function(){};if(typeof callback!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The callback must be a function');
  if(chunk===null)throw error(TypeError,'ERR_STREAM_NULL_VALUES','May not write null values to stream');
  var length=1;
  if(!s.objectMode){
   if(typeof chunk==='string'){encoding=encoding===undefined?s.encoding:encoding;if(!apply(bufferIsEncoding,Bytes,[encoding]))throw error(TypeError,'ERR_UNKNOWN_ENCODING','Unknown encoding: '+toString(encoding));if(s.decodeStrings){chunk=apply(bufferFrom,Bytes,[chunk,encoding]);encoding='buffer'}}
   else if(isView(chunk)){if(!apply(bufferIsBuffer,Bytes,[chunk]))chunk=apply(bufferFrom,Bytes,[chunk.buffer,chunk.byteOffset,chunk.byteLength]);encoding='buffer'}
   else throw error(TypeError,'ERR_INVALID_ARG_TYPE','The chunk must be a string, Buffer or ArrayBuffer view');
   length=chunk.length
  }else if(typeof chunk==='string')encoding=encoding===undefined?s.encoding:encoding;
  if(common.errored&&!common.destroyed){s.pendingCallbacks++;append(s.queue,{chunk:chunk,encoding:encoding,callback:callback,length:0});return false}
  var failure=s.ending?error(Error,'ERR_STREAM_WRITE_AFTER_END','write after end'):common.destroyed?error(Error,'ERR_STREAM_DESTROYED','Cannot call write after a stream was destroyed'):null;
  if(failure){later(function(){callback(failure);if(!common.destroyed)destroyStream(stream,failure)});return false}
  s.length+=length;s.pendingCallbacks++;append(s.queue,{chunk:chunk,encoding:encoding,callback:callback,length:length});flushWritable(stream);
  var accepted=s.length<s.hwm||s.length===0;if(!accepted)s.needDrain=true;return accepted&&!common.destroyed&&!common.errored
 };
 Writable.prototype.cork=function(){writableState(this).corked++};
 Writable.prototype.uncork=function(){var s=writableState(this);if(s.corked)s.corked--;flushWritable(this)};
 Writable.prototype.setDefaultEncoding=function(encoding){if(!apply(bufferIsEncoding,Bytes,[encoding]))throw error(TypeError,'ERR_UNKNOWN_ENCODING','Unknown encoding: '+toString(encoding));writableState(this).encoding=toString(encoding).toLowerCase();return this};
 Writable.prototype.end=function(chunk,encoding,callback){
  var stream=this,s=writableState(stream),common=state(stream);if(typeof chunk==='function'){callback=chunk;chunk=undefined;encoding=undefined}else if(typeof encoding==='function'){callback=encoding;encoding=undefined}
  if(callback!==undefined&&typeof callback!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The callback must be a function');
  if(s.finished||common.destroyed){if(callback)later(function(){callback(s.finished?error(Error,'ERR_STREAM_ALREADY_FINISHED','Cannot call end after a stream was finished'):error(Error,'ERR_STREAM_DESTROYED','Cannot call end after a stream was destroyed'))});return stream}
  if(chunk!==undefined&&chunk!==null)stream.write(chunk,encoding);if(callback)append(s.endCallbacks,callback);s.endErrorDeferred=state(stream).errored!==null;s.ending=s.ended=true;s.corked=0;if(!state(stream).errored)flushWritable(stream);return stream
 };
 function getter(prototype,name,read){define(prototype,name,{get:read,configurable:true})}
 for(var pair of [['writableLength','length'],['writableObjectMode','objectMode'],['writableHighWaterMark','hwm'],['writableCorked','corked'],['writableNeedDrain','needDrain'],['writableEnded','ended'],['writableFinished','finished']]){
  (function(name,key){getter(Writable.prototype,name,function(){return writableState(this)[key]})})(pair[0],pair[1])
 }
 getter(Writable.prototype,'writable',function(){var s=writableState(this);return s.enabled&&!s.ending&&!state(this).destroyed});
 getter(Writable.prototype,'writableAborted',function(){return !writableState(this).finished&&(state(this).destroyed||state(this).errored!==null)});
 getter(Writable.prototype,'writableBuffer',function(){return writableState(this).queue.slice()});
 for(var name of ['destroyed','closed','errored'])(function(key){getter(Stream.prototype,key,function(){return state(this)[key]})})(name);
`;
