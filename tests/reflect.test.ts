import {test} from 'node:test';
import {runOracle} from './helpers/oracle.js';
import {expectProgram} from './helpers/program.js';

test('Reflect intrinsic key order and tag',()=>{
 const source='console.log(Object.getOwnPropertyNames(Reflect).join("|"),Object.prototype.toString.call(Reflect));';
 expectProgram(source,runOracle(source).stdout);
});
