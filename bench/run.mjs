// Runs the micro-benchmarks in this directory on Nona and, when installed, on
// Node.js, Deno and Bun. Prints one JSON line per run; see PERFORMANCE.md.
//
//   node bench/run.mjs [--scale 0.1] [--runs 3] [--timeout 600] [--only 05,06] [--runtimes node,nona]
//
// Every script reads SCALE from the environment: the problem size is
// SCALE × the size named in the script (1M elements, 10M calls, ...). The
// scripts print their own per-phase timings as JSON; run.mjs adds wall time
// and peak RSS (Linux only, read from /usr/bin/time when present).

import {spawnSync} from 'node:child_process';
import {readdirSync, existsSync} from 'node:fs';
import {resolve, dirname, basename, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {const i = args.indexOf('--' + name); return i < 0 ? def : args[i + 1];};
const scale = Number(opt('scale', '1'));
const runs = Number(opt('runs', '3'));
const timeout = Number(opt('timeout', '600')) * 1000;
const only = opt('only', '').split(',').filter(Boolean);
const runtimes = opt('runtimes', 'node,deno,bun,nona').split(',');
const target = process.platform === 'win32' ? 'win32-x64' : 'linux-x64';
const exe = process.platform === 'win32' ? '.exe' : '';

const scripts = readdirSync(here).filter(f => /^\d\d_.*\.(m?js)$/.test(f) && !f.startsWith('01_'))
  .filter(f => only.length === 0 || only.some(p => f.startsWith(p)));

function has(cmd) {return spawnSync(cmd, ['--version'], {stdio: 'ignore'}).status === 0;}
const available = {node: true, deno: has('deno'), bun: has('bun'), nona: true};

function build(script) {
  const out = resolve(here, 'build', basename(script, extname(script)) + exe);
  const r = spawnSync('node', [resolve(here, '..', 'dist', 'cli.js'), 'build', resolve(here, script), '-o', out, '--target', target], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`nona build failed for ${script}: ${r.stderr}`);
  return out;
}

function measure(cmd, cmdArgs) {
  const t0 = performance.now();
  const r = spawnSync(cmd, cmdArgs, {encoding: 'utf8', timeout, env: {...process.env, SCALE: String(scale)}});
  const wall = (performance.now() - t0) / 1000;
  const out = (r.stdout || '').trim().split('\n').pop() || '';
  let metrics = null;
  try {metrics = JSON.parse(out);} catch {}
  return {rc: r.status, timedOut: r.signal === 'SIGTERM' && wall * 1000 >= timeout, wall: +wall.toFixed(3), metrics, stderr: (r.stderr || '').trim().slice(-200)};
}

for (const script of scripts) {
  const path = resolve(here, script);
  let bin = null;
  for (const rt of runtimes) {
    if (!available[rt]) continue;
    for (let i = 0; i < runs; i++) {
      let m;
      if (rt === 'nona') {bin ??= build(script); m = measure(bin, []);}
      else if (rt === 'node') m = measure('node', [path]);
      else if (rt === 'deno') m = measure('deno', ['run', '-A', path]);
      else if (rt === 'bun') m = measure('bun', [path]);
      console.log(JSON.stringify({rt, scale, script, ...m}));
      if (m.timedOut) break;
    }
  }
}
