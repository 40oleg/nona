import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {compile,hostTarget,type CompileOptions} from '../src/compiler.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

// Coverage builds (roadmap item 19): the program writes a V8 coverage file
// (NODE_V8_COVERAGE format) with every function's range and call count.

interface Coverage {result:{url:string;functions:{functionName:string;ranges:{startOffset:number;endOffset:number;count:number}[];isBlockCoverage:boolean}[]}[]}
const source=String.raw`
function used(n) { return n * 2; }
function unused() { return 1; }
const square = x => x * x;
const named = function inner(a) { return a + 1; };
class Point {
  constructor(x) { this.x = x; }
  get double() { return this.x * 2; }
  static make() { return new Point(3); }
  norm() { return Math.abs(this.x); }
}
function outer() { const add = (a) => (b) => a + b; return add(1)(2); }
let total = 0;
for (let i = 0; i < 3; i++) total += used(i);
console.log(total, square(4), named(1), Point.make().double, outer(), [1, 2].map(v => v + 1).join());
`;

function build(directory:string,file:string,text:string,options:Partial<CompileOptions>):string {
 const result=compile(text,{fileName:file,target:hostTarget,...options});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
 const executable=join(directory,hostTarget==='win32-x64'?'app.exe':'app');
 writeFileSync(executable,result.image);chmodSync(executable,0o755);
 return executable;
}
// Function ranges (the first range of each function) with their counts.
// Node.js may name the script by its real path (long Windows names, not the
// 8.3 temporary directory), so its script is matched by file name.
const functionRanges=(coverage:Coverage,url:string)=>coverage.result.filter(script=>script.url===url||script.url.endsWith('/'+url))
 .flatMap(script=>script.functions.map(fn=>`${fn.ranges[0]!.startOffset}-${fn.ranges[0]!.endOffset}:${fn.ranges[0]!.count}`)).sort();
const readAll=(directory:string)=>readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(readFileSync(join(directory,name),'utf8')) as Coverage);

test('a coverage build reports the function ranges and counts V8 reports',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-coverage-'));
 try{
  const file=join(directory,'app.js'),url=pathToFileURL(file).href,ours=join(directory,'nona'),node=join(directory,'node');
  mkdirSync(ours);mkdirSync(node);writeFileSync(file,source);
  const run=spawnSync(build(directory,file,source,{coverage:{directory:ours,url}}),[],{encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(run.status,0,run.stderr);
  const nodeRun=spawnSync(process.execPath,[file],{encoding:'utf8',env:{...process.env,NODE_V8_COVERAGE:node}});
  assert.equal(run.stdout,nodeRun.stdout);
  const [coverage]=readAll(ours);
  assert.ok(coverage,'one coverage file');
  assert.equal(readAll(ours).length,1);
  assert.ok(coverage.result[0]!.functions.every(fn=>fn.isBlockCoverage===false));
  const reference=readAll(node).find(c=>c.result.some(s=>s.url.endsWith('/app.js')));
  assert.ok(reference,'Node.js coverage of app.js');
  assert.deepEqual(functionRanges(coverage,url),functionRanges(reference,'app.js'));
  const names=coverage.result[0]!.functions.map(fn=>fn.functionName);
  for(const name of ['','used','unused','square','inner','Point','outer','add'])assert.ok(names.includes(name),name);
 }finally{removeTemporaryDirectory(directory);}
});

test('coverage is written when a runtime error ends the program, and not without the option',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-coverage-'));
 try{
  const file=join(directory,'fail.js'),url=pathToFileURL(file).href,out=join(directory,'out');mkdirSync(out);
  const text='function f() { return null.x; }\nf();\n';
  const failed=spawnSync(build(directory,file,text,{coverage:{directory:out,url}}),[],{encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(failed.status,1);
  assert.deepEqual(functionRanges(readAll(out)[0]!,url),[`0-${text.length}:1`,'0-31:1'].sort());
  const plain=join(directory,'plain');mkdirSync(plain);
  const ok=spawnSync(build(directory,file,'console.log(1)',{}),[],{encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(ok.status,0);assert.equal(readdirSync(plain).length,0);
 }finally{removeTemporaryDirectory(directory);}
});
