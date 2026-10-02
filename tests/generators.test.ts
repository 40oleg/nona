import test from 'node:test';
import {expectProgram} from './helpers/program.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

test('generator body starts on first next and completion is stable',()=>{
 expectProgram('let n=0;function* g(){n++;yield 1;return 2;}let it=g();console.log(n,it.next().value,n,it.next().value,it.next().done);','0 1 1 2 true\n');
});

test('generator parameters initialize at call time while the body stays suspended',()=>{
 expectProgram('let n=0;function* g(x=(n++,3)){n+=10;yield x;}let it=g();console.log(n,it.next().value,n);','1 3 11\n');
});

test('generator parameter errors escape from the call',()=>{
 expectProgram('let n=0;function* g(x=bad()){n++;yield x;}try{g();}catch(e){console.log(e.name,n);}','ReferenceError 0\n');
});
test('next sends a value back to yield',()=>{
 expectProgram('function* g(){let x=yield 1;return x+3;}let it=g();console.log(it.next().value,it.next(7).value,it.next().done);','1 10 true\n');
});
test('generator methods retain their receiver',()=>{
 expectProgram('let o={x:4,*g(){yield this.x;return this.x+1;}};let it=o.g();console.log(it.next().value,it.next().value);','4 5\n');
});

test('generator instances use the function prototype and its fallback',()=>{
 expectProgram('function* g(){}let p={x:7};g.prototype=p;console.log(Object.getPrototypeOf(g())===p,g().x);g.prototype=3;console.log(Object.getPrototypeOf(g())===Object.getPrototypeOf((function*(){}).prototype));','true 7\ntrue\n');
});

test('generator methods retain an own prototype object',()=>{
 expectProgram('let o={*g(){yield 1;}};console.log(Object.getOwnPropertyDescriptor(o.g,"prototype")!==undefined,Object.getPrototypeOf(o.g())===o.g.prototype);','true true\n');
});

test('generator functions share the generator function prototype',()=>{
 expectProgram('function* a(){}function* b(){}let base=Object.getPrototypeOf(a);console.log(base===Object.getPrototypeOf(b),Object.getPrototypeOf(base)===Function.prototype,base.prototype===Object.getPrototypeOf(a.prototype));','true true true\n');
});
test('generator is iterable in for-of',()=>{
 expectProgram('function* g(){yield 2;yield 4;yield 8;}let s=0;for(let x of g())s+=x;console.log(s);','14\n');
});

test('yield star delegates array iteration and returns the iterator completion value',()=>{
 expectProgram('function* inner(){yield 2;yield 4;return 9;}function* outer(){let a=yield* inner();yield a;yield* [3,5];}console.log([...outer()].join(","));','2,4,9,3,5\n');
});

test('yield star forwards next values to the delegated iterator',()=>{
 expectProgram('function* inner(){let x=yield 1;return x+5;}function* outer(){return yield* inner();}let it=outer();console.log(it.next().value,it.next(7).value,it.next().done);','1 12 true\n');
});

test('yield star requires iterator results to be objects',()=>{
 expectProgram('let bad={[Symbol.iterator](){return this;},next(){return 3;}};function* g(){yield* bad;}let it=g();try{it.next();}catch(e){console.log(e.name,it.next().done);}','TypeError true\n');
});

test('yield star forwards throw to the inner generator',()=>{
 expectProgram('function* inner(){try{yield 1;}catch(e){yield e+1;}return 8;}function* outer(){let x=yield* inner();yield x;}let it=outer();console.log(it.next().value,it.throw(4).value,it.next().value,it.next().done);','1 5 8 true\n');
});

test('yield star forwards return and allows a final yield',()=>{
 expectProgram('function* inner(){try{yield 1;}finally{yield 2;}}function* outer(){return yield* inner();}let it=outer(),a=it.next(),b=it.return(7),c=it.next();console.log(a.value,b.value,b.done,c.value,c.done);','1 2 false 7 true\n');
});

test('yield star closes an iterator that lacks throw',()=>{
 expectProgram('let closed=0,o={[Symbol.iterator](){return this;},next(){return {value:1,done:false};},return(){closed++;return {done:true};}};function* g(){yield* o;}let it=g();it.next();try{it.throw(3);}catch(e){console.log(e.name,closed,it.next().done);}','TypeError 1 true\n');
});

test('yield star return without a delegate return runs outer finally',()=>{
 expectProgram('let o={[Symbol.iterator](){return this;},next(){return {value:1,done:false};}};function* g(){try{yield* o;}finally{console.log("finally");}}let it=g();console.log(it.next().value);let end=it.return(7);console.log(end.value,end.done);','1\nfinally\n7 true\n');
});

test('yield star can yield a delegate return result before finishing',()=>{
 expectProgram('let n=0,o={[Symbol.iterator](){return this;},next(){return {value:++n,done:false};},return(x){return {value:x+1,done:false};}};function* g(){yield* o;}let it=g();console.log(it.next().value,it.return(7).value,it.next().value);','1 8 2\n');
});
test('uncaught generator throw reaches the caller and closes the generator',()=>{
 expectProgram('function* g(){yield 1;throw 7;}let it=g();console.log(it.next().value);try{it.next();}catch(e){console.log(e);}console.log(it.next().done);','1\n7\ntrue\n');
});
test('generator throw enters a suspended catch handler',()=>{
 expectProgram('function* g(){try{yield 1;}catch(e){yield e+1;}return 9;}let it=g();console.log(it.next().value,it.throw(4).value,it.next().value,it.next().done);','1 5 9 true\n');
});
test('throw before generator start closes it without running the body',()=>{
 expectProgram('let n=0;function* g(){n++;yield 1;}let it=g();try{it.throw(7);}catch(e){console.log(e,n,it.next().done);}','7 0 true\n');
});
test('return before start and after yield closes a generator',()=>{
 expectProgram('let n=0;function* g(){n++;yield 1;yield 2;}let a=g();let x=a.return(8);console.log(x.value,x.done,n,a.next().done);let b=g();console.log(b.next().value,b.return(9).value,b.next().done);','8 true 0 true\n1 9 true\n');
});
test('generator return bypasses catch and executes finally',()=>{
 expectProgram('function* g(){try{yield 1;}catch(e){console.log("caught");}finally{console.log("final");}}let it=g();console.log(it.next().value);let r=it.return(8);console.log(r.value,r.done,it.next().done);','1\nfinal\n8 true true\n');
});
test('generator return can yield from finally before completing',()=>{
 expectProgram('function* g(){try{yield 1;}finally{yield 2;}}let it=g();let a=it.next(),b=it.return(8),c=it.next();console.log(a.value,b.value,b.done,c.value,c.done);','1 2 false 8 true\n');
});
test('suspended generator retains local objects through stress GC',()=>{
 const source='function* g(){let keep={x:"alive"};yield 1;for(let i=0;i<30;i++)({x:i});return keep.x;}let it=g();console.log(it.next().value,it.next().value);';
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,String(run.stderr));assert.equal(String(run.stdout),'1 alive\n');
});

test('delegated iterator and suspended values survive stress GC',()=>{
 const source='function* inner(){let keep={text:"held"};yield keep;return keep.text;}function* outer(){return yield* inner();}let it=outer();let first=it.next().value;for(let i=0;i<30;i++)({v:i});console.log(first.text,it.next().value);';
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,String(run.stderr));assert.equal(String(run.stdout),'held held\n');
});
