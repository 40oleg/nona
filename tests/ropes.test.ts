import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runOnHost} from './helpers/host.js';

// Ropes (src/runtime/strings.ts): a long `+` result is a rope until something
// reads its units. The code generator flattens a slot before any operation
// other than `+`, a copy, a global store, `typeof`, `!` and `.length` reads
// it, so every consumer sees a flat string. Compared with Node.js, under GC
// stress (every operation collects, so ropes and their halves are marked and
// flattening allocates in the middle of a collection-heavy heap).
const ropeSource=String.raw`
const log=(...a)=>console.log(a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));
let s='';for(let i=0;i<300;i++)s+='abc'+i;
log(s.length,s.slice(0,9),s.slice(-6),s.indexOf('abc299'),s===s.slice(0),s<s+'z',typeof s,!s,!'',s?1:0);
function f(n){let r='';for(let i=0;i<n;i++)r+='r'+i;return r}
log(f(100).length,f(100)===f(100),f(100).replace(/r/g,'').length,new Set([f(50),f(50)]).size,new Map([[f(50),1]]).get(f(50)),({[f(40)]:7})[f(40)],f(40) in {[f(40)]:1});
var g='';for(var i=0;i<200;i++)g+='g'+i;
log(globalThis.g.length,JSON.stringify(globalThis.g).length,Object.getOwnPropertyDescriptor(globalThis,'g').value.length,Object.values(globalThis).filter(x=>typeof x==='string'&&x.length>100).length);
let acc='';for(let q=0;q<300;q++){acc+=q;if(acc.length>500&&typeof acc==='string'&&acc)break}
log(acc.length,acc.charAt(500),acc[7],acc.charCodeAt(3),@T@I{acc}@T.length,(acc+acc).length,[acc].join().length,acc==acc.slice(0),acc<acc+'z',acc.split('9').length);
function* gen(){let s='';for(let i=0;i<100;i++){s+='g'+i;if(i%40===0)yield s}return s}
log([...gen()].map(x=>x.length));
(async()=>{let s='';for(let i=0;i<100;i++){s+='a'+i;if(i==50)await null}return s})().then(s=>log('async',s.length));
try{let e='';for(let i=0;i<100;i++)e+='e'+i;throw e}catch(x){log('caught',x.length,typeof x)}
function closureAcc(){let c='';const add=x=>{c+=x};for(let i=0;i<200;i++)add('cl'+i);return c}
log(closureAcc().length,closureAcc().slice(-5));
function argsAcc(p){for(let i=0;i<100;i++)p+='p'+i;return [arguments[0].length,p.length]}
log(argsAcc('start'));
let sw='';for(let i=0;i<100;i++)sw+='w';switch(sw){case 'w'.repeat(100):log('switch ok');break;default:log('switch bad')}
let num='';for(let i=0;i<70;i++)num+='1';log(+num>1e69,num-1>1e69,Number(num).toString().length,parseInt(num.slice(0,5)),isNaN(num));
let d='';for(let i=0;i<100;i++)d+='d';d+=5;d+=null;d+=undefined;d+=true;d+={};d+=[1,2];d+=Symbol.iterator.description;log(d.length,d.slice(100));
let u='';for(let i=0;i<100;i++)u+='é😀'+i;log(u.length,[...u].length,encodeURIComponent(u).length,u.normalize('NFD').length,u.toUpperCase().slice(0,4));
const o={};let k='';for(let i=0;i<40;i++)k+='key'+i;o[k]=1;log(Object.keys(o)[0].length,o[k],k in o,delete o[k],k in o);
let big='';for(let i=0;i<2000;i++)big+='0123456789';const parts=[];for(let i=0;i<50;i++)parts.push(big+i);
log(parts[5].length,parts[49].slice(-3),parts.map(p=>p.length).reduce((a,b)=>a+b),big.length,JSON.stringify({big}).length,[big+'1',big+'2'].join('').length,big.lastIndexOf('9'));
let shared='';for(let i=0;i<100;i++)shared+='s'+i;const t1=shared,t2=shared+'!';log(t1===shared,t2.length,t1.length,t2.slice(-3),shared.length,t2.startsWith(t1));
class K{constructor(){this.v='';for(let i=0;i<100;i++)this.v+='v'+i}get len(){return this.v.length}}
log(new K().len,new K().v.slice(-4));
let tpl='';for(let i=0;i<60;i++)tpl=@T@I{tpl}@I{i}@T;log(tpl.length,tpl.slice(0,5),String(tpl).length,new String(tpl).length,tpl.at(-1));
`.replace(/@T/g,'`').replace(/@I\{/g,'${');
test('ropes agree with Node.js under GC stress',()=>{
 const run=runOnHost(ropeSource);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(ropeSource).stdout);
});

// Deep ropes: an append loop makes a left-deep tree as deep as the loop is
// long; flattening and collecting it must not recurse.
const deepSource=String.raw`
let s='';for(let i=0;i<200000;i++)s+='abc'+i;
console.log(s.length,s.slice(0,12),s.slice(-9));
let t='';for(let i=0;i<300000;i++)t+='x';
console.log(t.length,t.indexOf('y'),t===t.slice(0));
function f(){let r='';for(let i=0;i<100000;i++){r+='<li>'+i+'</li>';if(i%25000===0)r.length}return r}
console.log(f().length);
`;
test('ropes flatten and collect deep append chains',()=>{
 const run=runOnHost(deepSource,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(deepSource).stdout);
});
