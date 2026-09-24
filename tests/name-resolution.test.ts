import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {expectProgram} from './helpers/program.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

function native(source:string,gcStress=false){
  const image=linkPe(generate(lower(bind(parse(lex(source)))),{gcStress}));
  return runNative(image);
}

function expectNativeOracle(source:string,options:{gcStress?:boolean}={}){
  const result=native(source,options.gcStress);
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr.toString());
  assert.equal(result.stdout.toString(),runOracle(source).stdout);
}

const cases:[string,string][]=[
  ['sloppy assignment creates global property',
    'missing=7;let d=Object.getOwnPropertyDescriptor(globalThis,"missing");console.log(missing,globalThis.missing,d.writable,d.enumerable,d.configurable);'],
  ['missing read is catchable ReferenceError',
    'try{console.log(missing);}catch(e){console.log(e.name);}console.log(typeof missing);'],
  ['missing call and update fail before later effects',
    'try{missing(console.log("bad"));}catch(e){console.log(e.name);}try{missing++;}catch(e){console.log(e.name);}'],
  ['inherited global binding uses ordinary receiver',
    'globalThis.__proto__={x:3};console.log(x);x=4;console.log(x,globalThis.hasOwnProperty("x"),globalThis.__proto__.x);'],
  ['sloppy unresolved reference survives RHS creation',
    'missing=(globalThis.missing=1,2);console.log(missing,globalThis.missing);'],
];

for(const [name,source] of cases)test('dynamic global: '+name,()=>expectNativeOracle(source));

test('strict missing reference is preserved across RHS creation',()=>{
  expectProgram('"use strict";try{missing=(globalThis.missing=1,2);}catch(e){console.log(e.name);}console.log(globalThis.missing);',
    'ReferenceError\n1\n');
});

test('dynamic global values survive callbacks and stress GC',()=>{
  const source='missing={text:""+42};function read(){return missing;}for(let i=0;i<30;i++){({x:""+i});}console.log(read().text);delete globalThis.missing;try{read();}catch(e){console.log(e.name);}';
  expectNativeOracle(source,{gcStress:true});
});
