import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile,compileModuleToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {linkLinux} from '../src/backend/linux/index.js';
import {RuntimeBuilder,slot} from '../src/runtime/abi.js';
import {parseFfiSignature} from '../src/ffi.js';
import {readPe} from './helpers/pe-reader.js';
import {runNative} from './helpers/native.js';

const stubbed=`import {define, lastError} from 'nona:ffi';
const sum6 = define('test.dll', 'Sum6', 'i64(i32,i32,i32,i32,i32,i32)');
const wlen = define('test.dll', 'Wlen', 'u32(wstr)');
const ulen = define('test.dll', 'Ulen', 'u32(str)');
const fill = define('test.dll', 'Fill', 'void(buf,u32)');
const neg = define('test.dll', 'Neg', 'i32(i32)');
const half = define('test.dll', 'Half', 'f64(f64)');
const isZero = define('test.dll', 'IsZero', 'bool(ptr)');
const big = define('test.dll', 'Big', 'u64()');
console.log(sum6(1, 2, 3, 4, 5, 6), sum6(-1, 2, 3, 4, 5, -6), sum6.name, sum6.length, typeof sum6);
console.log(wlen('hello'), wlen(''), wlen(null), wlen('\\u{1F600}'), ulen('h\\u00e9llo'), ulen(''), ulen('\\u{1F600}'));
const bytes = new Uint8Array(8); fill(bytes.subarray(2), 3); console.log(bytes.join(','));
const buffer = new ArrayBuffer(4); fill(buffer, 4); console.log(new Uint8Array(buffer).join(','));
const view = new DataView(new ArrayBuffer(6), 1, 4); fill(view, 2); console.log(new Uint8Array(view.buffer).join(','));
console.log(neg(5), neg(-7), neg(true), half(3), isZero(null), isZero(0), isZero(1), big(), lastError());
for (const bad of [() => neg('x'), () => fill({}, 1), () => wlen(5), () => half(true), () => sum6(1, 2)]) {
  try { bad(); console.log('no error'); } catch (e) { console.log(e instanceof TypeError); }
}
let total = 0;
for (let i = 0; i < 300; i++) total += wlen('garbage ' + i) + ulen(String(i));
console.log(total);
`;

/** Stub implementations of test.dll for the Linux target (Win64 ABI). */
function stubs():RuntimeBuilder {
  const b=new RuntimeBuilder(),s=(n:string)=>'linux.ffi.test.dll!'+n+'.code';
  // Stack arguments 5 and 6 sit above the return address and the 32-byte shadow space.
  b.fn(s('Sum6'),40,a=>{a.mov('rax','rcx');a.add('rax','rdx');a.add('rax','r8');a.add('rax','r9');for(const d of [40,48]){a.load('r10',slot(40+d),32);a.shl('r10',32);a.sar('r10',32);a.add('rax','r10');}});
  b.fn(s('Wlen'),40,a=>{const l=a.unique('l'),d=a.unique('d');a.mov('rax',0);a.test('rcx','rcx');a.jcc('e',d);a.label(l);a.load('r10',{base:'rcx'},16);a.test('r10','r10');a.jcc('e',d);a.add('rax',1);a.add('rcx',2);a.jmp(l);a.label(d);});
  b.fn(s('Ulen'),40,a=>{const l=a.unique('l'),d=a.unique('d');a.mov('rax',0);a.label(l);a.load('r10',{base:'rcx'},8);a.test('r10','r10');a.jcc('e',d);a.add('rax',1);a.add('rcx',1);a.jmp(l);a.label(d);});
  b.fn(s('Fill'),40,a=>{const l=a.unique('l'),d=a.unique('d');a.mov('rax',7);a.label(l);a.test('rdx','rdx');a.jcc('e',d);a.store({base:'rcx'},'rax',8);a.add('rcx',1);a.sub('rdx',1);a.jmp(l);a.label(d);});
  // Garbage in the upper half checks the i32 result narrowing.
  b.fn(s('Neg'),40,a=>{a.mov('rax',0);a.sub('rax','rcx');a.mov('r10',0xdeadbeef00000000n);a.or('rax','r10');});
  b.fn(s('Half'),40,a=>{a.mov('rax',2);a.cvtsi2sd('xmm1','rax');a.divsd('xmm0','xmm1');});
  b.fn(s('IsZero'),40,a=>{const d=a.unique('d');a.mov('rax',0);a.test('rcx','rcx');a.jcc('ne',d);a.mov('rax',0x100000001n);a.label(d);});
  b.fn(s('Big'),40,a=>a.mov('rax',0xffffffffffffffffn));
  return b;
}

test('FFI thunks marshal arguments and results through the Win64 ABI',{skip:process.platform!=='linux'&&'Linux stubs'},()=>{
  const program=generate(compileModuleToIR(stubbed,join(tmpdir(),'ffi-main.mjs')),{gcStress:true});
  const b=stubs();program.fragments.push(...b.bundle.fragments);program.functions.push(...b.bundle.functions);
  const directory=mkdtempSync(join(tmpdir(),'nona-ffi-'));
  try{
    const executable=join(directory,'image');writeFileSync(executable,linkLinux(program));chmodSync(executable,0o755);
    const run=spawnSync(executable,[],{encoding:'utf8',timeout:60_000});
    assert.equal(run.status,0,run.stderr);
    assert.equal(run.stdout,[
      '21 7 Sum6 6 function',
      '5 0 0 2 6 0 4',
      '0,0,7,7,7,0,0,0',
      '7,7,7,7',
      '0,7,7,0,0,0',
      '-5 7 -1 1.5 true true false 18446744073709552000 0',
      'true','true','true','true','true',
      String(Array.from({length:300},(_,i)=>('garbage '+i).length+String(i).length).reduce((x,y)=>x+y,0)),
      '',
    ].join('\n'));
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('FFI declarations become PE imports and are rejected for Linux',()=>{
  const source="import {MessageBoxW, RegSetValueExW, lastError} from 'nona:win32';\nimport {define} from 'nona:ffi';\nconst beep = define('KERNEL32.dll', 'Beep', 'bool(u32,u32)');\nconsole.log(typeof MessageBoxW, typeof beep, lastError());\n";
  const win=compile(source,{fileName:'main.mjs',target:'win32-x64',module:true});
  assert.ok(win.ok);
  const imports=readPe(win.image).imports();
  for(const name of ['user32.dll!MessageBoxW','advapi32.dll!RegSetValueExW','KERNEL32.dll!Beep','KERNEL32.dll!GetLastError'])assert.ok(imports.includes(name),name);
  const linux=compile(source,{fileName:'main.mjs',target:'linux-x64',module:true});
  assert.equal(linux.ok,false);
  assert.ok(!linux.ok&&linux.diagnostics.every(d=>d.code==='E_FFI_TARGET'));
});

test('define() requires string literal arguments and a valid signature',()=>{
  const cases:[string,RegExp][]=[
    ["const dll='a.dll'; define(dll, 'F', 'void()');",/string literals/],
    ["define('a.dll', 'F');",/three arguments/],
    ["define('a.dll', 'F', 'string(i32)');",/result type/],
    ["define('a.dll', 'F', 'void(cb(void()))');",/./],
    ["define('a.dll', 'F', 'void(i33)');",/parameter type/],
    ["define('a\\\\b.dll', 'F', 'void()');",/DLL name/],
  ];
  for(const [body,message] of cases){
    const result=compile("import {define} from 'nona:ffi';\n"+body,{fileName:'main.mjs',target:'win32-x64',module:true});
    assert.equal(result.ok,false,body);
    assert.ok(!result.ok&&result.diagnostics[0]!.code==='E_FFI_STATIC'&&message.test(result.diagnostics[0]!.message),body);
  }
  // A shadowing local binding is an ordinary function call.
  assert.ok(compile("import {define} from 'nona:ffi';\nfunction f(define){ return define(1); }\nf(x=>x);",{fileName:'main.mjs',target:'linux-x64',module:true}).ok);
  // Calling the imported function indirectly throws at run time instead.
  assert.ok(compile("import * as ffi from 'nona:ffi';\ntry { ffi.define('a.dll','F','void()'); } catch (e) { console.log(e instanceof TypeError); }",{fileName:'main.mjs',target:'linux-x64',module:true}).ok);
});

test('FFI signature grammar',()=>{
  assert.deepEqual(parseFfiSignature(' i32 ( u32 , wstr ) '),{result:'i32',parameters:['u32','wstr']});
  assert.deepEqual(parseFfiSignature('void()'),{result:'void',parameters:[]});
  assert.throws(()=>parseFfiSignature('wstr()'),/result type/);
  assert.throws(()=>parseFfiSignature('i32'),/expected/);
});

test('Windows FFI calls user32, kernel32 and advapi32',{skip:process.platform!=='win32'&&'Windows only'},()=>{
  const source=`import {GetSystemMetrics, CreateMutexW, CloseHandle, GetModuleFileNameW, RegCreateKeyExW, RegSetValueExW, RegQueryValueExW, RegDeleteKeyW, RegCloseKey,
  HKEY_CURRENT_USER, KEY_ALL_ACCESS, REG_SZ, ERROR_ALREADY_EXISTS, wideString, fromWideString, readHandle, lastError} from 'nona:win32';
console.log(GetSystemMetrics(0) > 0);
const name = 'nona-ffi-test-' + Date.now();
const first = CreateMutexW(null, false, name), firstError = lastError();
const second = CreateMutexW(null, false, name), secondError = lastError();
console.log(first !== 0, second !== 0, firstError, secondError === ERROR_ALREADY_EXISTS);
CloseHandle(second); CloseHandle(first);
const path = new Uint16Array(260); const length = GetModuleFileNameW(null, path, 260);
console.log(length > 0, fromWideString(path).toLowerCase().endsWith('.exe'));
const keyOut = new Uint8Array(8), disposition = new Uint32Array(1);
console.log(RegCreateKeyExW(HKEY_CURRENT_USER, 'Software\\\\NonaTest', 0, null, 0, KEY_ALL_ACCESS, null, keyOut, disposition));
const key = readHandle(keyOut), value = wideString('C:\\\\Путь\\\\image.jpg');
console.log(RegSetValueExW(key, 'Wallpaper', 0, REG_SZ, value, value.byteLength));
const out = new Uint16Array(64), size = new Uint32Array([out.byteLength]), type = new Uint32Array(1);
console.log(RegQueryValueExW(key, 'Wallpaper', null, type, out, size), type[0] === REG_SZ, fromWideString(out));
console.log(RegCloseKey(key), RegDeleteKeyW(HKEY_CURRENT_USER, 'Software\\\\NonaTest'));
`;
  const result=compile(source,{fileName:'main.mjs',target:'win32-x64',module:true});
  assert.ok(result.ok);
  const run=runNative(result.image);
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString(),'true\ntrue true 0 true\ntrue true\n0\n0\n0 true C:\\Путь\\image.jpg\n0 0\n');
});
