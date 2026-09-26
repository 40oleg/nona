import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const programs:[string,string][]=[
  ['expression and block bodies',`var f=x=>x+1;var g=(a,b)=>{return a*b;};console.log(f(2),g(3,4));`],
  ['lexical this',`var o={x:7,f:function(){return ()=>this.x;}};var a=o.f();console.log(a.call({x:9}));`],
  ['lexical primitive this',`function f(){return ()=>this;}var a=f.call(3);console.log(typeof a(),a());`],
  ['lexical arguments',`function f(x){return y=>arguments[0]+y;}console.log(f(5)(7));`],
  ['lexical new.target',`function F(){this.f=()=>new.target===F;}console.log(new F().f());`],
  ['lexical super',`var p={x:6};var o={__proto__:p,m(){return ()=>super.x+this.y;},y:2};console.log(o.m()());`],
  ['not constructable',`var f=()=>1;try{new f();}catch(e){console.log(e instanceof TypeError);}`],
  ['source and metadata',`var f=(x)=>x;console.log(f.name,f.length,f.toString());`],
  ['nested arrows',`var f=x=>y=>x+y;console.log(f(3)(4));`],
  ['object expression body',`var f=()=>({x:7});console.log(f().x);`],
];
for(const [name,source] of programs)test(`arrow: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('arrow: lexical receiver survives stress GC',()=>{
  const source=`function F(){this.x={v:8};this.f=()=>this.x.v;}var o=new F();var f=o.f;o=null;for(var i=0;i<100;i++)({x:""+i});console.log(f());`;
  const image=linkPe(generate(compileToIR(source),{gcStress:true}));
  const run=runNative(image);
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
