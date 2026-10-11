import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compile,compileToIR} from '../src/compiler.js';
import type {FunctionIR,Operation} from '../src/ir/model.js';

// Control-flow clean-up (src/ir/control-flow.ts; #146 items 3 and 14):
// branches on `!x`, short-circuit conditions tested once, empty blocks
// skipped, single-predecessor blocks merged, and jumps to the next block
// left out of the generated code. Programs run under GC stress against
// Node.js; IR and assembly checks confirm the transformations fired.
const agree=(source:string)=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};
const fn=(source:string,name:string):FunctionIR=>compileToIR(source).functions.find(f=>f.name===name)!;
const ops=(f:FunctionIR):Operation[]=>f.blocks.flatMap(block=>block.operations);
const branches=(f:FunctionIR)=>f.blocks.filter(block=>block.terminator.kind==='branch').length;

test('negated and short-circuit conditions keep their truthiness and evaluation order',()=>agree(String.raw`
const out=[];const log=[];
const t=(name,v)=>{log.push(name);return v};
const values=[0,-0,NaN,'',' ','0',null,undefined,false,true,1,-1,0n,1n,{},[],function(){},Symbol('s')];
function not(v){if(!v)return 'F';return 'T'}
function notnot(v){if(!!v)return 'T';return 'F'}
function triple(v){return !!!v?'F':'T'}
function or(a,b){if(t('a',a)||t('b',b))return 'or';return 'none'}
function and(a,b){if(t('a',a)&&t('b',b))return 'and';return 'not'}
function nullish(a,b){if(t('a',a)??t('b',b))return 'nn';return 'nil'}
function mixed(a,b,c){if((t('a',a)||t('b',b))&&!t('c',c))return 'yes';return 'no'}
function value(a,b){const r=a||b;return r}
function negOr(a,b){if(!(a||b))return 'neither';return 'some'}
function loop(n){let i=0,s=0;while(!(i>=n)){s+=i;i++}return s}
function doWhile(n){let i=0;do{i++}while(!(i>n)&&i<10);return i}
function ternary(a,b){return (a?b:!b)?'x':'y'}
function labels(){let r='';outer:for(let i=0;i<3;i++){for(let j=0;j<3;j++){if(!(j<2))continue outer;if(i===2&&!j)break outer;r+=i+''+j}}return r}
function sw(k){let r='';switch(k){case 0:r+='a';case 1:r+='b';break;default:r+='d';case 2:r+='c'}return r}
function guarded(o){try{if(!o.x)throw new Error('no x');return 'ok'}catch(e){return e.message}finally{log.push('fin')}}
function* gen(v){if(!(yield v))yield 'falsy';else yield 'truthy'}
// Fused Number comparisons with each target emitted next (NaN is unordered).
function pairs(n){let c=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j)c++;let d=0;for(let i=0;i<n;i++)if(i===2)d++;else d+=10;return c+"/"+d}
function relations(){const r=[];
 for(let i=0;i<5;i++)for(let j=0;j<5;j++){const z=0;let a=z,b=z,k='';
  if(i===1)a=-z;else if(i===2)a=z+1;else if(i===3)a=z/z;else if(i===4)a=1/z;
  if(j===1)b=-z;else if(j===2)b=z+1;else if(j===3)b=z/z;else if(j===4)b=1/z;
  if(a!==b)k+='n';if(a!=b)k+='N';if(a===b)k+='e';if(a<b)k+='l';if(!(a<b))k+='L';if(a>=b)k+='g';if(!(a>=b))k+='G';r.push(k)}
 return r.join(' ')}
const coerced={valueOf(){log.push('valueOf');return 0},toString(){log.push('toString');return ''}};
out.push(values.map(not).join(''),values.map(notnot).join(''),values.map(triple).join(''));
for(const [a,b] of [[0,0],[0,1],[1,0],[1,1],[null,0],[undefined,1]]){out.push(or(a,b),and(a,b),nullish(a,b),negOr(a,b),String(value(a,b)));}
out.push(mixed(0,1,0),mixed(0,0,0),mixed(1,0,1),loop(5),doWhile(3),ternary(0,0),ternary(1,0),labels(),sw(0),sw(1),sw(2),sw(3));
out.push(pairs(4),relations(),guarded({x:1}),guarded({}),not(coerced),notnot(coerced),or(coerced,1),and(coerced,1));
const g=gen(1);g.next();out.push(g.next(0).value);
out.push(log.join(','));
console.log(out.join('|'));
`));

test('a branch on !x branches on x',()=>{
 const f=fn('function f(v){if(!!v)return 1;if(!v)return 2;return 3}','f');
 assert.equal(ops(f).filter(op=>op.kind==='unary'&&op.operator==='!').length,0);
 assert.equal(branches(f),2);
 // The value of !x is still computed where it is used as a value.
 const g=fn('function g(v){const n=!v;return n}','g');
 assert.equal(ops(g).filter(op=>op.kind==='unary'&&op.operator==='!').length,1);
});

test('a short-circuit condition tests each operand once',()=>{
 const f=fn('function f(x,a){if(x===null||x===undefined)return a;return x.value}','f');
 assert.equal(branches(f),2,'two tests, no test of the materialized result');
 const g=fn('function g(a,b,c){if(a&&b&&c)return 1;return 2}','g');
 assert.equal(branches(g),3);
 const h=fn('function h(a,b){if(a||b)return 1;return 2}','h');
 assert.equal(branches(h),2);
});

test('empty blocks are skipped and straight-line blocks merged',()=>{
 const f=fn('function f(a){let s=0;if(a)s=1;else s=2;s=s+1;return s}','f');
 for(const block of f.blocks)assert.ok(block.operations.length>0||block.terminator.kind!=='jump','no block only jumps');
 const g=fn('function g(){let s=0;{s=1}{s=s+2}return s}','g');
 assert.equal(g.blocks.length,1);
});

test('no jump goes to the block emitted right after it',()=>{
 const source='function f(x){if(!x)return 1;let s=0;for(let i=0;i<x;i++){if(i%2)continue;s+=i}while(s>100)s-=7;return s}\nconsole.log(f(9));\n';
 const result=compile(source,{fileName:'/app.js',target:'linux-x64',printAsm:true});
 assert.ok(result.ok);
 const lines=result.assembly!.split('\n');
 const body=lines.slice(lines.indexOf('js.fn.0:'),lines.indexOf('js.fn.0.end:'));
 let jumps=0;
 body.forEach((line,i)=>{
  const target=/\bjmp (js\.fn\.0\.block\.\d+)$/.exec(line)?.[1];
  if(!target)return;
  jumps++;
  assert.notEqual(body[i+1],target+':',`${line} falls through to the next block`);
 });
 assert.ok(jumps>0,'the loop still jumps back');
});
