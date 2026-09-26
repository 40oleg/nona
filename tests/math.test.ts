import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

const cases:[string,string][]=[
 ['pow basics',`console.log(Math.pow(2,5),Math.pow(-2,3),Math.pow(4,.5));`],
 ['pow conversions',`var s='';var a={valueOf:function(){s+='a';return 2;}},b={valueOf:function(){s+='b';return 3;}};console.log(Math.pow(a,b),s);`],
 ['pow missing arguments',`var a=Math.pow(),b=Math.pow(2);console.log(a!==a,b!==b);`],
 ['Math tag',`console.log(Object.prototype.toString.call(Math),Math[Symbol.toStringTag]);`],
 ['Math constants',`console.log(Math.E,Math.LN10,Math.LN2,Math.LOG10E,Math.LOG2E,Math.PI,Math.SQRT1_2,Math.SQRT2);console.log(Object.getOwnPropertyDescriptor(Math,'PI').writable,Object.getOwnPropertyDescriptor(Math,'PI').enumerable,Object.getOwnPropertyDescriptor(Math,'PI').configurable);`],
];
for(const [name,source] of cases)test(`Math: ${name}`,()=>expectProgram(source,runOracle(source).stdout));
