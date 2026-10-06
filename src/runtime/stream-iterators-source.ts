/** Iterator factories and Readable consumption use the same demand queue. */
export const streamIteratorsSource=String.raw`
 var resolvePromise=Promise.resolve.bind(Promise),rejectPromise=Promise.reject.bind(Promise),asyncIteratorSymbol=Symbol.asyncIterator,iteratorSymbol=Symbol.iterator,iteratorClosingErrors=new WeakMap();
 function abortError(reason){var value=error(Error,'ABORT_ERR','The operation was aborted');value.name='AbortError';if(reason!==undefined)value.cause=reason;return value}
 function prematureClose(){return error(Error,'ERR_STREAM_PREMATURE_CLOSE','Premature close')}
 function iteratorCloseReason(){var reason=abortError();apply(weakSet,iteratorClosingErrors,[reason,true]);return reason}
 function iteratorOf(input){if(input===null||input===undefined)throw error(TypeError,'ERR_INVALID_ARG_TYPE','The iterable must implement an iterator');var method=input[asyncIteratorSymbol]||input[iteratorSymbol];if(typeof method!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The iterable must implement an iterator');var iterator=apply(method,input,[]);if(!iterator||typeof iterator.next!=='function')throw error(TypeError,'ERR_INVALID_ARG_TYPE','Expected an iterator');return iterator}
 Readable.from=function(input,options){options=optionsOf(options);var streamOptions={objectMode:true};for(var key of Object.keys(options))streamOptions[key]=options[key];
  var iterator;if(typeof input==='string'||apply(isBuffer,Bytes,[input])){var supplied=false;iterator={next:function(){if(supplied)return {done:true};supplied=true;return {value:input,done:false}}}}else iterator=iteratorOf(input);
  var stream,busy=false,done=false,closed=false;
  function fault(reason){busy=false;stream.destroy(reason)}
  function value(item){if(item===null){fault(error(TypeError,'ERR_STREAM_NULL_VALUES','May not write null values to stream'));return false}if(state(stream).destroyed){busy=false;return false}var accepted=stream.push(item);if(!accepted)busy=false;return accepted}
  function result(item){if(!item||typeof item!=='object')throw error(TypeError,'ERR_INVALID_ARG_TYPE','Iterator result must be an object');if(item.done){done=true;busy=false;stream.push(null);return false}var chunk=item.value;if(chunk!==null&&(typeof chunk==='object'||typeof chunk==='function')&&typeof chunk.then==='function'){resolvePromise(chunk).then(function(item){if(value(item))pump()},fault);return false}return value(chunk)}
  function pump(){busy=true;try{while(!state(stream).destroyed&&!done){var item=iterator.next();if(item!==null&&(typeof item==='object'||typeof item==='function')&&typeof item.then==='function'){resolvePromise(item).then(function(item){try{if(result(item))pump()}catch(reason){fault(reason)}},fault);return}if(!result(item))return}busy=false}catch(reason){fault(reason)}}
  streamOptions.read=function(){if(!busy&&!done)pump()};
  streamOptions.destroy=function(reason,callback){if(closed||done){callback(reason);return}closed=true;var returned;try{returned=typeof iterator['return']==='function'?iterator['return']():undefined}catch(cause){callback(cause);return}resolvePromise(returned).then(function(){callback(reason)},callback)};
  stream=new Readable(streamOptions);return stream
 };
 Readable.prototype.iterator=function(options){options=optionsOf(options);var stream=this,s=readableState(stream),pending=[],ended=false,returned=false,failure=null,started=false;
  function cleanup(){stream.removeListener('readable',wake);stream.removeListener('end',onend);stream.removeListener('close',onclose)}
  function settle(){while(pending.length){var job=shift(pending);if(failure&&!returned)job.reject(failure);else job.resolve({value:undefined,done:true})}}
  function onerror(reason){failure=reason;settle()}
  function onend(){ended=true;settle();cleanup()}
  function onclose(){if(!ended&&!returned&&!failure)failure=state(stream).errored||prematureClose();settle();cleanup()}
  function start(){if(started)return;started=true;stream.on('error',onerror);stream.on('end',onend);stream.on('close',onclose);stream.on('readable',wake)}
  function wake(){try{while(pending.length&&!failure&&!returned&&!ended){var value=stream.read();if(value===null)break;shift(pending).resolve({value:value,done:false})}}catch(reason){failure=reason;settle();stream.destroy(reason)}}
  var iterator={next:function(){start();if(failure)return rejectPromise(failure);if(returned||ended||s.ended)return resolvePromise({value:undefined,done:true});return new Promise(function(resolve,reject){append(pending,{resolve:resolve,reject:reject});wake()})},
   'return':function(){returned=true;settle();cleanup();if(options.destroyOnReturn===false)return resolvePromise({value:undefined,done:true});start();return new Promise(function(resolve){if(state(stream).closed){resolve({value:undefined,done:true});return}stream.once('close',function(){resolve({value:undefined,done:true})});stream.destroy(iteratorCloseReason())})},
   'throw':function(reason){returned=true;settle();cleanup();start();stream.destroy(reason);return rejectPromise(reason)}
  };iterator[asyncIteratorSymbol]=function(){return this};return iterator
 };
 Readable.prototype[asyncIteratorSymbol]=function(){return this.iterator()};
`;
