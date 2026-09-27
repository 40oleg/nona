import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

test('BigInt literal forms, type, string and Boolean conversion',()=>expectProgram(`console.log(typeof 0n,String(0n),Boolean(0n),Boolean(1n));console.log(String(0xFFn),String(0b101n),String(0o77n),String(9007199254740993n))`,'bigint 0 false true\n255 5 63 9007199254740993\n'));
test('BigInt literal strict equality and JSON rejection',()=>expectProgram(`console.log(1n===1n,1n===2n,1n===1);try{JSON.stringify(1n)}catch(e){console.log(e.name)}`,'true false false\nTypeError\n'));
test('BigInt unary minus preserves arbitrary precision and zero',()=>expectProgram(`console.log(String(-123456789012345678901234567890n),String(-0n),String(-(-7n)))`,'-123456789012345678901234567890 0 7\n'));
test('BigInt addition and subtraction carry across arbitrary-length digits',()=>expectProgram(`console.log(String(1n+2n),String(999999999999999999999n+1n),String(100000000000000000000n-1n));console.log(String(-8n+3n),String(3n-8n),String(-8n-3n),String(8n+(-8n)))`,'3 1000000000000000000000 99999999999999999999\n-5 -5 -11 0\n'));
test('BigInt addition compares signed magnitudes and borrows',()=>expectProgram(`console.log(String(1234n-1235n),String(1235n-1234n),String(-1235n+1234n),String(-1234n+1235n));console.log(String(100000000000000000001n-99999999999999999999n),String(42n-42n))`,'-1 1 -1 1\n2 0\n'));
test('BigInt converts decimal strings and exposes primitive methods',()=>expectProgram(`console.log(BigInt('  +000123  ').toString(),String(BigInt('-00042')),String(BigInt('')),String(BigInt(true)),String(BigInt(12)));console.log(BigInt.prototype.valueOf.call(7n)===7n,Object(8n).valueOf()===8n);try{new BigInt(1)}catch(e){console.log(e.name)}`,'123 -42 0 1 12\ntrue true\nTypeError\n'));
test('BigInt prototype has its own brand and rejects direct value access',()=>expectProgram(`console.log(Object.prototype.toString.call(Object(1n)),Object.getOwnPropertyDescriptor(BigInt.prototype,Symbol.toStringTag).value);try{BigInt.prototype.toString()}catch(e){console.log(e.name)}`,'[object BigInt] BigInt\nTypeError\n'));
test('BigInt parses binary, octal, and hexadecimal strings at arbitrary precision',()=>expectProgram(`console.log(String(BigInt('0b101')),String(BigInt('0o77')),String(BigInt('0xFF')),String(BigInt('0Xfffffffffffffffffff')))`,'5 63 255 75557863725914323419135\n'));
test('BigInt toString converts arbitrary precision values across radices',()=>expectProgram(`console.log((255n).toString(16),(123456789012345678901234567890n).toString(36),(-42n).toString(2),(0n).toString(8),(36n).toString(36));for(const radix of [0,1,37]){try{(1n).toString(radix)}catch(e){console.log(e.name)}}`,'ff byw97um9s91dlz68tsi -101010 0 10\nRangeError\nRangeError\nRangeError\n'));
test('Number explicitly converts BigInt while unary plus rejects it',()=>expectProgram(`console.log(Number(0n),Number(-87n),Number(9007199254740993n),new Number(12n).valueOf());try{+1n}catch(e){console.log(e.name)}`,'0 -87 9007199254740992 12\nTypeError\n'));
test('BigInt.asIntN and asUintN wrap signed values beyond 64 bits',()=>expectProgram(`console.log(BigInt.asUintN(8,-1n),BigInt.asIntN(8,255n),BigInt.asIntN(8,128n),BigInt.asIntN(8,-129n));console.log(BigInt.asUintN(80,-1n).toString(16),BigInt.asIntN(80,1208925819614629174706175n),BigInt.asUintN(0,123n));console.log(BigInt.asIntN(3.9,10n),BigInt.asUintN(NaN,42n))`,'255 -1 -128 127\nffffffffffffffffffff -1 0\n2 0\n'));
test('BigInt radix and modulo conversions survive stress GC',()=>{
 const source=`var x=BigInt('0x123456789abcdef0123456789abcdef');console.log(x.toString(2).length,BigInt.asUintN(83,-x).toString(16),BigInt.asIntN(83,x).toString(16));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'121 43210fedcba9876543211 3cdef0123456789abcdef\n');
});
