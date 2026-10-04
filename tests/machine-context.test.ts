import {test} from 'node:test';
import assert from 'node:assert/strict';
const contextPath='../src/backend/machine/context.js';
const context=await import(contextPath).catch(()=>undefined);

test('native target scopes restore the outer target after nested emission and exceptions',()=>{
  assert.ok(context,'Native emission scopes must exist');
  const before=context.currentNativeTarget();
  context.withNativeTarget('freebsd-x64',()=>{
    assert.equal(context.currentNativeTarget(),'freebsd-x64');
    const a=context.createAssembler('one');a.mov('rax',42);assert.equal(a.finish().bytes[0],0x48);
    assert.throws(()=>context.withNativeTarget('linux-arm64',()=>{throw new Error('intentional scope failure')}),/intentional/);
    assert.equal(context.currentNativeTarget(),'freebsd-x64');
    context.withNativeTarget('darwin-x64',()=>assert.equal(context.currentNativeTarget(),'darwin-x64'));
    assert.equal(context.currentNativeTarget(),'freebsd-x64');
  });
  assert.equal(context.currentNativeTarget(),before);
  assert.throws(()=>context.withNativeTarget('unknown',()=>{}),/target/i);
  assert.equal(context.currentNativeTarget(),before);
});
