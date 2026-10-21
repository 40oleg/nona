import { test } from "node:test";
import assert from "node:assert/strict";
import { runOracle } from "./helpers/oracle.js";
import { runOnHost } from "./helpers/host.js";

// One reaction record per then (#44): the job order of every path that
// creates, settles or adopts a promise must stay the one Node.js produces.
// A function source gets the gcStress flag, so a test can shorten its program
// under GC stress; each variant is checked against the oracle.
function expectOracle(source: string | ((gcStress: boolean) => string)): void {
    for (const gcStress of [true, false]) {
        const program = typeof source === "string" ? source : source(gcStress);
        const expected = runOracle(program).stdout;
        const run = runOnHost(program, { gcStress });
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected, `gcStress ${gcStress}`);
    }
}

test("reactions on pending and settled promises run in registration order", () =>
    expectOracle(`
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

test("handler results, thrown errors, thenables and self resolution propagate through chains", () =>
    expectOracle(`
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

test("async functions, await and async generators keep their tick counts", () =>
    expectOracle(`
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

test("subclasses and foreign capabilities still go through the species constructor", () =>
    expectOracle(`
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

test("awaiting primitives, promises, thenables and species edge cases keeps the job order", () =>
    expectOracle(`
 var log=[];
 async function prim(tag){for(var v of [undefined,null,0,'s',false,1n,Symbol.iterator])log.push(tag+typeof (await v));return tag}
 prim('x').then(function(t){log.push('done '+t)});
 prim('y');
 (async function(){log.push('t '+(await {then:function(r){r('thenable')}}));log.push('p '+(await Promise.resolve('promise')))})();
 Promise.resolve().then(function(){log.push('q1')}).then(function(){log.push('q2')}).then(function(){log.push('q3')});
 var noCtor=Promise.resolve('nc');noCtor.constructor=undefined;noCtor.then(function(v){log.push('undefined constructor '+v)});
 var nullSpecies=Promise.resolve('ns');nullSpecies.constructor={};nullSpecies.constructor[Symbol.species]=null;nullSpecies.then(function(v){log.push('null species '+v)});
 var bad=Promise.resolve();bad.constructor=1;try{bad.then()}catch(e){log.push(e instanceof TypeError)}
 setTimeout(function(){console.log(log.join(' '))},0);
`));

test("a chain of 200 000 reactions settles in order", () => {
    const source = `
 var p=Promise.resolve(0);
 for(var i=0;i<200000;i++)p=p.then(function(v){return v+1});
 p.then(function(v){console.log('end',v)});
 `;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "end 200000\n");
});

test("then, queueMicrotask and await interleave as in Node.js", () =>
    expectOracle(`
 var log=[];
 var p=Promise.resolve('p');
 queueMicrotask(function(){log.push('m1')});
 p.then(function(v){log.push('t1 '+v);queueMicrotask(function(){log.push('m3')});return 'x'}).then(function(v){log.push('t2 '+v)});
 (async function(){log.push('a0');await p;log.push('a1');await 0;log.push('a2');await new Promise(function(r){queueMicrotask(function(){log.push('m4');r()})});log.push('a3')})();
 queueMicrotask(function(){log.push('m2');p.then(function(){log.push('t3')})});
 Promise.reject('r').then(function(){log.push('never')}).then(undefined,function(e){log.push('caught '+e)});
 setTimeout(function(){console.log(log.join(' '))},0);
`));

// All three chains (about 6000 promises) are built before any reaction runs,
// and GC stress marks that whole live heap on every allocation, so the cost
// grows faster than the length: 1000 hops took 144 s under GC stress
// on Windows and hit the timeout on CI (#418). The runtime itself is linear
// (100 000 hops run in seconds without GC stress), so the long chains run
// without GC stress and 200 hops (still two thrown values) under it.
test("handler-less reactions pass values and reasons through long chains", () =>
    expectOracle(
        (gcStress) => `
 var length=${gcStress ? 200 : 1000};
 var r=Promise.reject(new Error('deep')),f=Promise.resolve('value');
 for(var i=0;i<length;i++){r=r.then(function(){return 'skipped'});f=f.catch(function(){return 'skipped'})}
 for(var i=0;i<length;i++){r=r.then(null,undefined);f=f.then(1)}
 r.catch(function(e){console.log('reason',e.message)});
 f.then(function(v){console.log('value',v)});
 var n=Promise.resolve(0);
 for(var i=0;i<length;i++)n=n.then(function(v){if(v%100===99)throw v+1;return v+1}).catch(function(e){return e});
 n.then(function(v){console.log('alternating',v)});
`,
    ));

test("non-function handlers, thenable results and a patched Promise fall back to the prelude", () =>
    expectOracle(`
 var log=[];
 function f(v){return this===undefined?'strict '+v:'sloppy'}
 'use strict';
 Promise.resolve(1).then(f.bind(undefined,'bound')).then(function(v){log.push(v)});
 Promise.resolve(2).then(new Proxy(function(v){return v*10},{})).then(function(v){log.push('proxy '+v)});
 Promise.resolve(3).then(class{}).catch(function(e){log.push('class '+e.constructor.name)});
 Promise.resolve(4).then(function(v){return {then:function(y){log.push('adopting');y(v+1)}}}).then(function(v){log.push('adopted '+v)});
 Promise.resolve(5).then(function(v){return Promise.resolve(v*2)}).then(function(v){log.push('promise '+v)});
 Promise.resolve(6).then(function(v){return [v]}).then(function(v){log.push('array '+v[0])});
 var own=Promise.resolve(7);own.then=function(a){log.push('own then');return Promise.prototype.then.call(this,a)};
 own.then(function(v){log.push('own '+v)});
 setTimeout(function(){
  var saved=Promise.prototype.constructor;
  Promise.prototype.constructor=function(executor){log.push('patched constructor');return new Promise(executor)};
  Promise.prototype.constructor[Symbol.species]=Promise.prototype.constructor;
  Promise.resolve(8).then(function(v){log.push('after patch '+v)});
  Promise.prototype.constructor=saved;
  var getter=Object.getOwnPropertyDescriptor(Promise,Symbol.species);
  Object.defineProperty(Promise,Symbol.species,{get:function(){log.push('species read');return Promise},configurable:true});
  Promise.resolve(9).then(function(v){log.push('species '+v)});
  Object.defineProperty(Promise,Symbol.species,getter);
  Promise.resolve(10).then(function(v){log.push('restored '+v)});
  setTimeout(function(){console.log(log.join(' | '))},0);
 },0);
`));

test("unhandled rejections are reported once and late handlers report them handled", () =>
    expectOracle(`
 var log=[];
 process.on('unhandledRejection',function(reason,promise){log.push('unhandled '+reason+' '+(promise instanceof Promise))});
 process.on('rejectionHandled',function(promise){log.push('handled late')});
 var late=Promise.reject('late');
 Promise.reject('caught').catch(function(){});
 Promise.resolve().then(function(){throw 'derived'});
 var chained=Promise.reject('chain').then(function(){});
 setTimeout(function(){
  late.catch(function(e){log.push('late catch '+e)});
  chained.catch(function(){});
  setTimeout(function(){console.log(log.join(' | '))},0);
 },0);
`));

test("a 100 000 reaction chain of async functions, then and catch runs without stack growth", () => {
    const source = `
 var p=Promise.resolve(0);
 for(var i=0;i<100000;i++)p=i%3===0?p.then(function(v){return v+1}):i%3===1?p.then(async function(v){return v+1}):p.then(function(v){throw v+1}).catch(function(v){return v});
 p.then(function(v){console.log('end',v)});
 (async function(){var n=0;for(var i=0;i<100000;i++)n+=await i;console.log('await',n)})();
 `;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("promises of two realms share one job queue", () => {
    const source = `
 var other=__nonaCreateRealm(),log=[];
 var mine=Promise.resolve('main'),theirs=other.Promise.resolve('other');
 mine.then(function(v){log.push(1+v)});
 theirs.then(function(v){log.push(2+v)});
 Promise.prototype.then.call(theirs,function(v){log.push(3+v)});
 other.Promise.prototype.then.call(mine,function(v){log.push(4+v)}).then(function(){log.push(5)});
 mine.then(function(){return theirs}).then(function(v){log.push(6+v)});
 queueMicrotask(function(){log.push(7)});
 other.Promise.resolve(8).then(function(v){log.push(v)});
 setTimeout(function(){console.log(log.join(' '))},0);
 `;
    for (const gcStress of [true, false]) {
        const run = runOnHost(source, { gcStress, realms: 1 });
        assert.equal(run.status, 0, run.stderr);
        assert.equal(
            run.stdout,
            "1main 2other 3other 4main 7 8 5 6other\n",
            `gcStress ${gcStress}`,
        );
    }
});
