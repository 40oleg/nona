import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';

const cases:[string,string][]=[
 ['default and number hint prefer valueOf','let log="",o={valueOf:function(){log+="v";return 7;},toString:function(){log+="s";return "str";}};console.log(o+1,+o,o*2,o<8,o==7,log);'],
 ['string hint prefers toString','let log="",o={valueOf:function(){log+="v";return 7;},toString:function(){log+="s";return "key";}};let a={key:9};console.log(a[o],o in a,[o].join(""),log);console.log(delete a[o],log);'],
 ['fallback skips noncallable and object results','let a={valueOf:3,toString:function(){return "8";}},b={valueOf:function(){return {};},toString:function(){return 9;}};console.log(+a,b+1);let key={toString:null,valueOf:function(){return "x";}};console.log({x:4}[key]);'],
 ['second method is read after first callback','let o={valueOf:function(){this.toString=function(){return "changed";};return this;}};console.log(o+"!");'],
 ['wrapper conversions respect overrides','let n={}.valueOf.call(4);n.valueOf=function(){return 12;};n.toString=function(){return "wrapped";};console.log(n+1,[n].join(""));'],
 ['array length invokes conversion twice','let n=0,a=[1,2,3],v={valueOf:function(){n++;return n===1?4294967297:1;}};a.length=v;console.log(n,a.length,a[0],1 in a);'],
 ['join converts length and separator before elements','let log="",item={toString:function(){log+="i";return "item";}},o={0:item,length:{valueOf:function(){log+="l";return 1;}}},s={toString:function(){log+="s";return "|";}};console.log([].join.call(o,s),log);'],
 ['apply and radix accept user conversion','let n={valueOf:function(){return 2;}},o={0:7,1:8,length:n};function f(a,b){return a+b;}console.log(f.apply(null,o),(31).toString({valueOf:function(){return 16;}}));'],
 ['bitwise conversions run left to right','let log="",a={valueOf:function(){log+="a";return 5;}},b={valueOf:function(){log+="b";return 2;}};console.log(a|b,a<<b,~a,log);'],
 ['temporary strings and detached operands survive callbacks','let a={valueOf:function(){return "left"+3;}},b={valueOf:function(){a=null;b=null;for(let i=0;i<20;i++){({text:""+i});}return "right"+4;}};console.log(a+b);'],
 ['join survives removal of current and later references','let a=[{toString:function(){a[0]=null;for(let i=0;i<20;i++){({x:""+i});}return "one"+1;}},{toString:function(){return "two"+2;}}];console.log(a.join({toString:function(){return "--"+3;}}));'],
 ['property base survives key callback deleting last external reference','let o={x:9},key={toString:function(){o=null;for(let i=0;i<20;i++){({s:""+i});}return "x";}};console.log(o[key]);o={x:3};console.log(key in o);o={x:4};console.log(delete o[key]);'],
 ['comparison operators keep left to right callback order','let log="",a={valueOf:function(){log+="a";return "11";}},b={valueOf:function(){log+="b";return "2";}};console.log(a<b,a<=b,a>b,a>=b,log);'],
 ['bound conversion and inherited fallback','let p={toString:function(){return this.x;}},o={__proto__:p,x:"inherited",valueOf:null};console.log(o+"!");o.valueOf=function(){return this.n;}.bind({n:8});console.log(o*2);'],
 ['nullish results are valid primitives','let o={valueOf:function(){return null;}};console.log(o+1,o==null);o.valueOf=function(){};console.log(o+1,o==undefined);'],
];
for(const [name,source] of cases)test('coercion with GC stress: '+name,()=>{
 const run=runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

for(const source of [
 'let o={valueOf:3,toString:null};console.log(+o);',
 'let o={valueOf:function(){console.log("v");return this;},toString:function(){console.log("s");return {};}};console.log(o+1);',
 'let n=0,a=[];a.length={valueOf:function(){console.log(++n);return n;}};',
 'let a=[];a.length={valueOf:function(){console.log("convert");return -1;}};',
])test('coercion failure retains observable callback order: '+source,()=>{
 const run=runNative(linkHost(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
 const oracle=spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:5000,windowsHide:true});
 assert.equal(oracle.error,undefined);assert.equal(oracle.status,1);
 assert.equal(run.stdout.toString(),oracle.stdout);
});
