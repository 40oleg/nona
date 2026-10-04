import {spawnSync} from 'node:child_process';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {compile} from '../dist/src/compiler.js';

if(!['x64','arm64'].includes(process.arch)||!['win32','linux'].includes(process.platform)||process.platform==='win32'&&process.arch!=='x64')throw new Error('Linux native comparisons require Linux x64/ARM64 or Windows x64 with WSL');
const root=fileURLToPath(new URL('../',import.meta.url));
const inputs=join(root,'examples','compat'),outputs=join(root,'build','linux-compat'),work=join(root,'work');
mkdirSync(outputs,{recursive:true});mkdirSync(work,{recursive:true});
const options={timeout:30000,maxBuffer:4*1024*1024,windowsHide:true};
const results=[];
for(const file of readdirSync(inputs).filter(name=>/\.c?js$/.test(name)).sort()){
 const path=join(inputs,file),source=readFileSync(path,'utf8');
 const compiled=compile(source,{fileName:file,target:process.platform==='linux'&&process.arch==='arm64'?'linux-arm64':'linux-x64'});
 if(!compiled.ok){results.push({file,match:false,diagnostics:compiled.diagnostics});console.log('FAIL '+file);continue;}
 const executable=join(outputs,file.replace(/\.c?js$/,'')+'.elf');writeFileSync(executable,compiled.image,{mode:0o755});
 const node=spawnSync(process.execPath,[path],options);
 let native;
 if(process.platform==='linux'){
  chmodSync(executable,0o755);native=spawnSync(executable,[],options);
 }else{
  const translated=spawnSync('wsl.exe',['--exec','wslpath','-a',executable],{...options,encoding:'utf8'});
  if(translated.status!==0)throw new Error('WSL path conversion failed: '+translated.stderr);
  native=spawnSync('wsl.exe',['--exec','/bin/sh','-c','target=$(mktemp /tmp/nona-compat-XXXXXX); trap \'rm -f "$target"\' EXIT; cp "$1" "$target"; chmod 700 "$target"; "$target"','sh',translated.stdout.trim()],options);
 }
 const stdoutMatch=!!node.stdout&&!!native.stdout&&node.stdout.equals(native.stdout);
 const stderrMatch=!!node.stderr&&!!native.stderr&&node.stderr.equals(native.stderr);
 const match=!node.error&&!native.error&&node.status===0&&native.status===0&&stdoutMatch&&stderrMatch;
 results.push({file,match,stdoutMatch,stderrMatch,nodeStatus:node.status,nativeStatus:native.status,nodeStdout:node.stdout?.toString('utf8'),nativeStdout:native.stdout?.toString('utf8'),nativeStderr:native.stderr?.toString('utf8'),nativeError:native.error?.message});
 console.log(`${match?'PASS':'FAIL'} ${file}`);
}
writeFileSync(join(work,'linux-compat-report.json'),JSON.stringify({date:new Date().toISOString(),node:process.version,results},null,2)+'\n');
if(!results.length||results.some(result=>!result.match))process.exitCode=1;
