import {compileModuleToIR} from '../compiler.js';
import {collectSourceUsage} from '../frontend/lexer.js';
import {getTarget,type Target} from '../target.js';
import {generate} from './x64/codegen.js';
import {withNativeTarget} from './machine/context.js';
import {linkPe} from './pe/writer.js';
import {linkWindowsArm64} from './arm64/windows.js';
import {linkLinux} from './linux/index.js';
import {linkDarwin} from './darwin/index.js';
import {linkBsd} from './bsd/index.js';

export type StreamProbeCase={name:string;source:string;expected:string;gcStress?:boolean};

/** Deterministic programs for the eventual shared native Stream integration. */
export function streamProbeCases(_target:Target):StreamProbeCase[]{
 const imports=String.raw`
import Stream,{Readable,Writable,Duplex,Transform,PassThrough} from 'node:stream';
import * as namespace from 'node:stream';
import {EventEmitter} from 'node:events';
import {Buffer} from 'node:buffer';
`;
 return [
  {name:'stream-immediate-lifecycle',source:imports+String.raw`
const cancelled=setImmediate(()=>console.log('unexpected'));cancelled[Symbol.dispose]();
const handle=setImmediate(function(value){console.log('first',this===handle,value,handle.hasRef());queueMicrotask(()=>console.log('microtask'));setImmediate(()=>console.log('nested'))},'argument');
process.unref(handle);console.log('unref',handle.hasRef());process.ref(handle);console.log('ref',handle.hasRef());setImmediate(()=>console.log('second'));
`,expected:"unref false\nref true\nfirst true argument false\nmicrotask\nsecond\nnested\n"},
  {name:'stream-identity',source:imports+String.raw`
console.log('identity',Stream===namespace.default,Stream===namespace.Stream,Readable===namespace.Readable,Object.getPrototypeOf(Stream)===EventEmitter);
console.log('brands',new PassThrough() instanceof Duplex,new Writable() instanceof EventEmitter,new Readable() instanceof EventEmitter);
console.log('process',process instanceof EventEmitter,process.stdin instanceof Readable,process.stdout instanceof Writable,process.stderr instanceof Writable);
console.log('registry',process.getBuiltinModule('stream')===Stream,process.getBuiltinModule('node:stream')===Stream,process.getBuiltinModule('buffer').Buffer===Buffer);
console.log('descriptors',['platform','arch','pid','argv0'].every(name=>Object.getOwnPropertyDescriptor(process,name).writable===false),Object.getOwnPropertyDescriptor(process,'argv0').configurable===false);
`,expected:"identity true true true true\nbrands true true true\nprocess true true true true\nregistry true true true\ndescriptors true true\n"},
  {name:'stream-writable-queues',source:imports+String.raw`
const values=[],sink=new Writable({highWaterMark:2,write(chunk,encoding,callback){values.push('write:'+chunk);callback()},writev(chunks,callback){values.push('batch:'+chunks.map(entry=>entry.chunk.toString()).join(','));callback()}});
sink.cork();console.log('pressure',sink.write('a',()=>values.push('a')),sink.write('b',()=>values.push('b')),sink.writableLength,sink.writableNeedDrain);
sink.on('close',()=>console.log('closed',values.join('|'),sink.writableLength,sink.writableFinished,sink.destroyed));sink.end('c',()=>values.push('end'));
`,expected:"pressure true false 2 true\nclosed batch:a,b,c|a|b|end 0 true true\n"},
  {name:'stream-pipeline-demand',source:imports+String.raw`
(async()=>{const values=[],transform=new Transform({transform(chunk,encoding,callback){callback(null,chunk.toString().toUpperCase())}}),sink=new Writable({highWaterMark:1,write(chunk,encoding,callback){values.push(chunk.toString());setImmediate(callback)}});
const pending=Stream.promises.pipeline(Readable.from(['a','b']),transform,sink);await pending;console.log('pipeline',values.join(''),transform.readableEnded,transform.writableFinished,sink.writableFinished)})().catch(function(error){console.log('pipeline failure',error.name,error.code,error.message);throw error})
`,expected:"pipeline AB true true true\n"},
  {name:'stream-partial-read',source:imports+String.raw`
(async()=>{
const r=new Readable({read(){}});r.push(Buffer.from('abc'));r.push(null);console.log('partial',r.read(1).toString(),r.read(2).toString());r.resume();await Stream.promises.finished(r);console.log('ended',r.readableEnded,r.closed)})().catch(function(error){console.log('pipeline failure',error.name,error.code,error.message);throw error})
`,expected:"partial a bc\nended true true\n"},
  {name:'stream-operators-full',gcStress:false,source:imports+String.raw`
(async()=>{const results=await Readable.from([1,2,3,4]).map(async value=>value*2,{concurrency:2}).filter(value=>value>2).take(2).toArray();console.log('operators',results.join(','));console.log('reduce',await Readable.from([1,2,3]).reduce((sum,value)=>sum+value,0))})()
`,expected:"operators 4,6\nreduce 6\n"},
  {name:'stream-operators',source:imports+String.raw`
(async()=>{const results=await Readable.from([1,2,3]).map(async value=>value*2,{concurrency:2}).filter(value=>value>2).take(1).toArray();console.log('operators',results.join(','))})()
`,expected:"operators 4\n"},
  {name:'stream-reduce',source:imports+String.raw`
(async()=>{console.log('reduce',await Readable.from([1,2,3]).reduce((sum,value)=>sum+value,0))})()
`,expected:"reduce 6\n"},
  {name:'stream-consumer-bytes',source:imports+String.raw`
import consumers from 'node:stream/consumers';
(async()=>{const bytes=await consumers.bytes(Readable.from([Buffer.from([97]),new Uint8Array([98])]));console.log('bytes',bytes instanceof Uint8Array,Buffer.isBuffer(bytes),Array.from(bytes).join(','))})()
`,expected:"bytes true false 97,98\n"},
  {name:'stream-consumer-text',source:imports+String.raw`
import consumers from 'node:stream/consumers';
(async()=>{console.log('text',await consumers.text(Readable.from([Buffer.from([239,187,191,226]),Buffer.from([130,172])])))})()
`,expected:"text €\n"},
  {name:'stream-consumer-json',source:imports+String.raw`
import consumers from 'node:stream/consumers';
(async()=>{console.log('json',(await consumers.json(Readable.from(['{"x":2}']))).x)})()
`,expected:"json 2\n"},
  {name:'stream-web-cancellation',source:imports+String.raw`
(async()=>{const controller=new AbortController();controller.signal.addEventListener('abort',event=>event.stopImmediatePropagation());let aborts=0;const source=new Readable({read(){}}),web=Readable.toWeb(source),destination=new WritableStream({abort(){aborts++}}),pending=web.pipeTo(destination,{signal:controller.signal});controller.abort('stop');try{await pending}catch(reason){console.log('abort',reason,web.locked,destination.locked,aborts,source.destroyed)}
const complete=Readable.toWeb(Readable.from([])),reader=complete.getReader();await reader.read();await reader.closed;const old=reader.closed;reader.releaseLock();console.log('release',await reader.closed.then(()=> 'fulfilled',error=>error.name),old===reader.closed,complete.locked);
const invalid=Readable.toWeb(new Readable({read(){}})),writer=new WritableStream();try{await invalid.pipeTo(writer,{signal:3})}catch(error){console.log('validation',error.code,invalid.locked,writer.locked)}await invalid.cancel();await writer.abort()})()
`,expected:"abort stop false false 1 true\nrelease TypeError false false\nvalidation ERR_INVALID_ARG_TYPE false false\n"},
  {name:'stream-destroy-construct',source:imports+String.raw`
(async()=>{const values=[],fault=new Error('stop'),sink=new Writable({construct(callback){values.push('construct');setImmediate(()=>{values.push('constructed');callback()})},write(chunk,encoding,callback){values.push('write');callback()},destroy(reason,callback){values.push('destroy:'+(reason===fault));callback(reason)}});sink.on('error',reason=>values.push('error:'+(reason===fault)));const closed=new Promise(resolve=>sink.on('close',resolve));sink.cork();sink.write('x',reason=>values.push('callback:'+(reason===fault)));sink.destroy(fault);values.push('top:'+sink.destroyed);await closed;console.log('destroy',values.join('|'),sink.writableLength,sink.closed);
const controller=new AbortController(),readable=new Readable({read(){}}),pending=Stream.promises.finished(readable,{signal:controller.signal});controller.abort('cancel');try{await pending}catch(error){console.log('finished',error.name,error.code,error.cause,readable.destroyed)}readable.destroy()})()
`,expected:"destroy top:true|construct|callback:true|constructed|destroy:true|error:true 0 true\nfinished AbortError ABORT_ERR cancel false\n"},
 ];
}

/** Called after canonical Events/Stream providers are installed in the compiler. */
export function streamProbes(target:Target):{name:string;image:Uint8Array;expected:string;timeoutMs:number;minimalEnvironment:boolean}[]{
 return streamProbeCases(target).map(probe=>{
  const {result:ir,usage}=collectSourceUsage(()=>compileModuleToIR(probe.source,probe.name+'.mjs',undefined,'',target));
  const program=withNativeTarget(target,()=>generate(ir,{gcStress:probe.gcStress!==false,link:usage})),descriptor=getTarget(target)!;
  const image=descriptor.os==='win32'?(target==='win32-arm64'?linkWindowsArm64(program):linkPe(program)):descriptor.os==='linux'?linkLinux(program,descriptor.arch):descriptor.os==='darwin'?linkDarwin(program,descriptor.arch):linkBsd(program,descriptor.os);
  return {name:probe.name,image,expected:probe.expected,timeoutMs:60000,minimalEnvironment:true};
 });
}
