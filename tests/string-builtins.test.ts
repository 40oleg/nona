import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';

const cases:[string,string][]=[
 ['basic matches',`console.log('abracadabra'.includes('bra'),'abracadabra'.includes('xyz'),'abc'.includes(''),''.includes(''));`],
 ['indexOf and lastIndexOf basics',`console.log('ababa'.indexOf('ba'),'ababa'.indexOf('ba',2),'ababa'.lastIndexOf('ba'),'ababa'.lastIndexOf('ba',2),'ababa'.lastIndexOf('xy'),String.prototype.indexOf.length,String.prototype.lastIndexOf.length);`],
 ['indexOf and lastIndexOf empty search',`console.log('abc'.indexOf('',Infinity),'abc'.indexOf('',-Infinity),'abc'.lastIndexOf('',Infinity),'abc'.lastIndexOf('',-Infinity),'abc'.lastIndexOf('',undefined),'abc'.lastIndexOf('',NaN));`],
 ['indexOf and lastIndexOf UTF16',`console.log('😀x😀'.indexOf('😀',1),'😀x😀'.lastIndexOf('😀',3),'😀x😀'.indexOf('\\ud83d',1),'😀x😀'.lastIndexOf('\\ude00'));`],
 ['indexOf and lastIndexOf coercion',`var s='';var o={toString(){s+='r';return 'abcabc';}},q={toString(){s+='q';return 'bc';}},p={valueOf(){s+='p';return 4.8;}};console.log(String.prototype.indexOf.call(o,q,p),s);s='';console.log(String.prototype.lastIndexOf.call(o,q,p),s);`],
 ['String.fromCharCode code units',`console.log(String.fromCharCode(65,66,67),String.fromCharCode(0x1f600).charCodeAt(0),String.fromCharCode(-1).charCodeAt(0),String.fromCharCode().length,String.fromCharCode.length);`],
 ['String.fromCharCode conversions',`var s='';var a={valueOf(){s+='a';return 65.9;}},b={valueOf(){s+='b';return 66;}};console.log(String.fromCharCode(a,b),s);`],
 ['String.fromCodePoint BMP and surrogate pairs',`var s=String.fromCodePoint(65,0x1f600,0xffff);console.log(s.length,s.charCodeAt(0),s.charCodeAt(1),s.charCodeAt(2),s.charCodeAt(3),String.fromCodePoint().length,String.fromCodePoint.length);`],
 ['String.fromCodePoint validates each code point',`var values=[-1,0x110000,1.5,NaN,Infinity,-Infinity];for(var v of values){try{String.fromCodePoint(v);console.log('ok')}catch(e){console.log(e.name)}}try{String.fromCodePoint(Symbol())}catch(e){console.log(e.name)}`],
 ['String.fromCodePoint coercion order',`var s='';var a={valueOf(){s+='a';return 65;}},b={valueOf(){s+='b';return 0x1f600;}};console.log(String.fromCodePoint(a,b),s);`],
 ['String.raw template and substitutions',`console.log(String.raw({raw:['a','b','c']},1,2),String.raw({raw:['a','b','c']},1),String.raw({raw:[]}),String.raw.length);`],
 ['String.raw tagged template',`console.log(String.raw\`a\\nb\${3}c\`);`],
 ['String.raw getters and conversion order',`var s='';var raw={get length(){s+='l';return 2},get 0(){s+='a';return {toString(){s+='A';return 'x'}}},get 1(){s+='b';return 'y'}};var value={toString(){s+='v';return '!'}};console.log(String.raw({raw:raw},value),s);`],
 ['String.raw primitive raw and missing segment',`console.log(String.raw({raw:'ab'},'!'),String.raw({raw:{length:2,0:'a'}},'x'));`],
 ['String.concat values and metadata',`console.log('a'.concat('b',3,null,undefined),'😀'.concat('x').length,String.prototype.concat.call(123,'x'),String.prototype.concat.length);`],
 ['String.concat coercion order',`var s='';var o={toString(){s+='r';return 'a';}},a={toString(){s+='a';return 'b';}},b={toString(){s+='b';return 'c';}};console.log(String.prototype.concat.call(o,a,b),s);`],
 ['String.concat zero arguments and receiver errors',`console.log('abc'.concat(),String.prototype.concat.call(true));for(var x of [null,undefined])try{String.prototype.concat.call(x,'a')}catch(e){console.log(e.name)}`],
 ['String.toUpperCase Unicode',`console.log('abc 123 à ß ﬃ ı 𐐨'.toUpperCase());console.log('😀\ud800\udc00\ud800x'.toUpperCase().length,String.prototype.toUpperCase.call(123),String.prototype.toUpperCase.length);`],
 ['String.toUpperCase generic and errors',`var s='';var x={toString(){s+='x';return 'Straße';}};console.log(String.prototype.toUpperCase.call(x),s);for(var v of [null,undefined])try{String.prototype.toUpperCase.call(v)}catch(e){console.log(e.name)}`],
 ['String.toLowerCase Unicode and final sigma',`console.log('ABC À İ 𐐀'.toLowerCase());console.log('AΣ AΣB A.Σ AΣ.b AͅΣ AΣͅB'.toLowerCase(),String.prototype.toLowerCase.length);`],
 ['String locale casing default Unicode and metadata',`console.log('abc ß 𐐨'.toLocaleUpperCase(),'AΣ İ 𐐀'.toLocaleLowerCase(),String.prototype.toLocaleUpperCase.length,String.prototype.toLocaleLowerCase.length,String.prototype.toLocaleUpperCase.name,String.prototype.toLocaleLowerCase.name);`],
 ['String normalization forms, combining marks, and Hangul',`console.log('é'.normalize('NFD').length,'e\u0301'.normalize('NFC'),'Å'.normalize('NFKD'),'각'.normalize('NFD').length,'각'.normalize('NFC'),'햕'.normalize('NFC'),'़̣̀'.normalize('NFD'),String.prototype.normalize.length);`],
 ['String normalization form coercion and errors',`var s='';var x={toString(){s+='x';return 'e\u0301'}},f={toString(){s+='f';return 'NFC'}};console.log(String.prototype.normalize.call(x,f),s);for(var q of ['bad',Symbol()])try{'x'.normalize(q)}catch(e){console.log(e.name)}`],
 ['String localeCompare canonical equivalence and coercion',`var order='';var x={toString(){order+='x';return 'Å'}},y={toString(){order+='y';return 'A\u030A'}};console.log(String.prototype.localeCompare.call(x,y),order,'가'.localeCompare('가'),'a'.localeCompare('b'),'b'.localeCompare('a'),String.prototype.localeCompare.length);`],
 ['String.toLowerCase generic and errors',`var s='';var x={toString(){s+='x';return 'AΣ';}};console.log(String.prototype.toLowerCase.call(x),s);for(var v of [null,undefined])try{String.prototype.toLowerCase.call(v)}catch(e){console.log(e.name)}`],
 ['positions',`console.log('abcabc'.includes('ab',1),'abcabc'.includes('ab',3),'abc'.includes('a',Infinity),'abc'.includes('',Infinity),'abc'.includes('a',-5),'abc'.includes('b',1.9));`],
 ['UTF16 code units',`console.log('😀x'.includes('😀'),'😀x'.includes('\ud83d'),'😀x'.includes('x',2));`],
 ['generic and conversions',`var s='';var o={toString:function(){s+='r';return 'abc';}},q={toString:function(){s+='s';return 'b';}},p={valueOf:function(){s+='p';return 1;}};console.log(String.prototype.includes.call(o,q,p),s,String.prototype.includes.call(123,'2'));`],
 ['Symbol.match false',`var o={toString:function(){return 'bc';}};o[Symbol.match]=false;console.log('abc'.includes(o));`],
 ['startsWith and endsWith positions',`console.log('abcabc'.startsWith('bc',1),'abcabc'.startsWith('bc',4),'abcabc'.endsWith('bc'),'abcabc'.endsWith('ab',4),'abcabc'.endsWith('bc',2),'abc'.endsWith('',-1));`],
 ['startsWith and endsWith generic conversion',`var s='';var o={toString(){s+='r';return 'abc';}},q={toString(){s+='q';return 'bc';}},p={valueOf(){s+='p';return 3;}};console.log(String.prototype.endsWith.call(o,q,p),s,String.prototype.startsWith.call(123,'2',1));`],
 ['startsWith and endsWith bounds and metadata',`console.log('abc'.startsWith('a',-Infinity),'abc'.startsWith('c',Infinity),'abc'.endsWith('abc',Infinity),'abc'.endsWith('abc',-Infinity),String.prototype.startsWith.length,String.prototype.endsWith.length);`],
 ['charCodeAt and codePointAt UTF16',`console.log('😀x'.charCodeAt(0),'😀x'.charCodeAt(1),'😀x'.codePointAt(0),'😀x'.codePointAt(1),'😀x'.codePointAt(2));`],
 ['charCodeAt and codePointAt bounds',`console.log('abc'.charCodeAt()===97,'abc'.codePointAt()===97,'abc'.charCodeAt(-1)!=='abc'.charCodeAt(-1),'abc'.codePointAt(-1)===undefined,'abc'.charCodeAt(3)!=='abc'.charCodeAt(3),'abc'.codePointAt(3)===undefined);`],
 ['charCodeAt and codePointAt conversions',`var s='';var o={toString(){s+='r';return 'abc';}},p={valueOf(){s+='p';return 1.8;}};console.log(String.prototype.charCodeAt.call(o,p),s,String.prototype.codePointAt.call(123,1),String.prototype.charCodeAt.length,String.prototype.codePointAt.length);`],
 ['charCodeAt negative fractional positions',`console.log('abc'.charCodeAt(-.9),'abc'.codePointAt(-.9),'abc'.charCodeAt(-1));`],
 ['charAt UTF16, bounds and conversions',`console.log('😀x'.charAt(0).length,'😀x'.charAt(1).charCodeAt(0),'abc'.charAt(2),'abc'.charAt(3)==='',String.prototype.charAt.call(123,1),String.prototype.charAt.length);`],
 ['charAt negative fractional position',`console.log('abc'.charAt(-.9),'abc'.charAt(-1)==='');`],
 ['substring bounds, swap and UTF16',`console.log('abcdef'.substring(1,4),'abcdef'.substring(4,1),'abcdef'.substring(-2,2),'abcdef'.substring(3,Infinity),'abcdef'.substring(4,4)==='','😀x'.substring(0,2));`],
 ['substring conversions and metadata',`var s='';var o={toString(){s+='r';return 'abc';}},a={valueOf(){s+='a';return 2;}},b={valueOf(){s+='b';return 1;}};console.log(String.prototype.substring.call(o,a,b),s,String.prototype.substring.length);`],
 ['substring explicit undefined end',`console.log('undefined'.substring('e',undefined),'abcdef'.substring(2,undefined));`],
 ['slice negative positions and order',`console.log('abcdef'.slice(1,4),'abcdef'.slice(-4,-1),'abcdef'.slice(4,1)==='','abcdef'.slice(-100,100),'abcdef'.slice(-.9),'abcdef'.slice(2,undefined));`],
 ['slice generic and UTF16',`var s='';var o={toString(){s+='r';return '😀abc';}},p={valueOf(){s+='p';return 2;}};console.log(String.prototype.slice.call(o,p,-1),s,String.prototype.slice.length);`],
 ['repeat basic and conversions',`console.log('ab'.repeat(3),'😀'.repeat(2),'x'.repeat(0)==='',String.prototype.repeat.call(12,2),'x'.repeat(-.5)==='',String.prototype.repeat.length);`],
 ['repeat coercion order',`var s='';var o={toString(){s+='r';return 'xy';}},n={valueOf(){s+='n';return 2.9;}};console.log(String.prototype.repeat.call(o,n),s);`],
 ['repeat empty with large finite count',`console.log(''.repeat(2147483647)==='');`],
 ['trim whitespace and directions',`console.log(' \\t\\nabc\\r '.trim(),' \\t\\nabc\\r '.trimStart()+'|','|'+(' \\t\\nabc\\r '.trimEnd()),'\\u00a0\\u2000x\\u2029\\ufeff'.trim());`],
 ['trim generic and metadata',`var s='';var o={toString(){s+='r';return '  abc  ';}};console.log(String.prototype.trim.call(o),String.prototype.trimStart.call(o),String.prototype.trimEnd.call(o),s,String.prototype.trim.length,String.prototype.trimStart.length,String.prototype.trimEnd.length);`],
 ['trim aliases share identity',`console.log(String.prototype.trimLeft===String.prototype.trimStart,String.prototype.trimRight===String.prototype.trimEnd,String.prototype.trimLeft.name,String.prototype.trimRight.name,' x '.trimLeft()+'|','|'+(' x '.trimRight()));`],
 ['padStart and padEnd basics',`console.log('x'.padStart(5,'ab'),'x'.padEnd(6,'ab'),'abc'.padStart(2),'abc'.padEnd(3),'a'.padStart(4),'',String.prototype.padStart.length,String.prototype.padEnd.length);`],
 ['padding UTF16 and default',`console.log('😀'.padStart(5,'😀').length,'😀'.padEnd(5,'😀').length,'x'.padStart(3),'x'.padEnd(3,undefined),'x'.padStart(4,'').length);`],
 ['padding coercion order',`var s='';var o={toString(){s+='r';return 'x';}},n={valueOf(){s+='n';return 5.9;}},p={toString(){s+='p';return 'ab';}};console.log(String.prototype.padStart.call(o,n,p),s);`],
 ['padding skips fill conversion',`var s='';var p={toString(){s+='p';return 'z';}};console.log('abc'.padEnd(2,p),'abc'.padStart(NaN,p),s);`],
];
for(const [name,source] of cases)test(`String.includes: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('String.includes: truthy Symbol.match throws',()=>{
 const source=`var o={};o[Symbol.match]=true;'abc'.includes(o);`;
 const run=runNative(linkHost(generate(compileToIR(source))));
 assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});

test('String.includes: coercion survives stress GC',()=>{
 const source=`var x={toString:function(){for(var i=0;i<30;i++)({v:i});return 'abc';}},y={toString:function(){for(var i=0;i<30;i++)({v:i});return 'bc';}};console.log(String.prototype.includes.call(x,y));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.fromCodePoint: coercion retains buffer under stress GC',()=>{
 const source=`var a={valueOf(){for(var i=0;i<40;i++)({v:i});return 65;}},b={valueOf(){for(var i=0;i<40;i++)({v:i});return 0x1f600;}};console.log(String.fromCodePoint(a,b).length);`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.raw: getters retain raw and result under stress GC',()=>{
 const source=`var raw={length:2,get 0(){for(var i=0;i<40;i++)({v:i});return 'a'},get 1(){for(var i=0;i<40;i++)({v:i});return 'b'}};var sub={toString(){for(var i=0;i<40;i++)({v:i});return '!'}};console.log(String.raw({raw:raw},sub));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.concat: receiver and arguments survive stress GC',()=>{
 const source=`var o={toString(){for(var i=0;i<40;i++)({v:i});return 'a'}},a={toString(){for(var i=0;i<40;i++)({v:i});return 'b'}},b={toString(){for(var i=0;i<40;i++)({v:i});return 'c'}};console.log(String.prototype.concat.call(o,a,b));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.toUpperCase: coerced source survives stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<40;i++)({v:i});return 'Straße 𐐨 ﬃ';}};console.log(String.prototype.toUpperCase.call(x));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.toLowerCase: coerced source survives stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<40;i++)({v:i});return 'AΣ 𐐀 İ';}};console.log(String.prototype.toLowerCase.call(x));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String locale casing: coerced source survives stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<40;i++)({v:i});return 'AΣ Straße';}};console.log(String.prototype.toLocaleLowerCase.call(x),String.prototype.toLocaleUpperCase.call(x));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.normalize: coerced source and form survive stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<40;i++)({v:i});return 'Å각e\u0301'}},f={toString(){for(var i=0;i<40;i++)({v:i});return 'NFKD'}};console.log(String.prototype.normalize.call(x,f));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.localeCompare: inputs survive coercion and normalization under stress GC',()=>{
 const source=`var a={toString(){for(var i=0;i<40;i++)({v:i});return 'e\u0301'}},b={toString(){for(var i=0;i<40;i++)({v:i});return 'é'}};console.log(String.prototype.localeCompare.call(a,b));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.substring and charAt: dynamic strings survive stress GC',()=>{
 const source=`var s=['ab','😀','cd'].join('');var p={valueOf(){for(var i=0;i<40;i++)({v:i});return 1;}};console.log(s.substring(p,4),s.charAt(2).charCodeAt(0));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.repeat: source survives count coercion under stress GC',()=>{
 const source=`var s=['a','😀'].join(''),n={valueOf(){for(var i=0;i<40;i++)({v:i});return 3;}};console.log(s.repeat(n));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.padStart and padEnd: source and fill survive stress GC',()=>{
 const source=`var s=['x','😀'].join(''),n={valueOf(){for(var i=0;i<40;i++)({v:i});return 8;}},p={toString(){for(var i=0;i<40;i++)({v:i});return ['a','b'].join('');}};console.log(s.padStart(n,p),s.padEnd(n,p));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('String.fromCharCode: output survives argument callbacks under stress GC',()=>{
 const source=`var a={valueOf(){for(var i=0;i<40;i++)({v:i});return 65;}},b={valueOf(){for(var i=0;i<40;i++)({v:i});return 66;}};console.log(String.fromCharCode(a,b,67));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
