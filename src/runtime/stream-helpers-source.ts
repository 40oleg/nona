/** Completion observers and pipelines share terminal state and first error. */
export const streamHelpersSource=String.raw`
 function finished(stream,options,callback){if(typeof options==='function'){callback=options;options={}}options=optionsOf(options);if(typeof callback!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The callback must be a function');if(webStreamStatus(stream))return finishedWeb(stream,options,callback);if(!stream||typeof stream.on!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','Expected a stream');
  checkOperatorSignal(options.signal);var stopAbort=null,common=apply(weakGet,states,[stream]),readable=options.readable!==false&&(options.readable===true||(common?!!(common.readable&&common.readable.enabled):stream.readable!==undefined)),writable=options.writable!==false&&(options.writable===true||(common?!!(common.writable&&common.writable.enabled):stream.writable!==undefined)),readDone=!readable||!!stream.readableEnded,writeDone=!writable||!!stream.writableFinished,called=false;
  function cleanup(){stream.removeListener('end',onend);stream.removeListener('finish',onfinish);stream.removeListener('error',onerror);stream.removeListener('close',onclose);if(stopAbort){stopAbort();stopAbort=null}}
  function complete(reason){if(called)return;called=true;if(stopAbort){stopAbort();stopAbort=null}if(options.cleanup)cleanup();callback(reason)}
  function check(){if(readDone&&writeDone)complete()}
  function onend(){readDone=true;check()}
  function onfinish(){writeDone=true;check()}
  function onerror(reason){if(options.error!==false)complete(reason)}
  function onclose(){readDone=readDone||!!stream.readableEnded;writeDone=writeDone||!!stream.writableFinished;if(readDone&&writeDone)complete();else complete(stream.errored||prematureClose())}
  stream.on('end',onend);stream.on('finish',onfinish);stream.on('error',onerror);stream.on('close',onclose);
  if(options.signal){function abort(){cleanup();complete(abortError(options.signal.reason))}if(options.signal.aborted)later(abort);else stopAbort=watchAbort(options.signal,abort)}
  if(stream.closed)later(onclose);else if(stream.errored&&options.error!==false)later(function(){onerror(stream.errored)});else if(readDone&&writeDone)later(check);return cleanup
 }
 function finishedPromise(stream,options){return new Promise(function(resolve,reject){finished(stream,options,function(reason){if(reason)reject(reason);else resolve()})})}
 function subscribeAbort(signal,callback){if(vm.events&&vm.events.isSignal(signal))return watchAbort(signal,callback);signal.addEventListener('abort',callback,{once:true});return function(){signal.removeEventListener('abort',callback)}}
 function pipeline(){var args=[];for(var i=0;i<arguments.length;i++)append(args,arguments[i]);var callback=args[args.length-1];if(typeof callback!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The callback must be a function');args.length--;
  var options={},tail=args[args.length-1];if(tail&&typeof tail==='object'&&!Array.isArray(tail)&&typeof tail.on!=='function'&&('signal' in tail||'end' in tail)){options=args.pop();checkOperatorSignal(options.signal)}var streams=args.length===1&&Array.isArray(args[0])?args[0]:args;if(streams.length<2)throw error(TypeError,'ERR_MISSING_ARGS','At least two streams are required');
  var ordinary=options.end!==false;for(var stream of streams)if(!stream||typeof stream.on!=='function')ordinary=false;if(!ordinary)return generalPipeline(streams,options,callback);
  var pending=streams.length,completed=false,firstError=null,stopAbort=null;
  function abort(){var reason=abortError(options.signal.reason);for(var stream of streams)if(typeof stream.destroy==='function'&&!stream.destroyed)stream.destroy(reason)}
  function complete(reason){if(completed)return;if(reason){if(!firstError)firstError=reason;for(var stream of streams)if(typeof stream.destroy==='function'&&!stream.destroyed)stream.destroy(firstError)}pending--;if(pending===0){completed=true;if(stopAbort){stopAbort();stopAbort=null}callback(firstError||undefined)}}
  for(var i=0;i<streams.length;i++)finished(streams[i],{readable:i<streams.length-1,writable:i>0},complete);
  if(options.signal){if(options.signal.aborted)later(abort);else stopAbort=subscribeAbort(options.signal,abort)}for(var i=0;i<streams.length-1;i++){var destination=streams[i+1];if(vm.isProcessOutput&&vm.isProcessOutput(destination))(function(source,target){source.once('end',function(){target.end()})})(streams[i],destination);streams[i].pipe(destination)}return streams[streams.length-1]
 }
 function generalPipeline(stages,options,callback){var controller=new Controller(),context={signal:controller.signal},members=[],completed=false,firstError=null,terminal=stages[stages.length-1],returned=typeof terminal==='function'?new PassThrough({objectMode:true}):terminal,stopAbort=null;
  function track(stream){if(!stream||typeof stream.on!=='function')return;append(members,stream);stream.on('error',function(reason){if(reason&&apply(weakGet,iteratorClosingErrors,[reason]))return;fail(reason)})}
  function fail(reason){if(!firstError)firstError=reason;controller.abort(reason);for(var stream of members)if(typeof stream.destroy==='function'&&!stream.destroyed)stream.destroy(firstError)}
  function abort(){fail(abortError(options.signal.reason))}
  function done(reason,value){if(completed)return;completed=true;if(stopAbort){stopAbort();stopAbort=null}if(reason)fail(reason);controller.abort();callback(firstError||undefined,value)}
  function inputOf(value){if(value&&typeof value.getReader==='function')value=Readable.fromWeb(value);if(value&&typeof value.on==='function'){track(value);return value}var input=Readable.from(value);track(input);return input}
  for(var member of stages)track(member);if(options.signal){if(options.signal.aborted)abort();else stopAbort=subscribeAbort(options.signal,abort)}
  (async function(){if(firstError)throw firstError;var source=typeof stages[0]==='function'?apply(stages[0],undefined,[context]):stages[0],input=inputOf(source);
   for(var index=1;index<stages.length;index++){if(firstError)throw firstError;var stage=stages[index],last=index===stages.length-1;
    if(typeof stage==='function'){var output=apply(stage,undefined,[input,context]);if(last&&output&&typeof output.then==='function'){var result=await output;if(returned&&typeof returned.end==='function')returned.end();return result}input=inputOf(output);if(last){for await(var chunk of input)returned.write(chunk);returned.end();return}continue}
    if(stage&&typeof stage.getWriter==='function')stage=Writable.fromWeb(stage);else if(stage&&stage.writable&&typeof stage.writable.getWriter==='function')stage=Duplex.fromWeb(stage);track(stage);if(!stage||typeof stage.write!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','Expected a writable stream');
    if(!last){input.pipe(stage);input=stage;continue}
    for await(var chunk of input){if(firstError)throw firstError;await new Promise(function(resolve,reject){stage.write(chunk,function(reason){if(reason)reject(reason);else resolve()})})}
    if(options.end!==false)await new Promise(function(resolve,reject){stage.end(function(reason){if(reason)reject(reason);else resolve()})});return
   }
  })().then(function(value){done(undefined,value)},function(reason){done(reason)});return returned
 }
 function pipelinePromise(){var args=[];for(var i=0;i<arguments.length;i++)append(args,arguments[i]);return new Promise(function(resolve,reject){append(args,function(reason,value){if(reason)reject(reason);else resolve(value)});apply(pipeline,undefined,args)})}
 define(Stream,'finished',{value:finished,writable:true,enumerable:true,configurable:true});define(Stream,'pipeline',{value:pipeline,writable:true,enumerable:true,configurable:true});
 var streamPromises={finished:finishedPromise,pipeline:pipelinePromise};define(Stream,'promises',{get:function(){return streamPromises},enumerable:true,configurable:true});
 function isDestroyed(stream){var common=apply(weakGet,states,[stream]);return common?common.destroyed:null}
 function isErrored(stream){var common=apply(weakGet,states,[stream]),web=webStreamStatus(stream);return !!(common&&common.errored!==null||web&&web.errored)}
 function isReadable(stream){var common=apply(weakGet,states,[stream]);if(common)return common.readable?stream.readable&&!isErrored(stream):null;var web=webStreamStatus(stream);return web?web.readable:stream&&typeof stream.readable==='boolean'?false:null}
 function isWritable(stream){var common=apply(weakGet,states,[stream]);if(common)return common.writable?stream.writable&&!isErrored(stream):null;var web=webStreamStatus(stream);return web?web.writable:stream&&typeof stream.writable==='boolean'?false:null}
 function isDisturbed(stream){var common=apply(weakGet,states,[stream]),web=webStreamStatus(stream);return !!(common&&common.readable&&(common.readable.didRead||common.destroyed)||web&&web.disturbed)}
 function addAbortSignal(signal,stream){if(!signal||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The signal must be an AbortSignal');if(!stream||typeof stream.destroy!=='function'&&!webStreamStatus(stream))throw error(TypeError,'ERR_INVALID_ARG_TYPE','Expected a stream');
  var disposed=false,subscription=null;function abort(){var reason=abortError(signal.reason);if(typeof stream.destroy==='function')stream.destroy(reason);else if(webStreamStatus(stream).abortable)destroyWebStream(stream,reason)}function dispose(){if(disposed)return;disposed=true;if(subscription&&typeof subscription[Symbol.dispose]==='function')subscription[Symbol.dispose]();else signal.removeEventListener('abort',abort)}
  if(signal.aborted)abort();else if(typeof EventEmitter.addAbortListener==='function')subscription=EventEmitter.addAbortListener(signal,abort);else signal.addEventListener('abort',abort,{once:true});finished(stream,dispose);return stream
 }
 function destroy(stream,reason){if(stream&&typeof stream.destroy==='function')stream.destroy(reason||abortError());else if(stream&&typeof stream.close==='function')stream.close();else if(stream)later(function(){if(reason)stream.emit('error',reason);stream.emit('close')})}
 for(var pair of [['isDestroyed',isDestroyed],['isErrored',isErrored],['isReadable',isReadable],['isWritable',isWritable],['isDisturbed',isDisturbed],['addAbortSignal',addAbortSignal],['destroy',destroy]])define(Stream,pair[0],{value:pair[1],writable:true,enumerable:true,configurable:true});Readable.isDisturbed=isDisturbed;
`;
