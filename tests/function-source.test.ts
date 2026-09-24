import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

const cases:[string,string][]=[
 ['source preserves whitespace comments and line endings','function /*hello*/ f ( a,\r\n b ) { // внутри\r\n return a+b;\r\n}\nconsole.log(f.toString());'],
 ['anonymous source excludes surrounding expression parentheses','let f=((function /*匿名*/ (a){return a;}));console.log(f.toString());'],
 ['nested function source and closure identity','function make(x){return function inner(y) { return x+y; };}let a=make(1),b=make(2);console.log(a.toString(),a.toString()===b.toString());'],
 ['escaped identifier text and Unicode body remain original','function \\u0066(a){return "🦊"+a;}console.log(f.toString());'],
 ['metadata mutation does not change function source','function f(a) { return a; }delete f.name;delete f.length;console.log(f.toString());'],
 ['native and bound representations','function f(a){}console.log(f.call.toString(),f.apply.toString(),f.bind.toString(),f.toString.toString(),f.__proto__.toString(),f.bind(null).toString());'],
 ['native source unaffected by name deletion','function f(){}let c=f.call;delete c.name;console.log(c.toString());'],
 ['toString call apply and bound receiver','function f(a){return a;}let s=f.toString;console.log(s.call(f),s.apply(f,[]),s.bind(f)());'],
 ['function source participates in primitive conversion and array join','function f(a){return a;}console.log(""+f,""+[f],f==f.toString());'],
 ['deleting inherited toString uses object Function tag','function f(){}delete f.__proto__.toString;console.log(""+f);'],
 ['toString metadata','function f(){}let t=f.toString;console.log(t.name,t.length,typeof t,"prototype" in t);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of ['function f(){}let t=f.toString;t();','function f(){}f.toString.call({});','function f(){}f.toString.call(3);','function f(){}new f.toString();'])test('function toString protocol error: '+source,()=>{
 const result=compile(source,{fileName:'function-source-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
test('source descriptors and callable methods survive GC',()=>{
 const source='function make(x){return function(a){return x+a;};}let f=make(3),t=f.toString.bind(f);f=null;for(let i=0;i<30;i++){({text:""+i});}console.log(t());';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
