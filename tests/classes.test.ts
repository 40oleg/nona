import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import assert from 'node:assert/strict';

const cases:[string,string][]=[
 ['declaration, constructor, methods and static method',`class Point{constructor(x){this.x=x;}value(){return this.x;}static make(x){return new Point(x);}}var p=Point.make(5);console.log(p.value(),p instanceof Point,Object.getOwnPropertyDescriptor(Point.prototype,'value').enumerable);`],
 ['class expression name',`var C=class Inner{value(){return Inner.name;}};console.log(new C().value(),C.name);`],
 ['static method source excludes static prefix',`var C=class{static /* before */f /* a */(){return 1}static get x(){return 2}static set x(v){}};console.log(C.f.toString(),Object.getOwnPropertyDescriptor(C,'x').get.toString(),Object.getOwnPropertyDescriptor(C,'x').set.toString());`],
 ['explicit class constructor source spans the entire class',`class /* before */C /* after */ {constructor /* c */ () {} method() {}};console.log(C.toString());`],
 ['method strict receiver',`class C{m(){return this;}}var m=new C().m;console.log(m()===undefined);`],
 ['class constructor requires new',`class C{}try{C();}catch(e){console.log(e.name);}`],
 ['accessors and computed keys',`var k='m';class C{constructor(){this.v=2;}get x(){return this.v;}set x(v){this.v=v;}[k](){return this.x;}static get y(){return 5;}}var c=new C();c.x=4;console.log(c.m(),C.y,Object.getOwnPropertyDescriptor(C.prototype,'x').enumerable);`],
 ['class declaration TDZ',`try{new C();}catch(e){console.log(e.name);}class C{}`],
 ['default derived constructor forwards arguments',`class A{constructor(x){this.x=x;}value(){return this.x;}}class B extends A{}var b=new B(7);console.log(b.value(),b instanceof A,b instanceof B);`],
 ['explicit super call and instance method',`class A{constructor(x){this.x=x;}value(){return this.x;}}class B extends A{constructor(x){super(x+1);}value(){return super.value()+2;}}console.log(new B(3).value());`],
 ['static inheritance and super method',`class A{static f(){return 3;}}class B extends A{static f(){return super.f()+2;}}console.log(B.f(),Object.getPrototypeOf(B)===A);`],
 ['derived this is unavailable before super',`class A{}class B extends A{constructor(){try{this.x=1;}catch(e){console.log(e.name);}super();this.x=2;}}console.log(new B().x);`],
 ['duplicate super call fails',`class A{}class B extends A{constructor(){super();try{super();}catch(e){console.log(e.name);}}}new B();`],
 ['derived constructor rejects primitive return',`class A{}class B extends A{constructor(){super();return 4;}}try{new B();}catch(e){console.log(e.name);}`],
 ['derived constructor accepts object return before super',`class A{}class B extends A{constructor(){return {x:7};}}console.log(new B().x);`],
 ['derived constructor undefined return requires super',`class A{}class B extends A{constructor(){return undefined;}}try{new B();}catch(e){console.log(e.name);}`],
 ['default derived constructor preserves new target',`class A{constructor(){console.log(new.target.name);}}class B extends A{}class C extends B{}new C();`],
 ['explicit super preserves new target with spread',`class A{constructor(x){console.log(new.target.name,x);}}class B extends A{constructor(...args){super(...args);}}new B(7);`],
 ['bound base constructor preserves new target',`function A(x){console.log(new.target.name,x);}var Bound=A.bind(null,3);Bound.prototype=A.prototype;class B extends Bound{}new B();`],
 ['arrow created before super observes initialized this',`class A{}class B extends A{constructor(){let f=()=>this;try{f();}catch(e){console.log(e.name);}super();console.log(f()===this);}}new B();`],
 ['extends null with explicit object return',`class C extends null{constructor(){return {x:4};}}console.log(new C().x,Object.getPrototypeOf(C.prototype));`],
 ['extends null default constructor throws',`class C extends null{}try{new C();}catch(e){console.log(e.name);}`],
 ['mutated superclass link is checked at super call',`class A{}class B extends A{constructor(){super();}}Object.setPrototypeOf(B,{});try{new B();}catch(e){console.log(e.name);}`],
 ['Array subclass creates array with derived prototype',`class B extends Array{}let x=new B(1,2);console.log(Array.isArray(x),x.length,x instanceof B,x instanceof Array);`],
 ['primitive wrapper subclasses retain derived prototype',`class N extends Number{}class S extends String{}class B extends Boolean{}let n=new N(7),s=new S('ab'),b=new B(true);console.log(n instanceof N,n+1,s instanceof S,s.length,b instanceof B,b.valueOf());`],
 ['Error subclasses retain derived prototype',`class E extends Error{}class T extends TypeError{}let e=new E('x'),t=new T('y');console.log(e instanceof E,e.message,t instanceof T,t.message);`],
 ['Object subclass uses derived instance',`class O extends Object{}let o=new O(7);console.log(o instanceof O,Object.getPrototypeOf(o)===O.prototype,Object.keys(o).length);`],
];
for(const [name,source] of cases)test(`class: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('class: derived lexical this survives GC before and after super',()=>{
 const source=`class A{}class B extends A{constructor(){let f=()=>this;for(let i=0;i<20;i++)({value:String(i)});super();for(let i=0;i<20;i++)({value:String(i)});console.log(f()===this);}}new B();`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

// super.x is base.[[Get]](x, this) and super.x = v is base.[[Set]](x, v, this)
// (roadmap item 17): a Proxy in the chain answers through get/set, not
// through getOwnPropertyDescriptor.
test('super property access goes through Proxy get and set traps',()=>{
 const source=String.raw`
const log=[];
const proto=new Proxy({m(){return 'target'},v:1},{
 get(t,k,r){log.push('get '+String(k));return k==='m'?function(){return 'trap:'+(this===r)}:Reflect.get(t,k,r)},
 set(t,k,v,r){log.push('set '+String(k)+'='+v+' '+(r===b));return Reflect.set(t,k,v,r)},
 getOwnPropertyDescriptor(t,k){log.push('gopd '+String(k));return Reflect.getOwnPropertyDescriptor(t,k)}});
class A{}Object.setPrototypeOf(A.prototype,proto);
class B extends A{m(){return super.m()} get v(){return super.v} put(){super.w=5;return this.w}}
const b=new B();console.log(b.m(),b.v,b.put(),Object.keys(b).join(),log.join(','));
const plain={__proto__:{get x(){return this.tag},set s(v){this.got=v}},tag:'own',f(){super.s=3;super.q=4;return super.x+','+this.got+','+this.q}};console.log(plain.f());
const orphan={f(){return super.missing}};Object.setPrototypeOf(orphan,null);try{orphan.f()}catch(e){console.log(e.constructor.name)}
const frozen=Object.freeze({__proto__:{},f(){'use strict';try{super.z=1}catch(e){return e.constructor.name}return 'no'}});console.log(frozen.f());
`;
 const native=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(native.status,0,native.stderr.toString());
 assert.equal(native.stdout.toString(),runOracle(source).stdout);
});
