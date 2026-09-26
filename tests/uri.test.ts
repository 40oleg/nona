import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

for(const [name,source] of [
 ['ASCII escape sets',`console.log(encodeURI(";/?:@&=+$,# -_.!~*'()"),encodeURIComponent(";/?:@&=+$,# -_.!~*'()"));`],
 ['UTF-8 scalar widths',`console.log(encodeURI('é€😀'),encodeURIComponent('é€😀'));`],
 ['malformed surrogate errors',`for(var f of [encodeURI,encodeURIComponent])for(var s of ['\\uD800','\\uDC00','\\uD800A']){try{f(s);console.log('bad');}catch(e){console.log(e instanceof URIError);}}`],
 ['metadata and coercion',`var s='';var x={toString(){s+='x';return 'a b';}};console.log(encodeURI(x),s,encodeURI(),encodeURI.length,encodeURIComponent.length);`],
] as [string,string][])test(`URI encoding: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('URI encoding retains coerced string under stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<60;i++)({x:i});return 'a 😀 b';}};console.log(encodeURI(x),encodeURIComponent(x));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
