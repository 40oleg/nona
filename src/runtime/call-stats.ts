import {RuntimeBuilder,slot} from './abi.js';

/**
 * Call statistics (compile option callStats, CLI --call-stats): every call
 * instruction of the program and its runtime is preceded by an increment of
 * a counter for its target, and the counts are printed to stderr when the
 * program ends, most frequent first. The code generator fills
 * rt.callStatsTable ({count, then per target: name record, counter}); in a
 * normal build it is empty and rt.callStatsReport returns at once.
 */
export function emitCallStats(b:RuntimeBuilder):void {
 b.data('rt.callStatsTable',new Uint8Array(8),'.data');
 // Line buffer: slot 96 (12 columns of count, two spaces, the name, a line feed).
 b.fn('rt.callStatsReport',408,a=>{
  const done=a.unique('done'),outer=a.unique('outer'),scan=a.unique('scan'),next=a.unique('next'),scanned=a.unique('scanned'),digit=a.unique('digit'),copy=a.unique('copy'),copied=a.unique('copied'),short=a.unique('short');
  a.load('rax',{rip:'rt.callStatsTable'});a.test('rax','rax');a.jcc('e',done);
  a.mov('rcx',-12);a.callImport('GetStdHandle');a.store(slot(40),'rax');
  // The largest remaining count; a printed counter is cleared.
  a.label(outer);a.mov('r8',0);a.mov('r9',0);a.mov('rcx',0);a.lea('r10',{rip:'rt.callStatsTable'});a.load('r11',{base:'r10'});a.add('r10',8);
  a.label(scan);a.cmp('rcx','r11');a.jcc('ae',scanned);a.load('rax',{base:'r10',disp:8});a.load('rax',{base:'rax'});a.cmp('rax','r8');a.jcc('be',next);a.mov('r8','rax');a.mov('r9','r10');
  a.label(next);a.add('r10',16);a.add('rcx',1);a.jmp(scan);
  a.label(scanned);a.test('r8','r8');a.jcc('e',done);a.store(slot(56),'r9');
  a.mov('rax',0x2020202020202020n);a.store(slot(96),'rax');a.store(slot(104),'rax');
  a.lea('r11',slot(108));a.mov('rax','r8');a.mov('r10',10);
  a.label(digit);a.mov('rdx',0);a.div('r10');a.add('rdx',48);a.sub('r11',1);a.store({base:'r11'},'rdx',8);a.test('rax','rax');a.jcc('ne',digit);
  // The name record: length, then its bytes (at most 256 are printed).
  a.load('r9',slot(56));a.load('r10',{base:'r9'});a.load('rcx',{base:'r10'});a.cmp('rcx',256);a.jcc('be',short);a.mov('rcx',256);a.label(short);a.add('r10',8);
  a.lea('r11',slot(110));a.mov('r8',0);
  a.label(copy);a.cmp('r8','rcx');a.jcc('ae',copied);a.load('rax',{base:'r10'},8);a.store({base:'r11'},'rax',8);a.add('r10',1);a.add('r11',1);a.add('r8',1);a.jmp(copy);
  a.label(copied);a.mov('rax',10);a.store({base:'r11'},'rax',8);a.add('r11',1);
  a.lea('rdx',slot(96));a.mov('r8','r11');a.sub('r8','rdx');a.load('rcx',slot(40));a.lea('r9',slot(48));a.mov('rax',0);a.store(slot(32),'rax');a.callImport('WriteFile');
  a.load('r9',slot(56));a.load('r9',{base:'r9',disp:8});a.mov('rax',0);a.store({base:'r9'},'rax');a.jmp(outer);
  a.label(done);
 });
}
