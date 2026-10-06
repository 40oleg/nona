import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';

// CI verifies reports produced by real native children, including BSD guests.
const directory=resolve(process.argv[2]??'.');
for(const [filename,event] of [['nona-process-report-probe.json','JavaScript API'],['nona-process-report-uncaught.json','Exception']]){
 const report=JSON.parse(readFileSync(join(directory,filename),'utf8'));
 assert.equal(report.header.runtime,'nona');assert.equal(report.header.reportVersion,1);
 assert.equal(report.header.filename,filename);assert.equal(report.header.event,event);
 assert.ok(report.header.processId>0);assert.ok(report.javascriptHeap.totalMemory>=report.javascriptHeap.usedMemory);
 assert.ok(report.resourceUsage.rss>0);assert.equal(report.environmentVariables,undefined);
 assert.equal(report.header.networkInterfaces,undefined);
 if(event==='Exception')assert.match(report.javascriptStack.message,/nona-report-uncaught/);
}
for(const filename of ['nona-process-report-handled-must-not-exist.json','nona-process-report-fatal-must-not-exist.json'])assert.equal(existsSync(join(directory,filename)),false,filename);
const emergency=JSON.parse(readFileSync(join(directory,'nona-process-report-oom.json'),'utf8'));
assert.equal(emergency.header.runtime,'nona');assert.equal(emergency.header.event,'FatalError');assert.equal(emergency.header.trigger,'FatalError');
assert.equal(emergency.header.filename,'nona-process-report-oom.json');assert.equal(typeof emergency.header.configurationTime,'string');
assert.ok(emergency.javascriptHeap.heapTotal>=emergency.javascriptHeap.heapUsed);assert.ok(emergency.javascriptHeap.managedBlocks>0);
console.log('Native process reports contain valid JSON and respect handled/disabled policy');
