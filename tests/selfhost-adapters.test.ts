import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compilerCryptoSource,compilerHomeSource,compilerUrlSource} from '../src/selfhost-adapters.js';
import {requireHostTarget} from '../src/target.js';
import {runModulesOnHost} from './helpers/host.js';

test('private native compiler hashes and UUIDs agree with the Node API contract',()=>{
 const body=`const input=new Uint8Array([0,1,255]),hash=createHash('sha256').update('compiler\\0').update(input);input[0]=99;
 console.log(hash.digest('hex'));
 try{hash.update('late');console.log('unexpected reuse')}catch{console.log('finalized')}
 const first=randomUUID(),second=randomUUID();console.log(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first),first!==second);`;
 const files={
  'main.mjs':"import {createHash,randomUUID} from './crypto.mjs';"+body,
  'crypto.mjs':compilerCryptoSource(requireHostTarget()).replace("'./backend/macho/sha256.js'","'./sha256.mjs'"),
  'sha256.mjs':readFileSync(new URL('../src/backend/macho/sha256.js',import.meta.url),'utf8'),
 };
 const {native,oracle}=runModulesOnHost(files,'main.mjs',{gcStress:true,oracleSource:"import {createHash,randomUUID} from 'node:crypto';"+body});
 assert.equal(native.status,0,String(native.error??native.stderr));assert.equal(native.stdout,oracle);
});

test('private compiler cache home falls back to the native account profile',()=>{
 const body=`const key=process.platform==='win32'?'USERPROFILE':'HOME',saved=process.env[key];delete process.env[key];try{console.log(homedir());}finally{if(saved!==undefined)process.env[key]=saved;}`;
 const {native,oracle}=runModulesOnHost({'main.mjs':"import {homedir} from './home.mjs';"+body,'home.mjs':compilerHomeSource(requireHostTarget())},'main.mjs',{
  gcStress:true,oracleSource:"import {homedir} from 'node:os';"+body,
 });
 assert.equal(native.status,0,String(native.error??native.stderr));assert.equal(native.stdout,oracle);
});

test('private compiler file URLs preserve coverage file names',()=>{
 const body=`for(const path of ['input.js','a #?%.js','кириллица.js',"a !'()*.js",'a@b$d&e=f+g,h;i[j].js']){console.log(pathToFileURL(path).href);}`;
 const {native,oracle}=runModulesOnHost({'main.mjs':"import {pathToFileURL} from './url.mjs';"+body,'url.mjs':compilerUrlSource},'main.mjs',{
  gcStress:true,oracleSource:"import {pathToFileURL} from 'node:url';"+body,
 });
 assert.equal(native.status,0,String(native.error??native.stderr));assert.equal(native.stdout,oracle);
});
