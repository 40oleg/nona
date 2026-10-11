import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import type {FunctionIR,Operation} from '../src/ir/model.js';

// Constant folding, constant propagation, constant branch elimination and
// removal of dead pure operations (src/ir/constants.ts, src/ir/copies.ts;
// #146 items 1-3 and 10). Programs run under GC stress against Node.js; the
// IR checks confirm that the passes fired (or did not, for the negative
// cases).
const agree=(source:string)=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};
const fn=(source:string,name:string):FunctionIR=>compileToIR(source).functions.find(f=>f.name===name)!;
const ops=(f:FunctionIR):Operation[]=>f.blocks.flatMap(block=>block.operations);
const kinds=(f:FunctionIR,kind:Operation['kind'])=>ops(f).filter(op=>op.kind===kind);
const constants=(f:FunctionIR)=>ops(f).flatMap(op=>op.kind==='constant'?[op.value]:[]);

// Template literals (ToString of each substitution) in a plain string: the
// test sources are String.raw templates.
const templates="function templates(){const n=3,x=0.1;return [`${n}!`,`${x}`,`${-0}`,`${null}`,`${1e21}`].join('|');}\n";
test('folded operators on primitives keep JavaScript semantics',()=>agree(templates+String.raw`
const out=[];
const show=v=>typeof v==='number'&&Object.is(v,-0)?'-0':typeof v+':'+String(v);
function numbers(){
 const a=24*60*60,b=-0,c=0/0,d=1/0,e=-1/0,f=7%-3,g=-7%3,h=2**10,i=2**-1,j=(-2)**3,k=0.1+0.2,l=-0*1,m=0*-1,n=-0+0,o=-0-0;
 return [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,1/b,1/l,1/n,1/o].map(show).join();
}
function bits(){
 const a=5&3,b=5|3,c=5^3,d=~5,e=1<<31,f=-1>>>0,g=-1>>28,h=1<<33,i=2**32|0,j=~~3.7,k=-8>>>1,l=NaN|0,m=Infinity>>0;
 return [a,b,c,d,e,f,g,h,i,j,k,l,m].map(show).join();
}
function strings(){
 const a='a'+1,b=1+'a',c='x'+null+undefined+true,d=1+2+'3',e='1'+2+3,f='5'*'2',g='5'-2,h=+'0x1f',i=+' 12 ',j=+'',k=-'3',l=+'1e3',m='b'>'a',n='10'<'9',o='10'<9;
 const p='a'+0.5,q='a'+1e21,r='a'+-0,s=String(-0)+'',t='x'+NaN+Infinity;
 return [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t].map(show).join();
}
function equality(){
 const a=null==undefined,b=null===undefined,c=NaN===NaN,d=NaN!=NaN,e=0===-0,f='1'==1,g=true==1,h=null==0,i=undefined==0,j=''==0,k='0'==false,l=null>=0;
 return [a,b,c,d,e,f,g,h,i,j,k,l].map(show).join();
}
function unary(){
 const a=!0,b=!'',c=!'0',d=typeof null,e=typeof undefined,f=typeof 1,g=typeof 'x',h=typeof 1n,i=+true,j=-null,k=+undefined,l=~'7',m=!NaN,n=-(-0);
 return [a,b,c,d,e,f,g,h,i,j,k,l,m,n].map(show).join();
}
function updates(){let a=1;a++;let b='5';b++;let c=null;c--;let d=-0;d++;let e=2**53;e++;return [a,b,c,d,e].map(show).join();}
function bigints(){const a=2n**64n,b=1n+2n,c=7n/2n,d=-(1n),e=1n===1n,f=1n==1,g=typeof 2n,h=!0n;let i;try{i=1n+1}catch(x){i=x.name}let j;try{j=1n/0n}catch(x){j=x.name}return [a,b,c,d,e,f,g,h,i,j].map(show).join();}
out.push(numbers(),bits(),strings(),equality(),unary(),updates(),templates(),bigints());
console.log(out.join('\n'));
`));

test('constants flow along feasible paths only',()=>agree(String.raw`
const out=[];
function loop(n){let x=0;for(let i=0;i<n;i++)x=x+1;return x}
function merge(c){let x=1;if(c)x=2;return x*10}
function same(c){let x=1;if(c)x=1;return x+1}
function pruned(){const mode='production';if(mode==='production')return 'start';else return 'debug'}
function nested(){let s=0;const k=3;if(k>2){if(k<5)s=1;else s=2}else s=3;return s}
function whileFalse(){let n=0;while(false)n++;do{n++}while(n<0&&false);return n}
function caught(){let v=1;try{v=2;throw 0}catch(e){v=v+1}finally{v=v*10}return v}
function errorSlot(){let e=5;try{null.x}catch(error){e=error instanceof TypeError}return e}
function handlerConst(){let r='a';try{r='b';JSON.parse('{')}catch(x){r=r+'c'}return r}
function captured(){let x=1;const set=()=>{x=2};set();return x}
function args(a){a=1;arguments[0]=2;return a}
function strictArgs(a){'use strict';a=1;arguments[0]=2;return a}
function tdz(){if(false){let z=1;return z}try{return w}catch(e){return e.name}let w=2}
function sw(){const k=2;switch(k){case 1:return 'one';case 2:return 'two';default:return 'other'}}
function* gen(){let x=1;x=(yield x)+1;yield x}
function cond(){const a=0;return (a?'t':'f')+(a||'or')+(a&&'and')+(a??'nn')+(null??'n2')}
function loopConst(){let r=[];for(let i=0;i<3;i++){const c=10;r.push(c+i)}return r.join()}
const g=gen();g.next();
out.push(loop(4),merge(true),merge(false),same(true),pruned(),nested(),whileFalse(),caught(),errorSlot(),handlerConst(),captured(),args(0),strictArgs(0),tdz(),sw(),g.next(41).value,cond(),loopConst());
console.log(out.join('|'));
`));

test('dead pure operations are removed, effectful ones stay',()=>agree(String.raw`
const out=[];
function dead(x,y){const a=x===y,b=!x,c=typeof x,d=x==null;return 'ok'}
function effects(o){const unused=o*100;const u2=o+'';const u3=o<1;return 'done'}
let count=0;const obj={valueOf(){count++;return 1},toString(){count++;return 's'}};
out.push(dead(1,2),effects(obj),count);
try{effects(Symbol())}catch(e){out.push(e.name)}
try{effects(1n)}catch(e){out.push(e.name)}
console.log(out.join('|'));
`));

test('constant expressions and propagated constants fold in the IR',()=>{
 const seconds=fn('function seconds(){const s=24*60*60;return s}','seconds');
 assert.equal(kinds(seconds,'binary').length,0);
 assert.ok(constants(seconds).includes(86400));
 const total=fn('function total(){const price=100;const quantity=3;const total=price*quantity;return total}','total');
 assert.equal(kinds(total,'binary').length,0);
 assert.ok(constants(total).includes(300));
 const negative=fn('function negative(x){return x===-1}','negative');
 assert.equal(kinds(negative,'unary').length,0,'-1 is a constant');
 assert.ok(constants(negative).includes(-1));
 const text=fn('function text(){const name="Nona";return "Hello, "+name+"!"}','text');
 assert.ok(constants(text).includes('Hello, Nona!'));
});

test('a branch on a constant becomes a jump and the dead arm disappears',()=>{
 const source='function run(){const mode="production";if(mode==="production")start();else enableDebug()}';
 const f=fn(source,'run');
 assert.equal(f.blocks.filter(block=>block.terminator.kind==='branch').length,0);
 const names=ops(f).flatMap(op=>op.kind==='readGlobalProperty'?[op.name]:[]);
 assert.deepEqual(names,['start']);
});

test('values that are not constant on every path or depend on the engine are not folded',()=>{
 const loop=fn('function loop(n){let x=0;for(let i=0;i<n;i++)x=x+1;return x}','loop');
 assert.ok(kinds(loop,'binary').some(op=>op.kind==='binary'&&op.operator==='+'));
 const merge=fn('function merge(c){let x=1;if(c)x=2;return x*10}','merge');
 assert.ok(kinds(merge,'binary').some(op=>op.kind==='binary'&&op.operator==='*'));
 const fraction=fn('function fraction(){return "a"+0.1}','fraction');
 assert.ok(kinds(fraction,'binary').length===1,'Number-to-String of a fraction stays at run time');
 const big=fn('function big(){return 1n+2n}','big');
 assert.equal(kinds(big,'binary').length,1,'BigInt arithmetic is not folded');
 const power=fn('function power(){return 1.1**2.5}','power');
 assert.equal(kinds(power,'binary').length,1,'** of fractions is not folded');
 const captured=fn('function captured(){let x=1;const set=()=>{x=2};set();return x+1}','captured');
 assert.equal(kinds(captured,'binary').length,1,'a captured binding is not a known constant');
 const args=fn('function args(a){a=1;arguments[0]=2;return a+1}','args');
 assert.equal(kinds(args,'binary').length,1,'a mapped arguments object aliases parameters');
});

test('an unused strict comparison is removed, an unused conversion is not',()=>{
 const f=fn('function f(x,y){const a=x===y,b=!x,c=typeof x;const d=x*100;return 1}','f');
 const binaries=kinds(f,'binary');
 assert.equal(binaries.length,1);
 assert.ok(binaries[0]!.kind==='binary'&&binaries[0]!.operator==='*');
 assert.equal(kinds(f,'unary').length,0);
});
