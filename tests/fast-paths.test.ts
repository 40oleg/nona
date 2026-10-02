import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

// Programs whose observable behaviour must not change when the runtime takes
// a fast path (dense elements, named-property lookups, Map/Set hash index,
// chunked heap, string builder, inline number operators) instead of the generic one. Each is run on
// the host target under GC stress and compared with Node.js.
const programs:Record<string,string>={
 'dense elements and array semantics':`
const a=[];for(let i=0;i<300;i++)a.push(i);let s=0;for(let i=0;i<a.length;i++)s+=a[i];
const b=new Array(50);for(let i=0;i<50;i++)b[i]=i*2;
const c=[1,2,3];c[5]=9;c[2]="x";
console.log(s,a.length,b.length,b[49],b[50],c.length,c[3],c.join(","),Object.keys(c).join());
delete c[1];console.log(c[1],1 in c,c.length,Object.keys(c).join());
c.length=2;console.log(c.join(","),c[2],c[5]);
const d=[3,1,2];d.sort((x,y)=>x-y);console.log(d.join(","));
Object.freeze(d);d[0]=100;d[3]=1;console.log(d.join(","),d.length);
const e=[1,2];Object.defineProperty(e,"0",{get(){return "g";}});e[1]=5;console.log(e[0],e[1]);
const f=[];f[-0]="z";f[1.5]="h";f[-1]="n";f[4294967295]="big";console.log(f[0],f["1.5"],f["-1"],f.length,f[4294967295]);
Array.prototype[7]="proto";const g=[0];console.log(g[7]);g[7]="own";console.log(g[7],g.length,Object.keys(g).join());delete Array.prototype[7];
const sparse=[];sparse[1000000]=1;sparse[3]=2;console.log(sparse.length,sparse[3],sparse[1000000],sparse[5]);
function args(){return arguments;}const ar=args(1,2,3);console.log(ar[1],ar.length);
const m=[[1,2],[3,4]];let t=0;for(let i=0;i<2;i++)for(let j=0;j<2;j++)t+=m[i][j]*m[j][i];console.log(t);
const h=[1,2,3];h.length=10;h[9]=1;h.push(5);console.log(h.length,h[10],h[4]);
const big=[];for(let i=0;i<50;i++)big[i*3]=i;console.log(big.length,big[147],big[146],Object.keys(big).length);
const j=[1,2,3];console.log(JSON.stringify(j),Object.keys(j).join(),j.indexOf(2),j.includes(3),j.map(x=>x*2).join(),j.slice(1).join(),[...j].join(),Array.from(j).join());
const k=[1,2,3];Object.preventExtensions(k);k[3]=4;k[0]=10;console.log(k.join(),k.length);
const l=[1,2,3];Object.seal(l);delete l[0];l[1]=5;console.log(l.join(),Object.isSealed(l),Object.isFrozen(l));
const o={0:"a",1:"b",x:1};o[2]="c";console.log(JSON.stringify(o),Object.keys(o).join(),o["1"],o[1],"1" in o,2 in o,delete o[0],o[0],Object.keys(o).join());
const n=Object.create(null);n[0]=1;n[1]=2;console.log(n[0]+n[1],Object.keys(n).join(),JSON.stringify(n));
const {0:p0,...rest}=[1,2,3];console.log(p0,JSON.stringify(rest));
for(const key in [1,2,3])console.log(key);
console.log(Math.max.apply(null,[5,6]),Math.max(...[5,6]),(function(){return arguments.length;}).apply(null,[5,6]));
const q=[1,2,3,4,5];q.splice(1,2);q.unshift(0);q.shift();q.reverse();console.log(q.join(),q.length,q.pop(),q.join());
const r=[1,2,3];r.forEach((v,i,arr)=>{arr[i]=v*3;});console.log(r.join(),r.filter(x=>x>3).join(),r.reduce((s,x)=>s+x,0),r.some(x=>x===6),r.every(x=>x>0),r.find(x=>x>3),r.findIndex(x=>x===9));
const u=[1,,3];console.log(u.length,1 in u,Object.keys(u).join(),u.indexOf(undefined),u.findIndex(x=>x===undefined));
class Arr extends Array{sum(){return this.reduce((a,b)=>a+b,0);}}const v=new Arr();v.push(1,2,3);console.log(v.length,v.sum(),v instanceof Arr,Array.isArray(v),v.map(x=>x).constructor===Arr);
const w=[1,2,3];Object.defineProperty(w,"length",{writable:false});try{w.push(4);}catch(err){console.log("len ro",err.constructor.name);}w[5]=1;console.log(w.length,w[5],JSON.stringify(w));
const x=[0];Object.defineProperty(Array.prototype,"1",{set(val){console.log("setter",val);},get(){return "G";},configurable:true});x[1]="x";console.log(x[1],x.length,Object.keys(x).join());delete Array.prototype[1];
const y=[1,2,3];y.x=1;console.log(Object.keys(y).join(),JSON.stringify(y),Object.entries(y).length);
`,
 'named properties':`
const o={a:1,b:2};o.c=3;o.a=10;console.log(o.a,o.b,o.c,o.d,JSON.stringify(o),Object.keys(o).join());
const p=Object.create(o);p.b=20;console.log(p.a,p.b,p.c,Object.keys(p).join(),p.hasOwnProperty("a"),"a" in p);
const g={get x(){return 42;},set y(v){this._y=v*2;}};const h=Object.create(g);h.y=5;console.log(h.x,h._y,Object.keys(h).join(),g.x);
const ro={};Object.defineProperty(ro,"k",{value:1,writable:false});const rc=Object.create(ro);rc.k=2;console.log(rc.k,Object.keys(rc).length);
const fr=Object.freeze({z:1});fr.z=2;fr.w=3;console.log(fr.z,fr.w);
const ne=Object.preventExtensions({q:1});ne.q=5;ne.r=1;console.log(ne.q,ne.r);
const proto={};const child=Object.create(proto);child.__proto__={pp:1};console.log(child.pp,Object.getPrototypeOf(child)!==proto,child.__proto__.pp);
const keys={};keys["0"]="zero";keys["01"]="o1";keys[1]="one";keys["-1"]="m1";keys["1.5"]="f";console.log(keys[0],keys["01"],keys["1"],keys[-1],keys[1.5],Object.keys(keys).join("|"));
const len={length:5};console.log(len.length,[1,2].length,Object.create([1,2,3]).length);
class A{constructor(){this.v=1;}get gv(){return this.v+1;}m(){return this.v;}}class B extends A{m(){return super.m()+10;}}const bb=new B();bb.v=5;console.log(bb.m(),bb.gv,bb.constructor===B,Object.keys(bb).join());
globalThis.gg=7;console.log(globalThis.gg,gg,typeof globalThis.console);
const s="str";console.log(s.length,s.foo,s.toUpperCase(),(5).toFixed(1),true.toString(),Symbol.iterator in [],typeof [][Symbol.iterator]);
const sym=Symbol("s");const so={[sym]:1,x:2};console.log(so[sym],so.x,Object.getOwnPropertySymbols(so).length);
const many={};for(let i=0;i<100;i++)many["k"+i]=i;let t=0;for(let i=0;i<100;i++)t+=many["k"+i];console.log(t,many.k50,Object.keys(many).length);delete many.k50;console.log(many.k50,Object.keys(many).length);
const fn=function(){};fn.prop=1;console.log(fn.prop,fn.name,fn.length,typeof fn.call,fn.nope);
const arr=[1,2];arr.extra="e";console.log(arr.extra,arr.length,Object.keys(arr).join(),JSON.stringify(arr));
const pr=new Proxy({t:1},{get:(o,k)=>k==="t"?99:o[k]});console.log(pr.t,pr.u);
const un={u:undefined};console.log("u" in un,un.u,Object.keys(un).join());
const nested={a:{b:{c:1}}};nested.a.b.c=2;nested.a.b.d=3;console.log(JSON.stringify(nested));
Object.prototype.inherited="I";console.log(({}).inherited,[].inherited);delete Object.prototype.inherited;console.log(({}).inherited);
const emptyKey={};emptyKey[""]="e";console.log(emptyKey[""],Object.keys(emptyKey).length);
`,
 'Map, Set and WeakMap with many keys':`
const m=new Map();for(let i=0;i<500;i++)m.set(i,i*2);let s=0;for(let i=0;i<500;i++)s+=m.get(i);
console.log(m.size,s,m.get(-0),m.get(499),m.has("5"),m.get(500));
m.set(NaN,"nan");m.set(-0,"zero");m.set("str",1);m.set("str",2);const o={};m.set(o,"obj");m.set(10n,"big");m.set(true,"t");m.set(undefined,"u");m.set(null,"n");
console.log(m.get(NaN),m.get(0),m.get("st"+"r"),m.get(o),m.get({}),m.get(10n),m.get(true),m.get(undefined),m.get(null),m.size);
for(let i=0;i<500;i+=2)m.delete(i);console.log(m.size,m.get(0),m.get(1),m.has(2),m.has(3));
m.set(2,"again");console.log(m.get(2),[...m.keys()].length);m.clear();console.log(m.size,m.get(1));m.set(1,1);console.log(m.get(1),m.size);
const st=new Set();for(let i=0;i<300;i++)st.add("k"+(i%100));console.log(st.size,st.has("k99"),st.has("k100"),st.delete("k0"),st.has("k0"),st.size);
const wm=new WeakMap();const keys=[];for(let i=0;i<100;i++){const k={i};keys.push(k);wm.set(k,i);}
let ws=0;for(const k of keys)ws+=wm.get(k);console.log(ws,wm.has({}),wm.delete(keys[5]),wm.has(keys[5]),wm.get(keys[6]));
keys.length=50;for(let i=0;i<300;i++)({a:i});let ws2=0;for(const k of keys)ws2+=wm.get(k);console.log(ws2,wm.get(keys[49]));
`,
 'promise chains and sort':`
let p=Promise.resolve(0);for(let i=0;i<40;i++)p=p.then(v=>v+1);p.then(v=>console.log("chain",v));
const a=[5,3,undefined,1,,4,"b","a",10,2];a.sort();console.log(a.length,4 in a,String(a[0]),String(a[9]));
const b=[5,3,1,4,2].sort((x,y)=>y-x);console.log(b.join());
const o={length:3,0:"c",1:"a",2:"b"};Array.prototype.sort.call(o);console.log(o[0],o[1],o[2]);
console.log([{k:1,v:"a"},{k:0,v:"b"},{k:1,v:"c"},{k:0,v:"d"}].sort((x,y)=>x.k-y.k).map(x=>x.v).join(""));
const big=[];for(let i=0;i<60;i++)big.push((i*7919)%1009);big.sort((x,y)=>x-y);let ok=true;for(let i=1;i<big.length;i++)if(big[i-1]>big[i])ok=false;console.log(ok,big[0],big[59]);
`,
 'inline number operators':`
const vals=[0,-0,1,-1,1.5,NaN,Infinity,2**31,2**32+5,2**53,"3","abc",true,null,undefined,10n,{},-2147483648,4294967295];
const fmt=r=>typeof r==='object'?'obj':Object.is(r,-0)?'-0':String(r);
const ops=[(a,b)=>a+b,(a,b)=>a-b,(a,b)=>a*b,(a,b)=>a/b,(a,b)=>a%b,(a,b)=>a<b,(a,b)=>a<=b,(a,b)=>a>b,(a,b)=>a>=b,(a,b)=>a==b,(a,b)=>a!=b,(a,b)=>a===b,(a,b)=>a!==b,(a,b)=>a&b,(a,b)=>a|b,(a,b)=>a^b,(a,b)=>a<<b,(a,b)=>a>>b,(a,b)=>a>>>b];
const un=[a=>-a,a=>+a,a=>!a,a=>~a];
const out=[];
for(const a of vals)for(const b of vals)for(const f of ops){let r;try{r=fmt(f(a,b));}catch(e){r='E:'+e.constructor.name}out.push(r);}
for(const a of vals)for(const f of un){let r;try{r=fmt(f(a));}catch(e){r='E:'+e.constructor.name}out.push(r);}
for(const a of vals){let x=a,y=a,r;try{x++;y--;r=fmt(x)+'|'+fmt(y)}catch(e){r='E:'+e.constructor.name}out.push(r);}
for(const a of vals){out.push(a?'T':'F');let n=0;while(a&&n<2)n++;out.push(n);}
for(const a of vals)for(const b of vals){out.push(a<b?'y':'n');out.push(a==b?'y':'n');out.push(a!==b?'y':'n');if(a>=b)out.push(1);else out.push(0);}
let h=0;for(const s of out)for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;
console.log(out.length,h,out.slice(0,60).join());
const o={valueOf(){return 7;}};console.log(o+1,o*2,o<8,o==7,-o,!o,1<<o,o>>>1);
let i=0;for(;i<10;i++);console.log(i,i>>1,i<<30,i<<31,(2**40)|0,(2**32+7)&255,(-1)>>>0,(-1)>>>31,1.9|0,-1.9|0);
`,
 'large block churn':`
let s="x".repeat(9000);for(let i=0;i<400;i++)s=s+"y";console.log(s.length,s.slice(-3));
const keep=[];for(let i=0;i<200;i++){keep.push(new Float64Array(3000));if(keep.length>5)keep.shift();}console.log(keep.length,keep[0].length);
let b="";for(let i=0;i<3000;i++)b+="abc"+i;console.log(b.length,b.indexOf("abc2999"));
`,
 'JSON and join through the string builder':`
console.log(JSON.stringify({a:1,b:[1,"x",null,undefined,()=>1,{c:true}],d:undefined,e:{f:{g:[]}},h:"q\\"\\n"}));
console.log(JSON.stringify([undefined,function(){},Symbol("s")]),JSON.stringify(undefined),JSON.stringify(null),JSON.stringify("s"),JSON.stringify(1e21),JSON.stringify(NaN));
console.log(JSON.stringify({a:1,b:{c:[1,2,{d:3}]},e:[]},null,2));
console.log(JSON.stringify({a:1,b:2,c:{d:4}},["a","c","d"]),JSON.stringify({a:1,b:2},(k,v)=>typeof v==="number"?v*2:v),JSON.stringify({a:[1,2]},null,"--"));
console.log(JSON.stringify({toJSON(){return {x:1};}}),JSON.stringify({a:new Number(3),b:new String("s"),c:new Boolean(false)}));
const big=[];for(let i=0;i<300;i++)big.push({id:i,name:"item"+i,tags:["a","b"]});const s=JSON.stringify(big);console.log(s.length,JSON.parse(s)[299].name,[1,2,3].join("-"),big.map(x=>x.id).join(",").length,Array(5).join("x"),[null,undefined,1].join());
const parts=[];for(let i=0;i<500;i++)parts.push("abc"+i);const j=parts.join("-");console.log(j.length,j.slice(0,20),j.split("-").length);
try{const cyc={};cyc.self=cyc;JSON.stringify(cyc);}catch(e){console.log(e.constructor.name);}
console.log(JSON.stringify({a:{b:undefined,c:undefined}}),JSON.stringify([{a:undefined}]),JSON.stringify({},null,2),JSON.stringify([],null,2),JSON.stringify({a:[]},null,1));
const cyc=[1];cyc.push(cyc);try{cyc.join();console.log("join ok");}catch(e){console.log(e.constructor.name);}
`,
};

// The operator matrix does not allocate on its fast paths and is too large to
// run with a collection before every operation, so it runs without GC stress.
const plainPrograms=new Set(['inline number operators']);

for(const [name,source] of Object.entries(programs))test(`fast paths agree with Node.js: ${name}`,()=>{
 const expected=runOracle(source).stdout;
 const run=runOnHost(source,{gcStress:!plainPrograms.has(name)});
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,expected);
});
