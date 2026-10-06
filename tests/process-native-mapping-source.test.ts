import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linuxShims} from '../src/backend/linux/shims.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {compile} from '../src/compiler.js';

for(const [pageSize,add,mask] of [[4096,'ff0f0000','00f0ffff'],[16384,'ff3f0000','00c0ffff'],[65536,'ffff0000','0000ffff']] as const)test(`native mappings round live bytes to ${pageSize} before tail unmapping`,()=>withNativeTarget('linux-x64',()=>{
 const fragment=linuxShims([],{pageSize}).find(f=>f.name==='linux.VirtualAlloc.code')!,hex=Buffer.from(fragment.bytes).toString('hex');
 const rounded=hex.indexOf('4881c2'+add+'4881e2'+mask);assert.ok(rounded>=0);
 const allocation=hex.indexOf('0f05');assert.ok(allocation>rounded);
 // RDX is saved only after page rounding, and reused to form the tail start.
 assert.ok(hex.indexOf('4889542438',rounded)>rounded);
}));
for(const target of ['freebsd-x64','openbsd-x64','linux-x64','linux-arm64','darwin-x64','darwin-arm64','win32-x64','win32-arm64'] as const)test(`small native process vectors remain linked for ${target}`,()=>{
 const result=compile('console.log(Object.keys(process.env).length>=0);process.env.NONA_TINY="x";delete process.env.NONA_TINY;console.log("small vector")',{fileName:'process-small-vector.js',target});assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
});
