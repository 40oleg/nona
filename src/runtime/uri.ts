import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

const names=['encodeURI','encodeURIComponent'] as const;
export const uriRoots=names.map(name=>'rt.global.'+name+'.fn');
export const uriPropertyRoots=names.flatMap(name=>builtinPropertyRoots('rt.global.'+name+'.fn',name,'rt.globalObject'));

export function emitUri(b:RuntimeBuilder):void {
 const hex=Uint8Array.from('0123456789ABCDEF',c=>c.charCodeAt(0));
 b.data('rt.uri.hex',hex,'.rdata');
 for(const name of names){
  const safe=new Uint8Array(128);
  for(const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"+(name==='encodeURI'?';/?:@&=+$,#':''))safe[c.charCodeAt(0)]=1;
  b.data('rt.uri.safe.'+name,safe,'.rdata');
  prependFunctionBuiltin(b,'rt.global.'+name+'.fn',name,1,'rt.globalObject');
  rootedFn(b,'rt.global.'+name+'.fn.code',216,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
   a.store(slot(40),'rcx');const have=a.unique('have');a.test('rdx','rdx');a.jcc('ne',have);a.lea('rdx',{rip:'rt.undefinedValue'});a.jmp(have+'.convert');a.label(have);a.mov('rdx','r8');a.label(have+'.convert');
   a.lea('rcx',slot(64));a.call('rt.toString');
   a.load('rdx',slot(72));a.load('rax',{base:'rdx'});a.mov('r10',0x0e38e38e38e38e38n);a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');
   a.mov('r10',18);a.imul('rax','r10');a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');
   a.mov('r10',4);a.store(slot(80),'r10');a.store(slot(88),'rax');a.mov('r10',0);a.store(slot(96),'r10');a.store(slot(104),'r10');
   const writeUnit=()=>{a.load('r10',slot(104));a.shl('r10',1);a.load('r11',slot(88));a.add('r11',8);a.add('r11','r10');a.store({base:'r11'},'rax',16);a.load('r10',slot(104));a.add('r10',1);a.store(slot(104),'r10');};
   const loop=a.unique('loop'),done=a.unique('done'),pair=a.unique('pair'),scalar=a.unique('scalar'),invalid=a.unique('invalid'),plain=a.unique('plain'),one=a.unique('one'),two=a.unique('two'),three=a.unique('three'),four=a.unique('four'),bytes=a.unique('bytes'),byteLoop=a.unique('byteLoop'),next=a.unique('next');
   a.label(loop);a.load('r10',slot(96));a.load('rdx',slot(72));a.load('r11',{base:'rdx'});a.cmp('r10','r11');a.jcc('ae',done);
   a.shl('r10',1);a.add('rdx',8);a.add('rdx','r10');a.load('rax',{base:'rdx'},16);a.store(slot(112),'rax');a.mov('r10',1);a.store(slot(168),'r10');
   a.cmp('rax',0xd800);a.jcc('b',scalar);a.cmp('rax',0xdbff);a.jcc('be',pair);a.cmp('rax',0xdfff);a.jcc('be',invalid);a.jmp(scalar);
   a.label(pair);a.load('r10',slot(96));a.add('r10',1);a.load('r11',slot(72));a.load('r11',{base:'r11'});a.cmp('r10','r11');a.jcc('ae',invalid);
   a.load('r11',{base:'rdx',disp:2},16);a.cmp('r11',0xdc00);a.jcc('b',invalid);a.cmp('r11',0xdfff);a.jcc('a',invalid);
   a.sub('rax',0xd800);a.shl('rax',10);a.sub('r11',0xdc00);a.add('rax','r11');a.add('rax',0x10000);a.store(slot(112),'rax');a.mov('r10',2);a.store(slot(168),'r10');
   a.label(scalar);a.load('rax',slot(112));a.cmp('rax',128);a.jcc('ae',one);
   a.lea('r10',{rip:'rt.uri.safe.'+name});a.add('r10','rax');a.load('r10',{base:'r10'},8);a.test('r10','r10');a.jcc('ne',plain);
   a.label(one);a.load('rax',slot(112));a.cmp('rax',128);a.jcc('ae',two);a.store(slot(128),'rax');a.mov('r10',1);a.store(slot(120),'r10');a.jmp(bytes);
   a.label(two);a.cmp('rax',0x800);a.jcc('ae',three);a.mov('r10','rax');a.shr('r10',6);a.or('r10',0xc0);a.store(slot(128),'r10');a.and('rax',63);a.or('rax',0x80);a.store(slot(136),'rax');a.mov('r10',2);a.store(slot(120),'r10');a.jmp(bytes);
   a.label(three);a.cmp('rax',0x10000);a.jcc('ae',four);a.mov('r10','rax');a.shr('r10',12);a.or('r10',0xe0);a.store(slot(128),'r10');a.mov('r10','rax');a.shr('r10',6);a.and('r10',63);a.or('r10',0x80);a.store(slot(136),'r10');a.and('rax',63);a.or('rax',0x80);a.store(slot(144),'rax');a.mov('r10',3);a.store(slot(120),'r10');a.jmp(bytes);
   a.label(four);a.mov('r10','rax');a.shr('r10',18);a.or('r10',0xf0);a.store(slot(128),'r10');a.mov('r10','rax');a.shr('r10',12);a.and('r10',63);a.or('r10',0x80);a.store(slot(136),'r10');a.mov('r10','rax');a.shr('r10',6);a.and('r10',63);a.or('r10',0x80);a.store(slot(144),'r10');a.and('rax',63);a.or('rax',0x80);a.store(slot(152),'rax');a.mov('r10',4);a.store(slot(120),'r10');
   a.label(bytes);a.mov('r10',0);a.store(slot(160),'r10');a.label(byteLoop);a.load('r10',slot(160));a.load('r11',slot(120));a.cmp('r10','r11');a.jcc('ae',next);
   a.mov('rax',37);writeUnit();a.load('r10',slot(160));a.shl('r10',3);a.lea('r11',slot(128));a.add('r11','r10');a.load('r11',{base:'r11'});a.store(slot(176),'r11');
   for(const shift of [4,0]){a.load('r10',slot(176));if(shift)a.shr('r10',shift);a.and('r10',15);a.lea('r11',{rip:'rt.uri.hex'});a.add('r11','r10');a.load('rax',{base:'r11'},8);writeUnit();}
   a.load('r10',slot(160));a.add('r10',1);a.store(slot(160),'r10');a.jmp(byteLoop);
   a.label(plain);a.load('rax',slot(112));writeUnit();
   a.label(next);a.load('r10',slot(96));a.load('r11',slot(168));a.add('r10','r11');a.store(slot(96),'r10');a.jmp(loop);
   a.label(invalid);a.call('rt.throwURIError');
   a.label(done);a.load('r10',slot(88));a.load('r11',slot(104));a.store({base:'r10'},'r11');a.load('rcx',slot(40));a.mov('r10',4);a.store({base:'rcx'},'r10');a.load('r10',slot(88));a.store({base:'rcx',disp:8},'r10');
  });
 }
}
