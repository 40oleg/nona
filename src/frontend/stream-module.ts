/** Thin providers share the constructors installed by the stream prelude. */
export const streamModuleSource=String.raw`import {Buffer} from 'node:buffer';
const Stream=Buffer[Symbol.for('nona.stream.module')];
export default Stream;
export const Readable=Stream.Readable,Writable=Stream.Writable,Duplex=Stream.Duplex,Transform=Stream.Transform,PassThrough=Stream.PassThrough;
export {Stream};
export const addAbortSignal=Stream.addAbortSignal,compose=Stream.compose,destroy=Stream.destroy,duplexPair=Stream.duplexPair,finished=Stream.finished,pipeline=Stream.pipeline,promises=Stream.promises;
export const getDefaultHighWaterMark=Stream.getDefaultHighWaterMark,setDefaultHighWaterMark=Stream.setDefaultHighWaterMark,isDestroyed=Stream.isDestroyed,isDisturbed=Stream.isDisturbed,isErrored=Stream.isErrored,isReadable=Stream.isReadable,isWritable=Stream.isWritable;
export const _isArrayBufferView=Stream._isArrayBufferView,_isUint8Array=Stream._isUint8Array,_uint8ArrayToBuffer=Stream._uint8ArrayToBuffer;
`;

export const streamPromisesModuleSource=String.raw`import Stream from 'node:stream';
const promises=Stream.promises;
export default promises;
export const finished=promises.finished,pipeline=promises.pipeline;
`;

export const streamConsumersModuleSource=String.raw`import {Buffer} from 'node:buffer';
const consumers=Buffer[Symbol.for('nona.stream.consumers')];
export default consumers;
export const arrayBuffer=consumers.arrayBuffer,blob=consumers.blob,buffer=consumers.buffer,bytes=consumers.bytes,json=consumers.json,text=consumers.text;
`;
