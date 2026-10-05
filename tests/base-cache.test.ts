import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compile} from '../src/compiler.js';
import {decodeBaseImage,defaultCacheDirectory,encodeBaseImage,fileBaseImageCache} from '../src/cache.js';
import type {BaseImage} from '../src/backend/x64/codegen.js';

// The compiled runtime and preludes can be kept on disk between processes
// (roadmap item 20). A cached build must produce the same executable.

const source='function f(n){return n<2?n:f(n-1)+f(n-2)}class A{constructor(){this.y=1}get x(){return this.y}}console.log(f(10),new A().x,[3,1,2].sort().join());';
const digest=(image:Uint8Array)=>createHash('sha256').update(image).digest('hex');

test('base images survive encoding with every field',()=>{
 const image:BaseImage={
  fragments:[{name:'a',section:'.text',bytes:new Uint8Array([1,2,3]),fixups:[{offset:1,target:'b',addend:0,kind:'rel32'}],symbols:{'a$1':0}},{name:'b',section:'.rdata',alignment:8,bytes:new Uint8Array(0),fixups:[],symbols:{}}],
  functions:[{begin:'a',end:'a.end',prologSize:4,stackAllocation:40,savedRegisters:[{register:3,codeOffset:1,stackOffset:8}]}],
  imports:[{dll:'KERNEL32.dll',name:'ExitProcess',symbol:'imp.ExitProcess'}],
  literals:new Map([['hi','literal.0']]),serial:42,
 };
 assert.deepEqual(decodeBaseImage(encodeBaseImage(image)),image);
 assert.equal(decodeBaseImage(new Uint8Array([1,2,3])),undefined);
 const truncated=encodeBaseImage(image).slice(0,-2);
 assert.throws(()=>decodeBaseImage(truncated));
});

test('the default cache directory follows the platform conventions',()=>{
 assert.equal(defaultCacheDirectory({NONA_CACHE_DIR:'/x'},'linux'),'/x');
 assert.equal(defaultCacheDirectory({XDG_CACHE_HOME:'/c'},'linux'),join('/c','nona'));
 assert.equal(defaultCacheDirectory({LOCALAPPDATA:'L'},'win32'),join('L','nona','cache'));
 assert.ok(defaultCacheDirectory({},'darwin').endsWith(join('Library','Caches','nona')));
});

test('a new process builds from the cached runtime and gets the same executable',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-cache-'));
 try{
  for(const target of ['linux-x64','win32-x64'] as const){
   const plain=compile(source,{fileName:'/app.js',target});
   assert.ok(plain.ok);
   // Fill the cache in a child process, then build again in another one that must hit it.
   const script=join(directory,'build.mjs');
   writeFileSync(script,`
import {createHash} from 'node:crypto';
import {compile} from ${JSON.stringify(new URL('../src/compiler.js',import.meta.url).href)};
import {fileBaseImageCache} from ${JSON.stringify(new URL('../src/cache.js',import.meta.url).href)};
const cache=fileBaseImageCache(process.argv[2]);let hits=0,writes=0;
const counting={get(key){const image=cache.get(key);if(image)hits++;return image},set(key,image){writes++;cache.set(key,image)}};
const result=compile(${JSON.stringify(source)},{fileName:'/app.js',target:process.argv[3],baseCache:counting});
console.log(hits,writes,createHash('sha256').update(result.image).digest('hex'));`);
   const run=()=>{
    const child=spawnSync(process.execPath,[script,join(directory,'store'),target],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim().split(' ');
   };
   const [firstHits,firstWrites,firstImage]=run(),[hits,writes,image]=run();
   assert.equal(firstImage,digest(plain.image),target);
   assert.equal(image,digest(plain.image),target);
   assert.equal(Number(hits),1,target);assert.equal(Number(writes),0,target);
   assert.equal(Number(firstHits),0);assert.equal(Number(firstWrites),1);
  }
  assert.equal(readdirSync(join(directory,'store')).length,2,'native target identities isolate cached runtime images');
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('a damaged or unwritable cache only costs time',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-cache-'));
 try{
  const cache=fileBaseImageCache(directory);
  const first=compile(source,{fileName:'/app.js',target:'linux-x64',baseCache:cache});
  assert.ok(first.ok);
  for(const entry of readdirSync(directory))writeFileSync(join(directory,entry),'NONABAS1 broken');
  for(const key of ['k'])assert.equal(cache.get(key),undefined);
  const blocked=fileBaseImageCache(join(fileURLToPath(import.meta.url),'not-a-directory'));
  blocked.set('k',{fragments:[],functions:[],imports:[],literals:new Map(),serial:0});
  assert.equal(blocked.get('k'),undefined);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
