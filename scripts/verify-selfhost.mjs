// Development verification only: child compilers receive an empty PATH.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {compileToIR,compileModuleToIR} from '../dist/src/compiler.js';

if(process.platform==='win32'&&process.env.GITHUB_ACTIONS!=='true')throw Error('Native Windows verification runs only in CI');
const target=process.argv[2],stage1=resolve(process.argv[3]);
const directory=dirname(stage1),stage2=join(directory,'stage2'+(process.platform==='win32'?'.exe':''));
const environment={PATH:'',NONA_CACHE:'0',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})};
function run(image,args,extra={}){
 const result=spawnSync(image,args,{env:{...environment,...extra},encoding:'utf8',timeout:1800000,maxBuffer:16<<20,windowsHide:true});
 writeFileSync(join(directory,'last-native-run.json'),JSON.stringify({image,args,status:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr},null,2));
 assert.equal(result.error,undefined,result.error?.message);
 assert.equal(result.status,0,result.stderr);
 return result.stdout;
}
function sameImage(actual,expected,description){
 assert.equal(actual.length,expected.length,description+' (length)');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash(actual),hash(expected),description+' (SHA-256)');
}
const fixtures=[
 ['arithmetic.js','console.log(6*7);','42\n'],
 ['module.mjs',"import path from 'node:path';console.log(path.posix.normalize('/a/../b'));",'/b\n'],
 ['regexp.js',"console.log(/(?<word>a+)/u.exec('aaa').groups.word);",'aaa\n'],
];
function check(image){
 for(const [name,source,expected] of fixtures){
  const input=join(directory,name),output=join(directory,name+'.'+(process.platform==='win32'?'exe':'elf'));
  writeFileSync(input,source);run(image,[input,output,target]);
  // Assembler serials are process state. Compare fresh native and fresh Node
  // compiler processes rather than reusing the verifier's compiler cache.
  const oracleOutput=output+'.oracle';
  const oracle=spawnSync(process.execPath,[resolve('dist/cli.js'),'build',input,'-o',oracleOutput,'--target',target],{env:{...process.env,NONA_CACHE:'0'},encoding:'utf8',timeout:120000,windowsHide:true});
  assert.equal(oracle.status,0,oracle.stderr);
  if(process.platform!=='win32')chmodSync(output,0o755);
  assert.equal(run(output,[]),expected);
  try{sameImage(readFileSync(output),readFileSync(oracleOutput),'native compiler image differs from bootstrap: '+name)}catch(error){
   const nativeIR=output+'.native-ir.json';
   run(image,[input,output,target],{NONA_SELFHOST_DUMP_IR:nativeIR});
   const oracleIR=name.endsWith('.mjs')?compileModuleToIR(source,input,undefined,'',target):compileToIR(source,input,undefined,target);
   writeFileSync(output+'.oracle-ir.json',JSON.stringify(oracleIR,(_key,value)=>typeof value==='bigint'?{bigint:String(value)}:value));
   run(image,[input,output,target],{NONA_SELFHOST_TRACE:output+'.native'});
   const trace=spawnSync(process.execPath,[join(directory,'sources','selfhost-entry.mjs'),input,output+'.trace-oracle',target],{env:{...process.env,NONA_SELFHOST_TRACE:output+'.oracle'},encoding:'utf8',timeout:120000,windowsHide:true});
   assert.equal(trace.status,0,trace.stderr);
   throw error;
  }
  console.log('Native compiler regression passed:',image,name);
 }
}
check(stage1);
run(stage1,[join(directory,'sources','selfhost-entry.mjs'),stage2,target]);
if(process.platform!=='win32')chmodSync(stage2,0o755);
sameImage(readFileSync(stage2),readFileSync(stage1),'stage 1 and stage 2 compiler images differ');
console.log('Stage 1 built deterministic stage 2 with Node absent from PATH');
check(stage2);
