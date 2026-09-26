import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

for(const [name,source] of [
 ['numeric time and prototype',`let a=new Date(0),b=new Date(-1234.9),c=new Date(8640000000000001);console.log(a.getTime(),a.valueOf(),b.getTime(),Number.isNaN(c.getTime()),Object.prototype.toString.call(a),Object.getPrototypeOf(a)===Date.prototype);`],
 ['Date prototype is an ordinary object',`let a,b;try{Date.prototype.getTime()}catch(e){a=e.name}try{Date.prototype.valueOf()}catch(e){b=e.name}console.log(a,b,Object.prototype.toString.call(Date.prototype));`],
 ['Date.now host time',`let n=Date.now();console.log(typeof n,n>1600000000000,n<4102444800000,Date.now.length);`],
] as const)test(name,()=>expectProgram(source,runOracle(source).stdout));
