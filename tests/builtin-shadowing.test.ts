import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {expectProgram} from './helpers/program.js';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

function expectNativeOracle(source:string){
  const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))))));
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr.toString());
  assert.equal(result.stdout.toString(),runOracle(source).stdout);
}

const cases:[string,string][]=[
  ['function locals shadow immutable globals',
    'function f(undefined,NaN,Infinity){console.log(undefined,NaN,Infinity);}f(1,2,3);console.log(globalThis.undefined,globalThis.NaN,globalThis.Infinity);'],
  ['nested lexical shadows constructors and console',
    'let Object=7;{let console={log:function(v){globalThis.saved=v;}};console.log(Object+1);}globalThis.console.log(saved,typeof globalThis.Object);'],
  ['ordinary console method replacement',
    'let old=console.log;console.log=function(v){globalThis.saved=v;};console.log(9);old(saved);console.log=old;'],
  ['console can be passed and detached',
    'function use(c){let log=c.log;log("ok");}use(console);'],
];

for(const [name,source] of cases)test('builtin shadowing: '+name,()=>expectNativeOracle(source));

test('intrinsic global and console descriptors',()=>{
  const source='function show(o,k){let d=Object.getOwnPropertyDescriptor(o,k);console.log(d.writable,d.enumerable,d.configurable);}show(globalThis,"undefined");show(globalThis,"NaN");show(globalThis,"Infinity");show(globalThis,"console");show(console,"log");console.log(console.log.name,console.log.length);';
  expectProgram(source,'false false false\nfalse false false\nfalse false false\ntrue false true\ntrue false true\nlog 0\n');
});

test('global lexical cannot shadow immutable intrinsic',()=>{
  const options={fileName:'builtin-shadowing.js',target:'win32-x64' as const};
  assert.equal(compile('let undefined=1;',options).ok,false);
  assert.equal(compile('function f(){let undefined=1;return undefined;}',options).ok,true);
});
