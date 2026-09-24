import type {RuntimeBuilder} from './abi.js';
import {slot} from './abi.js';
import type {Assembler} from '../backend/x64/assembler.js';
import {RootLayout as R} from './heap-layout.js';
import {CellTag} from './environment-layout.js';

type ArgumentRegister='rcx'|'rdx'|'r8'|'r9';
export type RuntimeRoot=
 | {kind:'value';register:ArgumentRegister}
 | {kind:'range';register:ArgumentRegister;count:number|ArgumentRegister}
 | {kind:'output';register:ArgumentRegister}
 | {kind:'pointer';register:ArgumentRegister}
 | {kind:'locals';offset:number;count:number};

/** Add precise roots without changing offsets of the helper's existing locals.
 * Value inputs are snapshots plus a typed pointer retaining their container.
 * Range inputs must keep their contents stable during callbacks. Output roots
 * retain only the container: the result need not be initialized on entry.
 * body receives the enlarged frame size for incoming stack argument offsets.
 */
export function rootedFn(b:RuntimeBuilder,name:string,frame:number,roots:RuntimeRoot[],body:(a:Assembler,frameSize:number)=>void):void {
 if(frame%16!==8||roots.length===0)throw new Error('Invalid rooted runtime frame');
 let cursor=frame;
 const snapshots=roots.map(root=>{
  if(root.kind==='locals'&&(root.offset<32||root.count<0||root.offset+16*root.count>frame))throw new Error('Local root outside original frame');
  const offset=cursor;if(root.kind==='value')cursor+=32;else if(root.kind==='pointer')cursor+=16;return offset;
 });
 const records=cursor;cursor+=R.size*roots.length;
 const allocation=Math.ceil((cursor+8)/16)*16-8;
 b.fn(name,allocation,a=>{
  for(const root of roots)if(root.kind==='locals'){
   a.mov('rax',0);for(let i=0;i<root.count*2;i++)a.store(slot(root.offset+8*i),'rax');
  }
  for(const [index,root] of roots.entries()){
   const record=records+index*R.size,snapshot=snapshots[index]!;
   if(index===0)a.load('rax',{rip:'rt.gcRoots'});else a.lea('rax',slot(record-R.size));a.store(slot(record+R.next),'rax');
   if(root.kind==='value'){
    for(const offset of [0,8]){a.load('rax',{base:root.register,disp:offset});a.store(slot(snapshot+offset),'rax');}
    // Internal reference Value. It never escapes to JS; GC traces its pointer
    // by allocation kind, just as for internal captured-cell references.
    a.mov('rax',CellTag);a.store(slot(snapshot+16),'rax');a.store(slot(snapshot+24),root.register);
    a.lea('rax',slot(snapshot));a.store(slot(record+R.values),'rax');a.mov('rax',2);
   }else if(root.kind==='pointer'){
    a.mov('rax',CellTag);a.store(slot(snapshot),'rax');a.store(slot(snapshot+8),root.register);
    a.lea('rax',slot(snapshot));a.store(slot(record+R.values),'rax');a.mov('rax',1);
   }else if(root.kind==='locals'){
    a.lea('rax',slot(root.offset));a.store(slot(record+R.values),'rax');a.mov('rax',root.count);
   }else{
    a.store(slot(record+R.values),root.register);
    if(root.kind==='output')a.mov('rax',0);else if(typeof root.count==='number')a.mov('rax',root.count);else a.mov('rax',root.count);
   }
   a.store(slot(record+R.count),'rax');
  }
  a.lea('rax',slot(records+(roots.length-1)*R.size));a.store({rip:'rt.gcRoots'},'rax');
  body(a,allocation);
  // RAX/XMM0 may carry the return value. Restore via another volatile register.
  a.load('r10',slot(records+R.next));a.store({rip:'rt.gcRoots'},'r10');
 });
}
