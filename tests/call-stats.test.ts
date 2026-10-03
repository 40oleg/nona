import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile,hostTarget,type CompileOptions} from '../src/compiler.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

// Call statistics (roadmap item 18): every direct call is counted by target
// and the counts are printed to stderr at exit, most frequent first.

function run(source:string,options:Partial<CompileOptions>={}):{status:number|null;stdout:string;stderr:string} {
 const result=compile(source,{fileName:'/app.js',target:hostTarget,...options});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
 const directory=mkdtempSync(join(tmpdir(),'nona-stats-'));
 try{
  const executable=join(directory,hostTarget==='win32-x64'?'app.exe':'app');
  writeFileSync(executable,result.image);chmodSync(executable,0o755);
  const child=spawnSync(executable,[],{encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(child.error,undefined);
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
 }finally{removeTemporaryDirectory(directory);}
}
const lines=(text:string)=>text.split(/\r?\n/).filter(Boolean);
const entry=/^ *(\d+) {2}(\S+)$/;

test('a call-statistics build prints every called target with its count, most frequent first',()=>{
 const source='function f(n){return n<2?n:f(n-1)+f(n-2)}console.log(f(12),[3,1,2].sort().join());';
 const plain=run(source),counted=run(source,{callStats:true});
 assert.equal(plain.stderr,'');
 assert.equal(counted.status,0);assert.equal(counted.stdout,plain.stdout);
 const rows=lines(counted.stderr).map(line=>{const match=entry.exec(line);assert.ok(match,line);return {count:Number(match[1]),name:match[2]};});
 assert.ok(rows.length>20,String(rows.length));
 for(let i=1;i<rows.length;i++)assert.ok(rows[i-1]!.count>=rows[i]!.count,'sorted');
 assert.equal(new Set(rows.map(row=>row.name)).size,rows.length,'one line per target');
 // f(12) makes 465 calls, all through rt.invoke.
 assert.ok(rows.find(row=>row.name==='rt.invoke')!.count>=465);
 assert.ok(!rows.some(row=>row.name==='rt.callStatsReport'));
});

test('the counts are printed before an uncaught error ends the program',()=>{
 const counted=run('console.log("before");null.x;',{callStats:true});
 assert.equal(counted.status,1);assert.equal(counted.stdout,'before\n');
 const output=lines(counted.stderr);
 assert.match(output.at(-1)!,/Nona runtime error|TypeError/);
 assert.ok(output.slice(0,-1).every(line=>entry.test(line)));
 assert.ok(output.some(line=>/ rt\.throwTypeError$/.test(line)));
});
