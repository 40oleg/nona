import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

for(const [name,source,expected] of [
 ['numeric time and prototype',`let a=new Date(0),b=new Date(-1234.9),c=new Date(8640000000000001);console.log(a.getTime(),a.valueOf(),b.getTime(),Number.isNaN(c.getTime()),Object.prototype.toString.call(a),Object.getPrototypeOf(a)===Date.prototype);`],
 ['Date prototype is an ordinary object',`let a,b;try{Date.prototype.getTime()}catch(e){a=e.name}try{Date.prototype.valueOf()}catch(e){b=e.name}console.log(a,b,Object.prototype.toString.call(Date.prototype));`],
 ['Date.now host time',`let n=Date.now();console.log(typeof n,n>1600000000000,n<4102444800000,Date.now.length);`],
 ['UTC clock fields and negative times',`let a=new Date(-1),b=new Date(3600000+60000+1000+234);console.log(a.getUTCHours(),a.getUTCMinutes(),a.getUTCSeconds(),a.getUTCMilliseconds(),b.getUTCHours(),b.getUTCMinutes(),b.getUTCSeconds(),b.getUTCMilliseconds());`],
 ['multi argument calendar with UTC local policy',`let a=new Date(2016,6,6,23,59,59,1000),b=new Date(2016,6,6,0,0,0,-1);console.log(a.getTime(),b.getTime(),a.getUTCMilliseconds(),b.getUTCMilliseconds(),Date.UTC(2016,6,7),Date.UTC(99,0,1),Date.UTC(0,0,1));`,'1467849600000 1467763199999 0 999 1467849600000 915148800000 -2208988800000\n'],
 ['calendar fields at epoch and negative boundary',`for(let t of [0,-1,86400000,-86400000,Date.UTC(2000,1,29),Date.UTC(1900,2,1)]){let d=new Date(t);console.log(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCDay())}`],
 ['invalid calendar fields',`let d=new Date(NaN);console.log(Number.isNaN(d.getUTCFullYear()),Number.isNaN(d.getUTCMonth()),Number.isNaN(d.getUTCDate()),Number.isNaN(d.getUTCDay()))`],
 ['setTime clips and stores the numeric value',`let d=new Date(0);console.log(d.setTime(-1234.9),d.getTime(),Number.isNaN(d.setTime(8640000000000001)),Number.isNaN(d.getTime()),d.setTime(42),d.getTime())`],
 ['setTime checks receiver before coercion',`let log=[];let arg={valueOf(){log.push('valueOf');return 4}};try{Date.prototype.setTime.call({},arg)}catch(e){log.push(e.name)}console.log(log.join(','))`],
 ['timezone offset follows UTC host policy',`let a=new Date(0),b=new Date(NaN);console.log(a.getTimezoneOffset(),Number.isNaN(b.getTimezoneOffset()))`,'0 true\n'],
 ['Date constructor copies internal time',`let d=new Date(1234);d.valueOf=()=>{throw Error('called')};console.log(new Date(d).getTime())`],
 ['calendar fields across Gregorian eras',`for(let t of [-8640000000000000,-2208988800000,-62167219200000,-1,0,951782400000,946684800000,8640000000000000]){let d=new Date(t);console.log(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCDay())}`],
 ['Annex B getYear',`for(let t of [Date.UTC(1899,0,1),Date.UTC(1900,0,1),Date.UTC(2000,0,1),NaN]){let d=new Date(t);console.log(d.getYear())}`],
 ['millisecond setters normalize negative dates',`for(let t of [-1,0,999,1000]){let d=new Date(t);console.log(d.setUTCMilliseconds(1234.9),d.getTime());console.log(d.setMilliseconds(-2),d.getTime())}`],
 ['millisecond setter invalid values',`let d=new Date(NaN);console.log(Number.isNaN(d.setUTCMilliseconds(1)),Number.isNaN(d.getTime()));d=new Date(0);console.log(Number.isNaN(d.setMilliseconds()),Number.isNaN(d.getTime()))`],
 ['second setters preserve and override milliseconds',`for(let t of [-1,0,61007]){let d=new Date(t);console.log(d.setUTCSeconds(2),d.getTime());console.log(d.setSeconds(-3,12),d.getTime())}`],
 ['second setter snapshots invalid time',`let d=new Date(NaN),v={valueOf(){d.setTime(0);return 2}};console.log(Number.isNaN(d.setSeconds(v)),d.getTime())`],
 ['minute setters preserve and override lower fields',`for(let t of [-1,0,3661007]){let d=new Date(t);console.log(d.setUTCMinutes(2),d.getTime());console.log(d.setMinutes(-3,12,34),d.getTime())}`],
 ['minute setter snapshots invalid time',`let d=new Date(NaN),v={valueOf(){d.setTime(0);return 2}};console.log(Number.isNaN(d.setMinutes(v)),d.getTime())`],
] as const)test(name,()=>expectProgram(source,expected??runOracle(source).stdout));
