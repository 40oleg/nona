import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('BigInt literal forms, type, string and Boolean conversion',()=>expectProgram(`console.log(typeof 0n,String(0n),Boolean(0n),Boolean(1n));console.log(String(0xFFn),String(0b101n),String(0o77n),String(9007199254740993n))`,'bigint 0 false true\n255 5 63 9007199254740993\n'));
test('BigInt literal strict equality and JSON rejection',()=>expectProgram(`console.log(1n===1n,1n===2n,1n===1);try{JSON.stringify(1n)}catch(e){console.log(e.name)}`,'true false false\nTypeError\n'));
test('BigInt unary minus preserves arbitrary precision and zero',()=>expectProgram(`console.log(String(-123456789012345678901234567890n),String(-0n),String(-(-7n)))`,'-123456789012345678901234567890 0 7\n'));
