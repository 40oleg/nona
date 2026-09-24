import {RuntimeBuilder,slot} from './abi.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';

export function emitDescriptorValidation(b:RuntimeBuilder):void {
 // RCX/RDX Values, RAX SameValue Boolean. No user code or allocation.
 b.fn('rt.sameValue',72,a=>{
  const ordinary=a.unique('ordinary'),yes=a.unique('yes'),no=a.unique('no'),done=a.unique('done');
  a.load('rax',{base:'rcx'});a.cmp('rax',3);a.jcc('ne',ordinary);a.load('rax',{base:'rdx'});a.cmp('rax',3);a.jcc('ne',ordinary);
  a.load('rax',{base:'rcx',disp:8});a.load('r10',{base:'rdx',disp:8});a.cmp('rax','r10');a.jcc('e',yes);
  a.movsd('xmm0',{base:'rcx',disp:8});a.ucomisd('xmm0','xmm0');a.jcc('np',no);a.movsd('xmm0',{base:'rdx',disp:8});a.ucomisd('xmm0','xmm0');a.jcc('p',yes);a.jmp(no);
  a.label(ordinary);a.mov('r8','rdx');a.mov('rdx','rcx');a.lea('rcx',slot(40));a.call('rt.strictEq');a.load('rax',slot(48));a.jmp(done);
  a.label(no);a.mov('rax',0);a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);
 });
 // RCX partial descriptor, RDX current complete/missing descriptor, R8 extensible.
 // Return success in RAX. Only on success mutate current to the merged descriptor.
 // No callbacks: both records are retained by the caller throughout validation.
 b.fn('rt.validateDescriptor',72,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  const existing=a.unique('existing'),no=a.unique('no'),yes=a.unique('yes'),merge=a.unique('merge'),done=a.unique('done');
  a.load('rax',{base:'rdx',disp:D.present});a.cmp('rax',-1);a.jcc('ne',existing);a.test('r8','r8');a.jcc('e',no);
  for(let n=0;n<D.size;n+=8){a.load('rax',{base:'rcx',disp:n});a.store({base:'rdx',disp:n},'rax');}
  a.mov('rcx','rdx');a.call('rt.completePropertyDescriptor');a.jmp(yes);
  a.label(existing);
  const configurable=a.unique('configurable');a.load('rax',{base:'rdx',disp:D.configurable+8});a.test('rax','rax');a.jcc('ne',configurable);
  for(const name of ['configurable','enumerable'] as const){
   const absent=a.unique('absent');a.load('rax',{base:'rcx',disp:D.present});a.and('rax',F[name]);a.test('rax','rax');a.jcc('e',absent);
   a.load('rax',{base:'rcx',disp:D[name]+8});a.load('r10',{base:'rdx',disp:D[name]+8});a.cmp('rax','r10');a.jcc('ne',no);a.label(absent);
  }
  a.label(configurable);
  a.load('rax',{base:'rcx',disp:D.present});a.mov('r10','rax');a.and('r10',F.get|F.set);a.and('rax',F.value|F.writable);a.or('rax','r10');a.test('rax','rax');a.jcc('e',merge);
  // Normalize descriptor kind to 0 data or 1 accessor.
  a.test('r10','r10');a.mov('rax',0);const dataKind=a.unique('dataKind');a.jcc('e',dataKind);a.mov('rax',1);a.label(dataKind);a.store(slot(56),'rax');
  a.load('r10',{base:'rdx',disp:D.present});a.and('r10',F.get|F.set);a.test('r10','r10');a.mov('r10',0);const currentData=a.unique('currentData');a.jcc('e',currentData);a.mov('r10',1);a.label(currentData);
  a.cmp('rax','r10');const sameKind=a.unique('sameKind');a.jcc('e',sameKind);
  a.load('rax',{base:'rdx',disp:D.configurable+8});a.test('rax','rax');a.jcc('e',no);
  a.mov('rax',0);for(const offset of [D.value,D.value+8,D.writable+8,D.get,D.get+8,D.set,D.set+8])a.store({base:'rdx',disp:offset},'rax');
  a.mov('rax',2);a.store({base:'rdx',disp:D.writable},'rax');a.load('rax',slot(56));a.test('rax','rax');a.mov('rax',F.data);const changedData=a.unique('changedData');a.jcc('e',changedData);a.mov('rax',F.accessor);a.label(changedData);a.store({base:'rdx',disp:D.present},'rax');a.jmp(merge);
  a.label(sameKind);a.load('rax',{base:'rdx',disp:D.configurable+8});a.test('rax','rax');a.jcc('ne',merge);
  a.load('rax',slot(56));a.test('rax','rax');const accessor=a.unique('accessor');a.jcc('ne',accessor);
  a.load('rax',{base:'rdx',disp:D.writable+8});a.test('rax','rax');a.jcc('ne',merge);
  const noWritable=a.unique('noWritable');a.load('rax',{base:'rcx',disp:D.present});a.and('rax',F.writable);a.test('rax','rax');a.jcc('e',noWritable);a.load('rax',{base:'rcx',disp:D.writable+8});a.test('rax','rax');a.jcc('ne',no);a.label(noWritable);
  const compareField=(name:'value'|'get'|'set')=>{
   const absent=a.unique('absent');a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('rax',{base:'rcx',disp:D.present});a.and('rax',F[name]);a.test('rax','rax');a.jcc('e',absent);
   a.add('rcx',D[name]);a.add('rdx',D[name]);a.call('rt.sameValue');a.test('rax','rax');a.jcc('e',no);a.label(absent);
  };
  compareField('value');a.jmp(merge);a.label(accessor);compareField('get');compareField('set');
  a.label(merge);a.load('rcx',slot(40));a.load('rdx',slot(48));
  for(const name of ['enumerable','configurable','value','writable','get','set'] as const){
   const absent=a.unique('absent');a.load('rax',{base:'rcx',disp:D.present});a.and('rax',F[name]);a.test('rax','rax');a.jcc('e',absent);
   for(const n of [0,8]){a.load('rax',{base:'rcx',disp:D[name]+n});a.store({base:'rdx',disp:D[name]+n},'rax');}a.label(absent);
  }
  a.label(yes);a.mov('rax',1);a.jmp(done);a.label(no);a.mov('rax',0);a.label(done);
 });
}
