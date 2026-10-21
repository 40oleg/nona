/**
 * node:child_process on a native POSIX host without Node.js (the BSD VMs):
 * stdio capture, stdin piping, exit codes, signals, cwd/env, ENOENT and
 * outputs larger than a pipe buffer through spawn, exec, execFile and the
 * synchronous variants. The output lines are deterministic.
 */
export const childProcessProbeSource = String.raw`
import {spawn,spawnSync,exec,execFile,execSync,execFileSync} from 'node:child_process';
const sh='/bin/sh',missing='nona-missing-command-328';
// 1.5 MiB on stdout, then 1.5 MiB on stderr: both pipes must be drained.
const large='dd if=/dev/zero bs=1024 count=1536 2>/dev/null|tr "\\000" a;dd if=/dev/zero bs=1024 count=1536 2>/dev/null|tr "\\000" b >&2';
const count=(text,c)=>{let n=0;for(let i=0;i<text.length;i++)if(text[i]===c)n++;return n};
let r=spawnSync(sh,['-c','echo out;echo err >&2;exit 3']);
console.log('sync',r.status,r.signal,JSON.stringify(String(r.stdout)),JSON.stringify(String(r.stderr)),r.pid>0);
r=spawnSync(sh,['-c','tr a-z A-Z'],{input:'piped input'});
console.log('sync-input',r.status,String(r.stdout));
r=spawnSync(sh,['-c','pwd;echo "$NONA_PROBE_VALUE"'],{cwd:'/',env:{NONA_PROBE_VALUE:'ü=1',PATH:'/usr/bin:/bin'}});
console.log('sync-cwd-env',JSON.stringify(String(r.stdout)));
r=spawnSync(missing,['x']);
console.log('sync-enoent',r.error.code,r.error.errno<0,r.error.syscall,r.error.path,r.status,r.pid);
r=spawnSync(sh,['-c','kill -USR1 $$;sleep 5']);
console.log('sync-signal',r.status,r.signal);
r=spawnSync(sh,['-c',large],{maxBuffer:8<<20});
console.log('sync-large',r.status,r.stdout.length,count(String(r.stdout),'a'),r.stderr.length,count(String(r.stderr),'b'));
const big=execSync(large,{maxBuffer:8<<20,stdio:['ignore','pipe','pipe']});
console.log('execSync-large',big.length);
console.log('execSync',JSON.stringify(execSync('echo "$0" ok').toString()));
try{execSync('echo partial;exit 4',{stdio:'pipe'})}catch(e){console.log('execSync-status',e.status,JSON.stringify(String(e.stdout)))}
console.log('execFileSync',JSON.stringify(execFileSync(sh,['-c','cat'],{input:'stdin bytes'}).toString()));
try{execFileSync(missing)}catch(e){console.log('execFileSync-enoent',e.code)}
const step=(name,start)=>new Promise(resolve=>start(resolve)).then(line=>console.log(name,...line));
(async()=>{
await step('spawn',done=>{const c=spawn(sh,['-c','cat;echo err >&2;exit 5']);let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('close',(code,signal)=>done([JSON.stringify(out),JSON.stringify(err),code,signal]));c.stdin.end('to child')});
await step('spawn-kill',done=>{const c=spawn(sh,['-c','exec sleep 30'],{stdio:'ignore'});c.on('exit',(code,signal)=>done([code,signal,c.killed,c.signalCode]));setTimeout(()=>console.log('kill',c.kill('SIGUSR1')),50)});
await step('spawn-large',done=>{const c=spawn(sh,['-c',large]);let out=0,err=0;c.stdout.on('data',d=>out+=d.length);c.stderr.on('data',d=>err+=d.length);c.on('close',code=>done([code,out,err]))});
await step('spawn-cwd-env',done=>{const c=spawn('pwd',[],{cwd:'/tmp',env:{PATH:'/usr/bin:/bin'}});let out='';c.stdout.on('data',d=>out+=d);c.on('close',code=>done([code,JSON.stringify(out)]))});
await step('spawn-enoent',done=>{const c=spawn(missing);c.on('error',e=>done([e.code,e.syscall,e.path,c.pid]))});
await step('exec',done=>exec('echo exec;echo warn >&2;exit 2',(e,stdout,stderr)=>done([e.code,JSON.stringify(stdout),JSON.stringify(stderr)])));
await step('execFile',done=>execFile(sh,['-c','echo "$1"','sh','arg ü'],(e,stdout)=>done([e,JSON.stringify(stdout)])));
await step('execFile-enoent',done=>execFile(missing,e=>done([e.code])));
})();
`;

export const childProcessProbeExpected = `sync 3 null "out\\n" "err\\n" true
sync-input 0 PIPED INPUT
sync-cwd-env "/\\nü=1\\n"
sync-enoent ENOENT true spawnSync nona-missing-command-328 nona-missing-command-328 null 0
sync-signal null SIGUSR1
sync-large 0 1572864 1572864 1572864 1572864
execSync-large 1572864
execSync "/bin/sh ok\\n"
execSync-status 4 "partial\\n"
execFileSync "stdin bytes"
execFileSync-enoent ENOENT
spawn "to child" "err\\n" 5 null
kill true
spawn-kill null SIGUSR1 true SIGUSR1
spawn-large 0 1572864 1572864
spawn-cwd-env 0 "/tmp\\n"
spawn-enoent ENOENT spawn nona-missing-command-328 nona-missing-command-328 undefined
exec 2 "exec\\n" "warn\\n"
execFile null "arg ü\\n"
execFile-enoent ENOENT
`;
