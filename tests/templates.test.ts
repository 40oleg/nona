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
  ['tagged cooked and raw', 'function tag(s,v){console.log(s[0],s.raw[0],v,s[1]);}tag`a\\n${3}b`;'],
  ['tagged site identity and frozen arrays', 'let saved;function tag(s){console.log(saved===s,Object.isFrozen(s),Object.isFrozen(s.raw));saved=s;}function f(){tag`x`;}f();f();'],
  ['tagged member receiver', 'let o={x:7,tag(s,v){console.log(this.x,s[0],v);}};o.tag`a${3}`;'],
  ['tagged substitution order', 'let n=0;function tag(s,a,b){console.log(n,a,b);}tag`${++n}${++n}`;'],
];
for(const [name,source] of cases)test(`template: ${name}`,()=>expectProgram(source,runOracle(source).stdout));
