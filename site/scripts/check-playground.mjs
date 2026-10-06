// Runs the bundled playground worker in Node.js and checks that it produces
// the same executables as the compiler in ../dist. Run after build:playground.
// File names are absolute because the browser resolves them against '/'.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const {compile} = await import(pathToFileURL(join(site, '..', 'dist', 'src', 'compiler.js')).href);
const messages = [];
globalThis.self = {postMessage: message => messages.push(message)};
await import(pathToFileURL(join(site, 'src', 'public', 'playground-worker.js')).href);
if (!messages.shift()?.ready) throw new Error('The worker did not report ready');

const cases = [
  ...['win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'freebsd-x64', 'openbsd-x64']
    .map(target => ({file: 'hello.js', options: {fileName: '/app.js', target}})),
  {file: 'playground-async.mjs', options: {fileName: '/app.mjs', target: 'linux-x64', module: true}},
  ...['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64', 'freebsd-x64', 'openbsd-x64', 'win32-arm64', 'linux-arm64'].map(target => ({file: 'path.mjs', options: {fileName: '/app.mjs', target, module: true}})),
  {file: 'playground-messagebox.win32.mjs', options: {fileName: '/app.mjs', target: 'win32-x64', module: true, subsystem: 'windows'}},
];
let failed = false;
for (const [id, {file, options}] of cases.entries()) {
  const source = readFileSync(join(site, 'samples', file), 'utf8');
  self.onmessage({data: {id, source, options}});
  const reply = messages.shift();
  const expected = compile(source, options);
  const same = reply?.ok && expected.ok && Buffer.compare(Buffer.from(reply.image), Buffer.from(expected.image)) === 0;
  console.log(`${same ? 'ok  ' : 'FAIL'} ${file} → ${options.target}${reply?.ms ? ` (${Math.round(reply.ms)} ms)` : ''}`);
  if (!same) { failed = true; console.error(reply?.error ?? reply?.diagnostics ?? 'different output'); }
}
// A compile error comes back as diagnostics.
self.onmessage({data: {id: 'error', source: 'let x = ;', options: {fileName: '/app.js', target: 'linux-x64'}}});
const error = messages.shift();
if (error.ok || !error.diagnostics?.length) { failed = true; console.error('FAIL a syntax error did not produce diagnostics'); }
else console.log(`ok   syntax error → ${error.diagnostics[0].code}`);
process.exit(failed ? 1 : 0);
