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

const cases: [string,string][] = [
 ['normal and caught completion', 'try{console.log(1);}finally{console.log(2);}try{throw 3;}catch(e){console.log(e);}finally{console.log(4);}'],
 ['uncaught throw runs finally', 'try{try{throw 1;}finally{console.log(2);}}catch(e){console.log(e);}'],
 ['return value survives mutations and gc', 'function f(){let o={x:7};try{return o;}finally{o=null;for(let i=0;i<30;i++){({x:""+i});}}}console.log(f().x);'],
 ['finally return replaces throw and return', 'function f(n){try{if(n)throw 1;return 2;}finally{return 3;}}console.log(f(0),f(1));'],
 ['finally throw replaces return', 'function f(){try{return 1;}finally{throw 2;}}try{f();}catch(e){console.log(e);}'],
 ['catch return and catch throw', 'function f(n){try{throw 1;}catch(e){if(n)throw 2;return e;}finally{console.log(3);}}console.log(f(0));try{f(1);}catch(e){console.log(e);}'],
 ['labeled continue and break', 'let n=0;outer:for(let i=0;i<3;i++){try{while(true){if(i===0)continue outer;break outer;}}finally{n++;}}console.log(n);try{throw 7;}catch(e){console.log(e);}'],
 ['local loop exits do not run finally early', 'try{for(let i=0;i<3;i++){if(i===0)continue;break;}console.log(1);}finally{console.log(2);}'],
 ['finally break replaces return', 'function f(){outer:while(true){try{return 1;}finally{break outer;}}return 2;}console.log(f());'],
 ['finally continue replaces throw', 'let n=0;for(let i=0;i<3;i++){try{throw 7;}finally{n++;continue;}}console.log(n);'],
 ['nested finalizers order', 'function f(){try{try{return 1;}finally{console.log(2);}}finally{console.log(3);}}console.log(f());'],
 ['nested finally overrides pending values', 'function f(){try{try{throw 1;}finally{return 2;}}finally{try{throw 3;}catch(e){console.log(e);}}}console.log(f());'],
 ['internal finally break preserves pending return', 'function f(){try{return 7;}finally{while(true){break;}console.log(1);}}console.log(f());'],
 ['finally closure captures fresh cells', 'let a,b;for(let i=0;i<2;i++){try{continue;}finally{let x=i;let f=function(){return x;};if(i)a=f;else b=f;}}console.log(a(),b());'],
 ['finally is outside catch parameter scope', 'let e=1;try{throw 2;}catch(e){console.log(e);}finally{console.log(e);}'],
 ['coercion exception restores join and executes finally', 'let a=[{toString(){throw 7;}}];try{try{a.join();}finally{a[0]=3;console.log(a.join());}}catch(e){console.log(e);}'],
 ['finally throw bypasses its own catch', 'try{try{console.log(1);}catch(e){console.log("bad");}finally{throw 2;}}catch(e){console.log(e);}'],
 ['return expression before finally', 'let n=0;function f(){try{return ++n;}finally{n++;}}console.log(f(),n);'],
 ['pending throw object survives gc', 'try{try{throw {x:""+42};}finally{for(let i=0;i<30;i++){({x:""+i});}}}catch(e){console.log(e.x);}'],
 ['finalizer labels do not see inner try loops', 'function f(){outer:while(true){try{while(true){return 1;}}finally{break outer;}}return 2;}console.log(f());'],
 ['continue from inner finally still executes outer finally', 'let n=0;outer:for(let i=0;i<3;i++){try{try{throw 1;}finally{continue outer;}}finally{n++;}}console.log(n);'],
 ['inner catch inside finally preserves original pending throw', 'try{try{throw {x:7};}finally{try{throw 2;}catch(e){console.log(e);}}}catch(e){console.log(e.x);}'],
 ['return value snapshot survives assignment in finally', 'function f(){let x=1;try{return x;}finally{x=2;}}console.log(f());'],
 ['finally var hoisting and lexical shadow', 'function f(){try{console.log(x);}finally{var x=7;let a=2;console.log(a);}return x;}console.log(f());'],
 ['throw in finalizer intercepted outside abandoned inner handlers', 'function f(){try{while(true){try{return 1;}catch(e){console.log("bad");}}}finally{throw 2;}}try{f();}catch(e){console.log(e);}'],
];
for(const [name,source] of cases)test('Finally: '+name,()=>{
 const oracle=runOracle(source);
 const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
 assert.equal(result.stdout.toString(),oracle.stdout);
});
