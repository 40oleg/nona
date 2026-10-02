import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';
import {runOracle} from './helpers/oracle.js';

const cases=[
 'let o={x:8,m(){for(let i=0;i<20;i++)({v:""+i});return this.x;}};console.log(o?.m());',
 'let key={toString(){for(let i=0;i<20;i++)({v:""+i});return "x";}};let o={x:{y:9}};console.log(o?.[key].y);',
 'let o={m:function(a){return this.x+a;},x:2};function arg(){for(let i=0;i<20;i++)({v:""+i});return 5;}console.log(o.m?.(arg()));',
 'let o={x:"alive",m:function(v){return this.x+v;}};function drop(){o=null;for(let i=0;i<30;i++)({v:""+i});return "!";}console.log((o?.m)?.(drop()));',
];
for(const source of cases)test('optional chain values survive stress GC: '+source.slice(0,28),()=>{
 const image=linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true}));
 const run=runNative(image);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
