/** Pipe records keep each destination's drain wait and listeners independent. */
export const streamPipeSource=String.raw`
 var arraySplice=Array.prototype.splice;
 function pipeRecords(stream){var s=readableState(stream);if(!s.pipes)s.pipes=[];return s.pipes}
 function pipeWaiting(stream){for(var record of pipeRecords(stream))if(record.active&&record.waiting)return true;return false}
 function disconnectPipe(stream,record){if(!record.active)return;var waiting=record.waiting;record.active=false;record.waiting=false;var records=pipeRecords(stream);for(var i=0;i<records.length;i++)if(records[i]===record){apply(arraySplice,records,[i,1]);break}
  if(!records.length)readableState(stream).flowing=false;record.destination.emit('unpipe',stream,{hasUnpiped:false})
  if(waiting&&records.length&&!readableState(stream).unpipeAll&&!pipeWaiting(stream)&&stream.listenerCount('data'))stream.resume()
 }
 Readable.prototype.pipe=function(destination,options){var stream=this,s=readableState(stream);if(!destination||typeof destination.write!=='function'||typeof destination.on!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The destination must be a writable stream');options=options||{};
  var record={destination:destination,waiting:false,active:true,cleaned:false};append(pipeRecords(stream),record);
  function cleanup(){if(record.cleaned)return;record.cleaned=true;stream.removeListener('data',ondata);stream.removeListener('end',onend);destination.removeListener('drain',ondrain);destination.removeListener('error',onerror);destination.removeListener('finish',onfinish);destination.removeListener('close',onclose);destination.removeListener('unpipe',onunpipe);
   if(record.waiting){record.waiting=false;if(!pipeWaiting(stream)&&stream.listenerCount('data'))stream.resume()}
  }
  function ondata(chunk){if(!record.active)return;var accepted=destination.write(chunk);if(!accepted&&record.active&&!record.waiting){record.waiting=true;stream.pause()}}
  function ondrain(){if(!record.active)return;record.waiting=false;if(!pipeWaiting(stream)&&stream.listenerCount('data'))stream.resume()}
  function onend(){if(options.end!==false&&!(vm.isProcessOutput&&vm.isProcessOutput(destination))&&typeof destination.end==='function')destination.end();else disconnectPipe(stream,record)}
  function onfinish(){disconnectPipe(stream,record)}
  function onclose(){disconnectPipe(stream,record)}
  function onerror(reason){disconnectPipe(stream,record);if(!destination.listenerCount('error'))destination.emit('error',reason)}
  function onunpipe(source,info){if(source!==stream||info.hasUnpiped)return;info.hasUnpiped=true;cleanup()}
  destination.on('unpipe',onunpipe);destination.on('drain',ondrain);destination.prependListener('error',onerror);destination.once('finish',onfinish);destination.once('close',onclose);
  stream.on('data',ondata);stream.once('end',onend);destination.emit('pipe',stream);if(s.ended)later(onend);return destination
 };
 Readable.prototype.unpipe=function(destination){var records=pipeRecords(this).slice();if(destination===undefined){var s=readableState(this);s.unpipeAll=true;for(var record of records)disconnectPipe(this,record);s.unpipeAll=false;s.flowing=false}else for(var record of records)if(record.destination===destination){disconnectPipe(this,record);break}return this};
 Writable.prototype.pipe=function(){this.emit('error',error(Error,'ERR_STREAM_CANNOT_PIPE','Cannot pipe, not readable'));return undefined};
 Stream.prototype.pipe=function(destination,options){var source=this;options=options||{};function data(chunk){if(destination.writable&&destination.write(chunk)===false&&typeof source.pause==='function')source.pause()}function drain(){if(source.readable&&typeof source.resume==='function')source.resume()}function end(){if(options.end!==false&&!(vm.isProcessOutput&&vm.isProcessOutput(destination))&&typeof destination.end==='function')destination.end()}source.on('data',data);destination.on('drain',drain);source.once('end',end);destination.emit('pipe',source);return destination};
`;
