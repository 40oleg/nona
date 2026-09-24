import assert from 'node:assert/strict';
import { compile } from '../../src/compiler.js';
import { runNative } from './native.js';
export function expectProgram(source:string, expected:string):void {
  const result = compile(source, {fileName:'test.js',target:'win32-x64'});
  assert.equal(result.ok,true, JSON.stringify(result));
  if (!result.ok) return;
  const run=runNative(result.image);
  assert.equal(run.error,undefined);
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString('utf8'),expected);
}
