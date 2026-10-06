import {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {MapLayout,MapEntryLayout as E} from './map.js';
import {WeakMapKind,WeakFinalizationLayout as F} from './weak-collections.js';

/** Private builtin ABI: (WeakMap, mode, callback), with no calls or allocation.
 * Mode 0 publishes a surviving key into the caller's precise Value root;
 * mode 1 reads the strong callback, and mode 2 replaces/clears that callback.
 * GC has already pruned dead keys before any allocation can be reused. */
export function emitProcessFinalization(b:RuntimeBuilder):void {
 b.fn('process.finalization.code',40,a=>{
  const missing=a.unique('missing'),callback=a.unique('callback'),write=a.unique('write'),scan=a.unique('scan'),found=a.unique('found'),done=a.unique('done');
  a.cmp('rdx',2);a.jcc('b',missing);a.load('rax',{base:'r8'});a.cmp('rax',5);a.jcc('ne',missing);
  a.load('r9',{base:'r8',disp:8});a.load('rax',{base:'r9',disp:O.kind});a.cmp('rax',WeakMapKind);a.jcc('ne',missing);
  a.load('rax',{base:'r8',disp:16});a.cmp('rax',3);a.jcc('ne',missing);a.movsd('xmm0',{base:'r8',disp:24});a.cvttsd2si('rax','xmm0');
  a.cmp('rax',1);a.jcc('e',callback);a.cmp('rax',2);a.jcc('e',write);a.test('rax','rax');a.jcc('ne',missing);
  a.load('r9',{base:'r9',disp:MapLayout.head});a.label(scan);a.test('r9','r9');a.jcc('e',missing);a.load('rax',{base:'r9',disp:E.active});a.test('rax','rax');a.jcc('ne',found);a.load('r9',{base:'r9',disp:E.next});a.jmp(scan);
  a.label(found);for(const offset of [0,8]){a.load('rax',{base:'r9',disp:E.key+offset});a.store({base:'rcx',disp:offset},'rax');}a.jmp(done);
  a.label(callback);for(const offset of [0,8]){a.load('rax',{base:'r9',disp:F.callback+offset});a.store({base:'rcx',disp:offset},'rax');}a.jmp(done);
  a.label(write);a.cmp('rdx',3);a.jcc('b',missing);for(const offset of [0,8]){a.load('rax',{base:'r8',disp:32+offset});a.store({base:'r9',disp:F.callback+offset},'rax');}
  a.label(missing);a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
}
