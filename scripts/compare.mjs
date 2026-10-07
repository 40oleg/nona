// Compares Node.js output with natively compiled output for examples/compat.
//   node scripts/compare.mjs            -> win32-x64 executables (Windows x64 only)
//   node scripts/compare.mjs --linux    -> linux ELF (Linux x64/ARM64, or Windows x64 via WSL)
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compile} from '../dist/src/compiler.js';

const linux = process.argv.includes('--linux');
const unknown = process.argv.slice(2).filter(arg => arg !== '--linux');
if (unknown.length) throw new Error('Unknown arguments: ' + unknown.join(' '));

if (linux) {
  const supported = ['x64', 'arm64'].includes(process.arch)
    && ['win32', 'linux'].includes(process.platform)
    && !(process.platform === 'win32' && process.arch !== 'x64');
  if (!supported) throw new Error('Linux native comparisons require Linux x64/ARM64 or Windows x64 with WSL');
} else if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Native comparisons require Windows x64');
}

const root = fileURLToPath(new URL('../', import.meta.url));
const inputs = join(root, 'examples', 'compat');
const outputs = join(root, 'build', linux ? 'linux-compat' : 'compat');
const work = join(root, 'work');
const reportName = linux ? 'linux-compat-report.json' : 'compat-report.json';
const extension = linux ? '.elf' : '.exe';
const target = !linux ? 'win32-x64' : process.platform === 'linux' && process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
mkdirSync(outputs, {recursive: true});
mkdirSync(work, {recursive: true});
const options = {timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true};

function runNative(executable) {
  if (!linux) return spawnSync(executable, [], {...options, shell: false});
  if (process.platform === 'linux') {
    chmodSync(executable, 0o755);
    return spawnSync(executable, [], options);
  }
  const translated = spawnSync('wsl.exe', ['--exec', 'wslpath', '-a', executable], {...options, encoding: 'utf8'});
  if (translated.status !== 0) throw new Error('WSL path conversion failed: ' + translated.stderr);
  return spawnSync('wsl.exe', ['--exec', '/bin/sh', '-c',
    'target=$(mktemp /tmp/nona-compat-XXXXXX); trap \'rm -f "$target"\' EXIT; cp "$1" "$target"; chmod 700 "$target"; "$target"',
    'sh', translated.stdout.trim()], options);
}

const results = [];
for (const file of readdirSync(inputs).filter(name => /\.c?js$/.test(name)).sort()) {
  const path = join(inputs, file);
  const source = readFileSync(path, 'utf8');
  const compiled = compile(source, {fileName: file, target});
  if (!compiled.ok) {
    results.push({file, match: false, diagnostics: compiled.diagnostics});
    console.log('FAIL ' + file);
    continue;
  }
  const executable = join(outputs, file.replace(/\.c?js$/, '') + extension);
  writeFileSync(executable, compiled.image, linux ? {mode: 0o755} : undefined);
  const node = spawnSync(process.execPath, [path], {...options, shell: false});
  const native = runNative(executable);
  const stdoutMatch = !!node.stdout && !!native.stdout && node.stdout.equals(native.stdout);
  const stderrMatch = !!node.stderr && !!native.stderr && node.stderr.equals(native.stderr);
  const match = !node.error && !native.error && node.status === 0 && native.status === 0 && stdoutMatch && stderrMatch;
  const result = {file, match, sourceSha256: createHash('sha256').update(source).digest('hex'),
    stdoutMatch, stderrMatch, nodeStatus: node.status, nativeStatus: native.status,
    nodeError: node.error?.message, nativeError: native.error?.message,
    nodeStdout: node.stdout?.toString('utf8'), nativeStdout: native.stdout?.toString('utf8'),
    nodeStderr: node.stderr?.toString('utf8'), nativeStderr: native.stderr?.toString('utf8')};
  results.push(result);
  console.log(`${match ? 'PASS' : 'FAIL'} ${file}`);
  if (!match && linux) console.error(JSON.stringify(result));
}
const report = {date: new Date().toISOString(), node: process.version, v8: process.versions.v8, results};
writeFileSync(join(work, reportName), JSON.stringify(report, null, 2) + '\n');
if (results.length === 0 || results.some(result => !result.match)) process.exitCode = 1;
