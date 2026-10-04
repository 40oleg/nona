import {RuntimeBuilder,slot} from './abi.js';
import {DateLayout} from './date.js';

export function emitDateIso(b:RuntimeBuilder):void {
 b.fn('rt.Date.toISOString.fn.code',168,a=>{
  const digit=(width:number)=>{
   for(let i=width-1;i>=0;i--){
    a.xor('rdx','rdx');a.mov('r10',10);a.div('r10');a.add('rdx',48);a.store({base:'r9',disp:i*2},'rdx',16);
   }
   a.add('r9',width*2);
  };
  const literal=(c:string)=>{a.mov('r10',c.charCodeAt(0));a.store({base:'r9'},'r10',16);a.add('r9',2);};
  a.store(slot(40),'rcx');a.load('rdx',slot(208));a.lea('rcx',slot(64));a.call('rt.dateComponents');
  a.load('rax',slot(64));a.test('rax','rax');const valid=a.unique('valid');a.jcc('ne',valid);a.call('rt.throwRangeError');a.label(valid);
  a.load('rdx',slot(208));a.load('r10',{base:'rdx',disp:8});a.movsd('xmm0',{base:'r10',disp:DateLayout.time});a.cvttsd2si('rax','xmm0');
  a.signExtendRax();a.mov('r10',86400000);a.idiv('r10');a.test('rdx','rdx');const positive=a.unique('positive');a.jcc('ge',positive);a.add('rdx',86400000);a.label(positive);a.store(slot(104),'rdx');
  for(const [offset,scale] of [[112,3600000],[120,60000],[128,1000]] as const){
   a.load('rax',slot(104));a.xor('rdx','rdx');a.mov('r10',scale);a.div('r10');a.store(slot(offset),'rax');a.store(slot(104),'rdx');
  }
  a.load('rax',slot(104));a.store(slot(136),'rax');
  a.load('rax',slot(72));a.test('rax','rax');const extended=a.unique('extended'),allocate=a.unique('allocate');a.jcc('l',extended);a.cmp('rax',9999);a.jcc('a',extended);
  a.mov('rax',24);a.store(slot(144),'rax');a.jmp(allocate);a.label(extended);a.mov('rax',27);a.store(slot(144),'rax');a.label(allocate);
  a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(152),'rax');
  a.load('r10',slot(144));a.store({base:'rax'},'r10');a.lea('r9',{base:'rax',disp:8});
  a.load('rax',slot(144));a.cmp('rax',24);const extendedYear=a.unique('extendedYear'),yearDone=a.unique('yearDone');a.jcc('ne',extendedYear);
  a.load('rax',slot(72));digit(4);a.jmp(yearDone);
  a.label(extendedYear);a.load('rax',slot(72));a.test('rax','rax');const plus=a.unique('plus'),signed=a.unique('signed');a.jcc('ge',plus);
  literal('-');a.neg('rax');a.jmp(signed);a.label(plus);literal('+');a.label(signed);digit(6);a.label(yearDone);
  literal('-');a.load('rax',slot(80));a.add('rax',1);digit(2);
  literal('-');a.load('rax',slot(88));digit(2);
  literal('T');a.load('rax',slot(112));digit(2);
  literal(':');a.load('rax',slot(120));digit(2);
  literal(':');a.load('rax',slot(128));digit(2);
  literal('.');a.load('rax',slot(136));digit(3);literal('Z');
  a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(152));a.store({base:'rcx',disp:8},'rax');
 });
}
