import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

test('RegExp literal and constructor allocate native objects',()=>expectProgram(`
  let literal=/ab+/gi;
  let constructed=new RegExp('cd','m');
  console.log(typeof literal,literal instanceof RegExp,Object.getPrototypeOf(literal)===RegExp.prototype,literal.lastIndex);
  console.log(typeof constructed,constructed instanceof RegExp,constructed.lastIndex);
  literal.lastIndex=3;console.log(literal.lastIndex);
  console.log(literal.source,literal.flags,new RegExp('x','ig').flags,RegExp.prototype.source,RegExp.prototype.flags);
  console.log(literal.toString(),RegExp.prototype.toString.call({source:'x',flags:'m'}));
`,'object true true 0\nobject true 0\n3\nab+ gi gi (?:) \n/ab+/gi /x/m\n'));

test('RegExp object tag survives an own toString override',()=>expectProgram(`
  let regexp=new RegExp('x');
  regexp.toString=Object.prototype.toString;
  console.log(regexp.toString(),Object.prototype.toString.call(/y/));
  regexp[Symbol.toStringTag]='Custom';
  console.log(regexp.toString());
`,'[object RegExp] [object RegExp]\n[object Custom]\n'));

test('RegExp anchors inside a pattern use full matching semantics',()=>expectProgram(`
  console.log(/^..^e/.test('ab\\ncde'),/^^^^^^^robot$$$$/.test('robot'));
  console.log(/^a^/.test('a'),/a$b/.test('ab'));
`,'false true\nfalse false\n'));

test('Unicode RegExp rejects a standalone closing bracket',()=>expectProgram(`
  try{new RegExp(']','u')}catch(error){console.log(error.name)}
  console.log(new RegExp(']').test(']'));
`,'SyntaxError\ntrue\n'));

test('legacy RegExp identity escapes match punctuation',()=>expectProgram(String.raw`
  for(let ch of ['~','!','@','#','%','-',':',';','<','>']){
    let result=new RegExp('\\'+ch).exec(ch);
    if(result===null||result[0]!==ch)throw new Error('identity escape '+ch);
  }
  console.log('ok');
`,'ok\n'));

test('RegExp constructor rejects invalid and repeated flags',()=>expectProgram(`
  for(let flags of ['gg','z','v','uii']){
    try{new RegExp('x',flags)}catch(error){console.log(error.name)}
  }
`,'SyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\n'));

test('RegExp species getter returns its receiver',()=>expectProgram(`
  let getter=Object.getOwnPropertyDescriptor(RegExp,Symbol.species).get;
  let other={name:'other'};
  console.log(RegExp[Symbol.species]===RegExp,getter.call(other)===other);
  console.log(getter.name,getter.length);
  let descriptor=Object.getOwnPropertyDescriptor(RegExp,Symbol.species);
  console.log(descriptor.enumerable,descriptor.configurable,descriptor.set);
`,'true true\nget [Symbol.species] 0\nfalse true undefined\n'));

test('RegExp exec delegates groups, alternatives and repeats to the VM',()=>expectProgram(String.raw`
  let first=/(a+)(b)/.exec('xaab');
  console.log(first[0],first[1],first[2],first.index,first.input,first.groups);
  let second=/(?:ab|cd)\d?/g;
  console.log(second.exec('xcd2')[0],second.lastIndex,second.exec('xcd2'),second.lastIndex);
  console.log(/[Nn]?ever/.exec('Never')[0],/a{2,4}?/.exec('aaaaa')[0]);
`,'aab aa b 1 xaab undefined\ncd2 4 null 0\nNever aa\n'));

test('RegExp VM supports named and numbered backreferences',()=>expectProgram(String.raw`
  let named=/(?<word>ab)\k<word>/.exec('xabab');
  console.log(named[0],named[1],named.groups.word,Object.getPrototypeOf(named.groups)===null);
  let numbered=/(a)(b)\2\1/.exec('abba');
  console.log(numbered[0],numbered[1],numbered[2]);
  let absent=/(a)?\1b/.exec('b');
  console.log(absent[0],absent[1]);
`,'abab ab ab true\nabba a b\nb undefined\n'));

test('RegExp VM reads internal pattern and flags',()=>expectProgram(`
  let re=/(a+)/g;
  Object.defineProperty(re,'source',{get(){throw new Error('source')}});
  Object.defineProperty(re,'flags',{get(){throw new Error('flags')}});
  console.log(re.exec('xaa')[0],re.lastIndex);
`,'aa 3\n'));

test('RegExp VM updates lastIndex with strict Set semantics',()=>expectProgram(`
  let re=/(a+)/g;
  Object.defineProperty(re,'lastIndex',{value:0,writable:false});
  try{re.exec('aa')}catch(error){console.log(error.name)}
  console.log(re.lastIndex);
`,'TypeError\n0\n'));

test('RegExp VM handles lookahead and lookbehind assertions',()=>expectProgram(String.raw`
  console.log(/(?=ab)ab/.exec('xab')[0],/(?!ab)a./.exec('xac')[0]);
  console.log(/(?<=ab)c/.exec('xabc').index,/(?<!ab)c/.exec('xc').index);
  console.log(/(?<=(a)b)c/.exec('abc')[1]);
`,'ab ac\n3 1\na\n'));

test('RegExp VM advances by Unicode code points',()=>expectProgram(String.raw`
  let first=/(.)x/u.exec('𝌆x');
  console.log(first[0],first[1].length,first.index);
  console.log(/\u{1d306}x/u.exec('𝌆x')[0],/(\udf06)/u.exec('𝌆')===null);
  let sticky=/((.))/uy;sticky.lastIndex=1;
  let second=sticky.exec('𝌆');
  console.log(second[0].length,second.index,sticky.lastIndex);
  console.log(/(\D)/u.exec('𝌆')[1].length,/([^a])/u.exec('𝌆')[1].length,/(\d)/u.exec('𝌆'));
`,'𝌆x 2 0\n𝌆x true\n2 0 2\n2 2 null\n'));

test('RegExp constructor rejects structurally incomplete patterns',()=>expectProgram(String.raw`
  for(let pattern of ['(','[',')','a\\']){
    try{new RegExp(pattern)}catch(error){console.log(error.name)}
  }
  console.log(new RegExp('[()]').source,new RegExp('\\(').source);
`,'SyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\n[()] \\(\n'));

test('RegExp constructor validates quantifiers and group grammar before exec',()=>expectProgram(String.raw`
  for(let pattern of ['a**','a{2,1}','(?x)','(?<name>a)(?<name>b)']){
    try{new RegExp(pattern)}catch(error){console.log(error.name)}
  }
  console.log(new RegExp('a{2,3}').source);
`,'SyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\na{2,3}\n'));

test('RegExp constructor validates character class ranges',()=>expectProgram(String.raw`
  for(let pair of [['[z-a]',''],['[\\x7a-a]',''],['[\\d-a]','u'],['[a-\\d]','u'],['[a-\\p{L}]','u']]){
    try{new RegExp(pair[0],pair[1])}catch(error){console.log(error.name)}
  }
  console.log(new RegExp('[a-z]').test('q'),new RegExp('[\\d-a]').test('4'));
`,'SyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\ntrue true\n'));

test('RegExp VM matches decoded character class atoms and ranges',()=>expectProgram(String.raw`
  console.log(/[\x41-\x43]/.test('B'),/[\u0041-\u0043]/.test('C'));
  console.log(/[\u{1F600}-\u{1F602}]/u.test('😁'),/[\d-a]/.test('-'));
  console.log(/[\cA]/.test('\u0001'),/[\b]/.test('\b'));
`,'true true\ntrue true\ntrue true\n'));

test('RegExp constructor validates Unicode escapes and references',()=>expectProgram(String.raw`
  for(let pair of [['\\q','u'],['[\\q]','u'],['\\1','u'],['(a)\\2','u'],['(?<x>a)\\k<y>',''],['(?<x>a)\\k<y>','u'],['\\-','u']]){
    try{new RegExp(pair[0],pair[1])}catch(error){console.log(error.name)}
  }
  console.log(new RegExp('\\k<y>').source,new RegExp('[\\-]','u').test('-'));
  console.log(new RegExp('\\1(a)','u').test('aa'));
`,'SyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\n\\k<y> true\ntrue\n'));

test('RegExp non-Unicode decimal escapes use backreferences or legacy octal',()=>expectProgram(String.raw`
  console.log(new RegExp('\\1').test('\u0001'),new RegExp('\\12').test('\n'));
  console.log(new RegExp('\\8').test('8'),new RegExp('\\18').test('\u00018'));
  console.log(new RegExp('\\400').test(' 0'),new RegExp('\\000').test('\u0000'));
  console.log(new RegExp('[\\1]').test('\u0001'),new RegExp('\\1(a)').test('a'));
  console.log(new RegExp('(a)'.repeat(8)+'\\8').test('a'.repeat(9)));
`,'true true\ntrue true\ntrue true\ntrue true\ntrue\n'));

test('RegExp copies native patterns and call reuses an existing instance',()=>expectProgram(`
  let original=/cat/gi;
  console.log(RegExp(original)===original,RegExp(original,undefined)===original);
  let copy=new RegExp(original),override=new RegExp(original,'m');
  console.log(copy===original,copy.source,copy.flags,copy.lastIndex);
  console.log(override.source,override.flags,RegExp(original,'y')===original);
`,'true true\nfalse cat gi 0\ncat m false\n'));

test('RegExp flag accessors and generic flags getter',()=>expectProgram(`
  let re=new RegExp('x','yimgus');
  console.log(re.global,re.ignoreCase,re.multiline,re.dotAll,re.unicode,re.sticky,re.flags);
  let get=Object.getOwnPropertyDescriptor(RegExp.prototype,'flags').get;
  console.log(get.call({global:1,ignoreCase:0,multiline:'x',dotAll:false,unicode:true,sticky:[]}));
  console.log(RegExp.prototype.global,RegExp.prototype.flags);
`,'true true true true true true gimsuy\ngmuy\nundefined \n'));

test('RegExp source escapes slash and line terminators',()=>expectProgram(String.raw`
  console.log(new RegExp('/').source==='\\/',new RegExp('\n').source==='\\n');
  console.log(new RegExp('\u2028').source==='\\u2028',new RegExp('\u2029').source==='\\u2029');
  console.log(/a\/b/.source==='a\\/b',new RegExp('/').toString()==='/\\//');
`,'true true\ntrue true\ntrue true\n'));

test('RegExp test matches plain UTF-16 substrings without flags',()=>expectProgram(`
  let re=new RegExp('needle');
  console.log(re.test('hay needle stack'),re.test('haystack'),new RegExp('').test('anything'));
  console.log(new RegExp('猫').test('黒猫'),new RegExp('cat').test('concatenate'));
  console.log(new RegExp('a+').test('aaa'));
`,'true false true\ntrue true\ntrue\n'));

test('Unicode dot matches surrogate pairs and updates lastIndex in UTF-16 units',()=>expectProgram(`
  let re=/./ug;
  let first=re.exec('𝌆x'),second=re.exec('𝌆x');
  console.log(first[0],first[0].length,first.index,second[0],second.index,re.lastIndex);
  re.lastIndex=1;let middle=re.exec('𝌆x');
  console.log(middle[0].length,middle.index,re.lastIndex);
  let sticky=/./uy;sticky.lastIndex=1;
  console.log(sticky.exec('𝌆x')[0].length,sticky.lastIndex);
  console.log(/./u.exec('\\nX')[0],/./su.exec('\\nX')[0]==='\\n');
`,'𝌆 2 0 x 2 3\n2 0 2\n2 2\nX true\n'));

test('Unicode search does not start inside a surrogate pair',()=>expectProgram(`
  let low=new RegExp('\\udf06','u');
  console.log(low.exec('\\ud834\\udf06')===null,low.exec('\\udf06').index);
  let plain=new RegExp('\\udf06');
  console.log(plain.exec('\\ud834\\udf06').index);
`,'true 0\n1\n'));

test('Four digit Unicode escapes match code units',()=>expectProgram(String.raw`
  console.log(/\u0041/.exec('xA')[0],/\u0061/.exec('xA'),/\u00E9/.exec('é')[0]);
  let re=/\udf06/uy;re.lastIndex=1;
  console.log(re.exec('\ud834\udf06'),re.lastIndex);
  console.log(/\udf06/u.exec('\udf06')[0].length);
`,'A null é\nnull 0\n1\n'));

test('RegExp exec returns match metadata for plain patterns',()=>expectProgram(`
  let match=new RegExp('猫').exec('黒猫白猫');
  console.log(match[0],match.index,match.input,match.groups,match.length);
  console.log(new RegExp('missing').exec('hay')===null);
  let empty=new RegExp('').exec('abc');console.log(empty[0],empty.index,empty.length);
`,'猫 1 黒猫白猫 undefined 1\ntrue\n 0 1\n'));

test('global and sticky plain matches use lastIndex',()=>expectProgram(`
  let g=/cat/g,s='cat-cat';
  console.log(g.exec(s).index,g.lastIndex,g.exec(s).index,g.lastIndex,g.exec(s),g.lastIndex);
  let y=/cat/y;y.lastIndex=4;
  console.log(y.exec(s).index,y.lastIndex,y.exec(s),y.lastIndex);
  let plain=/cat/;plain.lastIndex=2;
  console.log(plain.exec(s).index,plain.lastIndex);
  let numeric=/cat/g;numeric.lastIndex=3.9;
  console.log(numeric.exec(s).index,numeric.lastIndex);
  let sticky=/cat/y;sticky.lastIndex=1;
  console.log(sticky.exec(s),sticky.lastIndex);
  let empty=new RegExp('','g');empty.lastIndex=2;
  console.log(empty.exec('abc').index,empty.lastIndex);
`,'0 3 4 7 null 0\n4 7 null 0\n0 2\n4 7\nnull 0\n2 2\n'));

test('plain exec converts lastIndex even without global or sticky flags',()=>expectProgram(`
  let count=0,re=/a/;
  re.lastIndex={valueOf(){count++;return 9}};
  console.log(re.exec('ba').index,count,typeof re.lastIndex);
`,'1 1 object\n'));

test('dot wildcard respects line terminators and dotAll',()=>expectProgram(String.raw`
  console.log(/a.c/.test('a猫c'),/a.c/.test('a\nc'),/a.c/s.test('a\nc'));
  console.log(/./.exec('x')[0],/./.exec('\u2028'),/./s.exec('\u2028')[0]==='\u2028');
  let re=/c.t/gy;re.lastIndex=1;console.log(re.exec('xcat').index,re.lastIndex);
`,'true false true\nx null true\n1 4\n'));

test('RegExp matches escaped literals, controls, and digit classes',()=>expectProgram(String.raw`
  let digits=/\d\d/.exec('a42');console.log(digits[0],digits.index);
  let escaped=/a\.b/.exec('xxa.b');console.log(escaped[0],escaped.index);
  let line=/a\nb/.exec('xa\nb');console.log(line[0]==='a\nb',line.index);
  let nonDigit=/\D/.exec('7猫');console.log(nonDigit[0],nonDigit.index);
  let global=/\d/g;console.log(global.exec('a1b2')[0],global.lastIndex,global.exec('a1b2')[0],global.lastIndex,global.exec('a1b2'),global.lastIndex);
`,'42 1\na.b 2\ntrue 1\n猫 1\n1 2 2 4 null 0\n'));

test('RegExp word and whitespace escapes cover ASCII and ES2020 spaces',()=>expectProgram(String.raw`
  console.log(/\w/.exec('猫_A')[0],/\W/.exec('_猫')[0]);
  console.log(/\s/.exec('x\u00a0')[0]==='\u00a0',/\s/.exec('x\u2028')[0]==='\u2028');
  console.log(/\S/.exec('\tQ')[0],/\w/.test('é'),/\W/.test('é'));
`,'_ 猫\ntrue true\nQ false true\n'));

test('RegExp simple character classes and ranges',()=>expectProgram(String.raw`
  console.log(/[Nn]evermore/.exec('Nevermore')[0],/[a-z]d/.exec('xbd')[0]);
  console.log(/[^a-z]/.exec('abc猫')[0],/[]/.exec('a'),/[^]/.exec('\n')[0]==='\n');
  console.log(/[\]]/.exec('x]')[0],/[a-z]/g.exec('a')[0]);
  let re=/[a-z]/gy;re.lastIndex=1;console.log(re.exec('xq').index,re.lastIndex);
  console.log(/[\n]/.exec('x\n')[0]==='\n',/[\b]/.exec('x\b')[0]==='\b');
`,'Nevermore bd\n猫 null true\n] a\n1 2\ntrue true\n'));

test('RegExp character classes include shorthand escapes',()=>expectProgram(String.raw`
  console.log(/[x\d]/.exec('a7')[0],/[\w]/.exec('猫_')[0],/[\s]/.exec('x\u00a0')[0]==='\u00a0');
  console.log(/[^\d]/.exec('7猫')[0],/[\D]/.exec('7猫')[0]);
`,'7 _ true\n猫 猫\n'));

test('RegExp word boundary assertions are zero width',()=>expectProgram(String.raw`
  console.log(/\bcat\b/.exec('a cat!')[0],/\bcat\b/.exec('a cat!').index);
  console.log(/\Bcat/.exec('scat').index,/\b/.exec(' cat').index,/\B/.exec('').index);
  console.log(/\b/.exec('é'),/\B/.exec('猫').index);
`,'cat 2\n1 1 0\nnull 0\n'));

test('RegExp start and end anchors honor multiline mode',()=>expectProgram(String.raw`
  console.log(/^cat/.exec('xcat'),/cat$/.exec('xcat').index);
  console.log(/^cat/m.exec('x\ncat').index,/cat$/m.exec('cat\nx').index);
  console.log(/$/.exec('abc').index,/^/.exec('abc').index);
  console.log(/x$/.exec('x\n'),/x$/m.exec('x\n').index,/^$/m.exec('\n').index);
`,'null 1\n2 0\n3 0\nnull 0 0\n'));

test('RegExp ASCII literals match without case under ignoreCase',()=>expectProgram(`
  let one=/cat/i.exec('xxCAT');console.log(one[0],one.index);
  let re=new RegExp('Ab','gi');console.log(re.exec('xabAB')[0],re.lastIndex,re.exec('xabAB')[0],re.lastIndex);
  console.log(/x/i.test('X'),/x/i.test('猫'));
`,'CAT 2\nab 3 AB 5\ntrue false\n'));

test('RegExp Unicode simple folding differs from legacy ignoreCase',()=>expectProgram(String.raw`
  console.log(/k/iu.test('K'),/[A-Z]/iu.test('K'),/\w/iu.test('K'));
  console.log(/k/i.test('K'),/s/i.test('ſ'),/é/i.test('É'),/[a-z]/i.test('B'));
  console.log(/[\u0390]/iu.test('\u1fd3'),/[\u1fd3]/iu.test('\u0390'));
  console.log(/\p{Lu}/iu.test('a'),/\P{Lu}/iu.test('a'),/\p{Lu}/iu.test('A'),/\P{Lu}/iu.test('A'));
`,'true true true\nfalse false true true\ntrue true\ntrue true true true\n'));

test('RegExp repeats a single atom with star plus and optional',()=>expectProgram(String.raw`
  let g=/\d+/g;console.log(g.exec('a12 b345')[0],g.lastIndex,g.exec('a12 b345')[0],g.lastIndex,g.exec('a12 b345'),g.lastIndex);
  console.log(/a+/.exec('baaa')[0],/a*/.exec('bbb')[0]==='',/z?/.exec('abc')[0]==='');
  console.log(/[a-z]+/.exec('42abc')[0],/.+/s.exec('a\nb')[0]==='a\nb');
`,'12 3 345 8 null 0\naaa true true\nabc true\n'));

test('RegExp literal alternatives preserve earliest position and branch order',()=>expectProgram(`
  console.log(/1|12/.exec('123')[0],/12|1/.exec('123')[0]);
  console.log(/ab|cd/.exec('xxcd')[0],/ab|cd/.exec('xxcd').index);
  console.log(/AL|se/i.exec('false')[0],/AL|se/i.exec('false').index);
  console.log(/a|/.exec('b')[0]==='',/|a/.exec('a')[0]==='');
`,'1 12\ncd 2\nal 1\ntrue true\n'));

test('RegExp test invokes an overridden exec method',()=>expectProgram(`
  let re=/x/;re.exec=function(){return {0:'x'}};console.log(re.test('no'));
  re.exec=function(){return null};console.log(re.test('x'));
  re.exec=function(){return 3};try{re.test('x')}catch(error){console.log(error.name)}
`,'true\nfalse\nTypeError\n'));

test('RegExp exec rejects an ordinary object receiver',()=>expectProgram(`
  for(let value of [{},[],new Number(1),function(){}]){
    try{RegExp.prototype.exec.call(value,'x')}catch(error){console.log(error.name)}
  }
`,'TypeError\nTypeError\nTypeError\nTypeError\n'));

test('RegExp internal strings survive stress GC',()=>{
 const source=String.raw`let re=/needle/gi;for(let i=0;i<12;i++){String(i)+String(i)}let m=new RegExp('needle').exec('xneedle');console.log(re instanceof RegExp,re.lastIndex,Object.getPrototypeOf(re)===RegExp.prototype,re.source,re.flags,re.toString(),new RegExp('needle').test('xneedle'),m[0],m.index,new RegExp('/').source==='\\/')`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'true 0 true needle gi /needle/gi true needle 1 true\n');
});

test('RegExp wildcard match text survives stress GC',()=>{
 const source=`let re=/a.c/g;let m=re.exec('猫abc');console.log(m[0],m.index,re.lastIndex);`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'abc 1 4\n');
});

test('RegExp VM captures survive stress GC',()=>{
 const source=`let re=/(a+)(b)/g;let m=re.exec('xaab');console.log(m[0],m[1],m[2],m.index,re.lastIndex);`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'aab aa b 1 4\n');
});

test('ASCII named RegExp captures avoid Unicode table setup under stress GC',()=>{
 const source=`let re=/(?<word>ab)\\k<word>/g;let m=re.exec('xabab');console.log(m[0],m.groups.word,m.index,re.lastIndex);`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})),30000);
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'abab ab 1 5\n');
});
