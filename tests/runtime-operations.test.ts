import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

// These programs exercise the common runtime entry points through user-visible
// syntax. They are intentionally independent of PE layout and OS imports.
const cases: [string, string][] = [
  ['property key conversion once', `var events=''; var key={toString:function(){events+='key';return 'x';}}; var o={x:4}; console.log(o[key],events);`],
  ['getter and receiver', `var p={get x(){return this.y;}};var o=Object.create(p);o.y=7;console.log(o.x);`],
  ['setter and receiver', `var p={set x(v){this.y=v;}};var o=Object.create(p);o.x=9;console.log(o.y,p.y);`],
  ['descriptor rejection', `var o={};Object.defineProperty(o,'x',{value:3,writable:false,configurable:false});console.log(o.x,delete o.x,o.x);`],
  ['abrupt key conversion', `var o={x:1};var k={toString:function(){throw 12;}};try{o[k]=2;}catch(e){console.log(e,o.x);}`],
  ['own key order', `var o={b:1,2:2,1:1,a:4};console.log(Object.keys(o).join(','));`],
  ['reflection key conversion', `var log='';var k={toString:function(){log+='k';return 'x';}};var o={};Object.defineProperty(o,k,{value:8,configurable:true});console.log(o.hasOwnProperty(k),Object.getOwnPropertyDescriptor(o,k).value,log);`],
  ['call and receiver', `function f(){return this.x;}var o={x:5,f:f};console.log(o.f(),f.call({x:7}));`],
  ['construct and prototype', `function F(x){this.x=x;}F.prototype.y=2;var o=new F(3);console.log(o.x,o.y,o instanceof F);`],
  ['coercion order', `var a={valueOf:function(){console.log('left');return 2;}};var b={valueOf:function(){console.log('right');return 3;}};console.log(a+b);`],
];
for (const [name, source] of cases) {
  test(`shared operation: ${name}`, () => expectProgram(source, runOracle(source).stdout));
}
