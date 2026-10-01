import type {Assembler} from '../backend/x64/assembler.js';
import {slot} from './abi.js';
import {ObjectLayout as O,ObjectFlags as OF} from './object-layout.js';

/** Object flag bits 8..15: realm index of new.target when the fallback applies. */
export const RealmFlagShift=8;
/** Intrinsics looked up per realm; codegen emits realm.table.NAME (one pointer per realm). */
export const realmTableIntrinsics=new Set<string>(['rt.objectPrototype']);
export const realmTable=(intrinsic:string):string=>{realmTableIntrinsics.add(intrinsic);return 'realm.table.'+intrinsic;};
// newInstanceRaw records when new.target.prototype was not an object. Each
// native constructor must then use the intrinsic of new.target's realm.
export function selectNativeConstructPrototype(a:Assembler,frame:number,intrinsic:string):void{
 a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});
 a.load('r11',{base:'r10',disp:O.flags});a.and('r11',OF.defaultPrototypeFallback);
 const inherited=a.unique('inherited'),ready=a.unique('prototypeReady');
 a.test('r11','r11');a.jcc('e',inherited);
 a.load('r11',{base:'r10',disp:O.flags});a.shr('r11',RealmFlagShift);a.and('r11',255);a.shl('r11',3);
 a.lea('r10',{rip:realmTable(intrinsic)});a.add('r10','r11');a.load('r10',{base:'r10'});a.jmp(ready);
 a.label(inherited);a.load('r10',{base:'r10',disp:O.prototype});a.label(ready);
}

/**
 * Reflect.construct gives some native constructors a receiver flagged
 * deferredConstructPrototype, so GetPrototypeFromConstructor runs at the
 * step ECMA-262 specifies (after argument conversion). This performs it once:
 * newTarget.prototype, or the intrinsic of newTarget's realm when that is not
 * an object, is stored in the receiver and the flag is cleared, so
 * selectNativeConstructPrototype then reads it. `temp` is a rooted 16-byte slot.
 */
export function resolveDeferredConstructPrototype(a:Assembler,frame:number,intrinsic:string,temp:number):void{
 const done=a.unique('deferredDone'),ready=a.unique('deferredReady');
 a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r11',{base:'r10',disp:O.flags});a.and('r11',OF.deferredConstructPrototype);a.test('r11','r11');a.jcc('e',done);
 a.lea('rcx',slot(temp));a.load('rdx',slot(frame+48));a.lea('r8',{rip:'rt.key.prototype'});a.call('rt.getProperty');
 a.load('r11',slot(temp));a.cmp('r11',5);a.load('r11',slot(temp+8));a.jcc('e',ready);
 a.load('rcx',slot(frame+48));a.load('rcx',{base:'rcx',disp:8});a.call('rt.functionRealm');a.shl('rax',3);
 a.lea('r11',{rip:realmTable(intrinsic)});a.add('r11','rax');a.load('r11',{base:'r11'});
 a.label(ready);a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.store({base:'r10',disp:O.prototype},'r11');
 a.mov('r11',0);a.store({base:'r10',disp:O.flags},'r11');
 a.label(done);
}
