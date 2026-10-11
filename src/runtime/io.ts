import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
export function emitIo(b:RuntimeBuilder):void {
 // stdout (-11) for console.log/info/debug, stderr (-12) for console.error/warn.
 emitWriter(b,'rt.write',-11);emitWriter(b,'rt.writeErr',-12);
 emitLog(b,'rt.log','rt.write');emitLog(b,'rt.logErr','rt.writeErr');
}
function emitWriter(b:RuntimeBuilder,name:string,handle:number):void {
 b.fn(name,120,a=>{
 a.store(slot(64),'rcx');a.load('rax',{base:'rcx'});a.test('rax','rax');a.jcc('e',name+'.done');a.mov('r10',0x7fffffff);a.cmp('rax','r10');failIf(a,'a');a.store(slot(72),'rax');a.add('rcx',8);a.store(slot(80),'rcx');a.mov('rcx',handle);a.callImport('GetStdHandle');a.store(slot(88),'rax');
 // No standard output (GUI subsystem, closed or detached handle): drop the text.
 a.test('rax','rax');a.jcc('e',name+'.done');a.cmp('rax',-1);a.jcc('e',name+'.done');
a.mov('rcx','rax');a.lea('rdx',slot(104));a.callImport('GetConsoleMode');a.test('rax','rax');a.jcc('ne',name+'.console');
 // Explicit length makes embedded NUL significant. Windows replaces isolated surrogates.
 a.mov('rcx',65001);a.mov('rdx',0);a.load('r8',slot(80));a.load('r9',slot(72));a.mov('rax',0);for(const d of [32,40,48,56])a.store(slot(d),'rax');a.callImport('WideCharToMultiByte');a.test('rax','rax');failIf(a,'e');a.store(slot(96),'rax');a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(64),'rax');a.store(slot(32),'rax');a.load('rax',slot(96));a.store(slot(40),'rax');a.mov('rax',0);a.store(slot(48),'rax');a.store(slot(56),'rax');a.mov('rcx',65001);a.mov('rdx',0);a.load('r8',slot(80));a.load('r9',slot(72));a.callImport('WideCharToMultiByte');a.test('rax','rax');failIf(a,'e');a.load('r10',slot(64));a.store(slot(80),'r10');a.store(slot(72),'rax');a.mov('rax',0);a.store(slot(96),'rax');a.jmp(name+'.loop');
 a.label(name+'.console');a.mov('rax',1);a.store(slot(96),'rax');a.label(name+'.loop');a.load('rcx',slot(88));a.load('rdx',slot(80));a.load('r8',slot(72));a.lea('r9',slot(104));a.mov('rax',0);a.store(slot(32),'rax');a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',name+'.file');a.callImport('WriteConsoleW');a.jmp(name+'.check');a.label(name+'.file');a.callImport('WriteFile');a.label(name+'.check');a.test('rax','rax');a.jcc('e',name+'.done');a.load('rax',slot(104),32);a.test('rax','rax');failIf(a,'e');a.load('r10',slot(72));a.cmp('rax','r10');failIf(a,'a');a.sub('r10','rax');a.store(slot(72),'r10');a.load('r11',slot(96));a.test('r11','r11');a.jcc('e',name+'.advance');a.shl('rax',1);a.label(name+'.advance');a.load('r11',slot(80));a.add('r11','rax');a.store(slot(80),'r11');a.test('r10','r10');a.jcc('ne',name+'.loop');a.label(name+'.done');
 });
}
function emitLog(b:RuntimeBuilder,name:string,writer:string):void {
 rootedFn(b,name,104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:72,count:1}],a=>{a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rax',0);a.store(slot(64),'rax');a.label(name+'.loop');a.load('rax',slot(64));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',name+'.done');a.test('rax','rax');a.jcc('e',name+'.arg');a.lea('rcx',{rip:'rt.str.space'});a.call(writer);a.label(name+'.arg');a.load('rdx',slot(56));a.lea('rcx',slot(72));a.call('rt.toString');a.load('rcx',slot(80));a.call(writer);a.load('rax',slot(56));a.add('rax',16);a.store(slot(56),'rax');a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(name+'.loop');a.label(name+'.done');a.lea('rcx',{rip:'rt.str.lf'});a.call(writer);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');});
}
