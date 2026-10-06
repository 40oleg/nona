import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {compile} from '../src/compiler.js';
import {runOracle} from './helpers/oracle.js';
import {promisePreludeSource} from '../src/runtime/promise-source.js';
import {bufferPreludeSource} from '../src/runtime/buffer-source.js';
import {encodingPreludeSource} from '../src/runtime/encoding-source.js';
import {nativeTargets} from '../src/target.js';
import {runtimeProbeSources} from '../src/backend/platform-probes.js';
import {cases,blobStreamCases,streamOracle} from './helpers/buffer-cases.js';
import {regexpVmPrelude} from '../src/runtime/regexp-vm-source.js';
import {runtimeRegExpLink} from '../src/runtime/link.js';
import {collectSourceUsage,lex} from '../src/frontend/lexer.js';

test('Buffer captures the private checked byte-copy adapter',()=>{
 let calls=0;
 const context={__nonaRegexpVm:{},__nonaByteCopy:(target:Uint8Array,source:Uint8Array,offset:number)=>{calls++;if(!ArrayBuffer.isView(target)||!ArrayBuffer.isView(source)||target.BYTES_PER_ELEMENT!==1||source.BYTES_PER_ELEMENT!==1||!Number.isInteger(offset)||offset<0||offset+source.length>target.length)return undefined;target.set(source,offset);return true}};
 const body=`var b=Buffer.from([1,2,3,4]);b.copy(b,1,0,3);var c=Buffer.from(b);c[0]=9;JSON.stringify([Array.from(b),Array.from(c)]);`;
 assert.equal(runInNewContext(encodingPreludeSource+bufferPreludeSource+body,context),'[[1,1,2,3],[9,1,2,3]]');
 assert.ok(calls>=2);assert.equal('__nonaByteCopy' in context,false);
});

test('Buffer captures and removes the private native hex helper',()=>{
 let calls=0;
 const context={__nonaRegexpVm:{},__nonaHexEncode:(bytes:Uint8Array)=>{calls++;return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('')}};
 assert.equal(runInNewContext(encodingPreludeSource+bufferPreludeSource+`Buffer.from([0,15,16,255]).toString('hex')`,context),'000f10ff');
 assert.equal(calls,1);assert.equal('__nonaHexEncode' in context,false);
});

test('Buffer source links its internal RegExp dependency',()=>{
 const unused=collectSourceUsage(()=>lex('console.log("hello")')).usage;
 assert.deepEqual(runtimeRegExpLink(unused),{regexp:false,unicodeProperties:false});
 const linked=collectSourceUsage(()=>lex('URL.revokeObjectURL("blob:nodedata:missing")')).usage;
 assert.equal(linked.regexp,false);assert.equal(linked.preludes.buffer,true);
 assert.deepEqual(runtimeRegExpLink(linked),{regexp:true,unicodeProperties:false});
 // Model the native exec-to-VM bridge instead of delegating to Node's engine.
 const bridge=`Function.prototype.__nonaMarkNativeInternal=function(){};RegExp.prototype.exec=function(s){return __nonaRegexpVm(this,String(s),this.lastIndex,false,this.source,this.flags)};`;
 const body=`__nonaRegexpVm.bufferModule.resolveObjectURL('blob:nodedata:missing?query#hash');URL.revokeObjectURL('blob:nodedata:missing?query#hash');var u=new URL('blob:nodedata:missing?query#hash');if(u.search!=='?query'||u.hash!=='#hash')throw Error('URL parsing');`;
 const run=(regexp:boolean)=>runInNewContext(bridge+regexpVmPrelude({regexp,unicodeProperties:false})+encodingPreludeSource+bufferPreludeSource+body);
 assert.throws(()=>run(false),/compiled without the RegExp engine/);assert.doesNotThrow(()=>run(runtimeRegExpLink(linked).regexp));
});

test('node:buffer resolves as a built-in module',()=>{
 const result=compile(`import {Buffer} from 'node:buffer';console.log(Buffer.from('ok').toString());`,{fileName:'buffer.mjs',target:'win32-x64',module:true});
 assert.equal(result.ok,true,JSON.stringify(result));
});

test('Buffer compile only: every native target links the full module',()=>{
 const source=`import buffer,{Buffer,Blob,File,isUtf8,transcode} from 'node:buffer';var b=Buffer.allocUnsafe(64,64);b.writeBigInt64BE(-1n);console.log(b.readBigInt64BE(),b.slice(1).length,isUtf8(b),transcode(Buffer.from('é'),'utf8','latin1').toString('hex'),new File(['ok'],'x').size);new Blob([b]).text().then(console.log);`;
 for(const {target} of nativeTargets){const result=compile(source,{fileName:'buffer.mjs',target,module:true});assert.equal(result.ok,true,target+': '+JSON.stringify(result));}
});

test('Buffer native platform probe matches the Node oracle',()=>{
 for(const probe of runtimeProbeSources.filter(probe=>probe.name.startsWith('buffer')))assert.equal(runOracle(probe.source).stdout,probe.expected,probe.name);
});

test('Buffer module utilities prelude oracle',()=>{
 const body=`console.log(isAscii(new ArrayBuffer(2)),isUtf8(new Uint8Array([0xc0,0x80])),btoa('é'),atob('6Q=='));for(var from of ['utf8','utf16le','ascii','latin1'])for(var to of ['utf8','utf16le','ascii','latin1'])try{console.log(from,to,transcode(Buffer.from([65,128,0,216]),from,to).toString('hex'))}catch(e){console.log(from,to,e.name,e.code)}for(var s of ['','Zg','Zg=','Zg==','Z','YQ===','a-b_'])try{console.log(s,atob(s))}catch(e){console.log(s,e.name,e.code)}console.log(Buffer.alloc(0).inspect(),Buffer.from([1,2,255]).inspect(),resolveObjectURL('missing'));`;
 let stdout='';runInNewContext(encodingPreludeSource+'\n'+bufferPreludeSource+`\nvar {isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL}=__nonaRegexpVm.bufferModule;`+body,{__nonaRegexpVm:{},console:{log:(...values:unknown[])=>{stdout+=values.map(String).join(' ')+'\n';}}});
 assert.equal(stdout,runOracle(`var {isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL}=require('node:buffer');`+body).stdout);
});

test('Blob asynchronous prelude oracle',async()=>{
 const body=`(async function(){var original=new Uint8Array([65,66]),b=new Blob([original,'é']);original.fill(0);console.log(await b.text(),Buffer.from(await b.arrayBuffer()).toString('hex'),Buffer.from(await b.bytes()).toString('hex'),await b.slice(-2).text());var c=await b.bytes();c.fill(0);console.log(await b.text())})()`;
 let stdout='';await runInNewContext(encodingPreludeSource+'\n'+bufferPreludeSource+'\n'+body,{__nonaRegexpVm:{},console:{log:(...values:unknown[])=>{stdout+=values.map(String).join(' ')+'\n';}}});
 assert.equal(stdout,runOracle(body).stdout);
});

test('reader release preserves pending closed promises and shares one release error',async()=>{
 const body=`(async function(){for(var done of [false,true]){var reader=new Blob(['x']).stream().getReader();if(done){await reader.read();await reader.read()}var before=reader.closed;reader.releaseLock();var after=reader.closed,result=await Promise.allSettled([before,after]);console.log(done,before===after,result.map(function(value){return value.status}).join(','),result[0].reason===result[1].reason)}})()`;
 let stdout='';await runInNewContext(encodingPreludeSource+bufferPreludeSource+body,{__nonaRegexpVm:{},console:{log:(...values:unknown[])=>{stdout+=values.map(String).join(' ')+'\n'}}});
 assert.equal(stdout,streamOracle(body));
});

test('Blob asynchronous methods retain the startup Promise constructor',async()=>{
 const body=`(async function(){var original=Promise,blob=new Blob(['ok']);globalThis.Promise={resolve:function(){throw Error('resolve trap')},reject:function(){throw Error('reject trap')}};var result=blob.text();console.log(result instanceof original,await result);var reader=blob.stream().getReader();console.log((await reader.read()).done);reader.releaseLock()})()`;
 let stdout='';await runInNewContext(encodingPreludeSource+bufferPreludeSource+body,{__nonaRegexpVm:{},console:{log:(...values:unknown[])=>{stdout+=values.map(String).join(' ')+'\n'}}});
 assert.equal(stdout,streamOracle(body));
});

test('Blob stream compile only: every native target',()=>{for(const {target} of nativeTargets){const result=compile(`import {resolveObjectURL} from 'node:buffer';`+blobStreamCases.join(';'),{fileName:'blob-stream.mjs',target,module:true});assert.equal(result.ok,true,target+': '+JSON.stringify(result))}});
for(const [index,body] of blobStreamCases.entries()){
 test('Blob stream and object URL prelude oracle '+index,async()=>{let stdout='';await runInNewContext(encodingPreludeSource+'\n'+bufferPreludeSource+'\nvar {resolveObjectURL}=__nonaRegexpVm.bufferModule;'+body,{__nonaRegexpVm:{},console:{log:(...values:unknown[])=>{stdout+=values.map(String).join(' ')+'\n';}}});assert.equal(stdout,streamOracle(body))});
}
for(const [index,source] of cases.entries()){
 test('Buffer prelude oracle '+index,()=>{
  let stdout='';
  const context={__nonaRegexpVm:{},console:{log:(...values:unknown[])=>{stdout+=values.map(String).join(' ')+'\n';}}};
  runInNewContext(encodingPreludeSource+'\n'+bufferPreludeSource+'\n'+source,context);
  assert.equal(stdout,runOracle(source).stdout);
 });
}

test('private Web reader and writer rejection handling does not construct species promises',()=>{
 const setup=`var __nonaRegexpVm={isConstructor:function(fn){return typeof fn==='function'},AggregateError:AggregateError};Function.prototype.__nonaSharedQueueInternal=function(){};Function.prototype.__nonaMarkNativeInternal=function(){};Function.prototype.__nonaMarkPromiseInternal=function(){};`;
 const body=`var speciesCalls=0;Object.defineProperty(Promise,Symbol.species,{get:function(){speciesCalls++;return Promise},configurable:true});var reader=new Blob(['x']).stream().getReader();reader.releaseLock();var writer=new WritableStream().getWriter();writer.releaseLock();__nonaPromiseDrainJobs();speciesCalls`;
 assert.equal(runInNewContext(setup+promisePreludeSource.replace('__NONA_FAIL_ON_UNHANDLED__','true')+encodingPreludeSource+bufferPreludeSource+body),0);
});
