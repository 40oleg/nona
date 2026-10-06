import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathModuleSourceForTarget} from '../src/frontend/path-module.js';
import {compileModuleToIR} from '../src/compiler.js';
import {collectSourceUsage} from '../src/frontend/lexer.js';
import {generate} from '../src/backend/x64/codegen.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {linkLinux} from '../src/backend/linux/index.js';
import type {Target} from '../src/target.js';
import {supportedNativeTargets} from '../src/target.js';
import {withBuiltinModules} from '../src/frontend/builtin-modules.js';
import type path from 'node:path';

test('Path and Buffer aliases resolve to their canonical built-in providers',()=>{
 const host=withBuiltinModules({resolve:specifier=>specifier,read:()=>{throw new Error('Unexpected external module')}},'linux-x64');
 for(const [canonical,aliases] of [['node:path',['path']],['node:path/posix',['path/posix']],['node:path/win32',['path/win32']],['node:buffer',['buffer','nona:buffer']]] as const){
  for(const alias of aliases){assert.equal(host.resolve(alias,'entry.mjs'),canonical);assert.equal(host.read(alias),host.read(canonical))}
 }
});

function adapter(target:Target,cwd:string,drives:Record<string,string>={}) {
 const global={};let processReads=0,cwdCalls=0;const driveReads:string[]=[];
 Object.defineProperty(global,'process',{configurable:true,get(){processReads++;throw Error('Path must not build process');}});
 const define=(dll:string,name:string,signature:string)=>{
  if(name==='GetCurrentDirectoryW'){
   assert.equal(dll,'KERNEL32.dll');assert.equal(signature,'u32(u32,buf)');
   return (capacity:number,out:Uint16Array)=>{cwdCalls++;if(capacity<=cwd.length)return cwd.length+1;for(let i=0;i<cwd.length;i++)out[i]=cwd.charCodeAt(i);return cwd.length;};
  }
  if(name==='GetEnvironmentVariableW'){
   assert.equal(dll,'KERNEL32.dll');
   assert.equal(signature,'u32(buf,buf,u32)');
   return (key:Uint16Array,out:Uint16Array,capacity:number)=>{const text=String.fromCharCode(...key).split('\0')[0]!;driveReads.push(text);const value=drives[text];if(value===undefined)return 0;if(capacity<=value.length)return value.length+1;for(let i=0;i<value.length;i++)out[i]=value.charCodeAt(i);return value.length;};
  }
  if(name==='79'||name==='17'){
   assert.equal(dll,'syscall');assert.equal(signature,'i64(buf,u64)');
   return (out:Uint8Array,capacity:number)=>{cwdCalls++;const bytes=new TextEncoder().encode(cwd+'\0');if(bytes.length>capacity)return -34;out.set(bytes);return bytes.length;};
  }
  throw Error('Unexpected Path host declaration '+name);
 };
 const source=pathModuleSourceForTarget(target).replace(/^import .*$/gm,'').replace(/^export .*$/gm,'');
 const implementation=new Function('define','globalThis',source+'\nreturn path;')(define,global) as typeof path;
 return {implementation,global,reads:()=>({processReads,cwdCalls,driveReads})};
}

test('Windows Path imports avoid full process startup and read only the requested drive',()=>{
 const cwd='C:\\'+ 'long'.repeat(90)+'\\é😀';
 const host=adapter('win32-x64',cwd,{'=D:':'D:\\other\\ü'});
 assert.deepEqual(host.reads(),{processReads:0,cwdCalls:0,driveReads:[]});
 assert.equal(host.implementation.normalize('C:/a/../b'),'C:\\b');
 assert.equal(host.implementation.resolve('x'),cwd+'\\x');
 assert.equal(host.implementation.resolve('D:child'),'D:\\other\\ü\\child');
 assert.deepEqual(host.reads().driveReads,['=D:']);assert.equal(host.reads().processReads,0);
 Object.defineProperty(host.global,'process',{value:{cwd:()=>'C:\\changed',env:{'=D:':'D:\\override'}},configurable:true});
 assert.equal(host.implementation.resolve('x'),'C:\\changed\\x');
 assert.equal(host.implementation.resolve('D:child'),'D:\\override\\child');
 assert.deepEqual(host.reads().driveReads,['=D:']);
});

for(const target of ['linux-x64','linux-arm64'] as const)test(target+' Path reads cwd lazily without process initialization',()=>{
 const host=adapter(target,'/tmp/é😀');
 assert.deepEqual(host.reads(),{processReads:0,cwdCalls:0,driveReads:[]});
 assert.equal(host.implementation.resolve('a','../b'),'/tmp/é😀/b');
 assert.equal(host.implementation.win32.resolve('C:child'),'C:\\tmp\\é😀\\child');
 assert.equal(host.reads().processReads,0);
 Object.defineProperty(host.global,'process',{value:{cwd:()=>'/changed',env:{}},configurable:true});
 assert.equal(host.implementation.resolve('x'),'/changed/x');
});

test('Path-only native images link cwd adapters without process argument/environment imports',()=>{
 for(const target of supportedNativeTargets){
  const {result:ir,usage}=collectSourceUsage(()=>compileModuleToIR('import path from "node:path";console.log(path.resolve("x"))','path.mjs',undefined,'',target));
  const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage}));
  assert.equal(usage.preludes.process,false,target+' must not select process startup');
  // GetCommandLineW can identify the native host for emergency diagnostics;
  // argument parsing and environment capture must remain absent.
  assert.ok(!program.imports.some(item=>item.name==='CommandLineToArgvW'||item.name==='GetEnvironmentStringsW'),target+' must not link full process startup');
  assert.ok(!program.fragments.some(item=>/^hostffi\.\d+\.code$/.test(item.name)),target+' must not emit process host thunks');
 }
});

test('Windows-produced Path imports have Linux foreign-host link shims',()=>{
 const {result:ir,usage}=collectSourceUsage(()=>compileModuleToIR('import path from "node:path";console.log(path.resolve("x"))','path.mjs',undefined,'','win32-x64'));
 const program=withNativeTarget('win32-x64',()=>generate(ir,{gcStress:true,link:usage}));
 assert.ok(program.imports.some(item=>item.name==='GetCurrentDirectoryW'));
 assert.ok(program.imports.some(item=>item.name==='GetEnvironmentVariableW'));
 const image=linkLinux(program);
 assert.deepEqual(Array.from(image.subarray(0,4)),[0x7f,0x45,0x4c,0x46]);
});
