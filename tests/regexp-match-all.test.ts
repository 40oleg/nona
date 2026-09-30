import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('String.matchAll and RegExp Symbol.matchAll return lazy matches',()=>expectProgram(`
  var matches='aba'.matchAll(/a/g);
  console.log(matches.next().value.index,matches.next().value.index,matches.next().done);
  console.log(Object.prototype.toString.call(matches));
  var re=/a/g;re.lastIndex=2;
  var copy=re[Symbol.matchAll]('aba');
  console.log(copy.next().value.index,re.lastIndex,copy.next().done);
  try{'a'.matchAll(/a/)}catch(error){console.log(error.name)}
`,'0 2 true\n[object RegExp String Iterator]\n2 2 true\nTypeError\n'));

test('RegExp String Iterator inherits the common iterator prototype',()=>expectProgram(`
  var iter=/a/g[Symbol.matchAll]('a');
  var prototype=Object.getPrototypeOf(iter);
  var common=Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  console.log(Object.getPrototypeOf(prototype)===common,
    Object.prototype.hasOwnProperty.call(prototype,Symbol.iterator),
    iter[Symbol.iterator]()===iter);
`,'true true true\n'));

test('RegExp String Iterator keeps state in internal slots',()=>expectProgram(`
  var iter=/a/g[Symbol.matchAll]('aba');
  var prototype=Object.getPrototypeOf(iter);
  var fake=Object.create(prototype);
  fake.__nonaMatchAllBrand=true;
  fake.__nonaMatcher=/a/g;
  fake.__nonaInput='a';
  console.log(Object.getOwnPropertyNames(iter).length,Object.getOwnPropertySymbols(iter).length);
  try{prototype.next.call(fake)}catch(error){console.log(error.name)}
  Object.preventExtensions(iter);
  console.log(iter.next().value.index,iter.next().value.index,iter.next().done);
`,'0 0\nTypeError\n0 2 true\n'));

test('String.matchAll converts the receiver before creating fallback RegExp',()=>expectProgram(`
  var calls=0,receiver={[Symbol.toPrimitive](){calls++;return 'aba'}};
  var pattern={[Symbol.matchAll]:null,toString(){return 'a'}};
  var iter=String.prototype.matchAll.call(receiver,pattern);
  console.log(calls,iter.next().value[0],iter.next().value[0]);
`,'1 a a\n'));
