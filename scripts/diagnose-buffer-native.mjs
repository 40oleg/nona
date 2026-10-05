import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileToIR} from '../dist/src/compiler.js';
import {collectSourceUsage} from '../dist/src/frontend/lexer.js';
import {generate} from '../dist/src/backend/x64/codegen.js';
import {withNativeTarget} from '../dist/src/backend/machine/context.js';
import {getTarget} from '../dist/src/target.js';
import {assertNativeHost} from '../dist/src/backend/platform-probes.js';
import {linkLinux} from '../dist/src/backend/linux/index.js';
import {linkDarwin} from '../dist/src/backend/darwin/index.js';
import {linkPe} from '../dist/src/backend/pe/writer.js';
import {linkWindowsArm64} from '../dist/src/backend/arm64/windows.js';

const target=process.argv[2],compileOnly=process.argv.includes('--compile-only'),descriptor=getTarget(target);
if(!descriptor)throw Error('Expected native target');
if(!compileOnly)assertNativeHost(target);
const probes={
 'blob-stream':`console.log('before');var s=new Blob(['abc']).stream();console.log('stream',s.locked);`,
 'blob-text-stream':`console.log('before');var s=new Blob(['abc']).textStream();console.log('stream',s.locked);`,
 'default-reader':`var s=new Blob(['abc']).stream();console.log('before reader');var r=s.getReader();console.log('reader',s.locked);r.read().then(q=>console.log(q.done,q.value.length));`,
 'byob-reader':`var s=new Blob(['abc']).stream();console.log('before reader');var r=s.getReader({mode:'byob'});console.log('reader',s.locked);`,
 'byob-read':`var r=new Blob(['abc']).stream().getReader({mode:'byob'});console.log('before read');var v=new Uint8Array(4),p=r.read(v);console.log('detached',v.byteLength);p.then(q=>console.log(q.done,q.value.length),e=>console.log('rejected',e.name,e.code,e.message));`,
 'direct-reader':`var s=new Blob(['abc']).stream();console.log('before direct');var r=new ReadableStreamDefaultReader(s);console.log('reader',s.locked);`,
 'promise-state':`var r={resolve:null,reject:null,closed:null};console.log('before promise');r.closed=new Promise(function(resolve,reject){r.resolve=resolve;r.reject=reject});r.closed.catch(function(){});console.log(typeof r.resolve);r.resolve();r.closed.then(()=>console.log('resolved'));`,
 'weakmap-state':`var brand=new WeakMap();function Reader(s){if(new.target===undefined)throw Error('new required');var r={stream:s,resolve:null,closed:null};r.closed=new Promise(function(resolve){r.resolve=resolve});brand.set(this,r);r.resolve()}var s=new Blob(['x']).stream();console.log('before constructor');var r=new Reader(s);console.log(brand.get(r).stream===s);`,
 'arraybuffer-detach':`var v=new Uint8Array(4);console.log('before detach');var fn=ArrayBuffer.__nonaDetachInternal;fn(v.buffer);console.log(v.byteLength);`,
 'writable-start':`var w=new WritableStream({start(){return Promise.reject('start failed')}}).getWriter();console.log('writer');w.closed.catch(e=>console.log(e));`,
};
const directory=resolve('work/buffer-native-diagnostics',target);mkdirSync(directory,{recursive:true});let failed=false;
for(const [name,source] of Object.entries(probes))for(const gcStress of [false,true]){
 const id=name+(gcStress?'-stress':'-normal'),{result:ir,usage}=collectSourceUsage(()=>compileToIR(source,undefined,undefined,target));
 const program=withNativeTarget(target,()=>generate(ir,{gcStress,link:usage}));
 const image=descriptor.os==='linux'?linkLinux(program,descriptor.arch):descriptor.os==='darwin'?linkDarwin(program,descriptor.arch):descriptor.arch==='arm64'?linkWindowsArm64(program):linkPe(program);
 const file=join(directory,id+(descriptor.os==='win32'?'.exe':''));writeFileSync(file,image);
 if(compileOnly){console.log('compiled',id,image.length);continue}
 chmodSync(file,0o755);const run=spawnSync(file,[],{encoding:'utf8',timeout:15000,windowsHide:true});
 console.log(JSON.stringify({id,status:run.status,signal:run.signal,stdout:run.stdout,stderr:run.stderr,error:run.error?.message}));
 if(run.status!==0||run.error)failed=true;
}
if(failed)process.exitCode=1;
