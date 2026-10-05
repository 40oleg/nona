import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runModulesOnHost} from './helpers/host.js';

import {pathParitySources} from './helpers/path-cases.js';
import {supportedNativeTargets} from '../src/target.js';
import {withBuiltinModules} from '../src/frontend/builtin-modules.js';


for(const [name,body] of Object.entries(pathParitySources))for(const flavor of ['posix','win32'])test('node:path '+name+' '+flavor,()=>{
 // Keep each GC-stress run bounded while exercising both explicit flavors.
 const focused=body.replaceAll('[path.posix,path.win32]','[path.'+flavor+']').replaceAll('[path,path.posix,path.win32]','[path.'+flavor+']');
 const {native,oracle}=runModulesOnHost({'main.mjs':`import path from 'node:path';\n${focused}`},'main.mjs');
 assert.equal(native.error,undefined);assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,oracle);
});

test('path aliases resolve to the same module identity',()=>{
 const host=withBuiltinModules({resolve:()=>undefined,read:()=>undefined},'win32-x64');
 for(const flavor of ['','/posix','/win32'])assert.equal(host.resolve('path'+flavor,'/main.mjs'),host.resolve('node:path'+flavor,'/main.mjs'));
});

test('path alias namespaces and dynamic imports match Node',()=>{
 const source=`import * as bare from 'path'; import * as prefixed from 'node:path';
import * as posix from 'path/posix'; import * as nodePosix from 'node:path/posix';
import * as win32 from 'path/win32'; import * as nodeWin32 from 'node:path/win32';
console.log(bare===prefixed,posix===nodePosix,win32===nodeWin32);
Promise.all([import('path'),import('node:path'),import('path/posix'),import('node:path/posix')]).then(a=>console.log(a[0]===a[1],a[2]===a[3],a[0]===bare));`;
 const {native,oracle}=runModulesOnHost({'main.mjs':source},'main.mjs');
 assert.equal(native.error,undefined);assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,oracle);
});

test('node:path compiles for all eight targets, with bare and flavor aliases',()=>{
 for(const target of supportedNativeTargets){
  const result=compile(`import path, {normalize, matchesGlob} from 'node:path'; import bare from 'path'; import posix from 'node:path/posix'; import win32 from 'path/win32'; console.log(normalize('a/../b'), matchesGlob('x.js','*.js'), path===bare, posix===path.posix,win32===path.win32);`,{fileName:'path.mjs',module:true,target});
  assert.ok(result.ok,JSON.stringify(result.ok?[]:result.diagnostics));
 }
});
