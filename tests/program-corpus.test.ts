import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

const programs: [string, string][] = [
  ['001-insertion-sort.js', '-5,-1,0,2,2,3,8\n3,-1,2,2,0,8,-5\n'],
  ['002-binary-search.js', '0 1 4 -1 -1\n'],
  ['003-prime-sieve.js', '2,3,5,7,11,13,17,19,23,29,31,37,41,43,47\n15 328\n'],
  ['004-closure-accounts.js', '15 12 102 12\n0,1,4,9\n'],
  ['005-expression-parser.js', '11\n4\n-18\n'],
  ['006-tree-traversal.js', 'a,b,d,e,c,f\nd,e,b,f,c,a\n6\n'],
  ['007-shortest-path.js', 'A,B,D,F\n0 3 -1\n'],
  ['008-matrix-multiply.js', '58,64\n139,154\n415\n'],
  ['009-run-length-encoding.js', 'a:3|b:2|c:1|a:4\ntrue 10\n0 0\n'],
  ['010-exception-cleanup.js', '6 -1\nopen:3,close:3,open:-2,catch:negative,close:-2\n'],
];

for (const [file, expected] of programs) {
  test(`program corpus: ${file}`, () => {
    // The fixtures stay in the source tree; this test executes from dist/tests.
    const source = readFileSync(new URL(`../../programs/${file}`, import.meta.url), 'utf8');
    const oracle = runOracle(source);
    assert.equal(oracle.status, 0, 'Node.js must exit successfully');
    assert.equal(oracle.stdout, expected, 'Node.js must produce the independently specified result');

    for (const gcStress of [false, true]) {
      const native = runOnHost(source, {gcStress});
      const context = `${file}, gcStress=${gcStress}`;
      assert.ifError(native.error);
      assert.equal(native.status, oracle.status, `${context}: ${native.stderr}`);
      assert.equal(native.stdout.replace(/\r\n/g, '\n'), oracle.stdout, context);
      assert.equal(native.stderr, '', `${context}: unexpected diagnostics`);
    }
  });
}
