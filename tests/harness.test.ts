import assert from 'node:assert/strict';
import test from 'node:test';

import { position } from '../src/source.js';
import { runNative } from './helpers/native.js';

test('position treats CRLF as one line break', () => {
  assert.deepEqual(position('a\r\nb', 3), { line: 2, column: 1 });
});

test('position counts UTF-16 code units', () => {
  assert.deepEqual(position('\ud83d\ude00x', 2), { line: 1, column: 3 });
});

test('position counts ES5 Unicode line separators', () => {
  assert.deepEqual(position('a\u2028b\u2029c',4), {line:3,column:1});
});

test('runNative reports a malformed executable as a failure', () => {
  const result = runNative(new Uint8Array([0x4d, 0x5a]), 1_000);

  assert.ok(result.error || result.status !== 0);
});
