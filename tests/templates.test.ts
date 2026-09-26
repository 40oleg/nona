import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

const cases:[string,string][]=[
  ['plain', 'console.log(`hello`);'],
  ['substitutions', 'var x=3;console.log(`a${x}b${x+1}c`);'],
  ['coercion hint', 'var x={toString:function(){return "text";},valueOf:function(){return 8;}};console.log(`${x}`);'],
  ['evaluation order', 'var x=0;function f(){console.log(++x);return x;}console.log(`${f()}-${f()}`);'],
  ['nested', 'var x=2;console.log(`${`v${x}`}:${x+1}`);'],
  ['object expression', 'console.log(`${({x:2}).x}`);'],
  ['escapes', 'console.log(`a\\n\\x41\\u0042\\u{43}\\`\\${z}`);'],
  ['line endings', 'console.log(`a\r\nb`);'],
];
for(const [name,source] of cases)test(`template: ${name}`,()=>expectProgram(source,runOracle(source).stdout));
