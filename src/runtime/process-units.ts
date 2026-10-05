import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {TypedArrayKind,TypedArrayLayout as T} from './typed-array.js';
import {ArrayBufferLayout as B} from './array-buffer.js';

/** Copy Windows UTF-16 code units without per-character managed allocations. */
export function emitProcessUnits(b:RuntimeBuilder):void {
 b.fn('process.units.code',72,a=>{
  a.store(slot(40),'rcx');const bad=a.unique('bad'),done=a.unique('done'),loop=a.unique('loop'),end=a.unique('end');
  a.cmp('rdx',2);a.jcc('b',bad);a.load('rax',{base:'r8'});a.cmp('rax',5);a.jcc('ne',bad);
  a.load('r11',{base:'r8',disp:8});a.load('rax',{base:'r11',disp:O.kind});a.cmp('rax',TypedArrayKind);a.jcc('ne',bad);
  a.load('rax',{base:'r11',disp:T.elementType});a.cmp('rax',4);a.jcc('ne',bad);
  a.load('r9',{base:'r11',disp:T.buffer});a.load('rax',{base:'r9',disp:B.detached});a.test('rax','rax');a.jcc('ne',bad);
  a.load('rax',{base:'r8',disp:16});a.cmp('rax',3);a.jcc('ne',bad);a.movsd('xmm0',{base:'r8',disp:24});a.cvttsd2si('r10','xmm0');a.cvtsi2sd('xmm1','r10');a.ucomisd('xmm0','xmm1');a.jcc('p',bad);a.jcc('ne',bad);a.test('r10','r10');a.jcc('s',bad);
  a.load('rax',{base:'r11',disp:T.length});a.cmp('r10','rax');a.jcc('a',bad);a.mov('rax',2147483647);a.cmp('r10','rax');a.jcc('a',bad);
  a.load('r9',{base:'r9',disp:B.bytes});a.load('rax',{base:'r11',disp:T.byteOffset});a.add('r9','rax');a.store(slot(48),'r9');a.store(slot(56),'r10');
  a.mov('rcx','r10');a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');a.store(slot(64),'rax');a.load('r10',slot(56));a.store({base:'rax'},'r10');a.lea('r9',{base:'rax',disp:8});a.load('r8',slot(48));
  a.label(loop);a.test('r10','r10');a.jcc('e',end);a.load('rax',{base:'r8'},16);a.store({base:'r9'},'rax',16);a.add('r8',2);a.add('r9',2);a.sub('r10',1);a.jmp(loop);
  a.label(end);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(64));a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(bad);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
}
