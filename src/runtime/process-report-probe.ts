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
