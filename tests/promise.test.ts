import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

function expectStress(source:string):void {
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
}

test('Promise reactions, thenable assimilation and chains drain after main',()=>expectStress(`
 console.log('sync');
 var thenable={then(resolve){for(var i=0;i<20;i++)({i});console.log('thenable');resolve(5)}};
 Promise.resolve(thenable).then(value=>{console.log('first',value);return value+1}).then(value=>console.log('second',value));
 new Promise(function(resolve,reject){resolve(3);reject(4)}).then(value=>console.log('once',value));
 Promise.reject('error').catch(reason=>console.log('caught',reason));
 console.log('end');
`));

test('Promise all, allSettled, race and finally preserve job order',()=>expectStress(`
 Promise.all([Promise.resolve(2),3]).then(values=>console.log('all',values.join(',')));
 Promise.allSettled([Promise.resolve(4),Promise.reject('x')]).then(values=>console.log('settled',values[0].status,values[0].value,values[1].status,values[1].reason));
 Promise.race([Promise.resolve(5),Promise.resolve(6)]).then(value=>console.log('race',value));
 Promise.resolve(7).finally(()=>console.log('finally')).then(value=>console.log('value',value));
 console.log('sync');
`));

test('Promise self resolution and rejection handlers survive GC stress',()=>expectStress(`
 var resolve,p=new Promise(function(r){resolve=r});resolve(p);
 p.then(undefined,error=>console.log(error.name));
 Promise.resolve(1).then(()=>{throw new Error('boom')}).catch(error=>console.log(error.message));
 Promise.reject('reason').finally(()=>2).catch(reason=>console.log(reason));
`));

test('Promise internal job and result arrays ignore inherited numeric setters',()=>expectStress(`
 Object.defineProperty(Array.prototype,0,{set(){throw new Error('inherited setter')},configurable:true});
 Promise.all([42]).then(values=>{delete Array.prototype[0];console.log(values[0])},error=>{delete Array.prototype[0];console.log(error.name)});
`));

test('Reflect.construct validates Promise executor before newTarget prototype',()=>expectStress(`
 var target=(function(){}).bind(null);
 Object.defineProperty(target,'prototype',{get(){throw new Error('prototype accessed')}});
 try{Reflect.construct(Promise,[],target)}catch(error){console.log(error.name)}
 try{Reflect.construct(Promise,[function(){}],target)}catch(error){console.log(error.name)}
`));
