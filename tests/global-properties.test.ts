import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

const cases:[string,string][]=[
 ['global identity','console.log(globalThis===this,globalThis.globalThis===globalThis);function f(){return globalThis===this;}console.log(f());'],
 ['bare var preserves existing value','var globalThis;console.log(globalThis===this);'],
 ['write updates property','let g=this;globalThis=7;console.log(globalThis,g.globalThis);g.globalThis=9;console.log(globalThis);'],
 ['var initializer updates configurable property','var globalThis=4;console.log(globalThis,this.globalThis,delete this.globalThis,typeof globalThis);'],
 ['delete identifier and recreate','let g=this;console.log(delete globalThis,typeof globalThis,"globalThis" in g);globalThis=5;console.log(g.globalThis,globalThis);'],
 ['undefined property differs from absent','globalThis=undefined;console.log(globalThis,"globalThis" in this);delete this.globalThis;console.log(typeof globalThis);'],
 ['lexical shadow preserves global property','let globalThis=3;console.log(globalThis,typeof this.globalThis);{let globalThis=4;console.log(globalThis);}console.log(globalThis);'],
 ['parameters and local var shadow','function f(globalThis){return globalThis+1;}function g(){var globalThis=8;return globalThis;}console.log(f(3),g(),typeof globalThis);'],
 ['hoisted function replaces global property','console.log(globalThis(),this.globalThis===globalThis);function globalThis(){return 12;}console.log(delete this.globalThis,typeof globalThis);'],
 ['compound updates use property binding','globalThis=4;console.log(globalThis++,++globalThis,globalThis+=2,this.globalThis);'],
 ['closures observe later property changes','function read(){return globalThis;}let g=this;globalThis={text:""+42};for(let i=0;i<20;i++){({text:""+i});}console.log(read().text);g.globalThis={text:""+57};console.log(read().text);'],
 ['inherited global property remains a binding','let g=this;delete g.globalThis;g.__proto__={globalThis:8};console.log(globalThis,typeof globalThis,delete globalThis,globalThis);globalThis=9;console.log(globalThis,g.__proto__.globalThis);'],
];
for(const [name,source] of cases)test('global property binding: '+name,()=>{
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('reading deleted builtin identifier is an error',()=>{
 const source='delete this.globalThis;globalThis;';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
