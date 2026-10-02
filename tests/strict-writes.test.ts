import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
const cases=[
 'let o={};Object.defineProperty(o,"x",{value:1});o.x=2;',
 'let p={};Object.defineProperty(p,"x",{value:1});let o=Object.create(p);o.x=2;',
 'let o={get x(){return 1;}};o.x=2;',
 'let o=Object.preventExtensions({});o.x=2;',
 'let s="abc";s.x=1;', 'let s="abc";s[0]="x";', 'let n=3;n.x=1;',
 'let a=[];Object.defineProperty(a,"length",{writable:false});a.length=1;',
 'let a=[];Object.defineProperty(a,"length",{writable:false});a[0]=1;',
 'let a=[0,1,2];Object.defineProperty(a,1,{configurable:false});a.length=0;',
 'let o={};Object.defineProperty(o,"x",{});delete o.x;', 'delete "abc"[0];',
 'Object.defineProperty(globalThis,"Object",{writable:false});Object=1;',
 'undefined=(console.log("rhs"),1);', 'NaN=1;', 'Infinity++;',
 'let p={};Object.defineProperty(p,"x",{value:1});let o={__proto__:p,m(){super.x=2;}};o.m();',
];
for(const body of cases)test('strict failed write/delete: '+body,()=>{
 const source='"use strict";try{'+body+'console.log("bad");}catch(e){console.log(e.name);}';
 const expected=runOracle(source),result=runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.toString(),expected.stdout);
});
