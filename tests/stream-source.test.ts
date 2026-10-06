import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {AsyncResource} from 'node:async_hooks';
import {addAbortListener} from 'node:events';
import * as nodeStream from 'node:stream';
import * as nodeStreamPromises from 'node:stream/promises';
import * as nodeStreamConsumers from 'node:stream/consumers';
import {encodingPreludeSource} from '../src/runtime/encoding-source.js';
import {bufferPreludeSource} from '../src/runtime/buffer-source.js';
import {runOracle} from './helpers/oracle.js';
import {streamModuleSource,streamPromisesModuleSource,streamConsumersModuleSource} from '../src/frontend/stream-module.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';

async function originalEvents(){
 const provider=await import('../src/frontend/events-module.js');
 const body=provider.eventsModuleSource.replace(/^import .*$/gm,'').replace('export default EventEmitter;','return EventEmitter;').replace(/\bexport /g,'');
 return new Function('AsyncResource','EventTarget',body)(AsyncResource,EventTarget);
}
async function boundary(){
 const events=await originalEvents(),vm:{[key:string]:unknown}={eventEmitterModule:events,enqueueNextTick:(callback:Function,args:unknown[]=[])=>process.nextTick(()=>Reflect.apply(callback,undefined,args)),events:{isSignal:(signal:unknown)=>signal instanceof AbortSignal,protect:(signal:AbortSignal,callback:()=>void)=>{const subscription=addAbortListener(signal,callback);return ()=>subscription[Symbol.dispose]()}}};
 const context=createContext({__nonaRegexpVm:vm,setImmediate,setTimeout,queueMicrotask,AbortController,AbortSignal});
 const source=await import(new URL('../src/runtime/stream-source.js',import.meta.url).href);
 runInContext(encodingPreludeSource+bufferPreludeSource+source.streamPreludeForTarget('win32-x64'),context);
 return context;
}

test('stream constructors use actual canonical Events and Buffer dependencies without adding globals',async()=>{
 const context=await boundary();
 assert.equal(runInContext('var stream=__nonaRegexpVm.streamModule;stream===stream.Stream&&stream.prototype instanceof __nonaRegexpVm.eventEmitterModule&&new stream.Writable() instanceof stream.Stream&&new stream.Readable() instanceof stream.Stream&&new stream.Duplex() instanceof stream.Readable&&new stream.Transform() instanceof stream.Duplex&&new stream.PassThrough() instanceof stream.Transform',context),true);
 assert.equal(runInContext('Buffer[Symbol.for("nona.stream.module")]===stream&&stream.getDefaultHighWaterMark(true)===16&&stream.getDefaultHighWaterMark(false)===16384',context),true);
 assert.equal(runInContext('typeof globalThis.Stream',context),'undefined');
});

test('private Web terminal subscriptions dispose without retaining locks or replacing closed promises',async()=>{
 const context=await boundary();
 runInContext(`var web=new Blob(['x']).stream(),reader=web.getReader(),closed=reader.closed,calls=0;var stop=__nonaRegexpVm.observeBufferWebStream(web,function(){calls++});stop();reader.cancel();`,context);
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(runInContext('calls===0&&reader.closed===closed&&web.locked',context),true);
 runInContext(`reader.releaseLock();var late=__nonaRegexpVm.observeBufferWebStream(web,function(){calls++});`,context);
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(runInContext('calls===1&&!web.locked',context),true);
 runInContext(`var originalPromise=Promise,allocations=0;Promise=new Proxy(Promise,{construct(target,args){allocations++;return Reflect.construct(target,args)}});var untouched=new Blob(['y']).stream();__nonaRegexpVm.bufferWebState(untouched);__nonaRegexpVm.destroyBufferWebStream(untouched,new Error('private'));Promise=originalPromise;`,context);
 assert.equal(runInContext('allocations',context),0);
});

test('thin stream providers expose actual defaults and complete Node26 namespace inventories',async()=>{
 const context=await boundary(),sources=[streamModuleSource,streamPromisesModuleSource,streamConsumersModuleSource];
 const output:string[]=[];
 for(const [index,source] of sources.entries()){
  const names:string[]=[];
  for(const statement of parse(lex(source),{module:true}).body){if(statement.kind!=='Export')continue;if(statement.defaultExpression)names.push('default');for(const item of statement.specifiers??[])names.push(item.exported);if(statement.declaration?.kind==='Var')for(const item of statement.declaration.declarations){assert.equal(item.id.kind,'Identifier');if(item.id.kind==='Identifier')names.push(item.id.name)}}
  const body=source.replace(/^import .*$/gm,'').replace(/export default ([^;]+);/g,'const defaultExport=$1;').replace(/export\s*\{[^}]+\};/g,'').replace(/\bexport /g,'');
  const exports=names.map(name=>JSON.stringify(name)+':'+(name==='default'?'defaultExport':name)).join(',');
  context.namespace=runInContext('(function(){'+(index===1?'const Stream=__nonaRegexpVm.streamModule;':'')+body+'return {'+exports+'}})()',context);
  output.push(Object.keys(context.namespace).sort().join(','));
  assert.equal(runInContext('namespace.default==='+['__nonaRegexpVm.streamModule','__nonaRegexpVm.streamModule.promises','__nonaRegexpVm.streamConsumersModule'][index],context),true);
  assert.equal(runInContext('Object.keys(namespace).every(key=>key==="default"||namespace[key]===namespace.default[key])',context),true);
 }
 assert.deepEqual(output,[nodeStream,nodeStreamPromises,nodeStreamConsumers].map(namespace=>Object.keys(namespace).sort().join(',')));
});

async function compare(body:string){
 let stdout='';const context=await boundary();context.console={log:(...args:unknown[])=>{stdout+=args.map(String).join(' ')+'\n'}};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([runInContext('var {Writable,Readable,Duplex,Transform,PassThrough}=__nonaRegexpVm.streamModule;'+body,context),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Stream fixture did not complete')),3000)})])}finally{if(timer)clearTimeout(timer)}
 const oracle=runOracle('var {Writable,Readable,Duplex,Transform,PassThrough}=require("node:stream");'+body);
 assert.equal(oracle.status,0);assert.equal(stdout,oracle.stdout);
}

test('Writable synchronous completion returns remaining pressure and defers callbacks',async()=>compare(`
new Promise(resolve=>{const out=[];const w=new Writable({highWaterMark:1,write(chunk,encoding,callback){out.push('write:'+chunk.toString()+':'+encoding);callback();out.push('returned')},final(callback){out.push('final');callback()}});
out.push('accepted:'+w.write('abc',()=>out.push('callback')));w.on('drain',()=>out.push('drain'));w.on('finish',()=>out.push('finish'));w.on('close',()=>{out.push('close');console.log(out.join('|'),w.writableLength,w.writableEnded,w.writableFinished,w.destroyed,w.closed);resolve()});w.end(()=>out.push('endcallback'));out.push('ended:'+w.writableEnded);
})`));

test('Writable delayed sink, cork nesting and writev drain the ordered queue',async()=>compare(`
new Promise(resolve=>{const out=[];const w=new Writable({highWaterMark:3,write(chunk,encoding,callback){out.push('one:'+chunk.toString());setImmediate(callback)},writev(chunks,callback){out.push('batch:'+chunks.map(x=>x.chunk.toString()+':'+x.encoding).join(','));setImmediate(callback)}});
w.on('drain',()=>out.push('drain'));w.on('finish',()=>{console.log(out.join('|'),w.writableLength,w.writableCorked,w.writableNeedDrain);resolve()});
w.cork();w.cork();out.push('first:'+w.write('ab',()=>out.push('a')));out.push('second:'+w.write('cd',()=>out.push('b')));out.push('queued:'+w.writableLength+':'+w.writableCorked+':'+w.writableNeedDrain);w.uncork();out.push('uncork:'+w.writableCorked);w.uncork();w.end('ef',()=>out.push('end'));
})`));

test('Writable object mode and decodeStrings preserve public sink arguments',async()=>compare(`
new Promise(resolve=>{const object={x:1},out=[];const w=new Writable({objectMode:true,highWaterMark:1,write(chunk,encoding,callback){out.push((chunk===object)+':'+encoding);callback()}});out.push('object:'+w.write(object));w.end(()=>{const raw=new Writable({decodeStrings:false,defaultEncoding:'latin1',write(chunk,encoding,callback){out.push(typeof chunk+':'+encoding+':'+chunk);callback()}});raw.setDefaultEncoding('hex');out.push('raw:'+raw.write('ff'));raw.end(()=>{console.log(out.join('|'));resolve()})})
})`));

test('Writable sink errors settle queued writes and end with the same error',async()=>compare(`
new Promise(resolve=>{const fault=new Error('failure'),out=[];const w=new Writable({write(chunk,encoding,callback){out.push('write:'+chunk);setImmediate(()=>callback(fault))},destroy(error,callback){out.push('destroy:'+(error===fault));callback(error)}});
w.on('error',error=>out.push('error:'+(error===fault)));w.on('close',()=>{out.push('close');console.log(out.join('|'),w.errored===fault,w.writableAborted);resolve()});w.write('a',error=>out.push('a:'+(error===fault)));w.write('b',error=>out.push('b:'+(error===fault)));w.end(error=>out.push('end:'+(error===fault)));
})`));

test('Writable construct defers queued work and finalization',async()=>compare(`
new Promise(resolve=>{const out=[];const w=new Writable({construct(callback){out.push('construct');setImmediate(()=>{out.push('constructed');callback()})},write(chunk,encoding,callback){out.push('write:'+chunk);callback()},final(callback){out.push('final');callback()}});
w.on('close',()=>{console.log(out.join('|'));resolve()});w.write('a',()=>out.push('a'));w.end('b',()=>out.push('end'));out.push('top');
})`));

test('Writable corked synchronous hooks do not recurse into the next hook',async()=>compare(`
new Promise(resolve=>{const out=[];const w=new Writable({write(chunk,encoding,callback){out.push('start:'+chunk);callback();out.push('return:'+chunk)}});w.cork();w.write('a',()=>out.push('a'));w.write('b',()=>out.push('b'));w.end(()=>{console.log(out.join('|'));resolve()});
})`));

test('Writable synchronous sink failures reject later writes without calling another sink',async()=>compare(`
new Promise(resolve=>{const fault=new Error('failure'),out=[];const w=new Writable({write(chunk,encoding,callback){out.push('write:'+chunk);callback(fault)},destroy(error,callback){out.push('destroy');callback(error)}});
w.on('error',error=>out.push('error:'+(error===fault)));w.on('close',()=>{out.push('close');console.log(out.join('|'));resolve()});out.push('a:'+w.write('a',error=>out.push('a:'+(error===fault))));out.push('b:'+w.write('b',error=>out.push('b:'+(error===fault))));w.end(error=>out.push('end:'+(error===fault)));out.push('top');
})`));

test('Writable pressure emits drain before its asynchronous write callback',async()=>compare(`
new Promise(resolve=>{const out=[];const w=new Writable({highWaterMark:2,write(chunk,encoding,callback){setImmediate(callback)}});w.on('drain',()=>out.push('drain:'+w.writableNeedDrain));out.push('accepted:'+w.write('abc',()=>{out.push('callback:'+w.writableLength);w.end(()=>{console.log(out.join('|'));resolve()})}));
})`));

test('Writable explicit destruction preserves pending callback completion and close state',async()=>compare(`
new Promise(resolve=>{const out=[];const w=new Writable({write(chunk,encoding,callback){out.push('write:'+chunk);setImmediate(callback)}});w.on('close',()=>{out.push('close');setImmediate(()=>{console.log(out.join('|'));resolve()})});w.write('a',error=>out.push('a:'+(error&&error.code)));w.write('b',error=>out.push('b:'+(error&&error.code)));w.end(error=>out.push('end:'+(error&&error.code)));w.destroy();out.push('destroyed:'+w.destroyed+':'+w.closed);
})`));

test('Writable corked synchronous errors stop the queue and settle each callback once',async()=>compare(`
new Promise(resolve=>{const fault=new Error('failure'),out=[];const w=new Writable({write(chunk,encoding,callback){out.push('write:'+chunk);callback(fault)}});w.on('error',error=>out.push('error:'+(error===fault)));w.on('close',()=>{console.log(out.join('|'));resolve()});w.cork();w.write('a',error=>out.push('a:'+(error===fault)));w.write('b',error=>out.push('b:'+(error===fault)));w.end(error=>out.push('end:'+(error===fault)));
})`));

test('Writable argument validation and sliced byte views match Node26',async()=>compare(`
new Promise(resolve=>{const out=[];const w=new Writable({write(chunk,encoding,callback){out.push(chunk.toString('hex')+':'+encoding);callback()}});
for(const chunk of [null,undefined,1,true,{},Symbol('x')])try{w.write(chunk)}catch(error){out.push(error.name+':'+error.code)}
for(const encoding of ['missing',Symbol('x'),123])try{w.setDefaultEncoding(encoding)}catch(error){out.push(error.name+':'+error.code)}
const bytes=new Uint8Array([10,20,30,40]);w.write(bytes.subarray(1,3));w.write(new DataView(bytes.buffer,1,2));w.end(()=>{console.log(out.join('|'));resolve()});
})`));

test('Writable internal queue survives prototype mutation and a large corked batch',async()=>{
 const context=await boundary();let result='';context.console={log:(value:string)=>{result=value}};
 await runInContext(`var Writable=__nonaRegexpVm.streamModule.Writable;var Original=Number.isInteger;Array.prototype.push=function(){throw Error('mutated push')};Array.prototype.shift=function(){throw Error('mutated shift')};WeakMap.prototype.get=function(){throw Error('mutated get')};WeakMap.prototype.set=function(){throw Error('mutated set')};Number.isInteger=function(){throw Error('mutated validation')};
 new Promise(resolve=>{var callbacks=0,writes=0,w=new Writable({highWaterMark:5,write(chunk,encoding,callback){writes++;callback()}});w.cork();for(var i=0;i<5000;i++)w.write('x',()=>callbacks++);w.end(()=>{console.log(writes+':'+callbacks+':'+w.writableLength);resolve()})})`,context);
 assert.equal(result,'5000:5000:0');
});

test('Readable partial demand drains bytes before end and close',async()=>compare(`
new Promise(resolve=>{const out=[];const r=new Readable({read(size){out.push('read:'+size);this.push(Buffer.from('abc'));this.push(null)}});r.on('readable',()=>{out.push('available:'+r.readableLength);let chunk;while((chunk=r.read(2))!==null)out.push(chunk.toString())});r.on('end',()=>out.push('end:'+r.readableEnded));r.on('close',()=>{out.push('close');console.log(out.join('|'),r.readableLength,r.destroyed,r.closed);resolve()});
})`));

test('Readable push, unshift and object mode preserve chunk identity and accounting',async()=>compare(`
new Promise(resolve=>{const first={n:1},second={n:2},out=[];const r=new Readable({objectMode:true,highWaterMark:1,read(){}});out.push('push:'+r.push(first)+':'+r.readableLength);const a=r.read();out.push('first:'+(a===first));r.unshift(second);out.push('unshift:'+r.readableLength+':'+(r.read()===second));r.push(null);r.on('end',()=>{console.log(out.join('|'),r.readableEnded,r.readableDidRead);resolve()});r.resume();
})`));

test('Readable flowing pause and resume preserve ordered data and events',async()=>compare(`
new Promise(resolve=>{const out=[];let index=0;const r=new Readable({read(){if(index<3)this.push(String(++index));else this.push(null)}});r.on('resume',()=>out.push('resume'));r.on('pause',()=>out.push('pause'));r.on('data',chunk=>{out.push('data:'+chunk.toString());if(chunk.toString()==='1'){r.pause();setImmediate(()=>r.resume())}});r.on('end',()=>{out.push('end');console.log(out.join('|'),r.readableFlowing,r.readableDidRead);resolve()});
})`));

test('Readable UTF8 decoding joins split bytes and preserves the byte order mark',async()=>compare(`
new Promise(resolve=>{const out=[],r=new Readable({read(){}});r.setEncoding('utf8');r.on('data',chunk=>out.push(typeof chunk+':'+chunk));r.on('end',()=>{console.log(out.join('|'),r.readableEncoding,r.readableLength);resolve()});for(const bytes of [[239,187],[191,226],[130],[172,240,159],[152,128,65],[226]])r.push(Buffer.from(bytes));r.push(null);
})`));

test('Readable explicit reads emit data even when flowing delivery is paused',async()=>compare(`
new Promise(resolve=>{const out=[],chunk=Buffer.from('abc'),r=new Readable({read(){}});r.on('data',value=>out.push('data:'+value.toString()));r.pause();r.push(chunk);out.push('read:'+(r.read()===chunk));r.push(null);r.on('end',()=>{console.log(out.join('|'),r.readableFlowing);resolve()});r.read(0);
})`));

for(const encoding of ['utf16le','base64','base64url','hex','latin1','ascii'])test('Readable incremental '+encoding+' decoder preserves all chunks',async()=>compare(`
new Promise(resolve=>{const out=[],r=new Readable({read(){}});r.setEncoding('${encoding}');r.on('data',chunk=>out.push(JSON.stringify(chunk)));r.on('end',()=>{console.log(out.join('|'),r.readableEncoding);resolve()});for(const bytes of [[65],[0,61],[216,0],[222,233],[128]])r.push(Buffer.from(bytes));r.push(null);
})`));

test('Readable late setEncoding converts buffered bytes and unshift preserves decoded lengths',async()=>compare(`
new Promise(resolve=>{const out=[],r=new Readable({read(){}});r.push(Buffer.from([226,130]));r.push(Buffer.from([172,65]));r.setEncoding('utf-8');out.push('length:'+r.readableLength+':'+r.read());r.unshift('é');out.push('unshift:'+r.readableLength+':'+r.read());r.push(null);r.on('end',()=>{console.log(out.join('|'));resolve()});r.resume();
})`));

test('Readable undefined byte pushes are ignored while object chunks retain identity',async()=>compare(`
const out=[],r=new Readable({read(){}});out.push(r.push(undefined)+':'+r.readableLength+':'+r.read());const objects=new Readable({objectMode:true,read(){}});out.push(objects.push(undefined)+':'+objects.readableLength+':'+objects.read());console.log(out.join('|'));r.destroy();objects.destroy();
`));

test('Writable delivers an existing Buffer to the sink without replacing its identity',async()=>compare(`
new Promise(resolve=>{const chunk=Buffer.from('abc'),out=[],w=new Writable({write(value,encoding,callback){out.push(value===chunk);callback()}});w.end(chunk,()=>{console.log(out.join('|'));resolve()})});
`));

test('Readable pipe honors destination pressure and closes after ordered writes',async()=>compare(`
new Promise(resolve=>{const out=[],r=new Readable({read(){this.push('a');this.push('b');this.push('c');this.push(null)}}),w=new Writable({highWaterMark:1,write(chunk,encoding,callback){out.push('write:'+chunk);setImmediate(callback)}});r.on('pause',()=>out.push('pause'));r.on('resume',()=>out.push('resume'));w.on('pipe',source=>out.push('pipe:'+(source===r)));w.on('unpipe',(source,info)=>out.push('unpipe:'+(source===r)+':'+info.hasUnpiped));w.on('finish',()=>{out.push('finish');console.log(out.join('|'),r.readableEnded,w.writableFinished);resolve()});out.push('return:'+(r.pipe(w)===w));
})`));

test('Readable pipe waits for each destination and cleans listeners on unpipe',async()=>compare(`
new Promise(resolve=>{const values=[[],[]],r=new Readable({read(){this.push('a');this.push('b');this.push(null)}}),writers=values.map((out,index)=>new Writable({highWaterMark:1,write(chunk,encoding,callback){out.push(chunk.toString());setTimeout(callback,index?2:1)}}));let finished=0;for(const w of writers)w.on('finish',()=>{if(++finished===2){console.log(values.map(x=>x.join('')).join('|'),r.listenerCount('data'),writers.map(w=>w.listenerCount('drain')).join(','));resolve()}});r.pipe(writers[0]);r.pipe(writers[1]);
})`));

test('Readable unpipe during data delivery and end:false leave the sink open',async()=>compare(`
new Promise(resolve=>{const out=[],r=new Readable({read(){this.push('a');this.push('b');this.push(null)}}),w=new Writable({write(chunk,encoding,callback){out.push(chunk.toString());r.unpipe(w);setImmediate(()=>r.resume());callback()}});w.on('unpipe',(source,info)=>out.push('unpipe:'+info.hasUnpiped));r.on('end',()=>{out.push('ended:'+w.writableEnded);w.end(()=>{console.log(out.join('|'),r.listenerCount('data'),w.listenerCount('drain'));resolve()})});r.pipe(w,{end:false});
})`));

test('Readable last unpipe stops flowing and retains unread bytes',async()=>compare(`
new Promise(resolve=>{const r=new Readable({read(){this.push('a');this.push('b');this.push(null)}}),w=new Writable({write(chunk,encoding,callback){r.unpipe(w);callback();setImmediate(()=>{console.log(r.readableFlowing,r.readableLength,r.readableEnded);r.destroy();w.destroy();resolve()})}});r.pipe(w);
})`));

test('Duplex uses both canonical sides and closes the writable side when half-open is disabled',async()=>compare(`
new Promise(resolve=>{const out=[],d=new Duplex({allowHalfOpen:false,read(){this.push('a');this.push(null)},write(chunk,encoding,callback){out.push('write:'+chunk);callback()}});out.push('brands:'+(d instanceof Readable)+':'+(d instanceof Writable));d.on('data',chunk=>out.push('data:'+chunk));d.on('end',()=>out.push('end'));d.on('finish',()=>out.push('finish'));d.on('close',()=>{out.push('close');console.log(out.join('|'),d.allowHalfOpen,d.readableEnded,d.writableFinished);resolve()});d.write('x');
})`));

test('Transform output and flush preserve prefinish, end and finish ordering',async()=>compare(`
new Promise(resolve=>{const out=[],t=new Transform({transform(chunk,encoding,callback){out.push('transform:'+chunk);callback(null,chunk.toString().toUpperCase())},flush(callback){out.push('flush');callback(null,'!')}});t.on('data',chunk=>out.push('data:'+chunk));for(const name of ['prefinish','end','finish'])t.on(name,()=>out.push(name));t.on('close',()=>{out.push('close');console.log(out.join('|'));resolve()});t.end('a',()=>out.push('endcb'));out.push('top');
})`));

test('Transform pressure holds write completion until readable demand',async()=>compare(`
new Promise(resolve=>{const out=[],t=new Transform({readableHighWaterMark:1,writableHighWaterMark:1,transform(chunk,encoding,callback){out.push('transform:'+chunk);callback(null,chunk)}});t.on('finish',()=>{out.push('finish');console.log(out.join('|'));t.destroy();resolve()});out.push('accepted:'+t.write('a',()=>out.push('writecb')));out.push('buffered:'+t.readableLength+':'+t.writableLength);setImmediate(()=>{out.push('read:'+t.read());t.end();t.resume()});
})`));

test('PassThrough preserves Buffer identity and both stream brands',async()=>compare(`
new Promise(resolve=>{const chunk=Buffer.from('x'),p=new PassThrough();p.on('data',value=>console.log(value===chunk,p instanceof Transform,p instanceof Duplex,p instanceof Readable,p instanceof Writable));p.on('end',resolve);p.end(chunk);
})`));

test('Readable.from consumes synchronous, promised and asynchronous iterator values',async()=>compare(`
(async()=>{const out=[];for(const input of [[1,Promise.resolve(2),3],(async function*(){yield 'a';yield 'b'})(),'abc',Buffer.from('x')]){const r=Readable.from(input);const values=[];for await(const value of r)values.push(Buffer.isBuffer(value)?'buffer:'+value.toString():typeof value+':'+value);out.push(values.join(','))}console.log(out.join('|'))})()
`));

test('Readable async iterators serialize concurrent next requests and end exactly once',async()=>compare(`
(async()=>{const r=Readable.from([1,2,3]);const iterator=r[Symbol.asyncIterator]();const result=await Promise.all([iterator.next(),iterator.next(),iterator.next(),iterator.next()]);console.log(result.map(x=>x.done?'done':x.value).join('|'),r.readableEnded);console.log((await iterator.next()).done)})()
`));

test('Readable iterator early return destroys by default and can preserve the stream',async()=>compare(`
(async()=>{const out=[];for(const keep of [false,true]){const r=Readable.from([1,2,3]),iterator=r.iterator({destroyOnReturn:!keep});out.push((await iterator.next()).value);out.push((await iterator.return()).done);out.push(r.destroyed);if(keep){const values=[];for await(const value of r)values.push(value);out.push(values.join(','))}}console.log(out.join('|'))})()
`));

test('Readable.from rejects null values and closes its source iterator on destruction',async()=>compare(`
(async()=>{const out=[];const iterator={n:0,next(){return {done:false,value:this.n++?null:1}},return(){out.push('returned');return {done:true}},[Symbol.iterator](){return this}};const r=Readable.from(iterator);try{for await(const value of r)out.push(value)}catch(error){out.push(error.code)}console.log(out.join('|'),r.destroyed)})()
`));

test('finished observes both Duplex sides, offers cleanup and preserves errors',async()=>compare(`
new Promise(resolve=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,out=[],p=new PassThrough();const cleanup=stream.finished(p,error=>{out.push('complete:'+(error===undefined));out.push('listeners:'+p.listenerCount('error'));cleanup();out.push('clean:'+p.listenerCount('error'));console.log(out.join('|'));resolve()});p.resume();p.end('x');
})`));

test('finished reports premature close and promise cleanup removes observer listeners',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;const r=new Readable({read(){}}),pending=stream.promises.finished(r,{cleanup:true});r.destroy();try{await pending}catch(error){console.log(error.code,r.listenerCount('error'),r.listenerCount('close'))}})()
`));

test('pipeline callback and promise forms transform ordered bytes and finish destinations',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,out=[];const input=Readable.from(['a','b']),upper=new Transform({transform(chunk,encoding,callback){callback(null,chunk.toString().toUpperCase())}}),output=new Writable({write(chunk,encoding,callback){out.push(chunk.toString());setImmediate(callback)}});await new Promise((resolve,reject)=>{console.log('return',stream.pipeline(input,upper,output,error=>error?reject(error):resolve())===output)});out.push('finished:'+input.readableEnded+':'+upper.writableFinished+':'+output.writableFinished);const second=new Writable({write(chunk,encoding,callback){out.push(chunk.toString());callback()}});await stream.promises.pipeline([Readable.from(['c']),second]);console.log(out.join('|'))})()
`));

test('pipeline preserves first error identity and destroys the participating streams',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,fault=new Error('sink'),input=Readable.from(['a','b']),output=new Writable({write(chunk,encoding,callback){callback(fault)}});try{await stream.promises.pipeline(input,output)}catch(error){console.log(error===fault,input.destroyed,output.destroyed,input.errored===fault,output.errored===fault)}})()
`));

test('finished respects explicit sides for a compatible EventEmitter stream',async()=>compare(`
new Promise(resolve=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,out=[],legacy=new stream.Stream();legacy.readable=true;stream.finished(legacy,{readable:true,writable:false},error=>{out.push('done:'+error);console.log(out.join('|'));resolve()});out.push('top');setImmediate(()=>{out.push('end');legacy.emit('end')});
})`));

test('stream status queries distinguish unknown values and actual stream sides',async()=>compare(`
const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;for(const value of [null,undefined,{}, {destroyed:true},{readable:true},{writable:true},{errored:new Error('e')},new Readable({read(){}}),new Writable({write(c,e,cb){cb()}})])console.log(stream.isDestroyed(value),stream.isErrored(value),stream.isReadable(value),stream.isWritable(value),stream.isDisturbed(value));
`));

test('stream default high-water marks validate values and configure new streams',async()=>compare(`
const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;for(const value of [-1,1.5,'1',Infinity,NaN])try{stream.setDefaultHighWaterMark(false,value)}catch(error){console.log(error.name,error.code)}stream.setDefaultHighWaterMark(false,7);stream.setDefaultHighWaterMark(true,3);console.log(new Readable({read(){}}).readableHighWaterMark,new Writable({objectMode:true}).writableHighWaterMark);stream.setDefaultHighWaterMark(false,16384);stream.setDefaultHighWaterMark(true,16);
`));

test('addAbortSignal preserves the abort cause, stream identity and completion cleanup',async()=>compare(`
new Promise(resolve=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,controller=new AbortController(),reason=new Error('cancel'),r=new Readable({read(){}});r.on('error',error=>console.log(error.name,error.code,error.cause===reason));r.on('close',resolve);console.log(stream.addAbortSignal(controller.signal,r)===r);controller.abort(reason);
})`));

test('Readable map, filter, flatMap, drop and take preserve ordered results',async()=>compare(`
(async()=>{const result=await Readable.from([1,2,3,4]).map(async value=>value*2).filter(value=>value>2).flatMap(value=>[value,value+1]).drop(1).take(3).toArray();console.log(result.join(','));const values=[];await Readable.from([1,2,3]).forEach(async value=>{values.push(value)});console.log(values.join(','))})()
`));

test('Readable some, every, find and reduce handle short circuit and empty input',async()=>compare(`
(async()=>{console.log(await Readable.from([1,2,3]).some(value=>value===2),await Readable.from([1,2,3]).every(value=>value<4),await Readable.from([1,2,3]).find(value=>value>1),await Readable.from([1,2,3]).reduce((total,value)=>total+value,0));console.log(await Readable.from([]).every(()=>false),await Readable.from([]).some(()=>true),await Readable.from([]).find(()=>true));try{await Readable.from([]).reduce((total,value)=>total+value)}catch(error){console.log(error.name,error.code)}})()
`));

test('Readable map concurrency is bounded while results retain input order',async()=>compare(`
(async()=>{let active=0,maximum=0;const mapped=Readable.from([1,2,3,4,5]).map(value=>new Promise(resolve=>{maximum=Math.max(maximum,++active);setTimeout(()=>{active--;resolve(value*2)},value%2?2:1)}),{concurrency:2,highWaterMark:1});console.log((await mapped.toArray()).join(','),maximum)})()
`));

test('Readable operator argument validation matches Node26 synchronous and promise forms',async()=>compare(`
(async()=>{const out=[];for(const [name,args] of [['map',[null]],['filter',[1]],['map',[x=>x,{concurrency:'2'}]],['map',[x=>x,{concurrency:0}]],['map',[x=>x,{highWaterMark:'1'}]],['take',[-1]],['drop',['1']],['take',[1.5]]]){const r=Readable.from([]);try{await r[name](...args)}catch(error){out.push(name+':'+error.name+':'+error.code)}r.destroy()}console.log(out.join('|'))})()
`));

test('Readable mapping preserves the original failure and callback signal state',async()=>compare(`
(async()=>{const out=[],fault=new Error('failure');let signal;const mapped=Readable.from([1,2]).map(async(value,context)=>{signal=context.signal;throw fault});try{await mapped.toArray()}catch(error){out.push(error===fault)}out.push(signal.aborted,mapped.destroyed);console.log(out.join('|'))})()
`));

test('Readable mapping reports external cancellation with Node operator error semantics',async()=>compare(`
(async()=>{const controller=new AbortController(),reason=new Error('cancel'),source=Readable.from([1,2,3]),mapped=source.map(value=>value,{signal:controller.signal});controller.abort(reason);try{await mapped.toArray()}catch(error){console.log(error.name,error.code,error.cause===reason,mapped.destroyed)}})()
`));

test('Readable reduce and take also honor an already aborted signal',async()=>compare(`
(async()=>{const signal=AbortSignal.abort(new Error('cancel'));for(const name of ['reduce','take','drop']){const source=Readable.from([1,2,3]);try{const value=name==='reduce'?await source.reduce((total,value)=>total+value,0,{signal}):await source[name](1,{signal}).toArray();console.log(name,'unexpected',String(value))}catch(error){console.log(name,error.name,error.code)}source.destroy()}})()
`));

test('stream consumers preserve byte views and expose all six result forms',async()=>compare(`
(async()=>{const consume=typeof __nonaRegexpVm==='undefined'?require('node:stream/consumers'):__nonaRegexpVm.streamConsumersModule;for(const name of ['buffer','bytes','arrayBuffer','blob','text','json']){const input=name==='json'?['{"x":',Buffer.from('2}')]:['a',new Uint8Array([0,98,0]).subarray(1,2),Buffer.from('c')];const value=await consume[name](Readable.from(input));console.log(name,name==='blob'?await value.text():name==='arrayBuffer'?Buffer.from(value).toString():name==='json'?JSON.stringify(value):name==='text'?value:Buffer.from(value).toString(),name==='buffer'?Buffer.isBuffer(value):name==='bytes'?value instanceof Uint8Array&&!Buffer.isBuffer(value):true)}})()
`));

test('stream text consumers decode split UTF8, omit an initial BOM and preserve failures',async()=>compare(`
(async()=>{const consume=typeof __nonaRegexpVm==='undefined'?require('node:stream/consumers'):__nonaRegexpVm.streamConsumersModule;console.log(await consume.text(Readable.from([Buffer.from([239,187]),Buffer.from([191,226]),Buffer.from([130,172])])));const fault=new Error('source');try{await consume.buffer((async function*(){yield 'x';throw fault})())}catch(error){console.log(error===fault)}try{await consume.json(Readable.from(['{']))}catch(error){console.log(error.name)}})()
`));

test('Readable toWeb readers lock, release and consume ordered byte chunks',async()=>compare(`
(async()=>{const r=Readable.from([Buffer.from('a'),Buffer.from('b')],{objectMode:false}),web=Readable.toWeb(r),reader=web.getReader();console.log(web instanceof ReadableStream,web.locked);const a=await reader.read(),b=await reader.read(),end=await reader.read();console.log(Buffer.isBuffer(a.value),a.value instanceof Uint8Array,Buffer.from(a.value).toString()+Buffer.from(b.value).toString(),end.done);await reader.closed;reader.releaseLock();console.log(web.locked,r.readableEnded)})()
`));

test('Readable fromWeb consumes a Blob stream and retains object mode values',async()=>compare(`
(async()=>{const web=new Blob(['a','b']).stream(),r=Readable.fromWeb(web);console.log(r.readableObjectMode);const out=[];for await(const chunk of r)out.push(chunk.toString());console.log(out.join(''),r.readableEnded);const original=Readable.from([{x:2}]),converted=Readable.fromWeb(Readable.toWeb(original),{objectMode:true});console.log((await converted.toArray())[0].x,converted.readableObjectMode)})()
`));

test('Writable toWeb propagates asynchronous sink completion and writer lock state',async()=>compare(`
(async()=>{const values=[],w=new Writable({write(chunk,encoding,callback){values.push(chunk.toString());setImmediate(callback)}}),web=Writable.toWeb(w),writer=web.getWriter();console.log(web instanceof WritableStream,web.locked);await writer.write(new Uint8Array([97]));await writer.write('b');await writer.close();await writer.closed;console.log(values.join(''),w.writableFinished);writer.releaseLock();console.log(web.locked)})()
`));

test('Writable fromWeb and Duplex Web pairs preserve bytes and both terminal sides',async()=>compare(`
(async()=>{const values=[],web=new WritableStream({write(chunk){values.push(Buffer.from(chunk).toString())},close(){values.push('closed')}}),w=Writable.fromWeb(web);await new Promise((resolve,reject)=>w.end('a',error=>error?reject(error):resolve()));console.log(values.join('|'),w.writableFinished);const t=new PassThrough(),pair=Duplex.toWeb(t),d=Duplex.fromWeb(pair);const received=d.toArray();d.end('x');console.log((await received).map(value=>value.toString()).join(''),d.readableEnded,d.writableFinished)})()
`));

test('Duplex.from preserves readable and writable sides for original input forms',async()=>compare(`
(async()=>{for(const input of ['abc',Buffer.from('x'),[1,2],Promise.resolve('z'),new Blob(['blob']),Readable.from([1]),new Writable({write(c,e,cb){cb()}})]){const d=Duplex.from(input);console.log(d.readableObjectMode,d.writableObjectMode,d.readable,d.writable,d instanceof Duplex);if(d.readable)console.log((await d.toArray()).map(value=>value instanceof ArrayBuffer?'array:'+Buffer.from(value):String(value)).join(','));else await new Promise(resolve=>d.end(resolve))}})()
`));

test('duplexPair routes each write to the opposite read side and preserves pressure',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;const [a,b]=stream.duplexPair({objectMode:true,highWaterMark:1}),out=[];out.push(a.write(1,()=>out.push('acb')));out.push(b.write(2,()=>out.push('bcb')));out.push(a.read(),b.read());a.end();b.end();a.resume();b.resume();await Promise.all([stream.promises.finished(a),stream.promises.finished(b)]);console.log(out.join('|'),a.readableEnded,b.writableFinished)})()
`));

test('Duplex.from async functions and compose chain consume the actual write side',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;const d=Duplex.from(async function*(input){for await(const value of input)yield value*2});const result=d.toArray();d.write(2);d.end(3);console.log((await result).join(','));const first=new Transform({transform(c,e,cb){cb(null,c.toString().toUpperCase())}}),last=new PassThrough(),chain=stream.compose(first,last),received=chain.toArray();chain.end('a');console.log((await received).map(String).join(''),chain instanceof Duplex,chain.writableFinished)})()
`));

test('Readable compose, legacy wrap and async disposal use the shared queues',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;const result=await Readable.from([1,2,3]).compose(async function*(input){for await(const value of input)yield value+1}).toArray();console.log(result.join(','));const legacy=new stream.Stream();legacy.pause=()=>{};legacy.resume=()=>{};const wrapped=new Readable({objectMode:true}).wrap(legacy);const pending=wrapped.toArray();legacy.emit('data',4);legacy.emit('end');console.log((await pending).join(','));const r=new Readable({read(){}});await r[Symbol.asyncDispose]();console.log(r.destroyed,r.closed,r.errored.name,r.errored.code)})()
`));

test('pipeline supports iterable sources, async generator transforms and promised terminal values',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;const result=await stream.promises.pipeline([1,2,3],async function*(input,{signal}){console.log(signal instanceof AbortSignal);for await(const value of input)yield value*2},async function(input){let total=0;for await(const value of input)total+=value;return total});console.log(result);const out=[],sink=new Writable({write(c,e,cb){out.push(c.toString());cb()}});await stream.promises.pipeline(async function*({signal}){yield 'a';yield 'b'},sink);console.log(out.join(''))})()
`));

test('pipeline aborts participating streams and end:false leaves a reusable destination',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;const values=[],w=new Writable({write(c,e,cb){values.push(c.toString());cb()}});await stream.promises.pipeline(Readable.from(['a']),w,{end:false});console.log(w.writableEnded,values.join(''));w.end();await stream.promises.finished(w);const reason=new Error('cancel'),controller=new AbortController(),input=new Readable({read(){}}),output=new Writable({write(c,e,cb){cb()}}),pending=stream.promises.pipeline(input,output,{signal:controller.signal});controller.abort(reason);try{await pending}catch(error){console.log(error.name,error.code,error.cause===reason,input.destroyed,output.destroyed)}})()
`));

test('Readable read sizes use Node numeric parsing and grow demand high-water marks',async()=>compare(`
for(const size of [1.9,'2x',NaN,-1,-Infinity,Infinity,Symbol('x'),'2',null]){const r=new Readable({read(){}});r.push('abc');r.push(null);try{console.log(String(size),String(r.read(size)),r.readableHighWaterMark)}catch(error){console.log(String(size),error.name,error.code)}r.destroy()}const r=new Readable({highWaterMark:2,read(){this.push('abcd')}});console.log(r.read(3).toString(),r.readableHighWaterMark);r.destroy();
`));

test('Readable and Writable constructor signals destroy immediately and preserve the cause',async()=>compare(`
(async()=>{const reason=new Error('cancel'),signal=AbortSignal.abort(reason);for(const C of [Readable,Writable]){const r=new C({signal,read(){},write(c,e,cb){cb()}});const error=await new Promise(resolve=>{console.log(C.name,r.destroyed);r.on('error',resolve)});console.log(error.name,error.code,error.cause===reason)}})()
`));

test('Web reader cancellation settles pending demand and preserves the destroy reason',async()=>compare(`
(async()=>{for(const reason of [undefined,'cancel',new Error('cancel')]){const r=new Readable({read(){}}),reader=Readable.toWeb(r).getReader(),pending=reader.read();await reader.cancel(reason);console.log((await pending).done,r.destroyed,r.errored===reason,r.errored&&r.errored.name,r.errored&&r.errored.code);await reader.closed;reader.releaseLock()}})()
`));

test('Web reader release rejects pending requests and leaves the stream available',async()=>compare(`
(async()=>{const r=new Readable({read(){}}),web=Readable.toWeb(r),reader=web.getReader(),pending=reader.read();reader.releaseLock();try{await pending}catch(error){console.log(error.name)}console.log(web.locked,r.destroyed);const next=web.getReader(),received=next.read();r.push('x');console.log(Buffer.from((await received).value).toString());await next.cancel();next.releaseLock()})()
`));

test('mapping cancellation rejects demand when an asynchronous source next arrives',async()=>compare(`
(async()=>{const controller=new AbortController(),r=new Readable({objectMode:true,read(){}}),mapped=r.map(value=>value,{signal:controller.signal}),pending=mapped.toArray();setImmediate(()=>{controller.abort('cancel');r.push(1)});try{await pending}catch(error){console.log(error.name,error.code,r.destroyed,mapped.destroyed)}})()
`));

test('pipeline accepts Web streams and generator failures retain original identity',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,out=[],sink=new WritableStream({write(value){out.push(Buffer.from(value).toString())}});await stream.promises.pipeline(new Blob(['a','b']).stream(),sink);console.log(out.join(''));const fault=new Error('mapper'),source=Readable.from([1,2]),output=new Writable({objectMode:true,write(v,e,cb){cb()}});try{await stream.promises.pipeline(source,async function*(input){for await(const value of input){yield value;throw fault}},output)}catch(error){console.log(error===fault,source.destroyed,output.destroyed)}})()
`));

test('destroy waits for an outstanding construct before invoking the destroy hook',async()=>compare(`
new Promise(resolve=>{const out=[],fault=new Error('stop'),w=new Writable({construct(callback){out.push('construct');setImmediate(()=>{out.push('constructed');callback()})},write(c,e,cb){out.push('write');cb()},destroy(error,callback){out.push('destroy:'+(error===fault));callback(error)}});w.on('error',error=>out.push('error:'+(error===fault)));w.on('close',()=>{out.push('close');console.log(out.join('|'));resolve()});w.destroy(fault);out.push('top:'+w.destroyed);})
`));

test('Writable construct failure settles queued callbacks without calling the sink',async()=>compare(`
new Promise(resolve=>{const out=[],fault=new Error('construct'),w=new Writable({construct(callback){setImmediate(()=>callback(fault))},write(c,e,cb){out.push('write');cb()}});w.on('error',error=>out.push('error:'+(error===fault)));w.on('close',()=>{console.log(out.join('|'));resolve()});w.write('a',error=>out.push('writecb:'+(error===fault)));w.end(error=>out.push('endcb:'+(error===fault)))})
`));

test('Writable final failure settles the end callback before error and close',async()=>compare(`
new Promise(resolve=>{const out=[],fault=new Error('final'),w=new Writable({write(c,e,cb){cb()},final(callback){setImmediate(()=>callback(fault))}});w.on('error',error=>out.push('error:'+(error===fault)));w.on('close',()=>{out.push('close');console.log(out.join('|'));resolve()});w.end('a',error=>out.push('endcb:'+(error===fault)))})
`));

test('unpipe removes a blocked destination and resumes remaining sinks',async()=>compare(`
new Promise(resolve=>{const out=[],r=Readable.from(['a','b','c']),slow=new Writable({highWaterMark:1,write(c,e,cb){out.push('slow:'+c);setImmediate(()=>{r.unpipe(slow);cb();slow.destroy()})}}),fast=new Writable({write(c,e,cb){out.push('fast:'+c);cb()}});fast.on('finish',()=>{console.log(out.join('|'),r.readableEnded,r.listenerCount('data'));resolve()});r.pipe(slow);r.pipe(fast)})
`));

test('Writable writev-only implementations receive single writes and corked batches',async()=>compare(`
new Promise(resolve=>{const out=[],w=new Writable({writev(entries,callback){out.push(entries.map(entry=>entry.chunk.toString()).join(','));callback()}});w.write('a');w.cork();w.write('b');w.write('c');w.end(()=>{console.log(out.join('|'));resolve()})})
`));

test('Writable repeated end and destroyed end callbacks report terminal errors exactly once',async()=>compare(`
(async()=>{const out=[],w=new Writable({write(c,e,cb){cb()}});await new Promise(resolve=>w.end(resolve));await new Promise(resolve=>w.end(error=>{out.push(error.code);resolve()}));const fault=new Error('destroy'),stopped=new Writable({write(c,e,cb){cb()}});stopped.on('error',()=>{});stopped.destroy(fault);await new Promise(resolve=>stopped.end(error=>{out.push(error===fault,error.code);resolve()}));console.log(out.join('|'))})()
`));

test('Stream high-water-mark null values choose defaults or per-side values',async()=>compare(`
const w=new Writable({highWaterMark:null}),d=new Duplex({highWaterMark:null,readableHighWaterMark:3,writableHighWaterMark:7});console.log(w.writableHighWaterMark,d.readableHighWaterMark,d.writableHighWaterMark);w.destroy();d.destroy();
`));

test('finished observes Blob Web streams without acquiring a reader lock',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,web=new Blob(['a','b']).stream();const pending=stream.promises.finished(web,{cleanup:true});console.log(web.locked,stream.isDestroyed(web),stream.isErrored(web),stream.isReadable(web),stream.isWritable(web),stream.isDisturbed(web));const reader=web.getReader();while(!(await reader.read()).done){}await pending;console.log(web.locked,stream.isReadable(web),stream.isDisturbed(web));reader.releaseLock()})()
`));

test('finished Web writers preserve errors and status without taking the writer lock',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;for(const fail of [false,true]){const fault=new Error('write'),web=new WritableStream({write(){if(fail)throw fault}}),pending=stream.promises.finished(web,{cleanup:true});console.log(web.locked,stream.isWritable(web),stream.isReadable(web),stream.isDisturbed(web));const writer=web.getWriter();try{await writer.write('x');await writer.close();await pending;console.log('closed',stream.isWritable(web),stream.isErrored(web))}catch(error){try{await pending}catch(reason){console.log(reason===fault,stream.isWritable(web),stream.isErrored(web))}}writer.releaseLock()}})()
`));

test('addAbortSignal errors Web adapters while legacy destroy closes Web writers',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;for(const web of [Readable.toWeb(new Readable({read(){}})),new WritableStream()]){const controller=new AbortController(),reason=new Error('cancel'),pending=stream.promises.finished(web);console.log(stream.addAbortSignal(controller.signal,web)===web);controller.abort(reason);try{await pending}catch(error){console.log(error.name,error.code,error.cause===reason,stream.isErrored(web),stream.isReadable(web),stream.isWritable(web))}}const w=new WritableStream(),stopped=stream.promises.finished(w);console.log(stream.destroy(w,new Error('ignored')));await stopped;console.log(stream.isErrored(w),stream.isWritable(w))})()
`));

test('addAbortSignal retains the Node26 immutable Blob source boundary',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,controller=new AbortController(),web=new Blob(['x']).stream();stream.addAbortSignal(controller.signal,web);controller.abort('cancel');await new Promise(setImmediate);console.log(stream.isErrored(web),stream.isReadable(web));console.log(await (typeof __nonaRegexpVm==='undefined'?require('node:stream/consumers'):__nonaRegexpVm.streamConsumersModule).text(web))})()
`));

test('finished signal cancels only its observation and leaves Web locks available',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,c=new AbortController(),reason=new Error('cancel'),web=new Blob(['x']).stream(),pending=stream.promises.finished(web,{signal:c.signal});c.abort(reason);try{await pending}catch(error){console.log(error.name,error.code,error.cause===reason,web.locked,stream.isReadable(web))}console.log(await (typeof __nonaRegexpVm==='undefined'?require('node:stream/consumers'):__nonaRegexpVm.streamConsumersModule).text(web))})()
`));

test('Readable reduce uses an internal callback signal and toArray ignores worker-only options',async()=>compare(`
(async()=>{const controller=new AbortController();let callbackSignal;console.log(await Readable.from([1,2]).reduce((sum,value,context)=>{callbackSignal=context.signal;return sum+value},0,{signal:controller.signal}));console.log(callbackSignal instanceof AbortSignal,callbackSignal===controller.signal,callbackSignal.aborted);console.log((await Readable.from([1,2]).toArray({concurrency:0,highWaterMark:-1})).join(','));const reason=new Error('cancel'),source=Readable.from([1]);try{await source.toArray({signal:AbortSignal.abort(reason)})}catch(error){console.log(error.name,error.code,error.cause===reason,source.destroyed)}})()
`));

test('stream public module exports match the Node26 default export inventory',async()=>compare(`
const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;console.log(Object.keys(stream).sort().join(','));
`));

test('legacy Stream and stream classes retain the canonical EventEmitter constructor ancestry',async()=>compare(`
const Stream=typeof __nonaRegexpVm==='undefined'?require('node:stream').Stream:__nonaRegexpVm.streamModule,Emitter=typeof __nonaRegexpVm==='undefined'?require('node:events').EventEmitter:__nonaRegexpVm.eventEmitterModule;console.log(Object.getPrototypeOf(Stream)===Emitter,Stream.captureRejections,Stream.defaultMaxListeners,Object.getPrototypeOf(Readable)===Stream,Object.getPrototypeOf(Writable)===Stream);
`));

test('Readable operator signal validation matches null, duck-shaped and inherited forms',async()=>compare(`
(async()=>{const fake={aborted:false,addEventListener(){},removeEventListener(){}},impostor=Object.create(AbortSignal.prototype);for(const signal of [null,false,{},fake,impostor])for(const name of ['map','toArray','reduce','take']){const r=Readable.from([]);try{await(name==='map'?r.map(x=>x,{signal}).toArray():name==='reduce'?r.reduce((a,x)=>a+x,0,{signal}):name==='take'?r.take(1,{signal}).toArray():r.toArray({signal}));console.log(name,signal===null?'null':'invalid','ok')}catch(error){console.log(name,signal===null?'null':'invalid',error.name,error.code)}r.destroy()}})()
`));

test('destroy rejects corked queues before an asynchronous destroy hook completes',async()=>compare(`
(async()=>{for(const asynchronous of [false,true])await new Promise(resolve=>{const out=[],w=new Writable({write(c,e,cb){cb()},destroy(reason,callback){out.push('destroy');if(asynchronous)setImmediate(()=>{out.push('destroyed');callback(reason)});else callback(reason)}});w.cork();w.write('x',error=>out.push('callback:'+error.code));w.on('close',()=>{console.log(asynchronous,out.join('|'),w.writableLength);resolve()});w.destroy();out.push('top')})})()
`));

test('finished signals cancel Node stream observation without destroying the stream',async()=>compare(`
new Promise(resolve=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule,controller=new AbortController(),reason=new Error('stop'),r=new Readable({read(){}});stream.finished(r,{signal:controller.signal},error=>{console.log(error.name,error.code,error.cause===reason,r.destroyed,r.listenerCount('end'));r.destroy();resolve()});controller.abort(reason)})
`));

test('Web pipeTo cannot lose cancellation to stopped public abort propagation',async()=>compare(`
(async()=>{const c=new AbortController();c.signal.addEventListener('abort',event=>event.stopImmediatePropagation());let aborts=0;const web=Readable.toWeb(new Readable({read(){}})),writable=new WritableStream({abort(){aborts++}}),pending=web.pipeTo(writable,{signal:c.signal});c.abort('stop');try{await pending}catch(reason){console.log(reason,web.locked,writable.locked,aborts)}})()
`));

test('closed Web reader release replaces closed with a rejected promise while preserving the old one',async()=>compare(`
(async()=>{const web=Readable.toWeb(Readable.from([])),reader=web.getReader();await reader.read();await reader.closed;const old=reader.closed;reader.releaseLock();console.log(await reader.closed.then(()=> 'fulfilled',error=>error.name),old===reader.closed,web.locked);console.log(await old.then(()=> 'original',()=> 'rejected'))})()
`));

test('pipeline cancellation survives stopped public abort propagation in both stage forms',async()=>compare(`
(async()=>{const stream=typeof __nonaRegexpVm==='undefined'?require('node:stream'):__nonaRegexpVm.streamModule;for(const general of [false,true]){const c=new AbortController(),r=new Readable({read(){}}),w=new Writable({write(chunk,encoding,callback){callback()}});c.signal.addEventListener('abort',event=>event.stopImmediatePropagation());const stages=general?[r,async function*(input){for await(const chunk of input)yield chunk},w]:[r,w],pending=stream.promises.pipeline(...stages,{signal:c.signal});c.abort('stop');try{await pending}catch(error){console.log(general,error.name,error.code,error.cause,r.destroyed,w.destroyed)}}})()
`));

test('Web pipeTo validates the signal before acquiring either stream lock',async()=>compare(`
(async()=>{for(const options of [3,{signal:3},{signal:{}}]){const web=Readable.toWeb(new Readable({read(){}})),writable=new WritableStream();try{await web.pipeTo(writable,options)}catch(error){console.log(error.name,error.code)}console.log(web.locked,writable.locked);await web.cancel();await writable.abort()}const web=Readable.toWeb(new Readable({read(){}}));try{await web.pipeTo({})}catch(error){console.log(error.name,error.code,web.locked)}await web.cancel()})()
`));

test('Readable toWeb strategy bounds prefetch and validates its queue before attaching',async()=>compare(`
(async()=>{for(const highWaterMark of [0,1,2]){let reads=0;const source=new Readable({highWaterMark:1,read(){reads++;if(reads<5)this.push('abc');else this.push(null)}}),web=Readable.toWeb(source,{strategy:{highWaterMark}});await new Promise(setImmediate);console.log('before',highWaterMark,reads,source.readableLength,source.readableFlowing);const reader=web.getReader();console.log('chunk',Buffer.from((await reader.read()).value).toString());await new Promise(setImmediate);console.log('after',reads,source.readableLength,source.readableFlowing);await reader.cancel();reader.releaseLock()}for(const strategy of [{highWaterMark:-1},{highWaterMark:NaN},{size:3},3]){const source=new Readable({read(){}});try{Readable.toWeb(source,{strategy});console.log('valid')}catch(error){console.log(error.name,error.code,source.listenerCount('readable'),source.listenerCount('data'))}source.destroy()}})()
`));

test('Readable toWeb custom chunk sizes count queued bytes but omit direct pending delivery',async()=>compare(`
(async()=>{let reads=0,calls=0;const source=new Readable({highWaterMark:1,read(){reads++;if(reads<5)this.push('abc');else this.push(null)}}),web=Readable.toWeb(source,{strategy:{highWaterMark:4,size(chunk){calls++;return chunk.byteLength}}});await new Promise(setImmediate);console.log('weighted',reads,calls,source.readableLength);const reader=web.getReader();await reader.read();await new Promise(setImmediate);console.log('drained',reads,calls,source.readableLength);await reader.cancel();reader.releaseLock();let direct=0;const pending=Readable.toWeb(Readable.from(['a']),{strategy:{highWaterMark:0,size(){direct++;return 1}}}).getReader();console.log('direct',(await pending.read()).value,direct);console.log('done',(await pending.read()).done,direct);pending.releaseLock()})()
`));

test('Readable toWeb queue size failures keep the source alive and reach the guarded scheduler',async()=>{
 const context=await boundary(),captured:unknown[]=[];
 const privateVm=context.__nonaRegexpVm as {enqueueNextTick:(callback:Function,args?:unknown[])=>void};
 privateVm.enqueueNextTick=(callback,args=[])=>process.nextTick(()=>{try{Reflect.apply(callback,undefined,args)}catch(reason){captured.push(reason)}});
 runInContext(`var source=__nonaRegexpVm.streamModule.Readable.from(['a','b']),reader=__nonaRegexpVm.streamModule.Readable.toWeb(source,{strategy:{size:function(){return -1}}}).getReader();reader.closed.catch(function(){});`,context);
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(captured.length,1);
 context.failure=captured[0];
 const actual=runInContext('failure.name+" "+failure.code+" "+source.destroyed',context);
 const same=await runInContext('reader.closed.then(function(){return false},function(reason){return reason===failure})',context);
 const oracle=runOracle(`var {Readable}=require('node:stream'),source,reader;process.setUncaughtExceptionCaptureCallback(async function(reason){source.removeAllListeners('data');console.log(reason.name,reason.code,source.destroyed);source.destroy();try{await reader.closed}catch(error){console.log(error===reason)}reader.releaseLock();process.setUncaughtExceptionCaptureCallback(null)});source=Readable.from(['a','b']);reader=Readable.toWeb(source,{strategy:{size:function(){return -1}}}).getReader();reader.closed.catch(function(){});`);
 assert.equal(actual+'\n'+same+'\n',oracle.stdout);
 runInContext('source.destroy();reader.releaseLock()',context);
});
