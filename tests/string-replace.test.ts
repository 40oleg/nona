import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

// Pinned: the pinned Test262 (and V8 >= 13) skip Symbol-keyed methods on primitive
// arguments; older Node versions still read them.
const pinnedReplace:Record<string,string>={'primitive search skips Symbol.replace getter':'aXb1c\n'};
for(const [name,source] of [
 ['first string match',`console.log('ababa'.replace('ba','X'),'abc'.replace('x','Y'),'abc'.replace('','X'),'😀😀'.replace('😀','x'));`],
 ['substitution patterns',"console.log('a,b,c'.replace(',', "+JSON.stringify("[$$][$&][$`][$'][$1][$<x>]")+"));"],
 ['functional replacement arguments',`var s='';console.log('abcabc'.replace('bc',function(m,p,x){s+=m+':'+p+':'+x;return 7;}),s);`],
 ['conversion order even on no match',`var s='';var r={toString(){s+='r';return 'abc'}},q={toString(){s+='q';return 'x'}},v={toString(){s+='v';return '!'}};console.log(String.prototype.replace.call(r,q,v),s);`],
 ['Symbol.replace before receiver conversion',`var s='';var r={toString(){throw Error('bad')}},q={[Symbol.replace](x,v){s+='q';return [x===r,v]}};console.log(String.prototype.replace.call(r,q,3).join('|'),s);`],
 ['primitive search skips Symbol.replace getter',`Object.defineProperty(Number.prototype,Symbol.replace,{get(){throw Error('bad')}});console.log('a1b1c'.replace(1,'X'));`],
 ['metadata and receiver errors',`console.log(String.prototype.replace.length,String.prototype.replace.name);for(var x of [null,undefined])try{String.prototype.replace.call(x,'a','b')}catch(e){console.log(e.name)}`],
] as [string,string][])test(`String.replace: ${name}`,()=>expectProgram(source,pinnedReplace[name]??runOracle(source).stdout));

test('String.replace retains values under stress GC',()=>{
 const source=`var r={toString(){for(var i=0;i<30;i++)({v:i});return 'a,b'}},q={toString(){for(var i=0;i<30;i++)({v:i});return ','}},v={toString(){for(var i=0;i<30;i++)({v:i});return '$&X'}};console.log(String.prototype.replace.call(r,q,v));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
