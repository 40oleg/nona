import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processHostDeclarations} from '../src/runtime/process-source.js';
import {fsModuleSource} from '../src/frontend/fs-module.js';
import {compile} from '../src/compiler.js';
test('Linux ARM64 process uses native syscall IDs and at-style signatures',()=>{
 const declarations=processHostDeclarations('linux-arm64' as never);
 const byName=new Map(declarations.map(d=>[d.name,d.declaration]));
 assert.deepEqual(byName.get('sys_open'),{dll:'syscall',name:'56',signature:'i64(i64,buf,i64,i64)'});
 assert.equal(byName.get('sys_readlink')?.name,'78');assert.equal(byName.get('sys_getcwd')?.name,'17');
 const result=compile('console.log(process.arch,process.pid>0)',{fileName:'process.js',target:'linux-arm64'});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
});
test('Linux ARM64 filesystem emits at-style calls and native stat mode layout',()=>{
 const source=fsModuleSource('linux-arm64');
 assert.ok(source.includes("define('syscall', '56', 'i64(i64,buf,i64,i64)')"));
 assert.ok(source.includes('getUint32(16, true)'));
 const result=compile('import {readFileSync} from "node:fs";console.log(readFileSync("a","utf8"))',{fileName:'fs.js',target:'linux-arm64',module:true});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
});
