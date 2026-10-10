import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {compile} from '../src/compiler.js';

const hostTarget=process.platform==='linux'?'linux-x64' as const:'win32-x64' as const;

// Long-running programs: many timer firings, promise jobs and coroutines must
// not accumulate memory, and an idle event loop must not use the CPU.

function build(source:string):{path:string;cleanup:()=>void} {
 const result=compile(source,{fileName:'main.js',target:hostTarget});
 if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));
 const directory=mkdtempSync(join(tmpdir(),'nona-stability-'));
 const path=join(directory,process.platform==='win32'?'image.exe':'image');
 writeFileSync(path,result.image);chmodSync(path,0o755);
 return {path,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}

/** Run to completion and report peak resident memory and peak virtual size (Linux) or commit (Windows) in KiB. */
async function measure(path:string):Promise<{status:number|null;stdout:string;rss:number;vm:number}> {
 if(process.platform==='win32'){
  const out=path+'.out';
  // Peak values are only readable while the process runs: sample them.
  const script=`$p = Start-Process -FilePath '${path}' -PassThru -WindowStyle Hidden -RedirectStandardOutput '${out}'; $null = $p.Handle; $ws = 0; $commit = 0;
while (-not $p.HasExited) { $p.Refresh(); if ($p.PeakWorkingSet64 -gt $ws) { $ws = $p.PeakWorkingSet64 }; if ($p.PeakPagedMemorySize64 -gt $commit) { $commit = $p.PeakPagedMemorySize64 }; Start-Sleep -Milliseconds 10 }
$p.WaitForExit(); "$($p.ExitCode) $([long]($ws / 1024)) $([long]($commit / 1024))"`;
  const ps=spawnSync('powershell',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true});
  assert.equal(ps.status,0,ps.stderr);
  const [status,rss,vm]=ps.stdout.trim().split(/\s+/).map(Number) as [number,number,number];
  return {status,stdout:readFileSync(out,'utf8').replace(/\r\n/g,'\n'),rss,vm};
 }
 const child=spawn(path,[],{windowsHide:true});
 let stdout='',rss=0,vm=0;
 child.stdout.on('data',d=>stdout+=d);
 const sample=()=>{
  try{
   const status=readFileSync(`/proc/${child.pid}/status`,'utf8');
   rss=Math.max(rss,Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]??0));vm=Math.max(vm,Number(/VmSize:\s+(\d+)/.exec(status)?.[1]??0));
  }catch{/* exited */}
 };
 const timer=setInterval(sample,10);
 const status=await new Promise<number|null>(resolve=>child.on('exit',code=>resolve(code)));
 clearInterval(timer);
 return {status,stdout,rss,vm};
}

/** User+system CPU seconds of a finished child process. */
function cpuSeconds(path:string):number {
 if(process.platform==='win32'){
  const ps=spawnSync('powershell',['-NoProfile','-Command',`$p = Start-Process -FilePath '${path}' -PassThru -WindowStyle Hidden; $p.WaitForExit(); $p.TotalProcessorTime.TotalSeconds`],{encoding:'utf8',windowsHide:true});
  assert.equal(ps.status,0,ps.stderr);
  return Number(ps.stdout.trim().replace(',','.'));
 }
 // `times` prints the accumulated user and system times of the shell's children.
 const sh=spawnSync('sh',['-c','"$0" >/dev/null; times',path],{encoding:'utf8'});
 assert.equal(sh.status,0,sh.stderr);
 const children=sh.stdout.trim().split('\n').pop()!;
 const seconds=[...children.matchAll(/(\d+)m([\d.]+)s/g)].map(m=>Number(m[1])*60+Number(m[2]));
 return seconds.reduce((a,b)=>a+b,0);
}

const intervals=(timers:number,ticks:number)=>`
var timers = ${timers}, remaining = timers, fired = 0, jobs = 0;
for (var t = 0; t < timers; t++) (function(){
  var count = 0, id = setInterval(function(){
    fired++;
    var garbage = {tick: count, list: [count, count + 1]};
    if (count % 50 === 0) Promise.resolve(garbage).then(function(){ jobs++; });
    if (++count === ${ticks}) { clearInterval(id); if (--remaining === 0) console.log(fired, jobs); }
  }, 1);
})();
`;

// The same sizes on Linux and Windows: the POSIX heap no longer maps pages
// per block (#37).
const [timers,ticks]=[50,2000];

test('ten times more interval firings do not need more memory',{timeout:600_000},async()=>{
 const small=build(intervals(timers,ticks/10)),large=build(intervals(timers,ticks));
 try{
  const a=await measure(small.path),b=await measure(large.path);
  assert.equal(a.status,0);assert.equal(b.status,0);
  assert.equal(a.stdout,`${timers*ticks/10} ${timers*ticks/500}\n`);assert.equal(b.stdout,`${timers*ticks} ${timers*ticks/50}\n`);
  assert.ok(a.rss>0&&b.rss<a.rss*1.5+8192,`peak memory ${a.rss} KiB → ${b.rss} KiB`);
  assert.ok(b.rss<128*1024,`peak memory ${b.rss} KiB`);
 }finally{small.cleanup();large.cleanup();}
});

test('abandoned coroutines release their stacks',{timeout:600_000},async()=>{
 // Each call suspends forever on a promise nobody references: its 1 MiB stack
 // can only be released by the collector.
 const {path,cleanup}=build(`
var rounds = 0;
async function abandoned(n){ await new Promise(function(){}); return n; }
var id = setInterval(function(){
  for (var i = 0; i < 100; i++) abandoned(i);
  if (++rounds === 60) { clearInterval(id); console.log('started', rounds * 100); }
}, 1);
`);
 try{
  const run=await measure(path);
  assert.equal(run.status,0);assert.equal(run.stdout,'started 6000\n');
  // 6000 stacks would reserve about 6 GiB; the collector keeps it far lower.
  assert.ok(run.vm>0&&run.vm<1024*1024,`peak virtual size/commit ${run.vm} KiB`);
 }finally{cleanup();}
});

test('an idle event loop does not use the CPU',{timeout:120_000},()=>{
 const {path,cleanup}=build(`var start = Date.now(); setTimeout(function(){ console.log(Date.now() - start >= 1900); }, 2000);`);
 try{
  const seconds=cpuSeconds(path);
  assert.ok(seconds<0.25,`CPU time ${seconds}s while waiting 2s`);
 }finally{cleanup();}
});
