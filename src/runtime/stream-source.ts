import type {Target} from '../target.js';
import {streamWritableSource} from './stream-writable-source.js';
import {streamReadableSource} from './stream-readable-source.js';
import {streamPipeSource} from './stream-pipe-source.js';
import {streamDuplexSource} from './stream-duplex-source.js';
import {streamIteratorsSource} from './stream-iterators-source.js';
import {streamHelpersSource} from './stream-helpers-source.js';
import {streamOperatorsSource} from './stream-operators-source.js';
import {streamWebSource} from './stream-web-source.js';
import {streamConsumersSource} from './stream-consumers-source.js';
import {streamComposeSource} from './stream-compose-source.js';

/** Shared original stream constructors; module providers expose this exact object. */
export const streamPreludeSource=String.raw`;(function(){
 var runtime=__nonaRegexpVm,Bytes=runtime.bufferModule.Buffer,initialized=null,StorageWeakMap=WeakMap;
 var define=Object.defineProperty,own=Object.prototype.hasOwnProperty,apply=Reflect.apply,setPrototype=Object.setPrototypeOf,create=Object.create;
 var weakGet=WeakMap.prototype.get,weakSet=WeakMap.prototype.set;
 var isInteger=Number.isInteger,isView=ArrayBuffer.isView,toString=String;
 var startupDefine=define,Promise=globalThis.Promise,arrayPush=Array.prototype.push,arrayShift=Array.prototype.shift,arraySplice=Array.prototype.splice;
 function initialize(){if(initialized)return initialized;
 var vm=__nonaRegexpVm,EventEmitter=vm.eventEmitterModule,Bytes=vm.bufferModule.Buffer;
 var states=new StorageWeakMap();
 var defaultByteHwm=__NONA_STREAM_BYTE_HIGH_WATER_MARK__,defaultObjectHwm=16;
 function error(kind,code,message){var value=new kind(message);value.code=code;return value}
 function state(stream){var value=apply(weakGet,states,[stream]);if(!value)throw error(TypeError,'ERR_INVALID_THIS','Expected a stream');return value}
 function optionsOf(options){if(options===undefined||options===null)return {};if(typeof options!=='object')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The options must be an object');return options}
 function initStream(stream,options){if(!apply(weakGet,states,[stream])){apply(EventEmitter,stream,[options]);apply(weakSet,states,[stream,{destroyed:false,closed:false,errored:null,readable:null,writable:null}])}}
 function Stream(){if(!(this instanceof Stream))return new Stream();initStream(this)}
 Stream.prototype=create(EventEmitter.prototype);define(Stream.prototype,'constructor',{value:Stream,writable:true,configurable:true});setPrototype(Stream,EventEmitter);
 function inherit(constructor,parent){constructor.prototype=create(parent.prototype);define(constructor.prototype,'constructor',{value:constructor,writable:true,configurable:true});setPrototype(constructor,parent)}
 function Writable(options){if(!(this instanceof Writable))return new Writable(options);options=optionsOf(options);initStream(this,options);initializeWritable(this,options);if(options.signal)addAbortSignal(options.signal,this)}
 inherit(Writable,Stream);
 function Readable(options){if(!(this instanceof Readable))return new Readable(options);options=optionsOf(options);initStream(this,options);initializeReadable(this,options);if(options.signal)addAbortSignal(options.signal,this)}
 inherit(Readable,Stream);
 function Duplex(options){if(!(this instanceof Duplex))return new Duplex(options);options=optionsOf(options);initStream(this,options);initializeDuplex(this,options);if(options.signal)addAbortSignal(options.signal,this)}
 inherit(Duplex,Readable);
 function Transform(options){if(!(this instanceof Transform))return new Transform(options);options=optionsOf(options);Duplex.call(this,options);initializeTransform(this,options)}
 inherit(Transform,Duplex);
 function PassThrough(options){if(!(this instanceof PassThrough))return new PassThrough(options);Transform.call(this,options)}
 inherit(PassThrough,Transform);
 function getDefaultHighWaterMark(objectMode){return objectMode?defaultObjectHwm:defaultByteHwm}
 function setDefaultHighWaterMark(objectMode,value){if(typeof value!=='number')throw error(TypeError,'ERR_INVALID_ARG_TYPE','The value must be a number');if(!isInteger(value)||value<0)throw error(RangeError,'ERR_OUT_OF_RANGE','The value must be a nonnegative integer');if(objectMode)defaultObjectHwm=value;else defaultByteHwm=value}
${streamWritableSource}
${streamReadableSource}
${streamPipeSource}
${streamDuplexSource}
${streamIteratorsSource}
${streamHelpersSource}
${streamOperatorsSource}
${streamWebSource}
${streamConsumersSource}
${streamComposeSource}
 for(var pair of [['Stream',Stream],['Writable',Writable],['Readable',Readable],['Duplex',Duplex],['Transform',Transform],['PassThrough',PassThrough],['getDefaultHighWaterMark',getDefaultHighWaterMark],['setDefaultHighWaterMark',setDefaultHighWaterMark]])define(Stream,pair[0],{value:pair[1],writable:true,enumerable:true,configurable:true});
 vm.streamModule=Stream;initialized=Stream;return Stream;
 }
 runtime.initializeStreams=initialize;
 startupDefine(Bytes,Symbol.for('nona.stream.module'),{get:initialize});
 startupDefine(Bytes,Symbol.for('nona.stream.consumers'),{get:function(){initialize();return runtime.streamConsumersModule}});
})();`;

export function streamPreludeForTarget(target:Target='win32-x64'):string {
 return streamPreludeSource.replace('__NONA_STREAM_BYTE_HIGH_WATER_MARK__',target.startsWith('win32-')?'16384':'65536');
}
