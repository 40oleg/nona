import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {emitMemory} from '../src/runtime/memory.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {supportedNativeTargets} from '../src/target.js';
import {compile} from '../src/compiler.js';

for(const target of supportedNativeTargets)test('unrecoverable native failure skips JS hooks and guards reentry on '+target,()=>{
 const b=withNativeTarget(target,()=>{const b=new RuntimeBuilder();emitMemory(b);return b});
 const fail=b.bundle.fragments.find(fragment=>fragment.name==='rt.fail')!,calls=fail.fixups.map(fixup=>fixup.target);
 assert.ok(calls.includes('rt.fatalActive'));assert.ok(calls.includes('rt.fatalReportHook'));assert.ok(calls.includes('ExitProcess'));assert.ok(!calls.includes('rt.runExitHook'));assert.ok(!calls.some(name=>/rt\.(alloc|gc)|HeapAlloc/.test(name)));
 for(const name of ['rt.fatalActive','rt.fatalReportHook'])assert.deepEqual(Array.from(b.bundle.fragments.find(fragment=>fragment.name===name)!.bytes),Array(8).fill(0));
 const result=compile('console.log(process.pid>0)',{fileName:'fatal-runtime-link.js',target});assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
});
