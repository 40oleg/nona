/** Readable demand, buffering and decoder state inside the shared closure. */
export const streamReadableSource=String.raw`
 var isBuffer=Bytes.isBuffer,bufferConcat=Bytes.concat,bufferAlloc=Bytes.alloc,byteSlice=Bytes.prototype.subarray,byteCopy=Bytes.prototype.copy,byteText=Bytes.prototype.toString,stringSlice=String.prototype.slice;
 var emitterOn=EventEmitter.prototype.on,emitterRemove=EventEmitter.prototype.removeListener,parseReadSize=parseInt;
 function encodingName(value){if(!apply(bufferIsEncoding,Bytes,[value]))throw error(TypeError,'ERR_UNKNOWN_ENCODING','Unknown encoding: '+toString(value));var name=toString(value).toLowerCase();return name==='utf-8'?'utf8':name==='ucs2'||name==='ucs-2'||name==='utf-16le'?'utf16le':name==='binary'?'latin1':name}
 function byteDecoder(encoding){var pending=apply(bufferAlloc,Bytes,[0]);
  return {write:function(bytes,last){var previous=pending.length,pair=encoding==='utf16le'&&previous>=2&&(pending[0]+pending[1]*256)>=55296&&(pending[0]+pending[1]*256)<=56319;if(pending.length){bytes=apply(bufferConcat,Bytes,[[pending,bytes]]);pending=apply(bufferAlloc,Bytes,[0])}
   var count=bytes.length;
   if(!last){if(encoding==='base64'||encoding==='base64url')count-=count%3;else if(encoding==='utf16le'){count-=count%2;if(pair&&count<4)count=0;else if(count>=2&&!(previous===1&&count===2)){var unit=bytes[count-2]+bytes[count-1]*256;if(unit>=55296&&unit<=56319)count-=2}}else if(encoding==='utf8'&&count){var start=count-1;while(start>0&&count-start<4&&(bytes[start]&192)===128)start--;var lead=bytes[start],expected=lead>=194&&lead<=223?2:lead>=224&&lead<=239?3:lead>=240&&lead<=244?4:1,available=count-start,valid=true;
    for(var i=start+1;i<count;i++)if((bytes[i]&192)!==128)valid=false;
    if(available>1&&(lead===224&&bytes[start+1]<160||lead===237&&bytes[start+1]>=160||lead===240&&bytes[start+1]<144||lead===244&&bytes[start+1]>=144))valid=false;
    if(valid&&expected>available)count=start
   }}
   if(count<bytes.length)pending=apply(byteSlice,bytes,[count]);return apply(byteText,apply(byteSlice,bytes,[0,count]),[encoding])
  }}
 }
 function initializeReadable(stream,options){var common=state(stream),objectMode=!!(options.objectMode||options.readableObjectMode);common.autoDestroy=options.autoDestroy!==false;common.emitClose=options.emitClose!==false;
  common.readable={objectMode:objectMode,hwm:highWaterMark(options,'readable',objectMode),queue:[],length:0,flowing:null,paused:false,eof:false,ended:false,reading:false,inRead:false,sync:true,didRead:false,encoding:null,decoder:null,notifyScheduled:false,workScheduled:false,flowScheduled:false,resumeScheduled:false,enabled:options.readable!==false};
  for(var name of ['read','destroy','construct'])hook(stream,options,name);constructStream(stream);if(options.encoding!==undefined)stream.setEncoding(options.encoding)
 }
 function readableState(stream){var value=state(stream).readable;if(!value)throw error(TypeError,'ERR_INVALID_THIS','Expected a readable stream');return value}
 Readable.prototype._destroy=defaultDestroy;Readable.prototype.destroy=function(reason,callback){return destroyStream(this,reason,callback)};
 Readable.prototype._read=function(){destroyStream(this,error(Error,'ERR_METHOD_NOT_IMPLEMENTED','The _read() method is not implemented'))};
 function endReadable(stream){var common=state(stream),s=readableState(stream);if(!s.eof||s.length||s.ended||s.endScheduled)return;s.endScheduled=true;
  later(function(){s.endScheduled=false;if(s.length||s.ended||common.destroyed)return;s.ended=true;stream.emit('end');if(common.autoDestroy&&(!common.writable||common.writable.finished))destroyStream(stream)})
 }
 function notifyReadable(stream){var s=readableState(stream);if(s.notifyScheduled||s.ended||state(stream).destroyed)return;s.notifyScheduled=true;
  later(function(){s.notifyScheduled=false;if(state(stream).destroyed)return;if(stream.listenerCount('readable')&&(s.length||s.eof))stream.emit('readable')})
 }
 function callRead(stream){var common=state(stream),s=readableState(stream);if(s.reading||s.inRead||s.eof||common.destroyed||common.constructing)return;s.reading=true;s.inRead=true;try{stream._read(s.hwm)}finally{s.inRead=false;s.sync=false}}
 function scheduleReadableWork(stream){var s=readableState(stream);if(s.workScheduled||s.eof||state(stream).destroyed)return;s.workScheduled=true;
  later(function(){s.workScheduled=false;if(state(stream).destroyed)return;while(!s.reading&&!s.eof&&s.length<s.hwm){var before=s.length;callRead(stream);if(before===s.length)break}if(s.flowing)flowReadable(stream)})
 }
 function flowReadable(stream){var s=readableState(stream);if(s.flowScheduled||state(stream).destroyed)return;s.flowScheduled=true;
  later(function(){s.flowScheduled=false;while(s.flowing&&!state(stream).destroyed){var chunk=stream.read();if(chunk===null)break}if(s.eof&&!s.length)endReadable(stream)})
 }
 function queueReadable(stream,chunk,front){var common=state(stream),s=readableState(stream);if(common.destroyed)return false;
  if(chunk===null){s.reading=false;if(s.eof)return false;s.eof=true;if(s.decoder){var tail=s.decoder.write(apply(bufferAlloc,Bytes,[0]),true);if(tail){append(s.queue,tail);s.length+=tail.length}}notifyReadable(stream);if(s.flowing)flowReadable(stream);return false}
  if(s.eof&&!front){destroyStream(stream,error(Error,'ERR_STREAM_PUSH_AFTER_EOF','stream.push() after EOF'));return false}
  if(s.ended&&front){destroyStream(stream,error(Error,'ERR_STREAM_UNSHIFT_AFTER_END_EVENT','stream.unshift() after end event'));return false}
  if(!s.objectMode){if(chunk===undefined){if(!front)s.reading=false;scheduleReadableWork(stream);return s.length<s.hwm}if(front&&s.encoding){if(typeof chunk!=='string')chunk=apply(byteText,apply(bufferFrom,Bytes,[chunk]),[s.encoding])}else{if(typeof chunk==='string')chunk=apply(bufferFrom,Bytes,[chunk]);else if(!apply(isBuffer,Bytes,[chunk])){if(!isView(chunk)){destroyStream(stream,error(TypeError,'ERR_INVALID_ARG_TYPE','The chunk must be a string, Buffer or ArrayBuffer view'));return false}chunk=apply(bufferFrom,Bytes,[chunk.buffer,chunk.byteOffset,chunk.byteLength])}if(s.decoder&&!front)chunk=s.decoder.write(chunk,false)}}
  if(!front)s.reading=false;var length=s.objectMode?1:chunk.length;if(!length){scheduleReadableWork(stream);return s.length<s.hwm}
  if(!front&&s.flowing&&!s.inRead&&!s.sync&&!s.length&&!stream.listenerCount('readable')){s.didRead=true;stream.emit('data',chunk);scheduleReadableWork(stream);return s.length<s.hwm}
  if(front){var queue=[chunk];for(var value of s.queue)append(queue,value);s.queue=queue}else append(s.queue,chunk);s.length+=length;
  notifyReadable(stream);scheduleReadableWork(stream);if(s.flowing&&!s.inRead)flowReadable(stream);return s.length<s.hwm
 }
 Readable.prototype.push=function(chunk,encoding){var s=readableState(this);if(typeof chunk==='string'&&encoding!==undefined&&!s.objectMode)chunk=apply(bufferFrom,Bytes,[chunk,encoding]);return queueReadable(this,chunk,false)};
 Readable.prototype.unshift=function(chunk,encoding){var s=readableState(this);if(typeof chunk==='string'&&encoding!==undefined&&!s.objectMode)chunk=apply(bufferFrom,Bytes,[chunk,encoding]);return queueReadable(this,chunk,true)};
 function consumeReadable(s,size){if(s.objectMode){s.length--;return shift(s.queue)}var first=s.queue[0];if(size===first.length){shift(s.queue);s.length-=size;return first}
  if(size<first.length){var piece=s.encoding?apply(stringSlice,first,[0,size]):apply(byteSlice,first,[0,size]);s.queue[0]=s.encoding?apply(stringSlice,first,[size]):apply(byteSlice,first,[size]);s.length-=size;return piece}
  var output=s.encoding?'':apply(bufferAlloc,Bytes,[size]),offset=0;
  while(offset<size){var chunk=s.queue[0],count=Math.min(chunk.length,size-offset);if(s.encoding)output+=apply(stringSlice,chunk,[0,count]);else apply(byteCopy,chunk,[output,offset,0,count]);offset+=count;if(count===chunk.length)shift(s.queue);else s.queue[0]=s.encoding?apply(stringSlice,chunk,[count]):apply(byteSlice,chunk,[count])}s.length-=size;return output
 }
 Readable.prototype.read=function(size){var common=state(this),s=readableState(this);if(common.destroyed)return null;
  var specified=size!==undefined;if(specified){size=parseReadSize(size,10);if(size!==size)specified=false;else if(size<0)return null;else if(size>1073741824)throw error(RangeError,'ERR_OUT_OF_RANGE','The size exceeds the maximum stream buffer');else if(size>s.hwm){var mark=1;while(mark<size)mark*=2;s.hwm=mark}}
  if(size===0){if(!s.eof&&s.length<s.hwm)callRead(this);if(s.eof&&!s.length)endReadable(this);return null}
  if(!s.eof&&(!s.length||specified&&size>s.length))callRead(this);
  var count=s.objectMode?(s.length?1:0):specified?size:s.flowing&&s.queue.length?s.queue[0].length:s.length;
  if(count>s.length){if(!s.eof){scheduleReadableWork(this);return null}count=s.length}
  if(!count){if(s.eof)endReadable(this);return null}
  if(!s.eof&&s.length-count<s.hwm){callRead(this);if(!specified&&!s.objectMode)count=s.flowing&&s.queue.length?s.queue[0].length:s.length}
  var chunk=consumeReadable(s,count);s.didRead=true;scheduleReadableWork(this);if(s.eof&&!s.length)endReadable(this);this.emit('data',chunk);return chunk
 };
 Readable.prototype.setEncoding=function(value){var s=readableState(this),encoding=encodingName(value),decoder=byteDecoder(encoding),chunks=[],length=0;
  for(var chunk of s.queue){var text=typeof chunk==='string'?chunk:decoder.write(chunk,false);if(text){append(chunks,text);length+=text.length}}if(s.eof){var tail=decoder.write(apply(bufferAlloc,Bytes,[0]),true);if(tail){append(chunks,tail);length+=tail.length}}s.queue=chunks;s.length=length;s.encoding=encoding;s.decoder=decoder;return this
 };
 Readable.prototype.resume=function(){var stream=this,s=readableState(stream);s.paused=false;if(!s.flowing){s.flowing=stream.listenerCount('readable')?false:true;if(!s.resumeScheduled){s.resumeScheduled=true;later(function(){s.resumeScheduled=false;if(state(stream).destroyed)return;stream.emit('resume');stream.read(0);if(s.flowing)flowReadable(stream)})}}return stream};
 Readable.prototype.pause=function(){var s=readableState(this);s.paused=true;if(s.flowing!==false){s.flowing=false;this.emit('pause')}return this};
 Readable.prototype.isPaused=function(){return readableState(this).flowing===false};
 Readable.prototype.on=Readable.prototype.addListener=function(name,listener){apply(emitterOn,this,[name,listener]);var s=readableState(this);if(name==='data'&&!s.paused)this.resume();else if(name==='readable'){s.flowing=false;scheduleReadableWork(this);if(s.length||s.eof)notifyReadable(this)}return this};
 Readable.prototype.removeListener=Readable.prototype.off=function(name,listener){apply(emitterRemove,this,[name,listener]);return this};
 for(var pair of [['readableLength','length'],['readableObjectMode','objectMode'],['readableHighWaterMark','hwm'],['readableFlowing','flowing'],['readableEncoding','encoding'],['readableEnded','ended'],['readableDidRead','didRead']])(function(name,key){getter(Readable.prototype,name,function(){return readableState(this)[key]})})(pair[0],pair[1]);
 getter(Readable.prototype,'readable',function(){var s=readableState(this);return s.enabled&&!s.ended&&!state(this).destroyed});
 getter(Readable.prototype,'readableAborted',function(){return !readableState(this).ended&&(state(this).destroyed||state(this).errored!==null)});
 getter(Readable.prototype,'readableBuffer',function(){return readableState(this).queue.slice()});
`;
