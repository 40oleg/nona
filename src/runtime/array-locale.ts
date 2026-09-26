import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const arrayLocaleRoots=['rt.arrayLocale.fn'];
export const arrayLocalePropertyRoots=builtinPropertyRoots('rt.arrayLocale.fn','toLocaleString','rt.arrayPrototype');

export function emitArrayLocale(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.arrayLocale.fn','toLocaleString',0,'rt.arrayPrototype');
 b.bundle.fragments.push(stringLiteral('rt.str.arrayLocaleKey','toLocaleString'));
 const key=new Uint8Array(16);key[0]=4;
 b.bundle.fragments.push({name:'rt.key.arrayLocale',section:'.rdata',alignment:8,bytes:key,symbols:{},fixups:[{offset:8,kind:'va64',target:'rt.str.arrayLocaleKey',addend:0}]});
 rootedFn(b,'rt.arrayLocale.fn.code',232,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:7}],(a,frame)=>{
  a.store(slot(48),'rcx');
  a.load('rdx',slot(frame+40));a.lea('rcx',slot(80));a.call('rt.toObject');
  a.lea('rcx',slot(80));a.call('rt.arrayFlattenLength');a.store(slot(200),'rax');
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(104),'rax');
  a.mov('rax',0);a.store(slot(208),'rax');
  const loop=a.unique('loop'),item=a.unique('item'),next=a.unique('next'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(208));a.load('r10',slot(200));a.cmp('rax','r10');a.jcc('ae',done);
  a.test('rax','rax');a.jcc('e',item);
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.str.comma'});a.store(slot(184),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(96));a.lea('r8',slot(176));a.call('rt.concat');
  a.label(item);a.lea('rcx',slot(112));a.load('rdx',slot(208));a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(128));a.lea('rdx',slot(80));a.lea('r8',slot(112));a.call('rt.getProperty');
  a.load('rax',slot(128));a.cmp('rax',1);a.jcc('be',next);
  a.lea('rcx',slot(144));a.lea('rdx',slot(128));a.lea('r8',{rip:'rt.key.arrayLocale'});a.call('rt.getProperty');
  a.lea('rax',slot(128));a.store(slot(32),'rax');
  a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.mov('r8',0);a.lea('r9',{rip:'rt.undefinedValue'});a.call('rt.invoke');
  a.lea('rcx',slot(176));a.lea('rdx',slot(160));a.call('rt.toString');
  a.lea('rcx',slot(96));a.lea('rdx',slot(96));a.lea('r8',slot(176));a.call('rt.concat');
  a.label(next);a.load('rax',slot(208));a.add('rax',1);a.store(slot(208),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(48));for(const offset of [0,8]){a.load('rax',slot(96+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
}
