import type {Assembler} from '../backend/x64/assembler.js';
import {slot} from './abi.js';
import {ObjectLayout as O,ObjectFlags as OF} from './object-layout.js';

// newInstanceRaw records when new.target.prototype was not an object. Each
// native constructor must then use its own intrinsic prototype.
export function selectNativeConstructPrototype(a:Assembler,frame:number,intrinsic:string):void{
 a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});
 a.load('r11',{base:'r10',disp:O.flags});a.and('r11',OF.defaultPrototypeFallback);
 const inherited=a.unique('inherited'),ready=a.unique('prototypeReady');
 a.test('r11','r11');a.jcc('e',inherited);a.lea('r10',{rip:intrinsic});a.jmp(ready);
 a.label(inherited);a.load('r10',{base:'r10',disp:O.prototype});a.label(ready);
}
