import test from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runNative} from './helpers/native.js';
for(const [source,expected] of [
 ['function s(){return "a"+"b";}console.log(s()+s());','abab\n'],
 ['console.log("a\\0"+"b", "a\\0b" < "a\\0c", "a\\0b" === "a\\0c");','a\0b true false\n'],
 ['var s="";for(var i=0;i<50;i++)s+="界";console.log(s);','界'.repeat(50)+'\n'],
 ['console.log("\\ud800", "\\udc00", "😀");','� � 😀\n'],
] as const)test('native strings: '+source,()=>{const result=compile(source,{fileName:'test.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;const run=runNative(result.image);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),expected);});
