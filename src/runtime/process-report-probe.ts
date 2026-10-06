/** CI-only programs: compile locally; execute solely in native CI children. */
export const processReportProbe=String.raw`
var report=process.report;
report.excludeEnv=true;report.excludeNetwork=true;
var snapshot=report.getReport(new Error('nona-report-probe'));
console.log(snapshot.header.runtime==='nona',snapshot.header.nonaVersion===process.version,snapshot.header.processId===process.pid,snapshot.javascriptHeap.totalMemory>=snapshot.javascriptHeap.usedMemory,snapshot.resourceUsage.rss>0,!Object.prototype.hasOwnProperty.call(snapshot,'environmentVariables'),!Object.prototype.hasOwnProperty.call(snapshot.header,'networkInterfaces'));
report.compact=true;
report.filename='nona-process-report-probe.json';
console.log(report.writeReport({})===report.filename);
report.directory='nona-process-report-absent-directory';
console.log(report.writeReport('missing.json',{})==='');
`;
export const processReportUncaughtProbe=String.raw`
process.report.excludeEnv=true;process.report.excludeNetwork=true;
process.report.filename='nona-process-report-uncaught.json';
process.report.reportOnUncaughtException=true;
throw new Error('nona-report-uncaught');
`;
export const processReportHandledProbe=String.raw`
process.report.filename='nona-process-report-handled-must-not-exist.json';
process.report.reportOnUncaughtException=true;
process.on('uncaughtException',function(error){console.log(error.message)});
setTimeout(function(){throw new Error('nona-report-handled')},0);
`;
/** An invalid native signature is never used to manufacture a fatal failure. */
export const processReportFatalConfigurationProbe=String.raw`
process.report.filename='nona-process-report-fatal-must-not-exist.json';
process.report.reportOnFatalError=true;
process.report.reportOnFatalError=false;
console.log(process.report.reportOnFatalError===false);
`;
export const processReportNetworkProbe=String.raw`
var report=process.report;report.excludeEnv=true;
var rows=report.getReport({}).header.networkInterfaces;
console.log(Array.isArray(rows),rows.length>0,rows.some(function(row){return row.internal&&(row.address==='127.0.0.1'||row.address==='::1')}),rows.every(function(row){return typeof row.name==='string'&&typeof row.address==='string'&&typeof row.netmask==='string'&&typeof row.mac==='string'}));
`;

/** CI children impose OS limits before requesting a large anonymous allocation. */
export function processReportAllocationFailureProbe(target:string):string {
 const configuration=`process.report.filename='nona-process-report-oom.json';process.report.reportOnFatalError=true;console.log('armed');`;
 if(target.startsWith('darwin-'))return String.raw`
import {define} from 'nona:ffi';
const reserve=define('syscall','197','i64(ptr,i64,i32,i32,i32,i64)');
`+configuration+String.raw`
// Darwin's resident-set limit does not constrain anonymous virtual mappings.
// Reserve inaccessible private ranges without touching pages or replacing
// existing mappings. The isolated child's exit releases every reservation.
for(let size=70368744177664;size>=536870912;size/=2){
 let attempts=0;while(reserve(null,size,0,0x1042,-1,0)>=0){if(++attempts===64)throw Error('Virtual reservation bound exceeded')}
}
new ArrayBuffer(1073741824);throw Error('Expected native allocation failure');
`;
 if(target.startsWith('win32-'))return String.raw`
import {define} from 'nona:ffi';
const query=define('KERNEL32.dll','K32GetProcessMemoryInfo','bool(ptr,buf,u32)');
const create=define('KERNEL32.dll','CreateJobObjectW','ptr(ptr,ptr)');
const configure=define('KERNEL32.dll','SetInformationJobObject','bool(ptr,i32,buf,u32)');
const assign=define('KERNEL32.dll','AssignProcessToJobObject','bool(ptr,ptr)');
`+configuration+String.raw`
let memory=new Uint32Array(20);memory[0]=80;if(!query(-1,memory,80))throw Error('Private memory query failed');
let limit=memory[18]+memory[19]*4294967296+67108864,settings=new Uint32Array(36);settings[4]=256;settings[28]=limit%4294967296;settings[29]=Math.floor(limit/4294967296);
let job=create(null,null);if(!job||!configure(job,9,settings,144)||!assign(job,-1))throw Error('Isolated memory job setup failed');
new ArrayBuffer(1073741824);throw Error('Expected native allocation failure');
`;
 const linux=target.startsWith('linux-'),arm=target.endsWith('arm64');
 const get=linux?(arm?163:97):194,set=linux?(arm?164:160):195,resource=linux?9:target.startsWith('freebsd-')?10:target.startsWith('openbsd-')?2:5;
 return `import {define} from 'nona:ffi';\nconst get=define('syscall','${get}','i32(i32,buf)'),set=define('syscall','${set}','i32(i32,buf)');\n`+configuration+`
let bounds=new Uint32Array(4);if(get(${resource},bounds)!==0)throw Error('Memory limit query failed');
let maximum=bounds[2]+bounds[3]*4294967296;bounds[0]=Math.min(maximum,536870912);bounds[1]=0;
if(set(${resource},bounds)!==0)throw Error('Isolated memory limit setup failed');
new ArrayBuffer(1073741824);throw Error('Expected native allocation failure');
`;
}
