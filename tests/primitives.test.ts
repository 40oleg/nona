import test from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runNative} from './helpers/native.js';
for(const [source,expected] of [
 ['console.log("2"+3, "2"-1, null==undefined, NaN===NaN);','23 1 true false\n'],
 ['console.log("10" < "2", "" || "ok", typeof missing);','true ok undefined\n'],
 ['var x=1;x="строка";x=false;console.log(x);','false\n'],
 ['console.log(!NaN,!0,!(-0),!null,!undefined,!"",!"0",NaN<=1,NaN>=1);','true true true true true true false false false\n'],
 ['console.log(null==0, undefined==0, false=="", false===0, "a" < "b", "a"<= "a");','false false true false true true\n'],
 ['console.log(typeof undefined, typeof null, typeof false, typeof 2, typeof "s");','undefined object boolean number string\n'],
 ['console.log(console.log());','\nundefined\n'],
] as const)test('native primitives: '+source,()=>{const result=compile(source,{fileName:'test.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;const run=runNative(result.image);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),expected);});
