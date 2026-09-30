import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

// Pinned: the pinned Test262 (and V8 >= 13) skip Symbol-keyed methods on primitive
// arguments; older Node versions still read them.
const pinnedSplit:Record<string,string>={'primitive separator skips Symbol.split getter':'a|b|c\n'};
for(const [name,source] of [
 ['string separator and trailing fields',`console.log('a,b,,'.split(',').join('|'),'abc'.split('x').join('|'),'abc'.split('').join('|'),'😀'.split('').length);`],
 ['limits and empty inputs',`console.log('a,b,c'.split(',',2).join('|'),'a,b'.split(',',0).length,'a,b'.split(',',undefined).length,''.split('').length,''.split(',').length);`],
 ['generic receiver and metadata',`console.log(String.prototype.split.call(123,'2').join('|'),String.prototype.split.call(true,'r').join('|'),String.prototype.split.length,String.prototype.split.name);`],
 ['Symbol.split hook before receiver coercion',`var s='';var receiver={toString(){s+='r';return 'abc'}},sep={[Symbol.split](v,limit){s+='s';return [v===receiver,limit]}};console.log(String.prototype.split.call(receiver,sep,2).join('|'),s);`],
 ['primitive separator skips Symbol.split getter',`Object.defineProperty(Number.prototype,Symbol.split,{get(){throw Error('bad')}});console.log('a1b1c'.split(1).join('|'));`],
 ['separator coercion before zero limit result',`var s='';var sep={toString(){s+='x';return ','}};console.log('a,b'.split(sep,0).length,s);`],
] as [string,string][])test(`String.split: ${name}`,()=>expectProgram(source,pinnedSplit[name]??runOracle(source).stdout));

test('String.split retains receiver and separator during stress GC',()=>{
 const source=`var r={toString(){for(var i=0;i<30;i++)({x:i});return 'a,b,c'}},s={toString(){for(var i=0;i<30;i++)({y:i});return ','}};console.log(String.prototype.split.call(r,s).join('|'));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
