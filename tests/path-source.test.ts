import {test} from 'node:test';
import assert from 'node:assert/strict';
import oracle from 'node:path';
import {pathModuleSource} from '../src/frontend/path-module.js';
import {pathParitySources} from './helpers/path-cases.js';

// Exercise the actual built-in source independently of native linking. Native
// module/GC parity is covered by path.test.ts on Windows and Linux in CI.
const implementation:typeof oracle=new Function(pathModuleSource.replace(/^export .*$/gm,'')+'\nreturn path;')();
test('path source: nested group oracle matrix',()=>{
 const groups=['@(a|b)','?(a|b)','*(a|b)','+(a|b)','!(a|b)'];
 const texts=['','a','b','c','aa','ab','a.js','b.js','aa.js','ax.js','xa.js','.','..','.a'];
 const differences:string[]=[];
 for(const flavor of ['posix','win32'] as const)for(const group of groups)for(const pattern of ['!('+group+')','!('+group+').js','@('+group+')','+('+group+')','@('+group+'*)'])for(const text of texts){
  const actual=implementation[flavor].matchesGlob(text,pattern),expected=oracle[flavor].matchesGlob(text,pattern);
  if(actual!==expected)differences.push(JSON.stringify([flavor,text,pattern,actual,expected]));
 }
 assert.deepEqual(differences,[]);
});
test('path source: concatenated extglob oracle matrix',()=>{
 const atoms=['a','b','?','*','[ab]','[!a]','@(a|b)','!(a|b)','!(a)','+(a|b)','?(a|b)','*(a|b)'];
 const texts=['a','b','ab','aa','abc','foo','bar','.a','a.js','abc.js','é','😀','a/b','a/b/c'];
 const differences:string[]=[];
 for(const flavor of ['posix','win32'] as const)for(const first of atoms)for(const second of atoms)for(const text of texts){
  const pattern=first+second,actual=implementation[flavor].matchesGlob(text,pattern),expected=oracle[flavor].matchesGlob(text,pattern);
  if(actual!==expected)differences.push(JSON.stringify([flavor,text,pattern,actual,expected]));
 }
 assert.deepEqual(differences,[]);
});
test('path source: Windows flavor resolves from a POSIX host cwd',()=>{
 const host={platform:'linux',env:{},cwd:()=>'/tmp/nona/path-tests'};
 const source=pathModuleSource.replace('const pathHost=globalThis.process;','').replace(/^export .*$/gm,'');
 const simulated:typeof oracle=new Function('pathHost',source+'\nreturn path;')(host);
 const originalCwd=process.cwd;
 try{
  process.cwd=host.cwd;
  for(const value of ['..','../..','a','a/./b/../c/','/','//','/a','/a/b','C:','C:foo','C:D:\\.']){
   assert.equal(simulated.win32.resolve(value),oracle.win32.resolve(value),'resolve '+value);
   assert.equal(simulated.win32.toNamespacedPath(value),oracle.win32.toNamespacedPath(value),'namespace '+value);
  }
 }finally{process.cwd=originalCwd;}
});
for(const [name,body] of Object.entries(pathParitySources))test('path source: '+name,()=>{
 const evaluate=(path:typeof oracle)=>{
  const lines:string[]=[];
  new Function('path','console',body)(path,{log:(...args:unknown[])=>lines.push(args.map(String).join(' '))});
  return lines;
 };
 assert.deepEqual(evaluate(implementation),evaluate(oracle));
});

test('path source: seeded POSIX and Windows root/component oracle parity',()=>{
 let seed=135;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 const parts=['a','..','.','','C:','D:','CON:','x:y','.x','😀','server','share'];
 for(const flavor of ['posix','win32'] as const)for(let i=0;i<3000;i++){
  let path='';for(let j=0,n=random()%8;j<n;j++)path+=parts[random()%parts.length]!+(['/','\\',''][random()%3]!);
  for(const method of ['normalize','dirname','basename','extname','isAbsolute','parse'] as const)
   assert.deepEqual(implementation[flavor][method](path),oracle[flavor][method](path),flavor+' '+method+' '+path);
 }
});

test('path source: glob token and traversal oracle matrix',()=>{
const paths=['','a','b','c','aa','ab','abc','a.js','b.js','A.JS','foo','FOO','a/b','a/b/c','/a','//a','a/','a//b','a/./b','./a','a/../b','../a','..','.','.a','a/.b','.a/b','a/b/','x/../a','a\\b','C:/a','C:\\a','c:/A','//server/share/a','\\\\server\\share\\a','3','é','中','😀','[',']','{a,b}','a{b}','a(b)','!a','#a'];
const patterns=['','*','?','??','a*','*a','a?','a','foo','FOO','*.js','**','**/*','a/**','a/**/b','**/a','**/../a','a/../b','a/*/../b','./a','a/.','a/','a//b','/*','//*','.*','[ab]','[!ab]','[^ab]','[a-c]','[z-a]','[]a]','[[]','[[:alpha:]]','[[:digit:]]','[[:alnum:]]','[[:space:]]','{a,b}','{a,{b,c}}','a{b}','{1..3}','{a..c}','{,a}','a{,b}','{}','{a}','@(a|b)','?(a|b)','*(a|b)','+(a|b)','!(a|b)','!(a)*','!(a).js','a!(b|c)','@(a|@(b|c))','@(.a|b)','!a','#a','a\\b','C:/*','c:/*','C:/a','//server/share/*','a/*/**'];
for(const flavor of ['posix','win32'] as const)for(const pattern of patterns)for(const text of paths)assert.equal(implementation[flavor].matchesGlob(text,pattern),oracle[flavor].matchesGlob(text,pattern),flavor+' '+JSON.stringify([text,pattern]));
});

test('path source: seeded root, suffix and path-pair oracle parity',()=>{
 let seed=9135;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed>>>8;};
 const prefixes=['','/','//','///','C:','C:/','D:\\','\\\\server\\share','\\\\server\\share\\','\\\\?\\C:\\','\\\\.\\pipe\\'];
 const chunks=['a','..','.','','C:','D:','CON:','x:y','.x','😀','server','share','...','foo.txt','é'];
 const path=()=>{let result=prefixes[random()%prefixes.length]!;for(let j=0,n=random()%6;j<n;j++)result+=chunks[random()%chunks.length]!+(['/','\\',''][random()%3]!);return result;};
 for(const flavor of ['posix','win32'] as const)for(let i=0;i<2500;i++){
  const from=path(),to=path();
  for(const method of ['normalize','dirname','basename','extname','isAbsolute','parse'] as const)
   assert.deepEqual(implementation[flavor][method](from),oracle[flavor][method](from),flavor+' '+method+' '+JSON.stringify(from));
  for(const suffix of ['.txt','foo'])assert.equal(implementation[flavor].basename(from,suffix),oracle[flavor].basename(from,suffix));
  for(const method of ['resolve','join','relative'] as const)
   assert.equal(implementation[flavor][method](from,to),oracle[flavor][method](from,to),flavor+' '+method+' '+JSON.stringify([from,to]));
 }
});
