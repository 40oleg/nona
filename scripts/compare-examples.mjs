import {spawnSync} from 'node:child_process';
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compile} from '../dist/src/compiler.js';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Native comparisons require Windows x64');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const inputs = join(root, 'examples', 'compat');
const outputs = join(root, 'build', 'compat');
const work = join(root, 'work');
mkdirSync(outputs, {recursive: true});
mkdirSync(work, {recursive: true});
const results = [];
for (const file of readdirSync(inputs).filter(file => /\.c?js$/.test(file)).sort()) {
  const path = join(inputs, file);
  const source = readFileSync(path, 'utf8');
  const compiled = compile(source, {fileName: file, target: 'win32-x64'});
  if (!compiled.ok) {
    results.push({file, match: false, diagnostics: compiled.diagnostics});
    continue;
  }
  const exe = join(outputs, file.replace(/\.c?js$/, '') + '.exe');
  writeFileSync(exe, compiled.image);
  const options = {timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false};
  const node = spawnSync(process.execPath, [path], options);
  const native = spawnSync(exe, [], options);
  const stdoutMatch = !!node.stdout && !!native.stdout && node.stdout.equals(native.stdout);
  const stderrMatch = !!node.stderr && !!native.stderr && node.stderr.equals(native.stderr);
  const match = !node.error && !native.error && node.status === 0 && native.status === 0 && stdoutMatch && stderrMatch;
  results.push({file, match, sourceSha256: createHash('sha256').update(source).digest('hex'),
    stdoutMatch, stderrMatch, nodeStatus: node.status, nativeStatus: native.status,
    nodeError: node.error?.message, nativeError: native.error?.message,
    nodeStdout: node.stdout?.toString('utf8'), nativeStdout: native.stdout?.toString('utf8'),
    nodeStderr: node.stderr?.toString('utf8'), nativeStderr: native.stderr?.toString('utf8')});
  console.log(`${match ? 'PASS' : 'FAIL'} ${file}`);
}
const report = {date: new Date().toISOString(), node: process.version, v8: process.versions.v8, results};
writeFileSync(join(work, 'compat-report.json'), JSON.stringify(report, null, 2) + '\n');
if (results.length === 0 || results.some(result => !result.match)) process.exitCode = 1;
