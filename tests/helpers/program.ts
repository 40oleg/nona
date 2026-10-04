import assert from 'node:assert/strict';
import { compile } from '../../src/compiler.js';
import { runNative } from './native.js';
import { linkPe } from '../../src/backend/pe/writer.js';
import { linkLinux } from '../../src/backend/linux/index.js';
import {requireHostTarget,getTarget,type Target} from '../../src/target.js';
import type { NativeProgram } from '../../src/backend/pe/model.js';
/** Select the host CPU as well as its operating system. */
export const hostTarget = requireHostTarget();
export function expectProgram(source:string, expected:string):void {
  const result = compile(source, {fileName:'test.js',target:hostTarget});
  assert.equal(result.ok,true, JSON.stringify(result));
  if (!result.ok) return;
  const run=runNative(result.image);
  assert.equal(run.error,undefined);
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString('utf8'),expected);
}
/** Link a program for the host target, so that runNative can run it here. */
export function linkHost(program:NativeProgram,target:Target=hostTarget):Uint8Array {
  return getTarget(target)!.os === 'linux' ? linkLinux(program,getTarget(target)!.arch) : linkPe(program);
}
