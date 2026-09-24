import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
const cases:[string,string][]=[
 ['bare and explicit receivers', 'function f(){"use strict";return this;}console.log(f()===undefined,f.call(null)===null,f.call(3)===3,f.apply("x",[])==="x",f.bind(false)()===false);'],
 ['script strict context inherited', '"use strict";function f(){return this;}let g=function(){return this;};let o={m(){return this;}};console.log(f()===undefined,g.call(1)===1,o.m.call(null)===null);'],
 ['outer function strict inherited', 'function outer(){"use strict";return function(){return this;};}console.log(outer()()===undefined);'],
 ['strict callee does not affect sloppy function', 'function sloppy(){return this===globalThis;}function strict(){"use strict";return sloppy();}console.log(strict());'],
 ['directive after other directive', 'function f(){"hello";"use strict";return this;}console.log(f()===undefined);'],
 ['escaped pseudo directive stays sloppy', 'function f(){"use\\x20strict";return this===globalThis;}function g(){("use strict");return this===globalThis;}console.log(f(),g());'],
 ['block string does not enable strict', 'function f(){{"use strict";}return this===globalThis;}console.log(f());'],
 ['statement ends directive prologue', 'function f(){0;"use strict";return this===globalThis;}console.log(f());'],
 ['strict method and accessor raw receiver', 'let o={m(){"use strict";return this;},get x(){"use strict";return this;}};let g=Object.getOwnPropertyDescriptor(o,"x").get;console.log(o.m.call(2)===2,g.call(null)===null);'],
 ['strict named expression writes throw', 'let f=function self(){"use strict";try{self=3;}catch(e){console.log(e.name);}return self;};console.log(f()===f);'],
 ['strict constructor still receives object', 'function F(){"use strict";this.x=7;console.log(new.target===F);}let o=new F();console.log(o.x,o instanceof F);'],
 ['raw receiver survives gc', 'function f(){"use strict";for(let i=0;i<30;i++){({x:""+i});}return this;}console.log(f.call(""+42));'],
 ['strict arguments never maps parameters', 'function f(a){"use strict";a=2;console.log(arguments[0]);arguments[0]=3;console.log(a);return arguments;}let args=f(1);console.log(args[0]);'],
 ['strict arguments with captured parameter', 'function f(a){"use strict";let g=function(){return a;};arguments[0]=7;a=3;return g;}console.log(f(1)());'],
 ['strict callee accessor throws', 'function f(){"use strict";try{console.log(arguments.callee);}catch(e){console.log(e.name);}try{arguments.callee=3;}catch(e){console.log(e.name);}let d=Object.getOwnPropertyDescriptor(arguments,"callee");console.log(d.get===d.set,d.enumerable,d.configurable,d.get.name,d.get.length,Object.isFrozen(d.get));}f();'],
 ['strict caller and arguments access throws', 'function f(){"use strict";}try{console.log(f.caller);}catch(e){console.log(e.name);}try{console.log(f.arguments);}catch(e){console.log(e.name);}let a=Object.getOwnPropertyDescriptor(Function.prototype,"caller"),b=Object.getOwnPropertyDescriptor(Function.prototype,"arguments");console.log(a.configurable,a.enumerable,b.configurable,b.enumerable);'],
 ['strict arguments extra and missing values', 'function f(a,b){"use strict";console.log(arguments.length,arguments[0],arguments[1],arguments[2],a,b);}f(1);f(1,2,3);'],
 ['strict arguments object survives gc', 'function f(a){"use strict";return arguments;}let a=f({x:""+42});for(let i=0;i<30;i++){({x:""+i});}console.log(a[0].x);'],
 ['strict missing global throws after rhs', '"use strict";try{missing=(console.log("rhs"),1);}catch(e){console.log(e.name);}console.log(typeof missing);'],
 ['strict global deletion in rhs', '"use strict";globalThis.dynamic=1;try{dynamic=(delete globalThis.dynamic,2);}catch(e){console.log(e.name);}console.log(typeof dynamic);'],
 ['strict dynamic global read', '"use strict";globalThis.dynamic=7;console.log(dynamic);try{console.log(missing);}catch(e){console.log(e.name);}'],
];
for(const [name,source] of cases)test('strict mode: '+name,()=>{
 const expected=runOracle(source);const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.toString(),expected.stdout);
});
for(const source of [
 'function f(a,a){"use strict";}', '"use strict";function f(a,a){}',
 'function f(eval){"use strict";}', 'function f(arguments){"use strict";}',
 '"use strict";var eval;', '"use strict";let arguments;',
 'function eval(){"use strict";}', 'let f=function arguments(){"use strict";};',
 'function f(){"use strict";arguments=1;}', '"use strict";eval++;',
 '"use strict";var x;delete x;', '"use strict";delete missing;',
 '"use strict";try{}catch(eval){}',
])test('strict early error: '+source,()=>assert.throws(()=>bind(parse(lex(source)))));

test('strict assignment preserves an unresolvable reference across RHS effects',()=>{
 const source='"use strict";try{missing=(globalThis.missing=1,2);}catch(e){console.log(e.name);}console.log(globalThis.missing);';
 const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
 assert.equal(result.stdout.toString(),'ReferenceError\n1\n');
});

test('ES2020 restricted function properties share the ThrowTypeError intrinsic',()=>{
 const source='let a=Object.getOwnPropertyDescriptor(Function.prototype,"caller"),b=Object.getOwnPropertyDescriptor(Function.prototype,"arguments");function f(){"use strict";return Object.getOwnPropertyDescriptor(arguments,"callee");}let c=f();console.log(a.get===a.set,a.get===b.get,a.get===b.set,a.get===c.get,a.get===c.set,Object.isFrozen(a.get));';
 const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
 assert.equal(result.stdout.toString(),'true true true true true true\n');
});
