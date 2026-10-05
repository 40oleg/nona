import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runOnHost,runModulesOnHost} from './helpers/host.js';
import {cases,blobStreamCases,streamOracle} from './helpers/buffer-cases.js';

for(const [index,body] of blobStreamCases.entries()){
 test('Blob stream and object URL Node oracle '+index,()=>{const source=`import {resolveObjectURL} from 'node:buffer';`+body;const {native}=runModulesOnHost({'main.mjs':source},'main.mjs');assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,streamOracle(body))});
}

test('Buffer module aliases share global constructors and helpers',()=>{
 const body=`console.log(Buffer===globalThis.Buffer,Buffer===bare.Buffer,Buffer===nona.Buffer,buffer.Buffer===Buffer,Blob===globalThis.Blob,File===globalThis.File);console.log(bare===node,nona===node);console.log(isAscii(Buffer.from('abc')),isAscii(Buffer.from('é')),isUtf8(Buffer.from([0xff])),isUtf8(Buffer.from('é')),btoa('é'),atob('6Q=='));console.log(transcode(Buffer.from('é😀'),'utf8','ascii').toString(),resolveObjectURL('blob:nodedata:missing'));`;
 const {native}=runModulesOnHost({'main.mjs':`import buffer,{Buffer,Blob,File,isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL} from 'node:buffer';import * as node from 'node:buffer';import * as bare from 'buffer';import * as nona from 'nona:buffer';`+body},'main.mjs');
 const oracle=runOracle(`var buffer=require('node:buffer'),bare=buffer,nona=buffer,node=buffer;var {Buffer,Blob,File,isAscii,isUtf8,btoa,atob,transcode,resolveObjectURL}=buffer;`+body);
 assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,oracle.stdout);
});

test('Blob immutable data and asynchronous methods match Node',()=>{
 const source=`var a=new Uint8Array([65,66]);var b=new Blob([a,'é'],{type:'TEXT/PLAIN'});a.fill(0);Promise.all([b.text(),b.arrayBuffer(),b.bytes(),b.slice(1,3).text()]).then(function(v){console.log(v[0],Buffer.from(v[1]).toString('hex'),Buffer.from(v[2]).toString('hex'),v[3]);v[2][0]=0;b.text().then(function(s){console.log(s)})});`;
 const native=runOnHost(source,{gcStress:true});assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,runOracle(source).stdout);
});

for(const [index,source] of cases.entries()){
 test('Buffer Node oracle '+index,()=>{
 const oracle=runOracle(source);
 const native=runOnHost(source,{gcStress:true});
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,oracle.stdout);
 });
}
