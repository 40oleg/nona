import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {compile} from '../src/compiler.js';
import {supportedNativeTargets} from '../src/target.js';
import {nonaVersion} from '../src/version.js';
import {processMetadataSource} from '../src/runtime/process-metadata-source.js';

test('compiler metadata and CLI derive the actual package version',()=>{
 const metadata=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));assert.equal(nonaVersion,metadata.version);
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../cli.js',import.meta.url)),'--version'],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,nonaVersion+'\n');
});
test('Nona metadata descriptors and identity match Node shape without invented dependencies',()=>{
 const result=runInNewContext('var process={arch:"arm64"},platform="linux";'+processMetadataSource()+'JSON.stringify({version:process.version,versions:process.versions,release:process.release,features:process.features,config:process.config,identity:process.versions===process.versions,descriptors:["version","versions","release","features","config"].map(name=>{var d=Object.getOwnPropertyDescriptor(process,name);return [d.writable,d.enumerable,d.configurable]})})');
 const value=JSON.parse(result);assert.equal(value.version,'v'+nonaVersion);assert.deepEqual(value.versions,{nona:nonaVersion});assert.deepEqual(value.release,{name:'nona'});assert.equal(value.identity,true);assert.equal(value.features.aot,true);assert.equal(value.features.uv,false);assert.equal(value.config.target,'linux-arm64');
 assert.deepEqual(value.descriptors,[[false,true,true],[false,true,true],[false,true,true],[false,true,false],[false,true,true]]);
});
test('embedded metadata source changes with version and safely quotes injected literals',()=>{
 assert.notEqual(processMetadataSource('0.8.0'),processMetadataSource('0.8.1'));
 const result=runInNewContext('var process={arch:"x64"},platform="win32";'+processMetadataSource('x";throw Error("unsafe")//')+'process.versions.nona');assert.equal(result,'x";throw Error("unsafe")//');
});
test('compiler cache rejects an older embedded package version after rebuilding',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-version-cache-')),compiler=join(directory,'compiler'),cache=join(directory,'cache');mkdirSync(compiler);
 try{
  writeFileSync(join(compiler,'package.json'),'{"type":"module"}');writeFileSync(join(compiler,'cache.js'),readFileSync(new URL('../src/cache.js',import.meta.url)));
  const source='import {fileBaseImageCache} from '+JSON.stringify(pathToFileURL(join(compiler,'cache.js')).href)+';const cache=fileBaseImageCache('+JSON.stringify(cache)+');';
  writeFileSync(join(compiler,'version.js'),'export const nonaVersion="0.8.0";');
  const first=spawnSync(process.execPath,['--input-type=module','-e',source+'cache.set("metadata",{fragments:[],functions:[],imports:[],literals:new Map(),serial:0});console.log(!!cache.get("metadata"))'],{encoding:'utf8',windowsHide:true});assert.equal(first.status,0,first.stderr);assert.equal(first.stdout,'true\n');
  writeFileSync(join(compiler,'version.js'),'export const nonaVersion="0.8.1";');
  const second=spawnSync(process.execPath,['--input-type=module','-e',source+'console.log(cache.get("metadata")===undefined)'],{encoding:'utf8',windowsHide:true});assert.equal(second.status,0,second.stderr);assert.equal(second.stdout,'true\n');
 }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true})}
});
for(const target of supportedNativeTargets)test(`genuine process metadata compiles for ${target}`,()=>{
 const source='var metadataProcess={arch:'+JSON.stringify(target.endsWith('arm64')?'arm64':'x64')+'},platform='+JSON.stringify(target.split('-')[0])+';'+processMetadataSource().replace(/\bprocess\b/g,'metadataProcess')+'console.log(metadataProcess.version,metadataProcess.versions.nona,metadataProcess.config.target)';
 const result=compile(source,{fileName:'process-metadata.js',target});assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});
