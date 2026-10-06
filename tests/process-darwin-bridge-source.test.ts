import {test} from 'node:test';
import assert from 'node:assert/strict';
import {darwinProcessSystemAdapters} from '../src/backend/darwin/system.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {linkDarwin} from '../src/backend/darwin/index.js';

for(const arch of ['x64','arm64'] as const)test(`Darwin ${arch} six-argument OS adapter preserves incoming stack arguments`,()=>withNativeTarget(`darwin-${arch}`,()=>{
 const program=generate(compileToIR('console.log(42)',undefined,undefined,`darwin-${arch}`));program.imports.push({dll:'/usr/lib/libSystem.B.dylib',name:'kevent',symbol:'kevent.test'});
 const adapted=darwinProcessSystemAdapters(program,arch),fragment=adapted.fragments.find(f=>f.name==='linux.kevent.test.code')!;assert.ok(fragment);
 if(arch==='x64'){
  const hex=Buffer.from(fragment.bytes).toString('hex');assert.ok(hex.includes('4c8b842410010000'));assert.ok(hex.includes('4c8b8c2418010000'));
 }else{
  const words=Array.from({length:fragment.bytes.length/4},(_,i)=>new DataView(fragment.bytes.buffer,fragment.bytes.byteOffset).getUint32(i*4,true));
  // LDR x9,[x28,#96/#104]; STR x9,[x28,#32/#40].
  for(const word of [0xf9403389,0xf9403789,0xf9001389,0xf9001789])assert.ok(words.includes(word),word.toString(16));
 }
 assert.ok(linkDarwin(program,arch).length>0);
}));
