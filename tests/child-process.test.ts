import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

// Each program runs as an ES module on the host target and under Node.js; the
// outputs must be identical. The children are Node.js itself (the test
// runner's executable), so both runs see the same child behaviour. Like the
// node:net tests, they run without GC stress: a forced collection before every
// block walks the whole compiled module graph and takes minutes.
// Platform layers exist for Windows and Linux.
const skip =
    process.platform !== "win32" &&
    process.platform !== "linux" &&
    "node:child_process has Windows and Linux platform layers only";
const posixSkip =
    process.platform !== "linux" && "the POSIX tools test runs on Linux";
const prelude = `const node = ${JSON.stringify(process.execPath)};\n`;

function expectNode(source: string): void {
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": prelude + source },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.ok(oracle.length > 0);
    assert.equal(native.stdout, oracle);
}

test(
    "child_process.spawn reports events in order, exit codes, stdout, stderr and stdin",
    { skip },
    () =>
        expectNode(String.raw`import { spawn, ChildProcess } from 'node:child_process';
const child = spawn(node, ['-e', 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{process.stdout.write("out:"+s.toUpperCase());process.stderr.write("err:"+s.length);process.exit(7)})'], { windowsHide: true });
console.log(child instanceof ChildProcess, typeof child.pid, child.exitCode, child.signalCode, child.killed, child.stdio.length, child.stdio[1] === child.stdout);
const events = [];
let out = '', err = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', d => out += d);
child.stderr.on('data', d => err += d);
child.stdout.on('end', () => events.push('stdout end'));
child.on('spawn', () => events.push('spawn'));
child.on('exit', (code, signal) => events.push('exit ' + code + ' ' + signal));
child.on('close', (code, signal) => {
  events.push('close ' + code + ' ' + signal);
  console.log(JSON.stringify(events.filter(e => e !== 'stdout end')), events.indexOf('stdout end') < events.length - 1);
  console.log(JSON.stringify(out), JSON.stringify(err), child.exitCode, child.signalCode, child.kill());
  const args = ['plain', 'with space', 'quote"inside', 'trailing\\', 'back\\\\"slash', '', 'tab\there'];
  const echo = spawn(node, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
  console.log(echo.stdin, echo.stderr);
  echo.stdout.on('data', d => console.log('argv', String(d).trim() === JSON.stringify(args)));
  echo.on('close', code => console.log('echo close', code));
});
child.stdin.write('hello ');
child.stdin.end('world');
`),
);

test(
    "child_process kills children and reports signals, cwd, env and ENOENT",
    { skip },
    () =>
        expectNode(String.raw`import { spawn, spawnSync, execFileSync } from 'node:child_process';
const child = spawn(node, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true });
child.on('spawn', () => setTimeout(() => console.log('kill', child.kill(), child.killed), 50));
child.on('exit', (code, signal) => console.log('exit', code, signal, child.exitCode, child.signalCode));
child.on('close', (code, signal) => {
  console.log('close', code, signal, child.kill());
  const parent = process.cwd();
  const where = spawnSync(node, ['-e', 'console.log(process.cwd());console.log(process.env.NONA_TEST_VALUE, typeof process.env.SystemRoot)'], { cwd: '..', env: { NONA_TEST_VALUE: 'value 1', PATH: process.env.PATH }, encoding: 'utf8', windowsHide: true });
  const lines = where.stdout.trim().split(/\r?\n/);
  console.log(where.status, lines[0] !== parent && parent.startsWith(lines[0]), lines[1]);
  const missing = spawn('nona-missing-command', ['a', 'b']);
  console.log(typeof missing.pid, missing.stdout !== null);
  missing.on('spawn', () => console.log('unexpected spawn'));
  missing.on('exit', () => console.log('unexpected exit'));
  missing.on('error', e => console.log('error', e.message, e.code, e.errno === (process.platform === 'win32' ? -4058 : -2), e.syscall, e.path, JSON.stringify(e.spawnargs)));
  missing.on('close', (code, signal) => {
    console.log('missing close', code === (process.platform === 'win32' ? -4058 : -2), signal);
    const sync = spawnSync('nona-missing-command', ['x']);
    console.log(JSON.stringify(Object.keys(sync)), sync.error.message, sync.error.code, sync.status, sync.output, sync.pid, sync.stdout);
    try { execFileSync('nona-missing-command'); } catch (e) { console.log('execFileSync', e.message, e.code, e.status, e.pid); }
  });
});
`),
);

test(
    "child_process exec and execFile buffer output and report failures",
    { skip },
    () =>
        expectNode(String.raw`import { exec, execFile, execSync, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
const options = { windowsHide: true };
execFile(node, ['-e', 'console.log("out");console.error("err")'], options, (error, stdout, stderr) => {
  console.log('execFile', error, JSON.stringify(stdout), JSON.stringify(stderr));
  execFile(node, ['-e', 'process.stderr.write("bad");process.exit(3)'], { ...options, encoding: 'buffer' }, (error, stdout, stderr) => {
    console.log('failed', error.message.split('\n')[1], error.code, error.killed, error.signal, error.cmd.endsWith('process.exit(3)'), Buffer.isBuffer(stdout), String(stderr));
    exec('echo hello&& exit 4', options, (error, stdout) => {
      console.log('exec', error.code, error.cmd, JSON.stringify(stdout.trim()));
      execFile(node, ['-e', 'process.stdout.write("x".repeat(3e6))'], options, (error, stdout) => {
        console.log('maxBuffer', error.code, error.message, stdout.length);
        execFile(node, ['-e', 'setInterval(()=>{},1000)'], { ...options, timeout: 100 }, (error) => {
          console.log('timeout', error.killed, error.signal, error.code);
          promisify(exec)('echo promised', options).then(({ stdout, stderr }) => {
            console.log('promisify', JSON.stringify(stdout.trim()), JSON.stringify(stderr));
            return promisify(execFile)(node, ['-e', 'process.exit(2)'], options);
          }).catch(error => {
            console.log('rejected', error.code, error.stdout, error.stderr);
            console.log('execSync', JSON.stringify(execSync('echo sync', { ...options, encoding: 'utf8' }).trim()));
            console.log('execFileSync', execFileSync(node, ['-e', 'process.stdout.write("buf")'], options).toString());
            try {
              execFileSync(node, ['-e', 'process.stderr.write("oops");process.exit(5)'], { ...options, stdio: 'pipe' });
            } catch (e) {
              console.log('throws', e.status, e.signal, String(e.stderr), e.message.endsWith('\noops'), JSON.stringify(Object.keys(e)));
            }
            const timed = spawnSync(node, ['-e', 'setInterval(()=>{},1000)'], { ...options, timeout: 100 });
            console.log('spawnSync timeout', timed.error.code, timed.error.message.startsWith('spawnSync '), timed.status, timed.signal);
            const shell = spawnSync('echo shell', { ...options, shell: true, encoding: 'utf8' });
            console.log('shell', shell.status, JSON.stringify(shell.stdout.trim()));
          });
        });
      });
    });
  });
});
`),
);

test(
    "child_process moves large outputs on both streams without deadlock",
    { skip },
    () =>
        expectNode(String.raw`import { spawn, spawnSync } from 'node:child_process';
const script = 'const b=Buffer.alloc(1<<20,97);for(let i=0;i<6;i++){process.stdout.write(b);process.stderr.write(b)}let n=0;process.stdin.on("data",d=>n+=d.length);process.stdin.on("end",()=>process.stdout.write("in:"+n))';
const input = Buffer.alloc(3 << 20, 98);
const sync = spawnSync(node, ['-e', script], { windowsHide: true, input, maxBuffer: 64 << 20 });
console.log('sync', sync.status, sync.stdout.length, sync.stderr.length, String(sync.stdout.subarray(-10)));
const small = spawnSync(node, ['-e', script], { windowsHide: true, input });
console.log('sync maxBuffer', small.error.code, small.signal);
const child = spawn(node, ['-e', script], { windowsHide: true });
let out = 0, err = 0, tail = '';
child.stdout.on('data', d => { out += d.length; tail = (tail + String(d)).slice(-10); });
child.stderr.on('data', d => err += d.length);
child.on('close', code => console.log('async', code, out, err, tail));
child.stdin.end(input);
`),
);

test("child_process and node:net share the event loop", { skip }, () =>
    expectNode(String.raw`import net from 'node:net';
import { spawn } from 'node:child_process';
// The two sides finish in either order; the lines are printed sorted.
const lines = [];
let pending = 2;
const done = () => { if (--pending === 0) console.log(lines.sort().join('\n')); };
const server = net.createServer(socket => {
  socket.setEncoding('utf8');
  let got = '';
  socket.on('data', d => got += d);
  socket.on('end', () => { lines.push('server got ' + got); socket.end(); server.close(done); });
});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const child = spawn(node, ['-e', 'const s=require("net").connect(' + port + ',"127.0.0.1",()=>{s.end("from child");});s.on("close",()=>console.log("child done"))'], { windowsHide: true });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', d => lines.push('child said ' + d.trim()));
  child.on('close', code => { lines.push('child close ' + code); done(); });
});
`),
);

test(
    "child_process runs POSIX tools: shell, exit codes, signals, cwd, env, stdin and large outputs",
    { skip: posixSkip },
    () =>
        expectNode(String.raw`import { spawn, spawnSync, exec, execSync, execFileSync } from 'node:child_process';
const env = { PATH: '/usr/bin:/bin', NONA_VALUE: 'a b' };
console.log(JSON.stringify(spawnSync('echo', ['one', 'two words'], { encoding: 'utf8', env }).stdout));
const failed = spawnSync('/bin/sh', ['-c', 'echo out; echo err >&2; exit 3'], { encoding: 'utf8' });
console.log(failed.status, failed.signal, JSON.stringify(failed.stdout), JSON.stringify(failed.stderr));
console.log(execSync('pwd', { cwd: '/', encoding: 'utf8' }).trim());
console.log(execFileSync('env', { env, encoding: 'utf8' }).split(/\n/).filter(l => l.startsWith('NONA_')).join());
console.log(spawnSync('cat', { input: 'piped input', encoding: 'utf8' }).stdout);
console.log(execSync('echo $0', { shell: '/bin/sh', encoding: 'utf8' }).trim());
const missing = spawnSync('nona-missing-command', { env });
console.log(missing.error.code, missing.error.errno, missing.error.syscall);
console.log(spawnSync('/', { env }).error.code, spawnSync('cat', { cwd: '/nona-missing-dir' }).error.code);
const big = spawnSync('/bin/sh', ['-c', 'head -c 5000000 /dev/zero; head -c 5000000 /dev/zero >&2'], { maxBuffer: 64 << 20 });
console.log('sync', big.status, big.stdout.length, big.stderr.length);
const sleeper = spawn('sleep', ['10']);
sleeper.on('spawn', () => console.log('kill', sleeper.kill()));
sleeper.on('exit', (code, signal) => console.log('exit', code, signal));
sleeper.on('close', () => {
  exec('kill -TERM $$', (error) => {
    console.log('self', error.killed, error.signal, error.code);
    const child = spawn('/bin/sh', ['-c', 'head -c 5000000 /dev/zero; head -c 5000000 /dev/zero >&2; cat']);
    let out = 0, err = 0, tail = '';
    child.stdout.on('data', d => { out += d.length; tail = String(d).slice(-5); });
    child.stderr.on('data', d => err += d.length);
    child.on('close', code => {
      console.log('async', code, out, err, tail);
      const early = spawn('/bin/sh', ['-c', 'exec 0<&-; sleep 0.3']);
      early.stdin.on('error', e => console.log('stdin', e.code));
      early.on('close', code => console.log('closed stdin', code));
      early.stdin.write(Buffer.alloc(1 << 20));
    });
    child.stdin.end('tail!');
  });
});
`),
);
