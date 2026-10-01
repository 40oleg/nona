import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModulesOnHost,runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compile} from '../src/compiler.js';
import {readPe} from './helpers/pe-reader.js';

// File I/O is exercised without GC stress: the collector runs before every operation
// there, which makes byte loops over large files too slow. The last test keeps GC stress.
function expectModules(files:Record<string,string>,gcStress=false):void {
 const {native,oracle}=runModulesOnHost(files,'main.mjs',{gcStress});
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,oracle);
}

test('node:fs reads, writes, lists and removes files like Node.js',()=>expectModules({'main.mjs':"import fs, {readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync, rmdirSync, renameSync, appendFileSync} from 'node:fs';\nconst dir = 'work-' + 'x';\nconsole.log(existsSync(dir), mkdirSync(dir + '/a/b', {recursive: true}) !== undefined, existsSync(dir + '/a/b'));\nwriteFileSync(dir + '/t.txt', '\u043f\u0440\u0438\u0432\u0435\u0442 \ud83d\ude00 hello\\n');\nappendFileSync(dir + '/t.txt', 'more');\nconsole.log(readFileSync(dir + '/t.txt', 'utf8'), readFileSync(dir + '/t.txt').length);\nwriteFileSync(dir + '/b.bin', new Uint8Array([0, 1, 2, 255]));\nconsole.log(Array.from(readFileSync(dir + '/b.bin')).join(','));\ncopyFileSync(dir + '/b.bin', dir + '/c.bin'); renameSync(dir + '/c.bin', dir + '/d.bin');\nconsole.log(readdirSync(dir).sort().join(','));\nconst st = statSync(dir + '/t.txt'); console.log(st.isFile(), st.isDirectory(), st.size, statSync(dir).isDirectory(), st.mtimeMs > 1e12);\nfor (const f of [() => readFileSync(dir + '/missing'), () => mkdirSync(dir), () => readFileSync(dir), () => rmdirSync(dir), () => readdirSync(dir + '/t.txt'), () => statSync('nope')]) {\n  try { f(); console.log('no error'); } catch (e) { console.log(e.code, e.syscall, e.message.startsWith(e.code + ': '), e instanceof Error); }\n}\nconsole.log(statSync('nope', {throwIfNoEntry: false}), typeof fs.readFileSync);\nfor (const f of ['t.txt', 'b.bin', 'd.bin']) unlinkSync(dir + '/' + f);\nrmdirSync(dir + '/a/b'); rmdirSync(dir + '/a'); rmdirSync(dir);\nconsole.log(existsSync(dir));\n"}));

test('fs handles large files, empty files and Unicode names',()=>expectModules({'main.mjs':`
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
`}));

test('TextEncoder and TextDecoder follow the WHATWG UTF-8 algorithms',()=>{
 const source=`
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
 const native=runOnHost(source);
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,runOracle(source).stdout);
});

test('fs survives GC stress',()=>expectModules({'main.mjs':`
import {writeFileSync, readFileSync, unlinkSync, readdirSync} from 'node:fs';
writeFileSync('g.txt', 'gc ' + [1, 2, 3].join());
console.log(readFileSync('g.txt', 'utf8'), readdirSync('.').includes('g.txt'));
unlinkSync('g.txt');
`},true));

test('fs uses Win32 imports on Windows and system calls on Linux',()=>{
 const source="import {readFileSync} from 'node:fs';\nconsole.log(typeof readFileSync);\n";
 const win=compile(source,{fileName:'main.mjs',target:'win32-x64',module:true});
 assert.ok(win.ok);
 const imports=readPe(win.image).imports();
 for(const name of ['kernel32.dll!CreateFileW','kernel32.dll!FindFirstFileW'])assert.ok(imports.some(i=>i.toLowerCase()===name.toLowerCase()),name);
 assert.ok(compile(source,{fileName:'main.mjs',target:'linux-x64',module:true}).ok);
});
