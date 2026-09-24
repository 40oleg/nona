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
 ['Error call and construct', 'let a=Error("hello"),b=new Error(7);console.log(a.name,a.message,String(a),b.message,String(b),a!==b,a instanceof Error);'],
 ['native error family', 'let types=[EvalError,RangeError,ReferenceError,SyntaxError,TypeError,URIError];for(let i=0;i<types.length;i++){let C=types[i],e=new C("x");console.log(C.name,C.length,e.name,String(e),e instanceof C,e instanceof Error,Object.getPrototypeOf(C)===Error);}'],
 ['undefined message omitted', 'let a=Error(),b=Error(undefined),c=Error("");console.log(a.hasOwnProperty("message"),b.hasOwnProperty("message"),c.hasOwnProperty("message"),String(a),String(c));'],
 ['message descriptor', 'let e=Error("x"),d=Object.getOwnPropertyDescriptor(e,"message");console.log(d.value,d.writable,d.enumerable,d.configurable,Object.keys(e).length);e.message=7;console.log(String(e));delete e.message;console.log(String(e));'],
 ['prototype descriptors and tags', 'console.log(Object.getOwnPropertyNames(Error.prototype).join(),Object.getOwnPropertyNames(TypeError.prototype).join());console.log(Object.prototype.toString.call(Error.prototype),Object.prototype.toString.call(Error("x")),Object.prototype.toString.call(TypeError("x")));let d=Object.getOwnPropertyDescriptor(Error,"prototype");console.log(d.writable,d.enumerable,d.configurable);'],
 ['generic tostring defaults', 'let f=Error.prototype.toString;console.log(f.call({}),f.call({name:"",message:"x"}),f.call({name:"A",message:""}),f.call({name:null,message:null}));'],
 ['tostring getter and conversion order', 'let n={toString(){console.log("name conversion");return "N";}},o={get name(){console.log("name");return n;},get message(){console.log("message");return {toString(){console.log("message conversion");return "M";}};}};console.log(Error.prototype.toString.call(o));'],
 ['constructor coercion and throw', 'try{Error({toString(){throw 7;}});}catch(e){console.log(e);}let e=TypeError({toString(){return ""+42;}});console.log(String(e));'],
 ['throw error through finally and gc', 'try{try{throw new RangeError(""+42);}finally{for(let i=0;i<30;i++){({x:""+i});}}}catch(e){console.log(e.name,e.message,e instanceof Error);}'],
 ['bound error constructor', 'let C=TypeError.bind(null,"bound");let e=new C();console.log(String(e),e instanceof C,e instanceof TypeError,e instanceof Error);'],
 ['prototype properties keep managed values alive', 'Error.prototype.message=""+42;Error.prototype.name={toString(){return "custom";}};for(let i=0;i<30;i++){({x:""+i});}console.log(String(Error()));'],
 ['constructors mutable and shadowable', 'let original=TypeError;TypeError=function(){return 7;};console.log(TypeError(),original("x").name);function f(Error){return Error;}console.log(f(3));'],
 ['constructor own message bypasses inherited setter', 'Object.defineProperty(Error.prototype,"message",{set(v){throw 1;},configurable:true});let e=Error("x");console.log(e.message,e.hasOwnProperty("message"));'],
 ['name conversion occurs before reading message', 'let o={name:{toString(){throw 7;}},get message(){console.log("bad");return "x";}};try{Error.prototype.toString.call(o);}catch(e){console.log(e);}'],
 ['native error prototype retains mutated object through gc', 'TypeError.prototype.message={toString(){return "ok";}};for(let i=0;i<30;i++){({x:""+i});}console.log(String(TypeError()));'],
];
for(const [name,source] of cases)test('Error objects: '+name,()=>{
 const expected=runOracle(source);
 const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.toString(),expected.stdout);
});
