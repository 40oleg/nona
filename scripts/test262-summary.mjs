#!/usr/bin/env node
// Summarize Test262 audit reports written by scripts/test262-audit.{ps1,sh}.
//
//   node scripts/test262-summary.mjs <resultsDir> [--compare <baseDir>] [--others <file>]
//
// Every t262-*.json report in <resultsDir> is read; reports in rN/
// subdirectories (reruns of single directories) override earlier results per
// file. Failures are classified per file:
//   eval  - the documented eval/dynamic Function exception (the test calls
//           eval, $262.evalScript, or uses wellKnownIntrinsicObjects, which
//           builds functions from strings);
//   post  - post-ES2020 semantics under an untagged or older feature
//           (features listed by test262-smoke.mjs as post-es2020, the v flag,
//           top-level await, numeric separators, Promise.any);
//   other - everything else, listed with --others.
// With --compare, files that changed between the two result sets are listed.
import {readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const compareDir = option('--compare'), othersFile = option('--others');
const resultsDir = args[0];
if (!resultsDir) { console.error('usage: test262-summary.mjs <resultsDir> [--compare <baseDir>] [--others <file>]'); process.exit(2); }

const smoke = readFileSync(join(root, 'scripts/test262-smoke.mjs'), 'utf8');
const post = new Function(`return ${smoke.match(/const postEs2020Features = (\[[\s\S]*?\]);/)[1]}`)();
const testRoot = resolve(process.env.TEST262_ROOT || join(root, 'work/test262'), 'test');

function load(dir) {
  const results = new Map(), add = file => {
    const report = JSON.parse(readFileSync(file, 'utf8'));
    for (const entry of report.results || report) results.set(entry.path, entry);
  };
  const reports = name => readdirSync(name).filter(f => /^t262-.*\.json$/.test(f)).map(f => join(name, f));
  for (const file of reports(dir)) add(file);
  for (const sub of readdirSync(dir).filter(d => /^r\d+$/.test(d)).sort((a, b) => +a.slice(1) - +b.slice(1))) for (const file of reports(join(dir, sub))) add(file);
  return results;
}
function catalog(path) {
  if (path.startsWith('language/')) return 'language';
  if (path.startsWith('annexB/')) return 'annexB';
  if (path.startsWith('built-ins/Atomics/')) return 'Atomics';
  return 'built-ins';
}
function classify(path) {
  const file = join(testRoot, path);
  if (!existsSync(file)) return 'other';
  const source = readFileSync(file, 'utf8'), body = source.slice(source.indexOf('---*/'));
  const features = (source.match(/features:\s*\[([^\]]*)\]/)?.[1] || '').split(',').map(s => s.trim());
  if (features.some(f => post.includes(f)) || /\/top-level-await\/|separators|Promise\/any\//.test(path) || /\/[dgimsuy]*v[dgimsuy]*[;,)\s]/.test(body)) return 'post';
  if (/\beval(Script)?\b|wellKnownIntrinsicObjects/.test(body)) return 'eval';
  return 'other';
}

const results = load(resultsDir), totals = {}, others = [];
for (const [path, entry] of results) {
  const t = totals[catalog(path)] ??= {pass: 0, fail: 0, skip: 0, eval: 0, post: 0, other: 0};
  t[entry.outcome]++;
  if (entry.outcome !== 'fail') continue;
  const kind = classify(path); t[kind]++;
  if (kind === 'other') others.push(path);
}
for (const [name, t] of Object.entries(totals).sort())
  console.log(`${name.padEnd(10)} ${t.pass}/${t.pass + t.fail} (skip ${t.skip}); fail: eval ${t.eval}, post ${t.post}, other ${t.other}`);
if (othersFile) writeFileSync(othersFile, others.sort().join('\n') + '\n');

if (compareDir) {
  const base = load(compareDir), fixed = [], broke = [];
  for (const [path, entry] of results) {
    const before = base.get(path);
    if (!before) continue;
    if (before.outcome === 'fail' && entry.outcome === 'pass') fixed.push(path);
    if (before.outcome === 'pass' && entry.outcome === 'fail') broke.push(`${path}  ${String(entry.error || entry.stderr || entry.stdout || '').replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  console.log(`compared with ${compareDir}: ${fixed.length} fixed, ${broke.length} newly failing`);
  for (const line of broke.sort()) console.log('  FAIL ' + line);
  for (const line of fixed.sort()) console.log('  PASS ' + line);
}
