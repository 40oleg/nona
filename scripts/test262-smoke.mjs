import {spawnSync} from 'node:child_process';
import {readFileSync, mkdirSync, writeFileSync, appendFileSync, readdirSync, chmodSync, rmSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {compile, fileModuleHost} from '../dist/src/compiler.js';
// Computed import() specifiers in Test262 name the test's own fixtures; the
// host declares those files as the modules such imports may load.
const moduleHost = {...fileModuleHost, candidates: referrer => {
  try {
    // Canonical module paths are '/'-rooted; on Windows they read '/C:/...'.
    if (/^\/[A-Za-z]:\//.test(referrer)) referrer = referrer.slice(1);
    const text = readFileSync(referrer, 'utf8');
    return readdirSync(dirname(referrer)).filter(name => name.endsWith('_FIXTURE.js') && text.includes(name)).map(name => './' + name);
  }
  catch { return []; }
}};
import {lex} from '../dist/src/frontend/lexer.js';
import {parse} from '../dist/src/frontend/parser.js';

const PIN = '7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd';
const root = resolve(process.env.TEST262_ROOT || 'work/test262');
const manifest = JSON.parse(readFileSync(new URL('../tests/test262-smoke.json', import.meta.url), 'utf8'));
const group = process.argv[2];
const pathFilter = process.env.TEST262_PATH_FILTER || '';
const excludePathFilter = process.env.TEST262_EXCLUDE_PATH_FILTER || '';
const excludePathFilters = [excludePathFilter,
  ...(process.env.TEST262_EXCLUDE_PATH_FILTERS || '').split(',')].map(value => value.trim()).filter(Boolean);
// Test262 feature tags introduced after ES2020; `post-es2020` in
// TEST262_EXCLUDE_FEATURES expands to this list for gate audits.
const postEs2020Features = ['AggregateError','Array.fromAsync','Array.prototype.at','array-find-from-last','array-grouping','arbitrary-module-namespace-names',
  'arraybuffer-transfer','Atomics.pause','Atomics.waitAsync','change-array-by-copy','class-fields-private','class-fields-private-in','class-fields-public',
  'class-methods-private','class-static-block','class-static-fields-private','class-static-fields-public','class-static-methods-private','decorators',
  'Error.isError','error-cause','explicit-resource-management','Float16Array','FinalizationRegistry','hashbang','immutable-arraybuffer','import-assertions',
  'import-attributes','import-defer','import-bytes','import-text','iterator-helpers','iterator-sequencing','joint-iteration','json-modules','json-parse-with-source',
  'legacy-regexp','logical-assignment-operators','Math.sumPrecise','nonextensible-applies-to-private','numeric-separator-literal','Object.hasOwn',
  'promise-try','promise-with-resolvers','Promise.any','Promise.allKeyed','RegExp.escape','regexp-duplicate-named-groups','regexp-match-indices',
  'regexp-modifiers','regexp-v-flag','resizable-arraybuffer','set-methods','ShadowRealm','source-phase-imports','String.prototype.at',
  'String.prototype.isWellFormed','String.prototype.replaceAll','String.prototype.toWellFormed','symbols-as-weakmap-keys','Temporal',
  'top-level-await','TypedArray.prototype.at','uint8array-base64','upsert','WeakRef','well-formed-unicode-strings','await-dictionary','Intl.Locale-info',
  'canonical-tz','Intl.DurationFormat','Intl.Era-monthcode','error-stack-accessor',
  // Non-standard extension: own caller/arguments on sloppy functions (ES2020 16.2 leaves it optional).
  'caller',
  // Host-defined [[IsHTMLDDA]] objects (Annex B.3.7) are optional; Nona's host has none.
  'IsHTMLDDA'];
const excludeFeatures = (process.env.TEST262_EXCLUDE_FEATURES || '').split(',').map(value => value.trim()).filter(Boolean)
  .flatMap(value => value === 'post-es2020' ? postEs2020Features : [value]);
const directOnly = process.env.TEST262_DIRECT_ONLY === '1';
const runAsync = process.env.TEST262_RUN_ASYNC === '1';
const deleteBinaries = process.env.TEST262_DELETE_BINARIES === '1';
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
const progressPath = process.env.TEST262_PROGRESS_LOG ? resolve(process.env.TEST262_PROGRESS_LOG) : '';
const revision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'});
if (revision.error || revision.status !== 0 || revision.stdout.trim() !== PIN) {
  throw new Error(`Test262 checkout must be pinned at ${PIN}; found ${revision.stdout?.trim() || revision.stderr}`);
}
if ((process.platform !== 'win32' && process.platform !== 'linux') || process.arch !== 'x64') {
  throw new Error('Native Test262 smoke run requires Windows x64 or Linux x64');
}
const target = process.platform === 'linux' ? 'linux-x64' : 'win32-x64';
// Realms are compiled in only for tests that create them (each adds a full runtime copy).
const realmHarness = '(function(){var create=typeof __nonaCreateRealm==="function"?__nonaCreateRealm:undefined;delete globalThis.__nonaCreateRealm;'
  + 'function wrap(g){var detach=g.ArrayBuffer.__nonaDetachInternal;delete g.ArrayBuffer.__nonaDetachInternal;'
  + 'return {global:g,detachArrayBuffer:detach,gc:function(){},createRealm:createRealm,evalScript:function(){throw new g.SyntaxError("evalScript requires dynamic code")}}}'
  + 'function createRealm(){if(!create)throw new Error("createRealm is unavailable");return wrap(create())}'
  + '$262.createRealm=createRealm;$262.global=globalThis;$262.gc=function(){}})();\n';
const harness = 'var print = function(){}; var $262={detachArrayBuffer:ArrayBuffer.__nonaDetachInternal}; delete ArrayBuffer.__nonaDetachInternal;\n' + realmHarness + ['sta.js', 'assert.js'].map(file => readFileSync(join(root, 'harness', file), 'utf8')).join('\n');
function filesUnder(directory, prefix) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(join(directory, entry.name), path)
      : entry.isFile() && entry.name.endsWith('.js') && !entry.name.includes('_FIXTURE') ? [path] : [];
  });
}
// $262.agent.start(source) arguments must be static strings: each is compiled
// into the image as a separate agent program (AOT has no runtime compilation).
function agentSources(source) {
  if (!source.includes('agent.start')) return [];
  let ast;
  try { ast = parse(lex(source)); } catch { return []; }
  const found = [], constants = new Map();
  // Top-level `const NAME = literal` values may appear in agent templates.
  for (const statement of ast.body) if (statement.kind === 'Var' && statement.declarationKind !== 'let')
    for (const declaration of statement.declarations)
      if (declaration.id.kind === 'Identifier' && declaration.init) constants.set(declaration.id.name, declaration.init);
  const timeouts = {yield: 100, small: 200, long: 1000, huge: 10000}; // harness/atomicsHelper.js
  // Counting loops (`for (var i = 0; i < N; i++)`) bind their variable to
  // each value in turn so per-agent templates such as `${i}` expand.
  const loopValues = new Map();
  const constant = node => {
    if (!node) return undefined;
    if (node.kind === 'Identifier' && loopValues.has(node.name)) return loopValues.get(node.name);
    if (node.kind === 'Identifier' && constants.has(node.name)) return constant(constants.get(node.name));
    if (node.kind === 'Member' && !node.computed && node.object?.kind === 'Member' && node.object.property?.value === 'timeouts'
      && Object.hasOwn(timeouts, node.property?.value)) return timeouts[node.property.value];
    if (node.kind === 'Literal' && typeof node.value === 'number') return node.value;
    if (node.kind === 'Template') {
      let text = node.quasis[0];
      for (let i = 0; i < node.expressions.length; i++) {
        const value = constant(node.expressions[i]);if (value === undefined || node.quasis[i + 1] === undefined) return undefined;
        text += String(value) + node.quasis[i + 1];
      }
      return text;
    }
    if (node.kind === 'Literal' && typeof node.value === 'string') return node.value;
    if (node.kind === 'Template' && node.expressions.length === 0) return node.quasis[0];
    if (node.kind === 'Binary' && ['+', '-', '*'].includes(node.operator)) {
      const left = constant(node.left), right = constant(node.right);
      return left === undefined || right === undefined ? undefined : node.operator === '+' ? left + right : node.operator === '-' ? left - right : left * right;
    }
    return undefined;
  };
  const visit = node => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'For' && node.init?.kind === 'Var' && node.init.declarations.length === 1 && node.init.declarations[0].id.kind === 'Identifier'
      && node.init.declarations[0].init?.kind === 'Literal' && typeof node.init.declarations[0].init.value === 'number'
      && node.test?.kind === 'Binary' && node.test.operator === '<' && node.test.left.kind === 'Identifier'
      && node.test.left.name === node.init.declarations[0].id.name && node.update?.kind === 'Update' && node.update.operator === '++') {
      const name = node.test.left.name, limit = Number(constant(node.test.right));
      if (Number.isInteger(limit) && limit <= 16) {
        const saved = loopValues.get(name);
        for (let value = node.init.declarations[0].init.value; value < limit; value++) { loopValues.set(name, value); visit(node.body); }
        if (saved === undefined) loopValues.delete(name); else loopValues.set(name, saved);
        return;
      }
    }
    if (node.kind === 'Var' && loopValues.size) for (const declaration of node.declarations) {
      const value = declaration.id.kind === 'Identifier' ? constant(declaration.init) : undefined;
      if (value !== undefined) loopValues.set(declaration.id.name, value);
    }
    if (node.kind === 'Call' && node.callee?.kind === 'Member' && node.callee.property?.value === 'start'
      && node.callee.object?.kind === 'Member' && node.callee.object.property?.value === 'agent') {
      const value = constant(node.arguments[0]);
      if (typeof value === 'string') found.push(value); // one program per started agent
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'span') visit(value);
  };
  visit(ast.body);
  return found;
}
function agentHarness(sources) {
  if (!sources.length) return '';
  return 'var __nonaAgentSources=' + JSON.stringify(sources) + ';$262.agent={start:function(source){var index=-1;for(var k=0;k<__nonaAgentSources.length;k++)'
    + 'if(__nonaAgentSources[k]===source){index=k;__nonaAgentSources[k]=null;break}'
    + 'if(index<0)throw new Error("agent source was not compiled");__nonaAgentStart(index)},broadcast:function(sab,id){__nonaAgentBroadcast(sab,id)},'
    + 'getReport:function(){return __nonaAgentGetReport()},sleep:function(ms){__nonaAgentSleep(ms)},monotonicNow:function(){return Date.now()}};\n';
}
function hasExcludedFeature(path) {
  if(!excludeFeatures.length)return false;
  const source=readFileSync(join(root,'test',path),'utf8');
  const metadata=source.match(/\/\*---([\s\S]*?)---\*\//)?.[1] || '';
  const features=metadata.match(/^features:\s*\[([^\]]*)\]/m)?.[1].split(',').map(value=>value.trim()) || [];
  return excludeFeatures.some(value=>features.includes(value));
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
  const moduleCase = flags.includes('module');
  if (negativePhase === 'parse' || moduleCase && negativePhase === 'resolution') {
    const parsed = moduleCase
      ? compile(source, {fileName: join(root, 'test', path), target, module: true, scriptPrelude: harness})
      : compile(`${flags.includes('onlyStrict') ? '"use strict";\n' : ''}${source}`, {fileName: path, target});
    return {path, outcome: parsed.ok ? 'fail' : 'pass', phase: 'parse',
      reason: parsed.ok ? 'Expected compiler diagnostic' : undefined,
      diagnostics: parsed.ok ? undefined : parsed.diagnostics};
  }
  const asyncCase=flags.includes('async');
  // Nona's main agent can block ([[CanBlock]] is true), so CanBlockIsFalse tests do not apply.
  if (flags.includes('CanBlockIsFalse')) return {path, outcome: 'skip', reason: 'Host agent can block'};
  if ((asyncCase && !runAsync) || flags.includes('raw') || negativePhase) {
    return {path, outcome: 'skip', reason: 'Unsupported harness mode in smoke runner'};
  }
  const baseHarness=asyncCase?harness.replace('var print = function(){};', 'var print = function(message){console.log(message)};'):harness;
  const agents = agentSources(source);
  const prelude = baseHarness + '\n' + agentHarness(agents) + (asyncCase?readFileSync(join(root,'harness','doneprintHandle.js'),'utf8'):'') + '\n'
    + includes.map(file => readFileSync(join(root, 'harness', file), 'utf8')).join('\n');
  const program = `${flags.includes('onlyStrict') ? '"use strict";\n' : ''}${prelude}\n${source}`;
  // Test262 leaves the host's unhandled-rejection policy unspecified. Several
  // Promise tests intentionally abandon a rejected result after checking the
  // synchronous semantics, so use the non-failing host policy for this harness.
  const realms = Math.min(4, (source.match(/createRealm/g) || []).length + includes.reduce((count, file) => count + (readFileSync(join(root, 'harness', file), 'utf8').match(/createRealm\(/g) || []).length, 0));
  const compiled = moduleCase
    ? compile(source, {fileName: join(root, 'test', path), target, module: true, scriptPrelude: prelude, unhandledRejections: 'ignore', realms, agents, moduleHost})
    : compile(program, {fileName: join(root, 'test', path), target, unhandledRejections: 'ignore', realms, agents, moduleHost});
  if (!compiled.ok) {
    return {path, outcome: 'fail', phase: 'compile', diagnostics: compiled.diagnostics};
  }
  const exe = resolve('work/test262-smoke', path.replaceAll('/', '_') + (target === 'win32-x64' ? '.exe' : ''));
  mkdirSync(dirname(exe), {recursive: true});
  writeFileSync(exe, compiled.image, {mode: 0o755});
  if (target !== 'win32-x64') chmodSync(exe, 0o755);
  // Linux worker threads can briefly leak another thread's write descriptor
  // into a forked child, making exec report ETXTBSY; retry that host race.
  let run;
  for (let attempt = 0; attempt < 20; attempt++) {
    run = spawnSync(exe, [], {encoding: 'utf8', timeout: runtimeTimeout, windowsHide: true, maxBuffer: 1024 * 1024});
    if (run.error?.code !== 'ETXTBSY') break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  if (deleteBinaries) rmSync(exe, {force: true});
  const completions=asyncCase?(run.stdout?.match(/Test262:AsyncTestComplete/g)?.length??0):0;
  const asyncSuccess=!asyncCase||(completions===1&&!run.stdout?.includes('Test262:AsyncTestFailure:'));
  return {path, outcome: !run.error && run.status === 0 && asyncSuccess ? 'pass' : 'fail', phase: 'runtime',
    status: run.status, error: run.error?.message, stderr: run.stderr?.slice(0, 2000),
    ...(asyncCase?{completions,stdout:run.stdout?.slice(0,2000)}:{})};
}
// A compiler crash is reported as that test's failure instead of aborting the run.
function safeRunCase(path) {
  try { return runCase(path); }
  catch (error) { return {path, outcome: 'fail', phase: 'compiler-crash', error: String(error?.stack || error).slice(0, 2000)}; }
}
if (!isMainThread) {
  for (const path of workerData.paths) parentPort.postMessage(safeRunCase(path));
} else {
  const paths = (group ? filesUnder(join(root, 'test', group), group).sort() : manifest.tests)
    .filter(path => path.includes(pathFilter) && !excludePathFilters.some(value => path.includes(value))
      && !hasExcludedFeature(path)
      && (!directOnly || !group || !path.slice(group.length + 1).includes('/')));
  if (progressPath) {
    mkdirSync(dirname(progressPath), {recursive: true});
    writeFileSync(progressPath, JSON.stringify({revision: PIN, group: group || 'smoke-manifest',
      pathFilter, excludePathFilters, excludeFeatures, directOnly, runAsync, runtimeTimeout, jobs, expected: paths.length}) + '\n');
  }
  const record = result => {
    if (progressPath) appendFileSync(progressPath, JSON.stringify(result) + '\n');
  };
  let results;
  if (jobs === 1 || paths.length < 2) results = paths.map(path => {
    const result = safeRunCase(path);
    record(result);
    return result;
  });
  else {
    const received = new Map();
    const activeJobs = Math.min(jobs, paths.length);
    const batches = Array.from({length: activeJobs}, () => []);
    paths.forEach((path,index) => batches[index % activeJobs].push(path));
    await Promise.all(batches.map(batch => new Promise((resolveWorker,rejectWorker) => {
      const worker = new Worker(new URL(import.meta.url), {workerData: {paths: batch}});
      worker.on('message', result => {received.set(result.path, result); record(result);});
      worker.on('error', rejectWorker);
      worker.on('exit', code => code === 0 ? resolveWorker() : rejectWorker(new Error(`Test262 worker exited with ${code}`)));
    })));
    results = paths.map(path => received.get(path));
    if (results.some(result => result === undefined)) {
      throw new Error('Test262 worker did not return every test result');
    }
  }
  const counts = Object.fromEntries(['pass', 'fail', 'skip'].map(k => [k, results.filter(r => r.outcome === k).length]));
  const report = {date: new Date().toISOString(), revision: PIN, target, group: group || 'smoke-manifest', pathFilter, excludePathFilters, excludeFeatures, directOnly, runAsync, runtimeTimeout, jobs, counts, results};
  mkdirSync(dirname(reportPath), {recursive: true});
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Test262 smoke: ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip`);
  for (const result of results) console.log(`${result.outcome.toUpperCase()} ${result.path}${result.phase ? ` (${result.phase})` : ''}`);
  if (counts.fail) process.exitCode = 1;
}
