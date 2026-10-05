import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GeneratorStack} from '../src/runtime/generator-stack.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
test('Linux ARM64 guards cover the largest supported kernel page without changing x64',()=>{
 assert.equal(withNativeTarget('linux-arm64',()=>GeneratorStack.guard),65536);
 assert.equal(withNativeTarget('linux-x64',()=>GeneratorStack.guard),4096);
 assert.equal(withNativeTarget('darwin-arm64',()=>GeneratorStack.guard),16384);
});
