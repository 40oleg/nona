import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile} from '../dist/src/compiler.js';

const file = 'examples/compat/matrix-calculator.cjs';
const source = readFileSync(file, 'utf8');
mkdirSync('build', {recursive: true});
const checks = `
function check(value, label) {
  if (!value) throw new Error(label);
}
function equalMatrix(actual, expected) {
  check(actual.length === expected.length, "row count");
  for (let i = 0; i < expected.length; i++) {
    check(actual[i].length === expected[i].length, "column count");
    for (let j = 0; j < expected[i].length; j++) {
      check(abs(actual[i][j] - expected[i][j]) < 0.000000001, "matrix entry");
    }
  }
}
equalMatrix(add(A, B, 1), [[5, 5], [6, 7]]);
equalMatrix(add(A, B, -1), [[-1, -3], [-4, -5]]);
equalMatrix(multiply(A, B), [[11, 14], [8, 10]]);
equalMatrix(transpose([[1, 2, 3], [4, 5, 6]]), [[1, 4], [2, 5], [3, 6]]);
equalMatrix(multiply([[1, 2, 3]], [[4], [5], [6]]), [[32]]);
const swapped = eliminate([[0, 2], [1, 3]]);
check(swapped.determinant === -2, "pivot swap determinant");
equalMatrix(swapped.inverse, [[-1.5, 1], [0.5, 0]]);
const singular = eliminate([[1, 2], [2, 4]]);
check(singular.determinant === 0 && singular.inverse === null, "singular");
check(eliminate([[0]]).inverse === null, "zero");
equalMatrix(eliminate([[4]]).inverse, [[0.25]]);
const three = [[1, 2, 3], [0, 1, 4], [5, 6, 0]];
const threeResult = eliminate(three);
check(abs(threeResult.determinant - 1) < 0.000000001, "3x3 determinant");
equalMatrix(multiply(three, threeResult.inverse), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
equalMatrix(three, [[1, 2, 3], [0, 1, 4], [5, 6, 0]]);
let rejected = 0;
try { dimensions([]); } catch (error) { rejected++; }
try { dimensions([[1], [2, 3]]); } catch (error) { rejected++; }
try { dimensions([[NaN]]); } catch (error) { rejected++; }
try { dimensions([[Infinity]]); } catch (error) { rejected++; }
try { dimensions([["1"]]); } catch (error) { rejected++; }
try { add([[1]], [[1, 2]], 1); } catch (error) { rejected++; }
try { multiply([[1, 2]], [[1, 2]]); } catch (error) { rejected++; }
try { eliminate([[1, 2]]); } catch (error) { rejected++; }
check(rejected === 8, "invalid inputs");
console.log("Matrix checks passed");
`;

for (const [name, program] of [['matrix-calculator', source], ['matrix-calculator-checks', source + checks]]) {
  const compiled = compile(program, {fileName: file, target: 'win32-x64'});
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const executable = resolve('build', name + '.exe');
  writeFileSync(executable, compiled.image);
  const options = {timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true};
  const node = spawnSync(process.execPath, ['-e', program], options);
  const native = spawnSync(executable, [], options);
  for (const result of [node, native]) {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr?.toString());
  }
  assert.deepEqual(native.stdout, node.stdout);
  assert.deepEqual(native.stderr, node.stderr);
  console.log(name + ': native EXE matches Node.js');
  if (name === 'matrix-calculator') process.stdout.write(native.stdout);
}
