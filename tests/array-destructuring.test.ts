import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['var let const',`var [a,b]=[2,3];let [c,d]=[4,5];const [e,f]=[6,7];console.log(a,b,c,d,e,f);`],
 ['holes and missing values',`var [,a,,b]=[1,2,3];console.log(a,b);`],
 ['rest values',`var [a,...xs]=[1,2,3,4];let [b,...ys]='abc';console.log(a,xs.join(','),b,ys.join(','));`],
 ['iterator close',`var log='';var it={ [Symbol.iterator]:function(){var i=0;return {next:function(){log+='n';return {value:++i,done:false};},return:function(){log+='r';return {};}};}};var [a,b]=it;console.log(a,b,log);`],
 ['for of binding',`var out='';for(let [a,b] of [[1,2],[3,4]])out+=a+':'+b+';';console.log(out);`],
 ['for of rest binding',`var out='';for(const [a,...xs] of [[1,2,3],[4,5]])out+=a+':'+xs.join(',')+';';console.log(out);`],
 ['custom iterator',`var it={ [Symbol.iterator]:function(){var i=0;return {next:function(){return i++<3?{value:i,done:false}:{done:true};}};}};var [a,,c,...rest]=it;console.log(a,c,rest.length);`],
 ['nested arrays',`var [[a,b],,[c,...d]]=[[1,2],0,[3,4,5]];console.log(a,b,c,d.join(','));`],
 ['nested defaults',`let [a=2,[b=3,c=4]=[undefined,8]]= [];console.log(a,b,c);`],
 ['default side effects',`var n=0;var [a=(n++,1),b=(n++,2)]=[undefined,4];console.log(a,b,n);`],
 ['default function names',`var [arrow=()=>{},fn=function(){}]=[];console.log(arrow.name,fn.name);`],
 ['nested rest pattern',`var [...[a,b]]=[4,5,6];console.log(a,b);`],
 ['loop defaults',`var out='';for(let [a=9,b=a+1] of [[undefined,undefined],[3,undefined]])out+=a+':'+b+';';console.log(out);`],
 ['object binding',`var {a,b:x}={a:2,b:3};let {c=5,d:y=8}={d:4};console.log(a,x,c,y);`],
 ['nested object binding',`var {a:[b,{c:d}]}={a:[4,{c:5}]};console.log(b,d);`],
 ['computed object binding',`var log='';var key={toString:function(){log+='k';return 'a';}};var {[key]:value=6}={a:3};console.log(value,log);`],
 ['object binding in loop',`var out='';for(const {a,b=2} of [{a:1},{a:3,b:4}])out+=a+':'+b+';';console.log(out);`],
 ['empty object binding checks null',`try{var {}=null;}catch(e){console.log(e.name);}`],
 ['default failure closes iterator',`var log='';var values={ [Symbol.iterator]:function(){return {next:function(){log+='n';return {value:undefined,done:false};},return:function(){log+='r';return {};}};}};try{var [a=(function(){throw 5;})()]=values;}catch(e){console.log(e,log);}`],
 ['nested failure closes outer iterator',`var log='';var values={ [Symbol.iterator]:function(){return {next:function(){log+='n';return {value:null,done:false};},return:function(){log+='r';return {};}};}};try{var [{a}]=values;}catch(e){console.log(e.name,log);}`],
 ['object rest excludes bound keys',`var calls='';var source={get a(){calls+='a';return 1;},get b(){calls+='b';return 2;}};var {a,...rest}=source;console.log(a,rest.a,rest.b,calls);`],
 ['object rest with computed and symbol keys',`var s=Symbol('s');var source={[s]:3,a:4,b:5};var {[s]:x,a:y,...rest}=source;console.log(x,y,Object.keys(rest).join(','),Object.getOwnPropertySymbols(rest).length);`],
 ['empty object rest',`var {...rest}={a:2};console.log(rest.a);`],
 ['function binding parameters',`function f([a,b],{x,y=4}){return a+b+x+y;}console.log(f([1,2],{x:3}));`],
 ['parameter defaults and TDZ',`function f([a=b,b=2]){return a+b;}try{f([]);}catch(e){console.log(e.name);}function g([a=2,b=a+3]=[]){return b;}console.log(g());`],
 ['arrow and method binding parameters',`var arrow=({x},[y=5])=>x+y;var obj={f({a},[b]){return a*b;}};console.log(arrow({x:2},[]),obj.f({a:3},[4]));`],
 ['rest binding parameter',`function f(a,...[b,c]){return a+b+c;}console.log(f(1,2,3));`],
 ['parameter arguments unmapped',`function f([x]){arguments[0]=[9];return x;}console.log(f([2]));`],
 ['array destructuring assignment',`let a,b,c;var result=([a,b=4,...[c]]=[1,undefined,3]);console.log(a,b,c,result.length);`],
 ['object destructuring assignment',`let a,x,rest;({a,b:x=6,...rest}={a:2,c:3});console.log(a,x,rest.c);`],
 ['assignment evaluates RHS once',`let a,b;var n=0;([a,b]=[n++,n++]);console.log(a,b,n);`],
 ['object assignment shorthand default',`let a;({a=7}={});console.log(a);`],
 ['assignment to properties',`var obj={};var key='x';([obj[key],...obj.rest]=[2,3,4]);({a:obj.y}={a:5});console.log(obj.x,obj.rest.join(','),obj.y);`],
 ['assignment property setter avoids getter',`var out='';var obj={get x(){out+='g';return 1;},set x(v){out+='s'+v;}};([obj.x]=[4]);console.log(out);`],
 ['assignment reference failure closes before next',`var log='';var it={ [Symbol.iterator]:function(){return {next:function(){log+='n';return {value:1,done:false};},return:function(){log+='r';return {};}};}};var fail=function(){throw 5;};try{([{}[fail()]]=it);}catch(e){console.log(e,log);}`],
 ['rest reference failure closes before next',`var log='';var it={ [Symbol.iterator]:function(){return {next:function(){log+='n';return {value:1,done:false};},return:function(){log+='r';return {};}};}};var fail=function(){throw 5;};try{([...{}[fail()]]=it);}catch(e){console.log(e,log);}`],
 ['iterator step failure skips close',`var log='';var it={ [Symbol.iterator]:function(){return {next:function(){log+='n';throw 5;},return:function(){log+='r';return {};}};}};try{([x]=it);}catch(e){console.log(e,log);}`],
];
for(const [name,source] of cases)test(`array destructuring: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

for(const source of [`let [a];`,`const [a];`,`let [a,a]=[1,2];`,`let [...a,b]=[1,2];`,`var x={a=1};`])
 test(`array destructuring early error: ${source}`,()=>assert.throws(()=>compileToIR(source)));

test('array destructuring survives stress GC',()=>{
 const source=`var values=[{x:2},{x:3},{x:4}];var [a,...xs]=values;for(var i=0;i<30;i++)({v:i});console.log(a.x,xs[0].x,xs[1].x);`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
