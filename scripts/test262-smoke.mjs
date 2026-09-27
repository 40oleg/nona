import {spawnSync} from 'node:child_process';
import {readFileSync, mkdirSync, writeFileSync, readdirSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {compile} from '../dist/src/compiler.js';

const PIN = '7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd';
const root = resolve(process.env.TEST262_ROOT || 'work/test262');
const manifest = JSON.parse(readFileSync(new URL('../tests/test262-smoke.json', import.meta.url), 'utf8'));
const group = process.argv[2];
const pathFilter = process.env.TEST262_PATH_FILTER || '';
if (group && (!/^[A-Za-z0-9_./-]+$/.test(group) || group.includes('..') || group.startsWith('/'))) {
  throw new Error('Group must be a relative Test262 test directory');
}
const reportPath = resolve(process.env.TEST262_REPORT || 'work/test262-smoke-report.json');
const revision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'});
if (revision.error || revision.status !== 0 || revision.stdout.trim() !== PIN) {
  throw new Error(`Test262 checkout must be pinned at ${PIN}; found ${revision.stdout?.trim() || revision.stderr}`);
}
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Native Test262 smoke run currently requires Windows x64');
}
const harness = 'var print = function(){};\n' + ['sta.js', 'assert.js'].map(file => readFileSync(join(root, 'harness', file), 'utf8')).join('\n');
const results = [];
function filesUnder(directory, prefix) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(join(directory, entry.name), path)
      : entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}
const paths = (group ? filesUnder(join(root, 'test', group), group).sort() : manifest.tests)
  .filter(path => path.includes(pathFilter));
for (const path of paths) {
  const source = readFileSync(join(root, 'test', path), 'utf8');
  const metadata = source.match(/\/\*---([\s\S]*?)---\*\//)?.[1] || '';
  const flags = metadata.match(/^flags:\s*\[([^\]]*)\]/m)?.[1].split(',').map(x => x.trim()) || [];
  const includes = metadata.match(/^includes:\s*\[([^\]]*)\]/m)?.[1].split(',').map(x => x.trim()) || [];
  const negativePhase = metadata.match(/^negative:\s*\r?\n\s*phase:\s*(\w+)/m)?.[1];
  if (negativePhase === 'parse') {
    const parsed = compile(`${flags.includes('onlyStrict') ? '"use strict";\n' : ''}${source}`,
      {fileName: path, target: 'win32-x64'});
    results.push({path, outcome: parsed.ok ? 'fail' : 'pass', phase: 'parse',
      reason: parsed.ok ? 'Expected compiler diagnostic' : undefined,
      diagnostics: parsed.ok ? undefined : parsed.diagnostics});
    continue;
  }
  if (flags.includes('module') || flags.includes('async') || flags.includes('raw') || negativePhase) {
    results.push({path, outcome: 'skip', reason: 'Unsupported harness mode in smoke runner'});
    continue;
  }
  const prelude = harness + '\n' + includes.map(file => readFileSync(join(root, 'harness', file), 'utf8')).join('\n');
  const program = `${flags.includes('onlyStrict') ? '"use strict";\n' : ''}${prelude}\n${source}`;
  const compiled = compile(program, {fileName: path, target: 'win32-x64'});
  if (!compiled.ok) {
    results.push({path, outcome: 'fail', phase: 'compile', diagnostics: compiled.diagnostics});
    continue;
  }
  const exe = resolve('work/test262-smoke', path.replaceAll('/', '_') + '.exe');
  mkdirSync(dirname(exe), {recursive: true});
  writeFileSync(exe, compiled.image);
  const run = spawnSync(exe, [], {encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024});
  results.push({path, outcome: !run.error && run.status === 0 ? 'pass' : 'fail', phase: 'runtime',
    status: run.status, error: run.error?.message, stderr: run.stderr?.slice(0, 2000)});
}
const counts = Object.fromEntries(['pass', 'fail', 'skip'].map(k => [k, results.filter(r => r.outcome === k).length]));
const report = {date: new Date().toISOString(), revision: PIN, target: 'win32-x64', group: group || 'smoke-manifest', pathFilter, counts, results};
mkdirSync(dirname(reportPath), {recursive: true});
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Test262 smoke: ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip`);
for (const result of results) console.log(`${result.outcome.toUpperCase()} ${result.path}${result.phase ? ` (${result.phase})` : ''}`);
if (counts.fail) process.exitCode = 1;
