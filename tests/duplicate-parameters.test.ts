import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

const cases:[string,string][]=[
 ['last duplicate parameter determines binding and length','function f(a,a){return a;}console.log(f(1,2),f(1),f.length);'],
 ['only rightmost duplicate argument is mapped','function f(a,a){a=8;console.log(arguments[0],arguments[1]);arguments[0]=9;console.log(a);arguments[1]=10;console.log(a);}f(1,2);'],
 ['missing rightmost duplicate prevents earlier mapping','function f(a,a){a=8;console.log(arguments[0],arguments[1]);arguments[0]=9;arguments[1]=10;console.log(a,arguments[0],arguments[1]);}f(1);'],
 ['interleaved duplicate names map their last positions','function f(a,b,a,b){a=8;b=9;console.log(arguments[0],arguments[1],arguments[2],arguments[3]);}f(1,2,3,4);f(1,2,3);'],
 ['duplicate parameter captured by closure','function f(a,a){return function(){return ++a;};}let g=f(2,7);console.log(g(),g());'],
 ['hoisted function replaces rightmost duplicate binding','function f(a,a){function a(){return 7;}console.log(arguments[0],arguments[1]===a,a());}f(1,2);'],
 ['duplicate arguments named parameter shadows implicit binding','function f(arguments,arguments){return arguments;}console.log(f(2,5),f(2));'],
 ['deleting last duplicate mapping does not map earlier index','function f(a,a){delete arguments[1];a=8;arguments[0]=9;console.log(a,arguments[0],arguments[1]);}f(1,2);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
test('escaped duplicate arguments preserve only rightmost mapping with stress GC',()=>{
 const source='function f(a,a){return {args:arguments,get:function(){return a;}};}let p=f(""+1,""+2);p.args[0]=""+8;p.args[1]=""+9;for(let i=0;i<30;i++){({x:i});}console.log(p.args[0],p.get());';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
