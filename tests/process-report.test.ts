import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {runProcess as runOnHost,processTestEnvironment} from './helpers/process.js';
import {runNative} from './helpers/native.js';
import {linkHost} from './helpers/program.js';
import {compileModuleToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {requireHostTarget} from '../src/target.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {processReportAllocationFailureProbe} from '../src/runtime/process-report-probe.js';

test('native process reports write valid JSON with genuine OS and allocator data',()=>{
 const directory=resolve(mkdtempSync(join(tmpdir(),'nona-report-'))),filename=join(directory,'api.json');
 try{
  const result=runOnHost(`let r=process.report;r.excludeEnv=true;r.filename=${JSON.stringify(filename)};let rows=r.getReport({}).header.networkInterfaces;console.log(rows.length>0,rows.some(x=>x.internal&&(x.address==='127.0.0.1'||x.address==='::1')));console.log(r.writeReport(new Error('native-report'))===r.filename);r.directory=${JSON.stringify(join(directory,'absent'))};console.log(r.writeReport('missing.json',{})==='')`);
  assert.equal(result.status,0,result.stderr);assert.equal(result.error,undefined);assert.equal(result.stdout,'true true\ntrue\ntrue\n');
  const report=JSON.parse(readFileSync(filename,'utf8'));assert.equal(report.header.runtime,'nona');assert.equal(report.header.reportVersion,1);assert.ok(report.header.processId>0);assert.ok(report.resourceUsage.rss>0);assert.ok(report.javascriptHeap.totalMemory>=report.javascriptHeap.usedMemory);assert.equal(report.environmentVariables,undefined);assert.match(report.javascriptStack.message,/native-report/);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test('native uncaught reporting excludes handled failures and disabled emergency output',()=>{
 const directory=resolve(mkdtempSync(join(tmpdir(),'nona-report-policy-'))),filename=join(directory,'exception.json');
 try{
  const setup=`process.report.filename=${JSON.stringify(filename)};process.report.excludeEnv=true;process.report.excludeNetwork=true;process.report.reportOnUncaughtException=true;`;
  const handled=runOnHost(setup+`process.report.reportOnFatalError=true;process.report.reportOnFatalError=false;process.on('uncaughtException',e=>console.log(e.message));setTimeout(()=>{throw Error('handled')},0)`);assert.equal(handled.status,0,handled.stderr);assert.equal(handled.stdout,'handled\n');assert.equal(existsSync(filename),false);
  const fatal=runOnHost(setup+`throw Error('unhandled-report')`);assert.equal(fatal.status,1,fatal.stderr);const report=JSON.parse(readFileSync(filename,'utf8'));assert.equal(report.header.event,'Exception');assert.match(report.javascriptStack.message,/unhandled-report/);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test('CI native allocator failure writes emergency JSON without JavaScript exit hooks',{skip:process.env.GITHUB_ACTIONS!=='true'},()=>{
 const directory=resolve(mkdtempSync(join(tmpdir(),'nona-report-oom-'))),filename=join(directory,'emergency.json'),target=requireHostTarget();
 try{
  const source=processReportAllocationFailureProbe(target).replace("'nona-process-report-oom.json'",JSON.stringify(filename)).replace("console.log('armed');","console.log('armed');process.on('exit',()=>console.log('unexpected JS exit hook'));");
  const image=withNativeTarget(target,()=>linkHost(generate(compileModuleToIR(source,'report-oom.mjs',undefined,'',target),{gcStress:true}),target));
  const result=runNative(image,process.arch==='arm64'?180000:60000,false,processTestEnvironment());assert.equal(result.error,undefined,JSON.stringify({stdout:result.stdout.toString(),stderr:result.stderr.toString(),error:result.error?.message}));assert.equal(result.status,1,result.stderr.toString());assert.equal(result.stdout.toString(),'armed\n');assert.match(result.stderr.toString(),/Nona runtime error/);
  const report=JSON.parse(readFileSync(filename,'utf8'));assert.equal(report.header.event,'FatalError');assert.equal(report.header.filename,filename);assert.equal(typeof report.header.configurationTime,'string');assert.ok(report.javascriptHeap.heapTotal>=report.javascriptHeap.heapUsed);assert.ok(report.javascriptHeap.managedBlocks>0);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
