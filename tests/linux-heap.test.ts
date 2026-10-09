import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile} from '../src/compiler.js';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {linuxShims,heapSmallest,heapLargestClass,heapClasses} from '../src/backend/linux/shims.js';

// Issue #37: the POSIX HeapAlloc/HeapFree shims carve blocks of up to 1 MiB
// from 4 MiB arenas and recycle them through per-class free lists; only
// larger blocks map their own pages. Array element tables, index tables and
// string builders live outside the managed heap, so a program that built
// arrays of a few hundred elements used to make an mmap and a munmap per table.

// Block sizes on both sides of every class boundary, the arena split and the
// direct mappings: element tables of 16-byte Values and string builders.
const churn=(rounds:number,entries:number,small:number)=>String.raw`
const sizes=[0,1,2,3,250,254,255,256,257,500,1000,1023,1024,1025,4000,8191,8192,16384,32767,32768,65535,65536,65537,70000,131072];
let total=0,check=0;
for(let round=0;round<${rounds};round++)for(const n of sizes){
  const a=new Array(n).fill(round+1);a.push(n);total+=a.length;check=(check+a[a.length-1]+(n?a[n>>1]:0))%1000003;
  const s='ab'.repeat(n>>1);total+=s.length;
  const parts=[];for(let i=0;i<Math.min(n,${small});i++)parts.push(i);check=(check+parts.join(',').length)%1000003;
}
const keep=[];for(let i=0;i<${small};i++)keep.push(new Array(300+i).fill(i));
for(let i=0;i<${small};i+=2)keep[i]=null;
for(let i=0;i<${small};i++)if(keep[i]===null)keep[i]=new Array(600-i).fill(-i);
for(const a of keep)check=(check+a.length+a[0]+a[a.length-1])%1000003;
const m=new Map();for(let i=0;i<${entries};i++)m.set('k'+i,i);for(let i=0;i<${entries};i+=3)m.delete('k'+i);
console.log(total,check,m.size,m.get('k20'),m.get('k'+(${entries}-2)));
`;

test('arrays, strings and maps of every heap class size keep their contents',()=>{
 // Under gcStress (a collection at every safepoint) with fewer rounds.
 for(const [gcStress,source] of [[false,churn(3,20000,300)],[true,churn(1,200,20)]] as const){
  const run=runOnHost(source,{gcStress});
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stdout,runOracle(source).stdout);
 }
});

test('the heap shims have power-of-two classes up to 256 KiB and one free list per class',()=>{
 assert.equal(heapSmallest<<(heapClasses-1),heapLargestClass);
 const fragments=linuxShims([{dll:'KERNEL32.dll',name:'HeapAlloc',symbol:'HeapAlloc'},{dll:'KERNEL32.dll',name:'HeapFree',symbol:'HeapFree'}]);
 const free=fragments.find(f=>f.name==='linux.heapFree');
 assert.ok(free&&free.bytes.length===8*heapClasses);
 assert.ok(fragments.some(f=>f.name==='linux.HeapAlloc.code')&&fragments.some(f=>f.name==='linux.HeapFree.code'));
});

const strace=process.platform==='linux'&&spawnSync('strace',['-V'],{encoding:'utf8'}).status===0;
test('allocation-heavy programs map arenas, not blocks',{skip:strace?false:'needs strace on Linux'},()=>{
 // 20 000 element tables of 32 KiB and 20 000 strings of 10 KiB.
 const source=`let t=0;for(let i=0;i<20000;i++){const a=new Array(2000).fill(i);t+=a.length+'y'.repeat(5000+i%100).length;}console.log(t);`;
 const result=compile(source,{fileName:'main.js',target:'linux-x64'});
 if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));
 const directory=mkdtempSync(join(tmpdir(),'nona-heap-'));
 try{
  const path=join(directory,'image'),log=join(directory,'strace.txt');
  writeFileSync(path,result.image);chmodSync(path,0o755);
  const run=spawnSync('strace',['-f','-c','-e','trace=mmap,munmap','-o',log,path],{encoding:'utf8',timeout:120_000});
  assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,`${20000*2000+20000*5000+990000}\n`);
  // strace -c rows: % time, seconds, usecs/call, calls, [errors,] syscall.
  const rows=readFileSync(log,'utf8').split('\n').map(line=>line.trim().split(/\s+/));
  const count=(name:string)=>Number(rows.find(fields=>fields[fields.length-1]===name)?.[3]??0);
  assert.ok(count('mmap')<500,`mmap ${count('mmap')}`);
  assert.ok(count('munmap')<1000,`munmap ${count('munmap')}`);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
