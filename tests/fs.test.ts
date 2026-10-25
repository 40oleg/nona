import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost, runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compile } from "../src/compiler.js";
import { readPe } from "./helpers/pe-reader.js";
import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// File I/O is exercised without GC stress: the collector runs before every operation
// there, which makes byte loops over large files too slow. The last test keeps GC stress.
function expectModules(files: Record<string, string>, gcStress = false): void {
    const { native, oracle } = runModulesOnHost(files, "main.mjs", {
        gcStress,
    });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, oracle);
}

test("node:fs reads, writes, lists and removes files like Node.js", () =>
    expectModules({
        "main.mjs":
            "import fs, {readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync, rmdirSync, renameSync, appendFileSync} from 'node:fs';\nconst dir = 'work-' + 'x';\nconsole.log(existsSync(dir), mkdirSync(dir + '/a/b', {recursive: true}) !== undefined, existsSync(dir + '/a/b'));\nwriteFileSync(dir + '/t.txt', '\u043f\u0440\u0438\u0432\u0435\u0442 \ud83d\ude00 hello\\n');\nappendFileSync(dir + '/t.txt', 'more');\nconsole.log(readFileSync(dir + '/t.txt', 'utf8'), readFileSync(dir + '/t.txt').length);\nwriteFileSync(dir + '/b.bin', new Uint8Array([0, 1, 2, 255]));\nconsole.log(Array.from(readFileSync(dir + '/b.bin')).join(','));\ncopyFileSync(dir + '/b.bin', dir + '/c.bin'); renameSync(dir + '/c.bin', dir + '/d.bin');\nconsole.log(readdirSync(dir).sort().join(','));\nconst st = statSync(dir + '/t.txt'); console.log(st.isFile(), st.isDirectory(), st.size, statSync(dir).isDirectory(), st.mtimeMs > 1e12);\nfor (const f of [() => readFileSync(dir + '/missing'), () => mkdirSync(dir), () => readFileSync(dir), () => rmdirSync(dir), () => readdirSync(dir + '/t.txt'), () => statSync('nope')]) {\n  try { f(); console.log('no error'); } catch (e) { console.log(e.code, e.syscall, e.message.startsWith(e.code + ': '), e instanceof Error); }\n}\nconsole.log(statSync('nope', {throwIfNoEntry: false}), typeof fs.readFileSync);\nfor (const f of ['t.txt', 'b.bin', 'd.bin']) unlinkSync(dir + '/' + f);\nrmdirSync(dir + '/a/b'); rmdirSync(dir + '/a'); rmdirSync(dir);\nconsole.log(existsSync(dir));\n",
    }));

test("fs handles large files, empty files and Unicode names", () =>
    expectModules({
        "main.mjs": `
import {readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync} from 'node:fs';
const big = new Uint8Array(200000); for (let i = 0; i < big.length; i++) big[i] = i * 7 & 255;
writeFileSync('big.bin', big);
const back = readFileSync('big.bin'); let same = back.length === big.length;
for (let i = 0; same && i < big.length; i++) same = back[i] === big[i];
console.log(back.length, same);
writeFileSync('empty.txt', ''); console.log(JSON.stringify(readFileSync('empty.txt', 'utf8')), readFileSync('empty.txt').length);
writeFileSync('файл-😀.txt', 'x'); console.log(readdirSync('.').filter(n => n.endsWith('.txt')).sort().join('|'), existsSync('файл-😀.txt'));
for (const name of ['big.bin', 'empty.txt', 'файл-😀.txt']) unlinkSync(name);
try { writeFileSync('x', 5); } catch (e) { console.log(e instanceof TypeError); }
`,
    }));

test("TextEncoder and TextDecoder follow the WHATWG UTF-8 algorithms", () => {
    const source = `
var e = new TextEncoder();
console.log(e.encoding, e.encode('aé€😀').join(','), e.encode('\\ud800x').join(','), e.encode().length);
var d = new TextDecoder();
console.log(d.encoding, d.fatal, d.ignoreBOM, d.decode(new Uint8Array([0xef,0xbb,0xbf,0x68,0x69])));
console.log(JSON.stringify(d.decode(new Uint8Array([0xc0,0x80,0xe0,0x80,0x41,0xed,0xa0,0x80,0xf4,0x90,0x80,0x80,0xf0,0x9f,0x98]))));
console.log(new TextDecoder('utf-8', {ignoreBOM: true}).decode(new Uint8Array([0xef,0xbb,0xbf,0x41])).length, d.decode(new Uint16Array([0x6968]).buffer), d.decode());
try { new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array([0xff])); } catch (x) { console.log(x instanceof TypeError); }
try { new TextDecoder('x-unknown-encoding'); } catch (x) { console.log(x instanceof RangeError); }
try { TextEncoder(); } catch (x) { console.log(x instanceof TypeError); }
console.log(d.decode(e.encode('long ' + 'x'.repeat(300))).length);
`;
    const native = runOnHost(source);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, runOracle(source).stdout);
});

test("fs survives GC stress", () =>
    expectModules(
        {
            "main.mjs": `
import {writeFileSync, readFileSync, unlinkSync, readdirSync} from 'node:fs';
writeFileSync('g.txt', 'gc ' + [1, 2, 3].join());
console.log(readFileSync('g.txt', 'utf8'), readdirSync('.').includes('g.txt'));
unlinkSync('g.txt');
`,
        },
        true,
    ));

test("fs.Stats has the times, owner, link count and block fields like Node.js", () => {
    const exact = process.platform === "linux";
    const source = `
import fs from 'node:fs';
fs.mkdirSync('stat-w', {recursive: true});
fs.writeFileSync('stat-w/f.txt', 'hello');
const s = fs.statSync('stat-w/f.txt');
const numbers = ['atimeMs', 'mtimeMs', 'ctimeMs', 'birthtimeMs', 'uid', 'gid', 'nlink', 'rdev', 'blksize', 'blocks', 'size', 'mode', 'dev', 'ino'];
const dates = ['atime', 'mtime', 'ctime', 'birthtime'];
console.log(numbers.map((k) => k + ':' + typeof s[k]).join(' '));
console.log(dates.map((k) => k + ':' + (s[k] instanceof Date) + ':' + (s[k].getTime() === s[k + 'Ms'] || Math.abs(s[k].getTime() - s[k + 'Ms']) < 1)).join(' '));
console.log(s.birthtimeMs <= s.ctimeMs, s.nlink >= 1, s.blksize > 0);
const d = fs.statSync('stat-w');
console.log(typeof d.ctime.getTime(), d.isDirectory(), typeof fs.statSync('stat-w', {bigint: true}).ino);
${
    exact
        ? `console.log(['uid', 'gid', 'nlink', 'rdev', 'blksize', 'blocks', 'mode', 'size'].map((k) => s[k]).join());
console.log(['atimeMs', 'mtimeMs', 'ctimeMs'].map((k) => Math.abs(s[k] - Date.now()) < 60000).join());
const l = fs.lstatSync('/proc/self');
console.log(l.isSymbolicLink(), typeof l.ctime.getTime(), l.uid);`
        : `const l = fs.lstatSync('stat-w/f.txt'); console.log(l.isFile());`
}
fs.rmSync('stat-w', {recursive: true});
`;
    expectModules({ "main.mjs": source }, true);
});

test("fs.truncateSync, truncate and promises.truncate match Node.js", () =>
    expectModules({
        "main.mjs": `
import fs, {truncateSync, writeFileSync, readFileSync, unlinkSync} from 'node:fs';
import {truncate as truncateAsync} from 'node:fs/promises';
const name = 'trunc-486.txt';
writeFileSync(name, 'hello world');
truncateSync(name, 5); console.log(readFileSync(name, 'utf8'));
truncateSync(name, 8); console.log(Array.from(readFileSync(name)).join(','), readFileSync(name).length);
truncateSync(name, -3); console.log(readFileSync(name).length);
writeFileSync(name, 'abc'); truncateSync(name); console.log(readFileSync(name).length);
writeFileSync(name, 'callback');
await new Promise((resolve) => fs.truncate(name, 4, (error) => { console.log(error, readFileSync(name, 'utf8')); resolve(); }));
await fs.promises.truncate(name, 2); console.log(readFileSync(name, 'utf8'));
await truncateAsync(name, 0); console.log(readFileSync(name).length);
for (const f of [() => truncateSync('missing-486.txt', 1), () => truncateSync(name, '1'), () => truncateSync(name, 1.5)]) {
  try { f(); console.log('no error'); } catch (e) { console.log(e.name, e.code, e.syscall, e.message.startsWith(e.code + ': ')); }
}
try { await fs.promises.truncate('missing-486.txt'); } catch (e) { console.log(e.code, e.syscall); }
unlinkSync(name);
`,
    }));

test("fs uses Win32 imports on Windows and system calls on Linux", () => {
    const imports = (source: string) => {
        const win = compile(source, {
            fileName: "main.mjs",
            target: "win32-x64",
            module: true,
        });
        assert.ok(win.ok);
        return readPe(win.image)
            .imports()
            .map((i) => i.toLowerCase());
    };
    const source =
        "import {readFileSync} from 'node:fs';\nconsole.log(typeof readFileSync);\n";
    const read = imports(source);
    for (const name of ["kernel32.dll!CreateFileW", "kernel32.dll!ReadFile"])
        assert.ok(read.includes(name.toLowerCase()), name);
    // A named import keeps only the Win32 functions it reaches (#440).
    assert.ok(!read.includes("kernel32.dll!findfirstfilew"));
    assert.ok(
        imports(
            "import {readdirSync} from 'node:fs';\nconsole.log(typeof readdirSync);\n",
        ).includes("kernel32.dll!findfirstfilew"),
    );
    assert.ok(
        compile(source, {
            fileName: "main.mjs",
            target: "linux-x64",
            module: true,
        }).ok,
    );
});

test("fs has lstat, Dirent, realpath.native, callbacks and fs/promises like Node.js", () =>
    expectModules({
        "c.cjs":
            "const fs = require('fs'), promises = require('fs/promises');\nconsole.log(fs.promises === promises, promises === require('node:fs').promises, typeof fs.lstatSync, typeof promises.readdir);\n",
        "main.mjs": `
import './c.cjs';
import fs, {lstatSync, readdirSync, realpathSync, Dirent, readdir, lstat, rmSync} from 'fs';
import {sep} from 'path';
(async () => {
fs.mkdirSync('w/sub', {recursive: true});
fs.writeFileSync('w/f.txt', 'abc');
const show = (s) => [s.isFile(), s.isDirectory(), s.isSymbolicLink(), s.isBlockDevice(), s.isCharacterDevice(), s.isFIFO(), s.isSocket()].join();
console.log(show(lstatSync('w/f.txt')), lstatSync('w/f.txt').size, show(lstatSync('w')));
console.log(lstatSync('w/missing', {throwIfNoEntry: false}));
try { lstatSync('w/missing'); } catch (e) { console.log(e.code, e.syscall); }
for (const d of readdirSync('w', {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1))
  console.log(d.name, d.parentPath, d instanceof Dirent, show(d));
console.log(typeof realpathSync.native, realpathSync.native('w').endsWith(sep + 'w'), typeof fs.realpath.native);
console.log(fs.promises === (await import('fs/promises')).default, fs.promises === (await import('node:fs/promises')).default);
// Node.js completes callbacks in any order, so collect the results and sort them.
const results = [];
let later = false;
await new Promise((done) => {
  let left = 5;
  const report = (...values) => { results.push(values.join(' ') + ' ' + later); if (--left === 0) done(); };
  readdir('w', (err, names) => report('readdir', err, names.sort().join()));
  lstat('w/nope', (err, st) => report('lstat', err.code, err.syscall, st));
  fs.stat('w/f.txt', (err, st) => report('stat', err, st.size));
  fs.readFile('w/f.txt', 'utf8', (err, text) => report('readFile', err, text));
  fs.exists('w/f.txt', (ok) => report('exists', ok));
  later = true;
});
console.log(results.sort().join('; '));
const {readdir: readdirP, lstat: lstatP, readFile: readFileP, writeFile: writeFileP, mkdir: mkdirP, rm: rmP, access: accessP} = await import('fs/promises');
const entries = await readdirP('w', {withFileTypes: true});
console.log(entries.map((d) => d.name + ':' + d.isDirectory()).sort().join());
console.log((await lstatP('w/sub')).isDirectory());
await writeFileP('w/g.txt', 'xyz'); console.log(await readFileP('w/g.txt', 'utf8'));
await mkdirP('w/p/q', {recursive: true}); await accessP('w/p/q');
try { await lstatP('w/none'); } catch (e) { console.log(e.code, e.syscall); }
try { rmSync('w'); } catch (e) { console.log(e.code); }
await rmP('w', {recursive: true}); rmSync('w', {force: true});
console.log(fs.existsSync('w'));
})();
`,
    }));

// node:fs resolves and joins paths with nona:internal/path-core (#439).
test("fs resolves relative, dot-segment and Unicode paths like Node.js", () =>
    expectModules({
        "main.mjs": `
import {existsSync, mkdirSync, writeFileSync, realpathSync, readdirSync, rmSync} from 'node:fs';
import path from 'node:path';
const root = 'папка-😀';
mkdirSync(root + '/ü/./deep', {recursive: true});
writeFileSync(root + '/ü/файл.txt', 'x');
writeFileSync(root + '/ü/deep/😀.txt', 'y');
for (const p of [root, './' + root + '/ü', root + '/ü/../ü/deep/../файл.txt', root + '/ü/deep/😀.txt', root + '/missing', root + '/ü/./deep/..'])
  console.log(JSON.stringify(p), existsSync(p));
const real = realpathSync(root + '/ü/deep/../файл.txt');
// The working directory may be reached through a short name or a link, so compare against its real path.
const base = realpathSync('.');
console.log(real === path.resolve(base, root, 'ü', 'файл.txt'), path.isAbsolute(real), real.endsWith(path.join(root, 'ü', 'файл.txt')));
console.log(base === path.resolve(base), realpathSync(root + '/./ü/..') === path.resolve(base, root));
for (const d of readdirSync('./' + root + '/ü', {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1))
  console.log(d.name, d.isFile(), d.isDirectory(), d.isSymbolicLink());
console.log(readdirSync(root + '/ü/deep').join());
rmSync('./' + root + '/ü/..', {recursive: true});
console.log(existsSync(root), existsSync(root + '/ü/deep/😀.txt'));
try { rmSync(root); } catch (e) { console.log(e.code); }
rmSync(root, {recursive: true, force: true});
`,
    }));

// On POSIX "r/a/.." stops resolving once "a" is removed; the recursive rm still succeeds (#449).
test("fs removes a directory named through a '..' segment like Node.js", () =>
    expectModules({
        "main.mjs": `
import {existsSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {rm} from 'node:fs/promises';
mkdirSync('r/a/b', {recursive: true});
writeFileSync('r/a/b/f.txt', 'x');
rmSync('r/a/..', {recursive: true});
console.log(existsSync('r'));
mkdirSync('q/a', {recursive: true});
await rm('./q/a/..', {recursive: true});
console.log(existsSync('q'));
try { rmSync('r/a/..', {recursive: true}); } catch (e) { console.log(e.code); }
`,
    }));

test("fs reads symbolic links where the host can create them", (t) => {
    const directory = mkdtempSync(join(tmpdir(), "nona-links-"));
    try {
        writeFileSync(join(directory, "target.txt"), "linked");
        mkdirSync(join(directory, "dir"));
        try {
            symlinkSync("target.txt", join(directory, "file-link"));
            symlinkSync(
                join(directory, "dir"),
                join(directory, "dir-link"),
                "dir",
            );
            symlinkSync("absent", join(directory, "broken"));
        } catch (error) {
            t.skip("cannot create symbolic links: " + (error as Error).message);
            return;
        }
        expectModules({
            "main.mjs": `
import fs from 'node:fs';
const dir = ${JSON.stringify(directory)};
const show = (s) => [s.isFile(), s.isDirectory(), s.isSymbolicLink()].join();
for (const name of ['file-link', 'dir-link', 'broken', 'target.txt'])
  console.log(name, show(fs.lstatSync(dir + '/' + name)));
console.log(show(fs.statSync(dir + '/file-link')), fs.readFileSync(dir + '/file-link', 'utf8'));
console.log(fs.readlinkSync(dir + '/file-link'), fs.readlinkSync(dir + '/broken'), fs.readlinkSync(dir + '/dir-link') === fs.realpathSync.native(dir + '/dir'));
try { fs.readlinkSync(dir + '/target.txt'); } catch (e) { console.log(e.code, e.syscall); }
try { fs.readlinkSync(dir + '/missing'); } catch (e) { console.log(e.code, e.syscall); }
for (const d of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)) console.log(d.name, show(d));
console.log(fs.realpathSync(dir + '/file-link') === fs.realpathSync(dir + '/target.txt'));
`,
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("readdir recursive lists all descendants like Node.js and enters symbolic links to directories", (t) => {
    const directory = mkdtempSync(join(tmpdir(), "nona-recursive-"));
    try {
        mkdirSync(join(directory, "rd", "sub", "deep"), { recursive: true });
        mkdirSync(join(directory, "rd", "empty"));
        for (const f of ["a", "sub/b", "sub/deep/c"])
            writeFileSync(join(directory, "rd", f), "");
        try {
            symlinkSync(
                join(directory, "rd", "sub"),
                join(directory, "rd", "link"),
                "dir",
            );
        } catch (error) {
            t.diagnostic("no symbolic links: " + (error as Error).message);
        }
        expectModules({
            "main.mjs": `
import fs from 'node:fs';
import {readdir as readdirP} from 'node:fs/promises';
const root = ${JSON.stringify(join(directory, "rd"))};
const sorted = (list) => JSON.stringify(list.map((n) => n.replaceAll('\\\\', '/')).sort());
console.log(sorted(fs.readdirSync(root, {recursive: true})));
console.log(sorted(fs.readdirSync(root, {recursive: false})));
console.log(sorted(fs.readdirSync(root, 'utf8')));
console.log(sorted(fs.readdirSync(root, {recursive: true, withFileTypes: true}).map((d) => d.parentPath.slice(root.length).replaceAll('\\\\', '/') + '|' + d.name + '|' + d.isDirectory())));
console.log(sorted(await readdirP(root, {recursive: true})));
fs.readdir(root, {recursive: true}, (error, names) => console.log(error, sorted(names)));
`,
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("fs.symlinkSync, symlink and promises.symlink create links like Node.js", () =>
    expectModules({
        "main.mjs": `
import fs from 'node:fs';
import {symlink as symlinkP} from 'node:fs/promises';
// The Node.js oracle runs in the directory the executable has just used.
for (const name of fs.readdirSync('.')) if (name.startsWith('sl-')) fs.rmSync(name, {recursive: true, force: true});
fs.writeFileSync('sl-target.txt', 'linked');
fs.mkdirSync('sl-dir');
let allowed = true;
try {
  fs.symlinkSync('sl-target.txt', 'sl-link.txt');
} catch (e) {
  if (e.code !== 'EPERM') throw e;
  allowed = false;
  console.log('links are not permitted');
}
if (allowed) {
console.log(fs.readlinkSync('sl-link.txt'), fs.lstatSync('sl-link.txt').isSymbolicLink(), fs.readFileSync('sl-link.txt', 'utf8'));
try { fs.symlinkSync('sl-target.txt', 'sl-link.txt'); } catch (e) { console.log(e.code, e.syscall, e.message.startsWith('EEXIST: file already exists, symlink')); }
try { fs.symlinkSync('sl-target.txt', 'sl-missing/link.txt'); } catch (e) { console.log(e.code, e.syscall); }
try { fs.symlinkSync(1, 'sl-x'); } catch (e) { console.log(e.code); }
fs.symlinkSync('sl-dir', 'sl-dir-link');
fs.symlinkSync('sl-dir', 'sl-dir-link2', 'dir');
console.log(fs.statSync('sl-dir-link').isDirectory(), fs.statSync('sl-dir-link2').isDirectory());
await symlinkP('sl-target.txt', 'sl-promise.txt');
console.log(fs.readlinkSync('sl-promise.txt'));
await symlinkP('sl-target.txt', 'sl-promise.txt').catch((e) => console.log(e.code, e.syscall));
await new Promise((resolve) => fs.symlink('sl-target.txt', 'sl-callback.txt', (error) => {
  console.log(error, fs.readlinkSync('sl-callback.txt'));
  fs.symlink('sl-target.txt', 'sl-callback.txt', (error) => { console.log(error.code, error.syscall); resolve(); });
}));
}
`,
    }));

test("fs reads Windows junctions as links", (t) => {
    if (process.platform !== "win32") {
        t.skip("junctions are a Windows feature");
        return;
    }
    const directory = mkdtempSync(join(tmpdir(), "nona-junction-"));
    try {
        mkdirSync(join(directory, "dir"));
        writeFileSync(join(directory, "dir", "inner.txt"), "x");
        symlinkSync(
            join(directory, "dir"),
            join(directory, "junction"),
            "junction",
        );
        expectModules({
            "main.mjs": `
import fs from 'node:fs';
const dir = ${JSON.stringify(directory)};
const link = fs.lstatSync(dir + '/junction');
console.log(link.isSymbolicLink(), link.isDirectory(), fs.statSync(dir + '/junction').isDirectory());
// The junction stores the path it was created with; realpathSync may expand
// 8.3 short names in it (the CI temp directory is C:\\Users\\RUNNER~1\\...).
console.log(fs.readlinkSync(dir + '/junction').replace(/\\\\$/, '') === dir + '\\\\dir');
console.log(fs.readdirSync(dir + '/junction').join(), fs.realpathSync(dir + '/junction') === fs.realpathSync(dir + '/dir'));
console.log(fs.readdirSync(dir, {withFileTypes: true}).map((d) => d.name + ':' + d.isSymbolicLink() + ':' + d.isDirectory()).sort().join());
try { fs.readlinkSync(dir + '/dir'); } catch (e) { console.log(e.code, e.syscall); }
`,
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("the fs callback API calls back on a later turn with the result or the error", () =>
    expectModules({
        "main.mjs": `
import fs, {readFile, writeFile, appendFile, stat, readdir, mkdir, rename, copyFile, unlink, rmdir, realpath, exists} from 'node:fs';
const call = (name, fn, ...args) => new Promise((resolve) => {
    let sync = true;
    fn(...args, (error, value) => {
        console.log(name, sync ? 'synchronous' : 'later', error ? error.code + ' ' + error.syscall : typeof value === 'string' ? value : value === undefined ? '-' : typeof value);
        resolve(value);
    });
    sync = false;
});
(async () => {
await call('mkdir', mkdir, 'cb-dir');
await call('writeFile', writeFile, 'cb-dir/a.txt', 'hello');
await call('appendFile', appendFile, 'cb-dir/a.txt', ' world');
await call('readFile', readFile, 'cb-dir/a.txt', 'utf8');
const data = await call('readFile buffer', readFile, 'cb-dir/a.txt');
const st = await call('stat', stat, 'cb-dir/a.txt');
console.log(data.length, st.isFile(), st.size);
await call('copyFile', copyFile, 'cb-dir/a.txt', 'cb-dir/b.txt');
await call('rename', rename, 'cb-dir/b.txt', 'cb-dir/c.txt');
console.log((await call('readdir', readdir, 'cb-dir')).sort().join());
console.log(await new Promise((resolve) => realpath('cb-dir', (error, value) => resolve(value === fs.realpathSync('cb-dir')))));
await new Promise((resolve) => exists('cb-dir/c.txt', (found) => resolve(console.log('exists', found))));
await call('missing', readFile, 'cb-dir/missing');
await call('mkdir again', mkdir, 'cb-dir');
await call('stat missing', stat, 'cb-dir/missing');
await call('unlink', unlink, 'cb-dir/a.txt');
await call('unlink', unlink, 'cb-dir/c.txt');
await call('rmdir', rmdir, 'cb-dir');
try { readFile('cb-dir/a.txt'); } catch (e) { console.log(e.name, e.code); }
console.log(typeof fs.readFile, fs.writeFile === writeFile);
})();
`,
    }));

test("fs.mkdtempSync, mkdtemp and promises.mkdtemp create unique directories (#483)", () =>
    expectModules({
        "main.mjs": `
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const prefix = path.join(os.tmpdir(), 'app-');
const a = fs.mkdtempSync(prefix), b = fs.mkdtempSync(prefix);
const c = await new Promise((resolve, reject) => fs.mkdtemp(prefix, (e, d) => e ? reject(e) : resolve(d)));
const d = await fs.promises.mkdtemp(prefix);
const all = [a, b, c, d];
console.log(new Set(all).size);
for (const dir of all) {
  const name = path.basename(dir);
  console.log(name.length, name.startsWith('app-'), /^[A-Za-z0-9]{6}$/.test(name.slice(4)), fs.statSync(dir).isDirectory());
}
if (process.platform !== 'win32') console.log((fs.statSync(a).mode & 0o777).toString(8));
try { fs.mkdtempSync(path.join(os.tmpdir(), 'no-such-dir', 'x-')); } catch (e) { console.log(e.code, e.syscall); }
for (const dir of all) fs.rmSync(dir, {recursive: true});
console.log(fs.existsSync(a));
`,
    }));

test("fs errors carry the errno of Node.js", () =>
    expectModules({
        "main.mjs": `
import fs from 'node:fs';
fs.mkdirSync('errno-dir', {recursive: true});
fs.writeFileSync('errno-dir/f.txt', 'x');
const cases = [
  () => fs.statSync('errno-dir/missing'),
  () => fs.mkdirSync('errno-dir'),
  () => fs.copyFileSync('errno-dir/f.txt', 'errno-dir/f.txt', fs.constants.COPYFILE_EXCL),
  () => fs.readFileSync('errno-dir'),
  () => fs.readdirSync('errno-dir/f.txt'),
  () => fs.rmdirSync('errno-dir'),
];
for (const f of cases) {
  try { f(); console.log('no error'); } catch (e) { console.log(e.code, e.errno, e.syscall, typeof e.errno); }
}
fs.readFile('errno-dir/missing', (e) => {
  console.log(e.code, e.errno, e.syscall);
  fs.promises.readFile('errno-dir/missing').catch((p) => {
    console.log(p.code, p.errno, p.syscall);
    fs.unlinkSync('errno-dir/f.txt');
    fs.rmdirSync('errno-dir');
  });
});
`,
    }));
