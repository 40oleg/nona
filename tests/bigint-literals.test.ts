import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('BigInt literal forms, type, string and Boolean conversion',()=>expectProgram(`console.log(typeof 0n,String(0n),Boolean(0n),Boolean(1n));console.log(String(0xFFn),String(0b101n),String(0o77n),String(9007199254740993n))`,'bigint 0 false true\n255 5 63 9007199254740993\n'));
test('BigInt literal strict equality and JSON rejection',()=>expectProgram(`console.log(1n===1n,1n===2n,1n===1);try{JSON.stringify(1n)}catch(e){console.log(e.name)}`,'true false false\nTypeError\n'));
test('BigInt unary minus preserves arbitrary precision and zero',()=>expectProgram(`console.log(String(-123456789012345678901234567890n),String(-0n),String(-(-7n)))`,'-123456789012345678901234567890 0 7\n'));
test('BigInt addition and subtraction carry across arbitrary-length digits',()=>expectProgram(`console.log(String(1n+2n),String(999999999999999999999n+1n),String(100000000000000000000n-1n));console.log(String(-8n+3n),String(3n-8n),String(-8n-3n),String(8n+(-8n)))`,'3 1000000000000000000000 99999999999999999999\n-5 -5 -11 0\n'));
test('BigInt addition compares signed magnitudes and borrows',()=>expectProgram(`console.log(String(1234n-1235n),String(1235n-1234n),String(-1235n+1234n),String(-1234n+1235n));console.log(String(100000000000000000001n-99999999999999999999n),String(42n-42n))`,'-1 1 -1 1\n2 0\n'));
