import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {processReportSource} from '../src/runtime/process-report-source.js';
import {compile} from '../src/compiler.js';
import {supportedNativeTargets} from '../src/target.js';
import {spawnSync} from 'node:child_process';
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {emitProcessFatalReport} from '../src/runtime/process-report-fatal.js';

const fixture=String.raw`
var files=[],closed=[],writes=[],attempt=0,failOpen=false,partial=false;
var process={pid:42,argv:['nona','program.js'],version:'v0.8.0',versions:{nona:'0.8.0'},release:{name:'nona'},arch:'x64',env:{HELLO:'world'},memoryUsage:function(){return {rss:99,heapTotal:80,heapUsed:40,external:10,arrayBuffers:10}},resourceUsage:function(){return {userCPUTime:12,systemCPUTime:3}},threadCpuUsage:function(){return {user:4,system:2}},getActiveResourcesInfo:function(){return ['NonaTimer']}},platform='linux',windows=false;
var apply=Reflect.apply,defineProperty=Object.defineProperty,encoder=new TextEncoder(),signals={SIGUSR2:12,SIGINT:2};
var reportIntrinsics={Error:Error,Uint8Array:Uint8Array,Uint32Array:Uint32Array,subarray:Uint8Array.prototype.subarray,min:Math.min,Date:Date,keys:Object.keys,isArray:Array.isArray,stringify:JSON.stringify,String:String,push:Array.prototype.push,trim:String.prototype.trim,time:Date.prototype.getTime,iso:Date.prototype.toISOString,year:Date.prototype.getFullYear,month:Date.prototype.getMonth,date:Date.prototype.getDate,hour:Date.prototype.getHours,minute:Date.prototype.getMinutes,second:Date.prototype.getSeconds};
function value(name,item){process[name]=item}function cwd(){return '/cwd'}function cstring(text){return text}function wideString(text){return text}
function argumentError(code,message){var error=new TypeError(message);error.code=code;return error}function hostError(operation,number,path){var error=new Error(operation);error.errno=number;error.path=path;return error}
function nativeWrite(fd,bytes){writes.push([fd,new TextDecoder().decode(bytes)])}
var host={sys_open:function(path,flags,mode){files.push([path,flags,mode]);return failOpen?-2:7},sys_write:function(fd,bytes,length){attempt++;if(partial&&attempt===1)return -4;var size=partial?Math.min(7,length):length;writes.push([fd,new TextDecoder().decode(bytes.subarray(0,size))]);return size},sys_close:function(fd){closed.push(fd)}};
var __nonaRegexpVm={processReportNetworkInterfaces:function(){return [{name:'loopback',address:'127.0.0.1'}]},processReportSignalWatch:function(name,enabled){writes.push(['signal',name,enabled])}};
`;
function run(source:string){return runInNewContext(fixture+processReportSource+source,{TextEncoder,TextDecoder})}
test('report public argument, accessor and supplied stack behavior agrees with Node oracle',()=>{
 const sample=String.raw`var r=process.report,errors=[];for(var item of [null,1,'x',[],true,function(){}])try{r.getReport(item)}catch(error){errors.push(error.code)};for(var key of ['directory','filename','compact','excludeEnv','excludeNetwork','reportOnSignal','reportOnFatalError','reportOnUncaughtException'])try{r[key]=null}catch(error){errors.push(error.code)};console.log(JSON.stringify({errors:errors,stack:r.getReport({stack:'Error: x\n  at a\n  at b',code:12}).javascriptStack,descriptors:Object.keys(r).map(function(key){var d=Object.getOwnPropertyDescriptor(r,key);return [key,d.enumerable,d.configurable,typeof d.get]})}));`;
 const oracle=spawnSync(process.execPath,['-e',sample],{encoding:'utf8',windowsHide:true});assert.equal(oracle.status,0,oracle.stderr);
 const actual=run(sample.replace('console.log(','JSON.stringify(').replace('JSON.stringify({errors','({errors').replace('}));','}));'));
 assert.deepEqual(JSON.parse(actual),JSON.parse(oracle.stdout));
});
test('report snapshots genuine metrics, copies environment and respects exclusions',()=>{
 const result=JSON.parse(run(`var first=process.report.getReport({});first.environmentVariables.HELLO='changed';process.report.excludeEnv=true;process.report.excludeNetwork=true;JSON.stringify([first,process.report.getReport({}),process.env.HELLO])`));
 assert.equal(result[0].header.runtime,'nona');assert.equal(result[0].javascriptHeap.usedMemory,40);assert.equal(result[0].resourceUsage.rss,99);assert.equal(result[0].header.networkInterfaces[0].address,'127.0.0.1');assert.equal(result[1].environmentVariables,undefined);assert.equal(result[1].header.networkInterfaces,undefined);assert.equal(result[2],'world');
});
test('report validates arguments and accessor types with stable identity',()=>{
 const result=JSON.parse(run(`var errors=[];for(var item of [null,1,'x',[],true,function(){}])try{process.report.getReport(item)}catch(error){errors.push(error.code)};for(var key of ['directory','filename','signal','compact','excludeEnv','excludeNetwork','reportOnSignal','reportOnFatalError','reportOnUncaughtException'])try{process.report[key]=null}catch(error){errors.push(error.code)}JSON.stringify([errors,process.report===process.report,Object.keys(process.report)])`));
 assert.equal(result[0].length,15);assert.ok(result[0].every((code:string)=>code==='ERR_INVALID_ARG_TYPE'));assert.equal(result[1],true);assert.equal(result[2].length,11);
});
test('report stack metadata follows supplied object stack and enumerable properties',()=>{
 const result=JSON.parse(run(String.raw`JSON.stringify([process.report.getReport({code:'IGNORED'}).javascriptStack,process.report.getReport({stack:'Error: x\n  at a\n  at b',code:12}).javascriptStack])`));
 assert.deepEqual(result,[{message:'No stack.',stack:['Unavailable.'],errorProperties:{}},{message:'Error: x',errorProperties:{code:'12'},stack:['at a']}]);
});
test('report files use OS create flags, retry EINTR, finish partial writes and close',()=>{
 const result=JSON.parse(run(`partial=true;process.report.directory='/reports';process.report.filename='diagnostic.json';var name=process.report.writeReport({});JSON.stringify([name,files,closed,JSON.parse(writes.filter(item=>item[0]===7).map(item=>item[1]).join('')).header.filename])`));
 assert.deepEqual(result,['diagnostic.json',[['/reports/diagnostic.json',577,420]],[7],'diagnostic.json']);
});
test('report failed open returns empty name and automatic failures preserve original exception',()=>{
 const result=JSON.parse(run(`failOpen=true;var first=process.report.writeReport('missing.json',{});delete __nonaRegexpVm.processReportNetworkInterfaces;var second=reportAutomatic(new Error('original'),'Exception','Exception');JSON.stringify([first,second,closed,writes.length])`));assert.deepEqual(result,['','',[],3]);
});
test('stdout output bypasses configured directory and default names advance sequence',()=>{
 const result=JSON.parse(run(`process.report.directory='/absent';var name=process.report.writeReport('stdout',{});JSON.stringify([name,files,writes.filter(item=>item[0]===1)[0][0],reportDefaultFilename(),reportDefaultFilename()])`));assert.equal(result[0],'stdout');assert.deepEqual(result[1],[]);assert.equal(result[2],1);assert.match(result[3],/^report\.\d{8}\.\d{6}\.42\.0\.001\.json$/);assert.match(result[4],/\.002\.json$/);
});
test('private report intrinsics survive overrides before lazy installation',()=>{
 const result=runInNewContext(fixture+`Date=function(){throw Error('replaced Date')};Object.keys=function(){throw Error('replaced keys')};Array.isArray=function(){throw Error('replaced isArray')};JSON.stringify=function(){throw Error('replaced JSON')};`+processReportSource+`process.report.excludeNetwork=true;process.report.writeReport('sample.json',{});files[0][0]`,{TextEncoder,TextDecoder});assert.equal(result,'sample.json');
});
test('fatal reporting configures native owned bytes and failed updates retain public settings',()=>{
 const result=JSON.parse(run(`var configs=[],reject=false;host.reportConfigure=function(path,length,header,size){if(reject)return 7;configs.push([Array.from(path),length,new TextDecoder().decode(header)]);return 0};process.report.filename='stdout';process.report.reportOnFatalError=true;reject=true;var code;try{process.report.filename='rejected.json'}catch(error){code=error.errno}reject=false;process.report.reportOnFatalError=false;JSON.stringify([configs[0][0],configs[1][1],code,process.report.filename,process.report.reportOnFatalError])`));assert.deepEqual(result,[[0,1],0,7,'stdout',false]);
});
test('Windows report adapter uses CreateFileW and partial WriteFile completion',()=>{
 const result=JSON.parse(run(`windows=true;platform='win32';host.CreateFileW=function(path,access,share,security,creation,flags,template){files.push([path,access,share,creation,flags]);return 9};host.WriteFile=function(handle,bytes,length,counter){var count=Math.min(length,11);counter[0]=count;writes.push([handle,new TextDecoder().decode(bytes.subarray(0,count))]);return true};host.CloseHandle=function(handle){closed.push(handle)};process.report.directory='C:\\reports';var name=process.report.writeReport('windows.json',{});JSON.stringify([name,files,closed,JSON.parse(writes.filter(item=>item[0]===9).map(item=>item[1]).join('')).header.filename])`));assert.deepEqual(result,['windows.json',[['C:\reports\\windows.json',1073741824,7,2,128]],[9],'windows.json']);
});
test('Windows fatal report UTF-16 paths with zero low bytes remain filenames',()=>{
 const result=JSON.parse(run(`windows=true;platform='win32';wideString=function(text){var units=new Uint16Array(text.length+1);for(var i=0;i<text.length;i++)units[i]=text.charCodeAt(i);return units};var paths=[];host.reportConfigure=function(path,length){paths.push([Array.from(new Uint8Array(path.buffer,path.byteOffset,path.byteLength)),length]);return 0};process.report.filename='\u0100.json';process.report.reportOnFatalError=true;JSON.stringify(paths[0])`));
 assert.equal(result[0][0],0);assert.equal(result[0][1],1);assert.ok(result[1]>2);
 const b=new RuntimeBuilder();emitProcessFatalReport(b,'win32-x64');const code=b.bundle.fragments.find(fragment=>fragment.name==='process.reportFatal.code')!;
 assert.ok(code.fixups.some(fixup=>fixup.target==='process.report.pathLength'));
});
test('BSD and Darwin report adapters use their original open flags',()=>{
 for(const platform of ['freebsd','openbsd','darwin'])assert.equal(run(`platform=${JSON.stringify(platform)};process.report.writeReport('os.json',{});files[0][1]`),1537);
});
test('report signal registration failures preserve prior enabled signal',()=>{
 const result=JSON.parse(run(`__nonaRegexpVm.processReportSignalWatch=function(name,enabled){if(name==='SIGINT')throw Error('watch failed')};process.report.reportOnSignal=true;try{process.report.signal='SIGINT'}catch(error){}JSON.stringify([process.report.signal,process.report.reportOnSignal])`));assert.deepEqual(result,['SIGUSR2',true]);
});
for(const target of supportedNativeTargets)test('report source compiles without execution for '+target,()=>{
 const result=compile(fixture+processReportSource+`process.report.excludeNetwork=true;console.log(process.report.getReport({}).header.runtime)`,{fileName:'report-source.js',target});assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});
for(const target of supportedNativeTargets)test('fatal report native helper emits without allocation for '+target,()=>{
 const builder=withNativeTarget(target,()=>{const b=new RuntimeBuilder();emitProcessFatalReport(b,target);return b});
 const code=builder.bundle.fragments.find(fragment=>fragment.name==='process.reportFatal.code')!;assert.ok(code.bytes.length>0);
 const calls=code.fixups.map(fixup=>fixup.target);assert.ok(calls.includes('process.heapSnapshot.code'));assert.ok(!calls.some(name=>/rt\.(alloc|collect|mapPages)|HeapAlloc/.test(name)));assert.ok(builder.bundle.fragments.some(fragment=>fragment.name==='process.reportConfigure.code'));
});
