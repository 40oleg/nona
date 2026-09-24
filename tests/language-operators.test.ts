import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

test('bitwise results use signed int32 except unsigned right shift',()=>{
  expectProgram('console.log(~0, -1 >>> 0, 1 << 33, -8 >> 2, 7 & 3, 4 | 1, 7 ^ 3);',
    '-1 4294967295 2 -2 3 5 4\n');
});
test('ToInt32 truncates and wraps, including nonfinite values',()=>{
  expectProgram('console.log(4294967297 | 0, -4294967297 | 0, NaN | 0, Infinity | 0, -Infinity | 0, -3.9 | 0, 0.9 | 0);',
    '1 -1 0 0 0 -3 0\n');
});
test('bitwise conversion covers binary64 exponent boundaries and primitive coercion',()=>{
  const values=['-0','5e-324','1.7976931348623157e308','9007199254740991','9007199254740992','9223372036854775808','1e23','1e25','"4294967295"','null','undefined','true','false','"-3.9"','"garbage"'];
  const source=values.map(v=>`console.log(${v}|0,${v}>>>0,~(${v}));`).join('');
  expectProgram(source,runOracle(source).stdout);
});
test('shift counts wrap modulo 32 and signed shifts retain the sign',()=>{
  const source='console.log(-2147483648>>0,-2147483648>>31,-2147483648>>>31,1<<31,1<<-1,8>>34,8>>>32,1<<NaN,1<<Infinity);';
  expectProgram(source,'-2147483648 -1 1 -2147483648 -2147483648 2 8 1 1\n');
});
test('compound bitwise assignment reads the left operand before right effects',()=>{
  const source='var a=7;a&=(a=3);console.log(a);a|=8;a^=3;a<<=2;a>>=1;a>>>=1;console.log(a);';
  expectProgram(source,'3\n8\n');
});
test('operator precedence follows JavaScript across shifts comparisons and bits',()=>{
  const source='console.log(1|2&4,1^3&1,1<<2+1,8>>1<5,2==2&3,4|1^3,1+2<<2);';
  expectProgram(source,runOracle(source).stdout);
});
test('comma and void preserve evaluation order and operand results',()=>{
  expectProgram('var a=1;console.log((a+=2,a*=3,a),void(a++),a);','9 undefined 10\n');
});
test('comma expressions do not swallow argument or declaration separators',()=>{
  expectProgram('var a=1,b=2;function f(x,y){return x+y;}console.log(f((a++,a),b),(a=4,b=5),a,b);',
    '4 5 4 5\n');
});
test('comma is available in loop headers conditional operands and return',()=>{
  const source='var a=0,b=0;for(a=0,b=4;a<3;a++,b--){} function f(){return a++,b++;} console.log(f(),a,b,true?(a=6,a+1):0);';
  expectProgram(source,runOracle(source).stdout);
});
