import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

for(const [name,source] of [
 ['ASCII escape sets',`console.log(encodeURI(";/?:@&=+$,# -_.!~*'()"),encodeURIComponent(";/?:@&=+$,# -_.!~*'()"));`],
 ['UTF-8 scalar widths',`console.log(encodeURI('é€😀'),encodeURIComponent('é€😀'));`],
 ['malformed surrogate errors',`for(var f of [encodeURI,encodeURIComponent])for(var s of ['\\uD800','\\uDC00','\\uD800A']){try{f(s);console.log('bad');}catch(e){console.log(e instanceof URIError);}}`],
 ['metadata and coercion',`var s='';var x={toString(){s+='x';return 'a b';}};console.log(encodeURI(x),s,encodeURI(),encodeURI.length,encodeURIComponent.length);`],
] as [string,string][])test(`URI encoding: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('URI encoding retains coerced string under stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<60;i++)({x:i});return 'a 😀 b';}};console.log(encodeURI(x),encodeURIComponent(x));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

for(const [name,source] of [
 ['reserved escapes',`console.log(decodeURI('%3b%2F%3f%3A%40%26%3D%2B%24%2C%23'),decodeURIComponent('%3b%2F%3f%3A%40%26%3D%2B%24%2C%23'));`],
 ['UTF-8 round trips',`var s='é€😀';console.log(decodeURI(encodeURI(s)),decodeURIComponent(encodeURIComponent(s)));`],
 ['malformed UTF-8',`for(var s of ['%','%0','%GG','%C0%80','%E0%80%80','%ED%A0%80','%F4%90%80%80','%E2%28%A1','%F0%9F%98']){try{decodeURIComponent(s);console.log('bad');}catch(e){console.log(e instanceof URIError);}}`],
 ['metadata and coercion',`var s='';var x={toString(){s+='x';return '%20';}};console.log(decodeURI(x),s,decodeURI(),decodeURI.length,decodeURIComponent.length);`],
] as [string,string][])test(`URI decoding: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('URI decoding retains coerced string under stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<60;i++)({x:i});return 'a%20%F0%9F%98%80%20b';}};console.log(decodeURI(x),decodeURIComponent(x));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
