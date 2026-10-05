import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {compile} from '../src/compiler.js';
import {runOracle} from './helpers/oracle.js';
import {bufferPreludeSource} from '../src/runtime/buffer-source.js';
import {encodingPreludeSource} from '../src/runtime/encoding-source.js';
import {nativeTargets} from '../src/target.js';
import {runtimeProbeSources} from '../src/backend/platform-probes.js';
import {cases,blobStreamCases,streamOracle} from './helpers/buffer-cases.js';

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
