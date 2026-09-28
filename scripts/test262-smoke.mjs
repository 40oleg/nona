import {spawnSync} from 'node:child_process';
import {readFileSync, mkdirSync, writeFileSync, readdirSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {compile} from '../dist/src/compiler.js';

const PIN = '7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd';
const root = resolve(process.env.TEST262_ROOT || 'work/test262');
const manifest = JSON.parse(readFileSync(new URL('../tests/test262-smoke.json', import.meta.url), 'utf8'));
const group = process.argv[2];
const pathFilter = process.env.TEST262_PATH_FILTER || '';
const excludePathFilter = process.env.TEST262_EXCLUDE_PATH_FILTER || '';
const directOnly = process.env.TEST262_DIRECT_ONLY === '1';
const runtimeTimeout = Number(process.env.TEST262_RUNTIME_TIMEOUT_MS || 30000);
const jobs = Number(process.env.TEST262_JOBS || 1);
if (!Number.isSafeInteger(runtimeTimeout) || runtimeTimeout < 1 || runtimeTimeout > 600000) {
  throw new Error('TEST262_RUNTIME_TIMEOUT_MS must be an integer from 1 to 600000');
}
if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 8) {
  throw new Error('TEST262_JOBS must be an integer from 1 to 8');
}
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
const harness = 'var print = function(){}; var $262={detachArrayBuffer:ArrayBuffer.__nonaDetachInternal}; delete ArrayBuffer.__nonaDetachInternal;\n' + ['sta.js', 'assert.js'].map(file => readFileSync(join(root, 'harness', file), 'utf8')).join('\n');
function filesUnder(directory, prefix) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(join(directory, entry.name), path)
      : entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}
function runCase(path) {
  // Windows Git may rewrite checkout line endings. Tests of source text must
  // use the pinned blob so their intended CR, LF, and CRLF bytes survive.
  const blob = path.includes('line-terminator-normalisation-')
    ? spawnSync('git', ['-C', root, 'show', `HEAD:test/${path}`], {encoding: 'utf8'}) : null;
  if (blob && blob.status !== 0) throw new Error(blob.stderr || `Cannot read Test262 blob ${path}`);
  const source = blob ? blob.stdout : readFileSync(join(root, 'test', path), 'utf8');
  const metadata = source.match(/\/\*---([\s\S]*?)---\*\//)?.[1] || '';
  const flags = metadata.match(/^flags:\s*\[([^\]]*)\]/m)?.[1].split(',').map(x => x.trim()) || [];
  const includes = metadata.match(/^includes:\s*\[([^\]]*)\]/m)?.[1].split(',').map(x => x.trim()) || [];
  const negativePhase = metadata.match(/^negative:\s*\r?\n\s*phase:\s*(\w+)/m)?.[1];
  if (negativePhase === 'parse') {
    const parsed = compile(`${flags.includes('onlyStrict') ? '"use strict";\n' : ''}${source}`,
      {fileName: path, target: 'win32-x64'});
    return {path, outcome: parsed.ok ? 'fail' : 'pass', phase: 'parse',
      reason: parsed.ok ? 'Expected compiler diagnostic' : undefined,
      diagnostics: parsed.ok ? undefined : parsed.diagnostics};
  }
  if (flags.includes('module') || flags.includes('async') || flags.includes('raw') || negativePhase) {
    return {path, outcome: 'skip', reason: 'Unsupported harness mode in smoke runner'};
  }
  const prelude = harness + '\n' + includes.map(file => readFileSync(join(root, 'harness', file), 'utf8')).join('\n');
  const program = `${flags.includes('onlyStrict') ? '"use strict";\n' : ''}${prelude}\n${source}`;
  const compiled = compile(program, {fileName: path, target: 'win32-x64'});
  if (!compiled.ok) {
    return {path, outcome: 'fail', phase: 'compile', diagnostics: compiled.diagnostics};
  }
  const exe = resolve('work/test262-smoke', path.replaceAll('/', '_') + '.exe');
  mkdirSync(dirname(exe), {recursive: true});
  writeFileSync(exe, compiled.image);
  const run = spawnSync(exe, [], {encoding: 'utf8', timeout: runtimeTimeout, windowsHide: true, maxBuffer: 1024 * 1024});
  return {path, outcome: !run.error && run.status === 0 ? 'pass' : 'fail', phase: 'runtime',
    status: run.status, error: run.error?.message, stderr: run.stderr?.slice(0, 2000)};
}
if (!isMainThread) {
  for (const path of workerData.paths) parentPort.postMessage(runCase(path));
} else {
  const paths = (group ? filesUnder(join(root, 'test', group), group).sort() : manifest.tests)
    .filter(path => path.includes(pathFilter) && (!excludePathFilter || !path.includes(excludePathFilter))
      && (!directOnly || !group || !path.slice(group.length + 1).includes('/')));
  let results;
  if (jobs === 1 || paths.length < 2) results = paths.map(runCase);
  else {
    const received = new Map();
    const activeJobs = Math.min(jobs, paths.length);
    const batches = Array.from({length: activeJobs}, () => []);
    paths.forEach((path,index) => batches[index % activeJobs].push(path));
    await Promise.all(batches.map(batch => new Promise((resolveWorker,rejectWorker) => {
      const worker = new Worker(new URL(import.meta.url), {workerData: {paths: batch}});
      worker.on('message', result => received.set(result.path, result));
      worker.on('error', rejectWorker);
      worker.on('exit', code => code === 0 ? resolveWorker() : rejectWorker(new Error(`Test262 worker exited with ${code}`)));
    })));
    results = paths.map(path => received.get(path));
    if (results.some(result => result === undefined)) {
      throw new Error('Test262 worker did not return every test result');
    }
  }
  const counts = Object.fromEntries(['pass', 'fail', 'skip'].map(k => [k, results.filter(r => r.outcome === k).length]));
  const report = {date: new Date().toISOString(), revision: PIN, target: 'win32-x64', group: group || 'smoke-manifest', pathFilter, excludePathFilter, directOnly, runtimeTimeout, jobs, counts, results};
  mkdirSync(dirname(reportPath), {recursive: true});
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Test262 smoke: ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip`);
  for (const result of results) console.log(`${result.outcome.toUpperCase()} ${result.path}${result.phase ? ` (${result.phase})` : ''}`);
  if (counts.fail) process.exitCode = 1;
}
