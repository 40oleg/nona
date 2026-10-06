/** Consumers collect original iterator values before decoding or constructing a Blob. */
export const streamConsumersSource=String.raw`
 var BlobConstructor=vm.bufferModule.Blob,consumerDecoder=new TextDecoder(),consumerDecode=TextDecoder.prototype.decode,parseJson=JSON.parse;
 async function consumeBuffer(input){var parts=[],length=0,values=input&&typeof input[asyncIteratorSymbol]==='function'?input:input&&typeof input.getReader==='function'?webValues(input):input;for await(var chunk of values){var bytes;if(typeof chunk==='string')bytes=apply(bufferFrom,Bytes,[chunk]);else if(chunk instanceof ArrayBuffer)bytes=apply(bufferFrom,Bytes,[chunk]);else if(isView(chunk))bytes=apply(bufferFrom,Bytes,[chunk.buffer,chunk.byteOffset,chunk.byteLength]);else throw error(TypeError,'ERR_INVALID_ARG_TYPE','Expected a string or byte chunk');append(parts,bytes);length+=bytes.length}return apply(bufferConcat,Bytes,[parts,length])}
 async function consumeBytes(input){return new U8(await consumeBuffer(input))}
 async function consumeArrayBuffer(input){return (await consumeBytes(input)).buffer}
 async function consumeBlob(input){return new BlobConstructor([await consumeBuffer(input)])}
 async function consumeText(input){return apply(consumerDecode,consumerDecoder,[await consumeBuffer(input)])}
 async function consumeJson(input){return parseJson(await consumeText(input))}
 var streamConsumers={arrayBuffer:consumeArrayBuffer,blob:consumeBlob,buffer:consumeBuffer,bytes:consumeBytes,json:consumeJson,text:consumeText};vm.streamConsumersModule=streamConsumers;define(Bytes,Symbol.for('nona.stream.consumers'),{value:streamConsumers});
`;
