import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileToIR,compile} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {collectSourceUsage} from '../src/frontend/lexer.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {supportedNativeTargets} from '../src/target.js';
import {linkLinux} from '../src/backend/linux/index.js';

for(const target of supportedNativeTargets)test('POSIX I/O dispositions install at main entry only for '+target,()=>{
 const {result:ir,usage}=collectSourceUsage(()=>compileToIR('console.log(1)','signal-defaults.js',undefined,target));
 const main=withNativeTarget(target,()=>generate(ir,{link:usage})),agent=withNativeTarget(target,()=>generate(ir,{link:usage,agent:true}));
 assert.ok(main.fragments.find(item=>item.name==='entry')!.fixups.some(item=>item.target==='rt.processSignalDefaults'));
 assert.ok(!agent.fragments.find(item=>item.name==='entry')!.fixups.some(item=>item.target==='rt.processSignalDefaults'));
 const helper=main.fragments.find(item=>item.name==='rt.processSignalDefaults')!;
 assert.equal(helper.syscalls?.length??0,target==='win32-arm64'?0:2);assert.ok(!helper.fixups.some(item=>/alloc|gc|js\./.test(item.target)));
 assert.ok(main.fragments.findIndex(item=>item.name==='entry')>=0);
 const image=compile('console.log(1)',{fileName:'signal-defaults.js',target});assert.ok(image.ok,image.ok?'':JSON.stringify(image.diagnostics));
 if(target==='win32-x64')assert.ok(linkLinux(main,'x64').length>1024);
});
