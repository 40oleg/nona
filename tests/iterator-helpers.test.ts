import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// ES2025 iterator helpers (#322), compared with Node.js under GC stress.
const common = `
function* gen(n){for(let i=1;i<=n;i++)yield i;}
function plain(n,log){let i=0;return{next(){log&&log.push("next");return i<n?{value:++i,done:false}:{value:undefined,done:true};},return(){log&&log.push("return");return{};}};}
const show=(v)=>JSON.stringify(v);
const err=(f)=>{try{f();return "ok";}catch(e){return e.constructor.name;}};
`;
const programs: Record<string, string> = {
    "lazy helpers on arrays, generators, Map/Set iterators and plain objects": `
const sources=()=>[[1,2,3,4][Symbol.iterator](),gen(4),new Set([1,2,3,4]).values(),new Map([[1,"a"],[2,"b"],[3,"c"],[4,"d"]]).keys(),Iterator.from(plain(4))];
for(const s of sources())console.log(show(s.map((x,i)=>x*10+i).toArray()));
for(const s of sources())console.log(show(s.filter((x,i)=>x%2===0||i===0).toArray()));
for(const s of sources())console.log(show(s.take(2).toArray()),show(sources()[0].drop(3).toArray()));
for(const s of sources())console.log(show(s.flatMap((x,i)=>[x,i]).toArray()));
console.log(show(gen(3).map(x=>x+1).filter(x=>x>2).flatMap(x=>gen(x)).drop(1).take(4).toArray()));
console.log(show(gen(5).take(Infinity).toArray()),show(gen(5).drop(Infinity).toArray()),show(gen(5).take(0).toArray()),show(gen(5).drop(0).toArray()),show(gen(3).take(2.9).toArray()),show(gen(3).drop("1").toArray()));
console.log(show(new Map([[1,2],[3,4]]).entries().map(([k,v])=>k+v).toArray()));`,
    "eager methods": `
const sources=()=>[[1,2,3,4].values(),gen(4),new Set([1,2,3,4]).values(),Iterator.from(plain(4))];
for(const s of sources())console.log(s.reduce((a,b,i)=>a+b*i));
for(const s of sources())console.log(s.reduce((a,b,i)=>a+"|"+b+":"+i,"init"));
for(const s of sources()){const seen=[];console.log(s.forEach(function(v,i){seen.push(v+"@"+i,typeof this);}),seen.join());}
for(const s of sources())console.log(s.some((x,i)=>x===3&&i===2),sources()[1].some(x=>x>9));
for(const s of sources())console.log(s.every((x,i)=>x===i+1),sources()[1].every(x=>x<3));
for(const s of sources())console.log(s.find(x=>x>2),sources()[1].find(x=>x>9));
console.log(err(()=>gen(0).reduce((a,b)=>a+b)),gen(0).reduce((a,b)=>a+b,7),gen(1).reduce((a,b)=>a+b));
console.log(show(gen(0).toArray()),Array.isArray(gen(2).toArray()));`,
    "Iterator.from wraps, passes through and closes": `
const g=gen(2);console.log(Iterator.from(g)===g);
const arr=[1,2];const ai=arr[Symbol.iterator]();console.log(Iterator.from(ai)===ai,show(Iterator.from(arr).toArray()),show(Iterator.from(new Set([3,4])).toArray()));
console.log(show(Iterator.from("a𝒜b").toArray()),show(Iterator.from(new String("xy")).toArray()));
const log=[];const w=Iterator.from(plain(3,log));
console.log(w instanceof Iterator,Object.getPrototypeOf(w)!==Iterator.prototype,Object.getPrototypeOf(Object.getPrototypeOf(w))===Iterator.prototype,Object.prototype.toString.call(w));
console.log(show(w.next()),show(w.return()),log.join());
const noReturn=Iterator.from({next(){return{value:1,done:false};}});console.log(show(noReturn.return()));
const WP=Object.getPrototypeOf(w);console.log(Object.getOwnPropertyNames(WP).sort().join(),WP.next.length,WP.return.name);
console.log(err(()=>WP.next.call({})),err(()=>WP.return.call(gen(1).map(x=>x))));
for(const v of [null,undefined,0,0n,true,Symbol()])console.log(err(()=>Iterator.from(v)));
const iterable={[Symbol.iterator](){return plain(2);}};console.log(show(Iterator.from(iterable).toArray()));
console.log(err(()=>Iterator.from({[Symbol.iterator](){return 1;}})),err(()=>Iterator.from({[Symbol.iterator]:1})));
let reads=0;const counted={get next(){reads++;let i=0;return()=>({done:i++>1,value:i});}};const cw=Iterator.from(counted);cw.next();cw.next();cw.next();console.log(reads);`,
    "closing the underlying iterator": `
let log=[];
console.log(err(()=>Iterator.from(plain(5,log)).map(x=>{if(x===2)throw new Error("boom");return x;}).toArray()),log.join());log=[];
console.log(err(()=>Iterator.from(plain(5,log)).filter(()=>{throw 1;}).next()),log.join());log=[];
console.log(err(()=>Iterator.from(plain(5,log)).flatMap(()=>5).next()),log.join());log=[];
console.log(err(()=>Iterator.from(plain(5,log)).flatMap(()=>"ab").next()),log.join());log=[];
console.log(err(()=>Iterator.from(plain(5,log)).reduce(()=>{throw 1;})),log.join());log=[];
console.log(err(()=>Iterator.from(plain(5,log)).forEach(()=>{throw 1;})),log.join());log=[];
console.log(Iterator.from(plain(5,log)).some(x=>x===2),log.join());log=[];
console.log(Iterator.from(plain(5,log)).every(x=>x<2),log.join());log=[];
console.log(Iterator.from(plain(5,log)).find(x=>x===2),log.join());log=[];
console.log(Iterator.from(plain(5,log)).some(x=>x>9),log.join());log=[];
console.log(show(Iterator.from(plain(5,log)).take(2).toArray()),log.join());log=[];
console.log(show(Iterator.from(plain(2,log)).take(2).toArray()),log.join());log=[];
console.log(show(Iterator.from(plain(2,log)).take(5).toArray()),log.join());log=[];
const early=Iterator.from(plain(5,log)).map(x=>x);console.log(show(early.return()),show(early.next()),log.join());log=[];
const mid=Iterator.from(plain(5,log)).map(x=>x);mid.next();console.log(show(mid.return()),show(mid.return()),show(mid.next()),log.join());log=[];
const done=Iterator.from(plain(1,log)).map(x=>x);done.next();done.next();console.log(show(done.return()),log.join());log=[];
const inner=[];const fm=Iterator.from(plain(3,log)).flatMap(x=>Iterator.from(plain(2,inner)));fm.next();console.log(show(fm.return()),log.join(),inner.join());log=[];
let calls=0;const ret={next(){return{done:false,value:1};},return(){calls++;throw new RangeError("r");}};
console.log(err(()=>Iterator.from(ret).map(x=>x).return()),err(()=>Iterator.from(ret).map(()=>{throw new TypeError("t");}).next()),calls);
const bad={next(){return{done:false,value:1};},return(){return 1;}};
console.log(err(()=>Iterator.from(bad).take(0).next()),err(()=>Iterator.from(bad).some(()=>true)));
function* closing(){try{yield 1;yield 2;}finally{log.push("finally");}}
console.log(show(closing().take(1).toArray()),log.join());log=[];
console.log(show(closing().flatMap(x=>[x,x]).take(3).toArray()),log.join());`,
    "argument validation and errors": `
for(const lim of [NaN,undefined,"x",-1,-Infinity,{valueOf(){return -0.5;}}])console.log(err(()=>gen(1).take(lim)),err(()=>gen(1).drop(lim)));
console.log(err(()=>gen(1).take({valueOf(){throw new SyntaxError();}})),err(()=>gen(1).take(1n)),err(()=>gen(1).take(Symbol())),show(gen(2).take(-0.5).toArray()));
for(const m of ["map","filter","flatMap","reduce","forEach","some","every","find"])console.log(m,err(()=>gen(1)[m]()),err(()=>gen(1)[m]({})),err(()=>Iterator.prototype[m].call(null,x=>x)),err(()=>Iterator.prototype[m].call(1,x=>x)));
for(const m of ["take","drop","toArray"])console.log(m,err(()=>Iterator.prototype[m].call(undefined,1)));
console.log(err(()=>Iterator.prototype.map.call({next:1},x=>x)),err(()=>Iterator.prototype.map.call({next:1},x=>x).next()));
console.log(err(()=>Iterator.prototype.toArray.call({next(){return 1;}})),err(()=>Iterator.prototype.toArray.call({next(){throw new EvalError();}})));
let order=[];Iterator.prototype.map.call({get next(){order.push("next");return()=>({done:true});}},x=>x);console.log(order.join());
order=[];const helper=Iterator.prototype.filter.call({get next(){order.push("next");return()=>({done:true});}},x=>x);order.push("created");helper.next();helper.next();console.log(order.join());
const it=gen(3).map(x=>it.next());console.log(err(()=>it.next()),show(it.next()));
const it2=gen(3).filter(()=>{it2.return();});console.log(err(()=>it2.next()));
const HP=Object.getPrototypeOf(gen(1).map(x=>x));console.log(err(()=>HP.next.call({})),err(()=>HP.return.call(gen(1))),err(()=>HP.next.call(Iterator.from({next(){}}))));
console.log(err(()=>new Iterator()),err(()=>Iterator()),err(()=>Reflect.construct(Iterator,[],Iterator)),err(()=>new Iterator.prototype.map(x=>x)),err(()=>new Iterator.from([])));
const it3=gen(1).flatMap(()=>({next(){return{done:false,value:1};},get [Symbol.iterator](){return null;}}));console.log(show(it3.next()));`,
    "subclassing Iterator": `
class Counter extends Iterator{constructor(n){super();this.i=0;this.n=n;}next(){return this.i<this.n?{value:this.i++,done:false}:{value:undefined,done:true};}}
const c=new Counter(4);console.log(c instanceof Iterator,c instanceof Counter,Iterator.from(c)===c,Object.prototype.toString.call(c));
console.log(show(new Counter(5).filter(x=>x%2).map(x=>x*x).toArray()),new Counter(4).reduce((a,b)=>a+b));
let seen=0;for(const v of new Counter(3).map(x=>x+1))seen+=v;console.log(seen);
console.log(show([...new Counter(3).take(2)]),show(Array.from(new Counter(3).drop(1))));
class Bare extends Iterator{}const b=new Bare();console.log(Object.getPrototypeOf(Object.getPrototypeOf(b))===Iterator.prototype,b.constructor===Bare);
function Old(){}Old.prototype=Object.create(Iterator.prototype);console.log(new Old() instanceof Iterator,new Old().constructor===Iterator);`,
    "properties, names and toStringTag": `
const d=(o,k)=>{const x=Object.getOwnPropertyDescriptor(o,k);return x?[typeof x.value,x.writable,x.enumerable,x.configurable,typeof x.get,typeof x.set].join():"none";};
console.log(typeof Iterator,Iterator.name,Iterator.length,d(globalThis,"Iterator"),d(Iterator,"prototype"),d(Iterator,"from"),Iterator.from.name,Iterator.from.length);
console.log(Object.getPrototypeOf(Iterator)===Function.prototype,Iterator.prototype===Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())));
const IP=Iterator.prototype;
for(const m of ["map","filter","take","drop","flatMap","reduce","toArray","forEach","some","every","find"])console.log(m,IP[m].name,IP[m].length,d(IP,m),"prototype" in IP[m]);
console.log(d(IP,Symbol.toStringTag),d(IP,"constructor"));
const tag=Object.getOwnPropertyDescriptor(IP,Symbol.toStringTag),ctor=Object.getOwnPropertyDescriptor(IP,"constructor");
console.log(tag.get.name,tag.set.name,tag.get.length,tag.set.length,ctor.get.name,ctor.set.name,tag.get.call(),ctor.get.call()===Iterator,IP.constructor===Iterator,IP[Symbol.toStringTag]);
console.log(err(()=>tag.set.call(undefined,"x")),err(()=>tag.set.call(1,"x")),err(()=>tag.set.call(IP,"x")),err(()=>{IP.constructor=1;}),err(()=>ctor.set.call(IP,1)));
const sub=Object.create(IP);sub[Symbol.toStringTag]="Mine";sub.constructor=42;console.log(Object.prototype.toString.call(sub),sub.constructor,d(sub,"constructor"),IP.constructor===Iterator);
const own={constructor:1};ctor.set.call(own,2);console.log(own.constructor,d(own,"constructor"));
const helper=gen(2).map(x=>x),HP=Object.getPrototypeOf(helper);
console.log(Object.prototype.toString.call(helper),HP[Symbol.toStringTag],d(HP,Symbol.toStringTag),Object.getPrototypeOf(HP)===IP,Object.getOwnPropertyNames(HP).sort().join(),HP.next.name,HP.next.length,HP.return.name,HP.return.length,d(HP,"next"));
console.log(Object.prototype.toString.call(gen(1)),Object.prototype.toString.call([].values()),Object.prototype.toString.call(Object.create(IP)),helper[Symbol.iterator]()===helper);
console.log(Object.getPrototypeOf(gen(1).filter(x=>x))===HP,Object.getPrototypeOf(gen(1).take(1))===HP,Object.getPrototypeOf(gen(1).flatMap(x=>[x]))===HP,Object.getPrototypeOf(gen(1).drop(1))===HP);`,
    "user shadowing and later mutation": `
const saved=Iterator;
Array.prototype[Symbol.iterator]=function(){throw new Error("no");};
Function.prototype.call=function(){throw new Error("no call");};
Object.defineProperty=function(){throw new Error("no define");};
console.log(show(saved.from({next(){return{done:this.n>2,value:this.n=(this.n||0)+1};}}).map(x=>x*2).toArray()));
console.log(typeof globalThis.Iterator,delete globalThis.Iterator,typeof globalThis.Iterator);`,
};
for (const [name, source] of Object.entries(programs))
    test(`iterator helpers: ${name}`, () => {
        const expected = runOracle(common + source);
        assert.equal(expected.status, 0, expected.stderr);
        const run = runOnHost(common + source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected.stdout);
    });

test("iterator helpers: shadowing the global Iterator", () => {
    const source = `var Iterator=1;console.log(typeof Iterator,globalThis.Iterator);function* g(){yield 1;}console.log(g().toArray().length);`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

// ES2025 closes the underlying iterator when argument validation fails, and
// the pinned Test262 rejects finite limits above 2 ** 53 - 1; older Node.js
// releases do neither, so this output is fixed instead of the oracle's.
test("iterator helpers: argument validation closes the underlying iterator", () => {
    const source = `
let closed=0;
const it={__proto__:Iterator.prototype,get next(){throw new Error("next read");},return(){closed++;return{};}};
const names=[];
for(const [m,args] of [["map",[]],["filter",[1]],["flatMap",[{}]],["forEach",[]],["some",[]],["every",[]],["find",[]],["reduce",[]],["take",[NaN]],["take",[-1]],["drop",[NaN]],["drop",[-1]],["take",[{valueOf(){throw new SyntaxError();}}]],["take",[2**53]],["drop",[2**53]]]){
try{it[m](...args);}catch(e){names.push(m+":"+e.constructor.name);}}
console.log(closed,names.join());
let thrown=0;const throwing={__proto__:Iterator.prototype,next(){},return(){thrown++;throw new Error("ignored");}};
try{throwing.map(1);}catch(e){console.log(e.constructor.name,thrown);}`;
    const run = runOnHost(source);
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "15 map:TypeError,filter:TypeError,flatMap:TypeError,forEach:TypeError,some:TypeError,every:TypeError,find:TypeError,reduce:TypeError,take:RangeError,take:RangeError,drop:RangeError,drop:RangeError,take:SyntaxError,take:RangeError,drop:RangeError\nTypeError 1\n",
    );
});
