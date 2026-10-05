import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

for (const gcStress of [false, true]) {
 test(`script functions shadow optional runtime globals, gcStress=${gcStress}`, () => {
  const source = `
function escape(value) { return value + '!'; }
function unescape(value) { return value.slice(1); }
console.log(['a', 'b'].map(escape).join(''));
console.log(['xa', 'yb'].map(unescape).join(','));
console.log(globalThis.escape === escape, globalThis.unescape === unescape);
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'escape');
console.log(descriptor.writable, descriptor.enumerable, descriptor.configurable);
console.log('abc'.substr(1), '<'.bold());
`;
  const expected = runOracle(source);
  const native = runOnHost(source, {gcStress});
  assert.ifError(native.error);
  assert.equal(native.status, 0, native.stderr);
  assert.equal(native.stdout.replace(/\r\n/g, '\n'), expected.stdout);
  assert.equal(native.stderr, '');
 });
}
