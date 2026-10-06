/** Duplex shares the two side states; Transform couples their pressure. */
export const streamDuplexSource=String.raw`
 var defaultInstance=Function.prototype[Symbol.hasInstance],propertyNames=Object.getOwnPropertyNames,descriptor=Object.getOwnPropertyDescriptor;
 define(Writable,Symbol.hasInstance,{value:function(value){if(apply(defaultInstance,this,[value]))return true;if(this!==Writable)return false;var common=apply(weakGet,states,[value]);return !!(common&&common.writable)}});
 for(var name of propertyNames(Writable.prototype))if(name!=='constructor'&&!(name in Duplex.prototype))define(Duplex.prototype,name,descriptor(Writable.prototype,name));
 function initializeDuplex(stream,options){initializeReadable(stream,options);initializeWritable(stream,options);stream.allowHalfOpen=options.allowHalfOpen!==false;
  if(options.readable===false){var r=readableState(stream);r.eof=r.ended=true}
  if(options.writable===false){var w=writableState(stream);w.ending=w.ended=w.finished=true}
  stream.once('end',function(){if(!stream.allowHalfOpen&&!writableState(stream).ending)later(function(){if(!writableState(stream).ending&&!state(stream).destroyed)stream.end()})})
 }
 function initializeTransform(stream,options){state(stream).transform={pending:null};readableState(stream).sync=false;for(var name of ['transform','flush'])hook(stream,options,name)}
 Transform.prototype._transform=function(chunk,encoding,callback){callback(error(Error,'ERR_METHOD_NOT_IMPLEMENTED','The _transform() method is not implemented'))};
 Transform.prototype._read=function(){var s=state(this).transform,callback=s.pending;s.pending=null;readableState(this).reading=false;if(callback)callback()};
 Transform.prototype._write=function(chunk,encoding,callback){var stream=this,common=state(stream),s=common.transform,called=false;
  stream._transform(chunk,encoding,function(reason,value){if(called){destroyStream(stream,error(Error,'ERR_MULTIPLE_CALLBACK','Callback called multiple times'));return}called=true;if(reason){callback(reason);return}if(value!==undefined&&value!==null)stream.push(value);var r=readableState(stream);if(r.length>=r.hwm&&r.length&&!r.eof)s.pending=callback;else callback()})
 };
 Transform.prototype._final=function(callback){var stream=this,called=false;function complete(reason,value){if(called){destroyStream(stream,error(Error,'ERR_MULTIPLE_CALLBACK','Callback called multiple times'));return}called=true;if(reason){callback(reason);return}if(value!==undefined&&value!==null)stream.push(value);stream.push(null);callback()}
  if(typeof stream._flush==='function')stream._flush(complete);else complete()
 };
 PassThrough.prototype._transform=function(chunk,encoding,callback){callback(null,chunk)};
`;
