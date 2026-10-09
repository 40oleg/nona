import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runOnHost} from './helpers/host.js';

// One reaction record per then (#44): the job order of every path that
// creates, settles or adopts a promise must stay the one Node.js produces.
function expectOracle(source:string):void {
 const expected=runOracle(source).stdout;
 for(const gcStress of [true,false]){
  const run=runOnHost(source,{gcStress});
  assert.equal(run.error,undefined);
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stdout,expected,`gcStress ${gcStress}`);
 }
}

test('reactions on pending and settled promises run in registration order',()=>expectOracle(`
 var log=[],resolve,reject;
 var pending=new Promise(function(y){resolve=y}),failing=new Promise(function(y,n){reject=n});
 for(var i=0;i<5;i++)(function(i){pending.then(function(v){log.push('p'+i+':'+v)})})(i);
 failing.then(function(){log.push('never')}).catch(function(e){log.push('derived '+e)});
 failing.catch(function(e){log.push('c'+e)});
 failing.then(undefined,function(e){log.push('r'+e)});
 var settled=Promise.resolve('s');
 settled.then(function(v){log.push('s1'+v)});
 queueMicrotask(function(){log.push('micro')});
 resolve('x');reject('y');
 settled.then(function(v){log.push('s2'+v)});
 pending.then(function(v){log.push('late'+v)});
 setTimeout(function(){console.log(log.join(' '))},0);
`));

test('handler results, thrown errors, thenables and self resolution propagate through chains',()=>expectOracle(`
 var log=[];
 var thenable={then:function(y){log.push('then called');y('t')}};
 Promise.resolve(1).then(function(v){return v+1}).then(function(v){throw new Error('e'+v)})
  .then(function(){log.push('skipped')}).catch(function(e){log.push(e.message);return thenable})
  .then(function(v){log.push('adopted '+v);return Promise.resolve('inner')}).then(function(v){log.push(v)});
 var self=Promise.resolve().then(function(){return self});
 self.catch(function(e){log.push(e.constructor.name)});
 Promise.reject(new Error('r')).then(null,undefined).catch(function(e){log.push('passed '+e.message)});
 Promise.resolve(2).then(5,6).then(function(v){log.push('identity '+v)});
 var getterThrows={get then(){throw new Error('getter')}};
 Promise.resolve(getterThrows).catch(function(e){log.push(e.message)});
 for(var i=0;i<3;i++)Promise.resolve(i).then(function(v){log.push('tick '+v)});
 setTimeout(function(){console.log(log.join('|'))},0);
`));

test('async functions, await and async generators keep their tick counts',()=>expectOracle(`
 var log=[];
 async function a(){log.push('a0');await null;log.push('a1');await Promise.resolve();log.push('a2');return 'ra'}
 async function b(){log.push('b0');try{await Promise.reject(new Error('b'))}catch(e){log.push('b caught')}throw new Error('bt')}
 async function* g(){yield 1;await null;yield Promise.resolve(2);return 3}
 a().then(function(v){log.push(v)});
 b().catch(function(e){log.push(e.message)});
 Promise.resolve().then(function(){log.push('p1')}).then(function(){log.push('p2')}).then(function(){log.push('p3')}).then(function(){log.push('p4')});
 (async function(){for await(var v of g())log.push('g'+v);for await(var w of [Promise.resolve('s'),'t'])log.push(w)})();
 var it=g();it.next().then(function(r){log.push('n'+r.value)});it.return(9).then(function(r){log.push('ret'+r.value+r.done)});
 setTimeout(function(){console.log(log.join(' '))},0);
`));

test('subclasses and foreign capabilities still go through the species constructor',()=>expectOracle(`
 var log=[];
 class Sub extends Promise{constructor(executor){log.push('construct');super(executor)}}
 var derived=Sub.resolve(1).then(function(v){return v+1});
 log.push(derived instanceof Sub);
 derived.then(function(v){log.push('sub '+v)});
 var p=Promise.resolve(3);
 p.constructor=function(executor){log.push('custom');executor(function(v){log.push('custom resolve '+v)},function(e){log.push('custom reject '+e)})};
 p.constructor[Symbol.species]=p.constructor;
 p.then(function(v){return v*2});
 var q=Promise.reject('no');q.constructor=p.constructor;q.catch(function(){throw 'again'});
 log.push(Promise.reject(1).catch(function(){}) instanceof Promise);
 setTimeout(function(){console.log(log.join(' '))},0);
`));

test('a chain of 200 000 reactions settles in order',()=>{
 const source=`
 var p=Promise.resolve(0);
 for(var i=0;i<200000;i++)p=p.then(function(v){return v+1});
 p.then(function(v){console.log('end',v)});
 `;
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,'end 200000\n');
});
