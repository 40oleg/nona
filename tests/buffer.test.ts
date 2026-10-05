import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {compile} from '../src/compiler.js';
import {runOracle} from './helpers/oracle.js';
import {runOnHost,runModulesOnHost} from './helpers/host.js';
import {bufferPreludeSource} from '../src/runtime/buffer-source.js';
import {encodingPreludeSource} from '../src/runtime/encoding-source.js';
import {nativeTargets} from '../src/target.js';
import {runtimeProbeSources} from '../src/backend/platform-probes.js';

const cases=[
  `var b=Buffer.from('hé😀');console.log(b instanceof Uint8Array,Buffer.isBuffer(b),b.toString(),b.toString('hex'),Buffer.byteLength('hé😀'));var s=b.slice(1,3);s[0]=65;console.log(b[1],s.buffer===b.buffer,s instanceof Buffer);console.log(Buffer.from({type:'Buffer',data:[257,-1]}).toString('hex'));`,
  `for(var e of ['utf8','utf16le','latin1','ascii','base64','base64url','hex']){var s=e==='hex'?'deadbeef':e==='base64'||e==='base64url'?'aGVsbG8_':'Aé😀';var b=Buffer.from(s,e);console.log(e,b.toString('hex'),b.toString(e))}console.log(Buffer.isEncoding('UTF-8'),Buffer.isEncoding('no'),Buffer.byteLength(new Uint16Array(3)));`,
  `var b=Buffer.alloc(12,'ab');console.log(b.toString(),b.indexOf('ba'),b.lastIndexOf('ba'),b.includes('zz'));console.log(b.copy(b,2,0,8),b.toString());console.log(Buffer.concat([Buffer.from([1,2]),new Uint8Array([3])],5).toString('hex'));console.log(Buffer.compare(Buffer.from([1]),Buffer.from([2])),b.equals(Buffer.from(b)));console.log(JSON.stringify(b.toJSON()));`,
  `var b=Buffer.alloc(32);console.log(b.writeUIntLE(0x123456,1,3),b.readUIntBE(1,3),b.writeIntBE(-123456,4,3),b.readIntBE(4,3));b.writeDoubleLE(Math.PI,8);b.writeFloatBE(1.5,16);b.writeBigInt64BE(-123456789012345n,20);console.log(b.readDoubleLE(8),b.readFloatBE(16),b.readBigInt64BE(20));console.log(Buffer.from([1,2,3,4]).swap16().toString('hex'));`,
  `var b=Buffer.alloc(5);console.log(b.write('😀a',0,3),b.toString('hex'));console.log(b.write('😀a',0,5),b.toString());for(var f of [function(){Buffer.alloc(-1)},function(){Buffer.from(5)},function(){Buffer.from('a','bad')},function(){b.readUInt32LE(2)},function(){b.writeUInt8(256)}]){try{f()}catch(e){console.log(e.name,e.code)}}`,
  `var a=new ArrayBuffer(8),v=new Uint8Array(a);v.set([1,2,3,4]);var b=Buffer.from(a,1,3);b[0]=9;var c=Buffer.from(b);c[0]=7;console.log(v[1],b[0],c[0],b.buffer===a,Buffer.isBuffer(v));console.log(Buffer.copyBytesFrom(new Uint16Array([0x1234,0xabcd]),1,1).toString('hex'));console.log(Buffer.alloc(2.9).length,Buffer.allocUnsafeSlow(2).length,Buffer.poolSize);`,
  `var b=Buffer.from('abcabc');for(var p of [undefined,-99,-2,0,1,3,99,NaN])console.log(b.indexOf('bc',p,5),b.lastIndexOf('bc',p,5),b.indexOf('',p,5));var u=Buffer.from('abcabc','utf16le');console.log(u.indexOf('bc',1,'utf16le'),u.lastIndexOf('bc',undefined,'utf16le'));console.log(Buffer.prototype.toString.call(new Uint8Array([65,66])),Buffer.prototype.readUInt16BE.call(new Uint8Array([1,2])));`,
  `for(var e of ['utf8','utf16le','latin1','ascii','hex','base64','base64url']){var b=Buffer.alloc(8);console.log(e,b.write(e==='hex'?'4142zz':e==='base64'||e==='base64url'?'QUL/':'é😀',1,5,e),b.toString('hex'))}for(var s of ['','A','Zg==','Zg=',' Zg== ','YWJj-_/','0g','1x','ab9'])console.log(s,Buffer.from(s,'base64').toString('hex'),Buffer.from(s,'hex').toString('hex'));`,
  `var b=Buffer.alloc(12);for(var n of [1,2,3,4,5,6]){b.writeUIntLE(Math.pow(2,8*n)-1,0,n);console.log(n,b.readUIntLE(0,n),b.readUIntBE(0,n));b.writeIntBE(-Math.pow(2,8*n-1),0,n);console.log(b.readIntBE(0,n))}b.writeBigUint64LE((1n<<64n)-1n);console.log(b.readBigUint64LE(),b.readBigInt64LE());b.writeFloatLE(-0);console.log(Object.is(b.readFloatLE(),-0));`,
  `var b=Buffer.alloc(8);for(var f of [function(){b.readUIntLE(undefined,2)},function(){b.readUInt8('0')},function(){b.writeIntLE(128,0,1)},function(){b.fill('zz','hex')},function(){Buffer.alloc(NaN)},function(){Buffer.allocUnsafe(4,3)},function(){Buffer.from('x').swap16()},function(){Buffer.from('x').toString(null)}])try{f()}catch(e){console.log(e.name,e.code)}console.log(Buffer.from('ab').compare(Buffer.from('abcd'),0,2),b.copy(Buffer.alloc(0)),Buffer.from([128,255]).toString('ascii'));`,
  `var b=new Blob(['a',new Uint8Array([98,99]),new Blob(['dé'])],{type:'TEXT/PLAIN'});console.log(b.size,b.type,b instanceof Blob,Object.prototype.toString.call(b));console.log(b.slice(-3).size,b.slice(1,3,'ABC').type);var f=new File(['a'],'hé😀',{type:'TEXT/PLAIN',lastModified:123});console.log(f.name,f.lastModified,f.size,f.type,f instanceof Blob,f instanceof File,Object.prototype.toString.call(f));var a=new Uint8Array([1,2]),q=new Blob([a]);a[0]=9;console.log(q.size);`,
];

test('node:buffer resolves as a built-in module',()=>{
 const result=compile(`import {Buffer} from 'node:buffer';console.log(Buffer.from('ok').toString());`,{fileName:'buffer.mjs',target:'win32-x64',module:true});
 assert.equal(result.ok,true,JSON.stringify(result));
});

test('Buffer compile only: every native target links the full module',()=>{
 const source=`import buffer,{Buffer,Blob,File,isUtf8,transcode} from 'node:buffer';var b=Buffer.allocUnsafe(64,64);b.writeBigInt64BE(-1n);console.log(b.readBigInt64BE(),b.slice(1).length,isUtf8(b),transcode(Buffer.from('é'),'utf8','latin1').toString('hex'),new File(['ok'],'x').size);new Blob([b]).text().then(console.log);`;
 for(const {target} of nativeTargets){const result=compile(source,{fileName:'buffer.mjs',target,module:true});assert.equal(result.ok,true,target+': '+JSON.stringify(result));}
});

test('Buffer native platform probe matches the Node oracle',()=>{
 const probe=runtimeProbeSources.find(probe=>probe.name==='buffer')!;
 assert.equal(runOracle(probe.source).stdout,probe.expected);
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

test('Blob prelude: stream dependency is explicit',()=>{
 runInNewContext(encodingPreludeSource+'\n'+bufferPreludeSource+`\nfor(var method of ['stream','textStream']){var threw=false;try{(new Blob())[method]()}catch(e){if(e.code!=='ERR_NOT_IMPLEMENTED')throw e;threw=true}if(!threw)throw Error('Missing stream dependency error')}`,{__nonaRegexpVm:{}});
});

test('Buffer module aliases share global constructors and helpers',()=>{
 const body=`console.log(Buffer===globalThis.Buffer,Buffer===bare.Buffer,Buffer===nona.Buffer,buffer.Buffer===Buffer,Blob===globalThis.Blob,File===globalThis.File);console.log(isAscii(Buffer.from('abc')),isAscii(Buffer.from('é')),isUtf8(Buffer.from([0xff])),isUtf8(Buffer.from('é')),btoa('é'),atob('6Q=='));console.log(transcode(Buffer.from('é😀'),'utf8','ascii').toString(),resolveObjectURL('blob:nodedata:missing'));`;
 const {native}=runModulesOnHost({'main.mjs':`import buffer,{Buffer,Blob,File,isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL} from 'node:buffer';import * as bare from 'buffer';import * as nona from 'nona:buffer';`+body},'main.mjs');
 const oracle=runOracle(`var buffer=require('node:buffer'),bare=buffer,nona=buffer;var {Buffer,Blob,File,isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL}=buffer;`+body);
 assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,oracle.stdout);
});

test('Blob immutable data and asynchronous methods match Node',()=>{
 const source=`var a=new Uint8Array([65,66]);var b=new Blob([a,'é'],{type:'TEXT/PLAIN'});a.fill(0);Promise.all([b.text(),b.arrayBuffer(),b.bytes(),b.slice(1,3).text()]).then(function(v){console.log(v[0],Buffer.from(v[1]).toString('hex'),Buffer.from(v[2]).toString('hex'),v[3]);v[2][0]=0;b.text().then(function(s){console.log(s)})});`;
 const native=runOnHost(source,{gcStress:true});assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,runOracle(source).stdout);
});

for(const [index,source] of cases.entries()){
 test('Buffer prelude oracle '+index,()=>{
  let stdout='';
  const context={__nonaRegexpVm:{},console:{log:(...values:unknown[])=>{stdout+=values.map(String).join(' ')+'\n';}}};
  runInNewContext(encodingPreludeSource+'\n'+bufferPreludeSource+'\n'+source,context);
  assert.equal(stdout,runOracle(source).stdout);
 });
 test('Buffer Node oracle '+index,()=>{
 const oracle=runOracle(source);
 const native=runOnHost(source,{gcStress:true});
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,oracle.stdout);
 });
}

export {cases};
