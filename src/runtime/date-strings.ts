import {RuntimeBuilder,slot} from './abi.js';
import {DateLayout} from './date.js';
import {stringLiteral} from './value.js';

export const dateStringMethods=['toUTCString','toDateString','toTimeString','toString','toLocaleDateString','toLocaleTimeString','toLocaleString'] as const;

export function emitDateStrings(b:RuntimeBuilder):void {
 const table=(names:string[])=>{const bytes=new Uint8Array(names.length*8),view=new DataView(bytes.buffer);names.forEach((name,i)=>view.setBigUint64(i*8,BigInt(name.charCodeAt(0))|(BigInt(name.charCodeAt(1))<<16n)|(BigInt(name.charCodeAt(2))<<32n),true));return bytes;};
 b.data('rt.date.weekdays',table(['Sun','Mon','Tue','Wed','Thu','Fri','Sat']));
 b.data('rt.date.months',table(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']));
 b.bundle.fragments.push(stringLiteral('rt.str.invalidDate','Invalid Date'));
 for(const method of dateStringMethods){const mode=method==='toLocaleDateString'?'toDateString':method==='toLocaleTimeString'?'toTimeString':method==='toLocaleString'?'toString':method;
 b.fn('rt.Date.'+method+'.fn.code',200,a=>{
  const literal=(s:string)=>{for(const c of s){a.mov('r10',c.charCodeAt(0));a.store({base:'r9'},'r10',16);a.add('r9',2);}};
  const digits=(width:number)=>{for(let i=width-1;i>=0;i--){a.xor('rdx','rdx');a.mov('r10',10);a.div('r10');a.add('rdx',48);a.store({base:'r9',disp:i*2},'rdx',16);}a.add('r9',width*2);};
  const name=(offset:number,tableName:string)=>{a.load('rax',slot(offset));a.shl('rax',3);a.lea('r10',{rip:tableName});a.add('r10','rax');a.load('r10',{base:'r10'});for(let i=0;i<3;i++){a.store({base:'r9',disp:i*2},'r10',16);if(i<2)a.shr('r10',16);}a.add('r9',6);};
  const year=()=>{a.load('rax',slot(152));a.test('rax','rax');const unsigned=a.unique('unsigned');a.jcc('e',unsigned);literal('-');a.label(unsigned);
   a.load('rax',slot(136));a.load('r11',slot(144));a.mov('r8','r9');a.shl('r11',1);a.add('r8','r11');a.shr('r11',1);
   const loop=a.unique('yearDigit');a.label(loop);a.sub('r8',2);a.xor('rdx','rdx');a.mov('r10',10);a.div('r10');a.add('rdx',48);a.store({base:'r8'},'rdx',16);a.sub('r11',1);a.jcc('ne',loop);
   a.load('r10',slot(144));a.shl('r10',1);a.add('r9','r10');};
  const time=()=>{a.load('rax',slot(112));digits(2);literal(':');a.load('rax',slot(120));digits(2);literal(':');a.load('rax',slot(128));digits(2);};
  a.store(slot(40),'rcx');a.load('rdx',slot(240));a.lea('rcx',slot(64));a.call('rt.dateComponents');
  a.load('rax',slot(64));const valid=a.unique('valid'),done=a.unique('done');a.test('rax','rax');a.jcc('ne',valid);
  a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.lea('rax',{rip:'rt.str.invalidDate'});a.store({base:'rcx',disp:8},'rax');a.jmp(done);a.label(valid);
  a.load('rdx',slot(240));a.load('r10',{base:'rdx',disp:8});a.movsd('xmm0',{base:'r10',disp:DateLayout.time});a.cvttsd2si('rax','xmm0');
  a.signExtendRax();a.mov('r10',86400000);a.idiv('r10');a.test('rdx','rdx');const positive=a.unique('positive');a.jcc('ge',positive);a.add('rdx',86400000);a.label(positive);a.store(slot(104),'rdx');
  for(const [offset,scale] of [[112,3600000],[120,60000],[128,1000]] as const){a.load('rax',slot(104));a.xor('rdx','rdx');a.mov('r10',scale);a.div('r10');a.store(slot(offset),'rax');a.store(slot(104),'rdx');}
  a.load('rax',slot(72));a.mov('r10',0);a.test('rax','rax');const yearPositive=a.unique('yearPositive');a.jcc('ge',yearPositive);a.neg('rax');a.mov('r10',1);a.label(yearPositive);a.store(slot(136),'rax');a.store(slot(152),'r10');
  a.mov('r10',4);a.cmp('rax',10000);const widthReady=a.unique('widthReady'),five=a.unique('five'),six=a.unique('six');a.jcc('ae',five);a.jmp(widthReady);a.label(five);a.mov('r10',5);a.cmp('rax',100000);a.jcc('ae',six);a.jmp(widthReady);a.label(six);a.mov('r10',6);a.label(widthReady);a.store(slot(144),'r10');
  a.mov('rax',mode==='toUTCString'?25:mode==='toDateString'?11:mode==='toTimeString'?17:29);
  if(mode!=='toTimeString'){a.add('rax','r10');a.load('r10',slot(152));a.add('rax','r10');}
  a.store(slot(160),'rax');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(168),'rax');a.load('r10',slot(160));a.store({base:'rax'},'r10');a.lea('r9',{base:'rax',disp:8});
  if(mode==='toUTCString'){name(96,'rt.date.weekdays');literal(', ');a.load('rax',slot(88));digits(2);literal(' ');name(80,'rt.date.months');literal(' ');year();literal(' ');time();literal(' GMT');}
  else if(mode==='toTimeString'){time();literal(' GMT+0000');}
  else{name(96,'rt.date.weekdays');literal(' ');name(80,'rt.date.months');literal(' ');a.load('rax',slot(88));digits(2);literal(' ');year();if(mode==='toString'){literal(' ');time();literal(' GMT+0000');}}
  a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(168));a.store({base:'rcx',disp:8},'rax');a.label(done);
 });}
}
