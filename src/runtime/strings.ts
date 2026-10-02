import { RuntimeBuilder,slot,failIf } from './abi.js';
import {stringLiteral} from './value.js';
export function emitStrings(b:RuntimeBuilder):void {
 for(const [name,value] of Object.entries({undefined:'undefined',null:'null',true:'true',false:'false',boolean:'boolean',number:'number',string:'string',symbol:'symbol',bigint:'bigint',object:'object',space:' ',lf:'\n'}))b.bundle.fragments.push(stringLiteral('rt.str.'+name,value));
 // RCX destination, RDX source, R8 byte count: a block copy with `rep movsb`,
 // which the processor runs at cache bandwidth for any length worth a call.
 // RSI and RDI are preserved registers of the calling convention and are
 // saved around the copy; nothing here can throw or reach a safepoint.
 b.fn('rt.copyBytes',56,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rcx','r8');a.repMovsb();
  a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 b.fn('rt.concat',104,a=>{
 a.store(slot(40),'rcx');a.load('rdx',{base:'rdx',disp:8});a.load('r8',{base:'r8',disp:8});a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rax',{base:'rdx'});a.load('r10',{base:'r8'});a.add('rax','r10');failIf(a,'b','rt.throwRangeError');a.store(slot(64),'rax');a.mov('r10',0x3ffffffffffffffbn);a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(72),'rax');a.load('r10',slot(64));a.store({base:'rax'},'r10');a.add('rax',8);a.store(slot(80),'rax');
 for(const offset of [48,56]){a.load('rdx',slot(offset));a.load('r8',{base:'rdx'});a.add('r8','r8');a.add('rdx',8);a.load('rcx',slot(80));a.add('rcx','r8');a.store(slot(80),'rcx');a.sub('rcx','r8');a.call('rt.copyBytes');}
 a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');
 });
 // Compare UTF16 code units; return signed -1,0,1. Inputs descriptor pointers.
 b.fn('rt.compareStrings',40,a=>{const symbol=a.unique('symbol'),ordinary=a.unique('ordinary');a.load('r8',{base:'rcx'});a.load('r9',{base:'rdx'});a.cmp('r8',-1);a.jcc('e',symbol);a.cmp('r9',-1);a.jcc('ne',ordinary);a.jmp('rt.compareStrings.less');a.label(symbol);a.cmp('r9',-1);a.jcc('ne','rt.compareStrings.greater');a.cmp('rcx','rdx');a.jcc('e','rt.compareStrings.equal');a.jmp('rt.compareStrings.greater');a.label(ordinary);a.add('rcx',8);a.add('rdx',8);a.label('rt.compareStrings.loop');a.test('r8','r8');a.jcc('e','rt.compareStrings.leftEnd');a.test('r9','r9');a.jcc('e','rt.compareStrings.greater');a.load('r10',{base:'rcx'},16);a.load('r11',{base:'rdx'},16);a.cmp('r10','r11');a.jcc('b','rt.compareStrings.less');a.jcc('a','rt.compareStrings.greater');a.add('rcx',2);a.add('rdx',2);a.sub('r8',1);a.sub('r9',1);a.jmp('rt.compareStrings.loop');a.label('rt.compareStrings.leftEnd');a.test('r9','r9');a.jcc('ne','rt.compareStrings.less');a.label('rt.compareStrings.equal');a.mov('rax',0);a.jmp('rt.compareStrings.done');a.label('rt.compareStrings.less');a.mov('rax',-1);a.jmp('rt.compareStrings.done');a.label('rt.compareStrings.greater');a.mov('rax',1);a.label('rt.compareStrings.done');});
}
