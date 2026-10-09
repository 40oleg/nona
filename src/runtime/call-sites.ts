import {RuntimeBuilder,slot} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {EnvironmentLayout as E} from './environment-layout.js';
import {FunctionLayout} from './functions.js';
import type {Assembler,Mem} from '../backend/x64/assembler.js';
import type {Reg} from '../backend/x64/encoder.js';
import type {Fixup} from '../backend/pe/model.js';

/**
 * Closure creation and general calls described by static site descriptors
 * (#166).
 *
 * The code generator used to expand both inline: creating a closure copied
 * its captures into the argument area, called rt.newFunction, stored up to
 * six flags and the lexical this/new.target, and called
 * rt.initFunctionMetadata (87-197 bytes per site); a call whose callee is not
 * known at compile time copied its arguments and set up six registers and
 * stack slots (about 85 bytes). Now each site is one `.rdata` descriptor and
 * `lea rcx,[dest]; lea rdx,[rip+descriptor]; call stub` (16 bytes). The stubs
 * read their operands from the caller's frame through RBP, which the runtime
 * never changes (it is callee-saved in the Win64 ABI the runtime follows).
 *
 * An operand is a signed 32-bit entry. An even entry is the RBP displacement
 * of a frame slot (slots are 16-byte aligned, so displacements are even); an
 * odd entry names a constant in `.rdata`: it is a rel32 fixup with addend 1,
 * so the constant is at entry address + 4 + entry - 1. Constants are 8-aligned
 * fragments and entries 4-aligned, so the distance itself is even. The slot
 * fields of a closure descriptor (thisSlot, newTargetSlot, functionSlot) and
 * a call site's argument area are plain RBP displacements.
 */
export const ClosureDescriptor={code:0,flags:8,parameters:12,captures:16,name:20,sourceText:24,homeObject:28,thisSlot:32,newTargetSlot:36,functionSlot:40,entries:44} as const;
export const ClosureFlags={
 /** No prototype object and not a constructor (methods, accessors, arrows, async functions): rt.newMethod. */
 bare:1,classConstructor:2,arrow:4,generator:8,async:16,strict:32,
 /** An arrow inside a function: it inherits the function's home object. */
 inheritHomeObject:64,
 /** sourceText names a string literal (Function.prototype.toString). */
 sourceText:128,
 /** sourceText names a source range descriptor, stored tagged with bit 0 (rt.sourceSlice). */
 sourceRange:256,
 /** homeObject names a Value (an object literal or class prototype). */
 homeObject:512,
 /** name names a Value (a computed property key) rather than a string literal. */
 computedName:1024,
} as const;
/**
 * argc, the argument area's displacement, the callee and receiver entries,
 * then one entry per argument; a construct site (rt.constructSite) has one
 * more entry, new.target, or SiteNone when the callee is new.target.
 */
export const CallSiteDescriptor={argc:0,area:4,callee:8,receiver:12,entries:16} as const;
const F=ClosureFlags;
/** rt.newClosure entries: the flags each can see (`never`) and always sees (`always`). */
const closureVariants:Record<string,{never:number;always:number}>={
 'rt.newClosure':{never:0,always:0},
 'rt.newArrowClosure':{never:F.classConstructor|F.generator|F.async|F.homeObject|F.computedName,always:F.bare|F.arrow},
 'rt.newPlainClosure':{never:F.bare|F.classConstructor|F.arrow|F.generator|F.async|F.homeObject|F.computedName|F.inheritHomeObject,always:0},
};
/** The rt.newClosure entry for a descriptor with these flags. */
export function closureStub(flags:number):string {
 for(const name of ['rt.newArrowClosure','rt.newPlainClosure']){const v=closureVariants[name]!;if((flags&v.never)===0&&(flags&v.always)===v.always)return name;}
 return 'rt.newClosure';
}
/** Sites with at most this many arguments have a stub for their count. */
export const unrolledArguments=4;
/** The stub for a general call site of `kind` with `count` arguments. */
export function callSiteStub(kind:'invoke'|'construct'|'tail',count:number):string {
 const name={invoke:'rt.invokeSite',construct:'rt.constructSite',tail:'rt.tailCallSite'}[kind];
 return count<=unrolledArguments?`${name}${count}`:name;
}
/** An absent operand: neither a slot displacement (a multiple of 16) nor a constant (odd). */
export const SiteNone=2;
/** Writes the entry for a code generator operand (an RBP-relative slot or a constant's address) at `offset`. */
export function writeSiteEntry(view:DataView,fixups:Fixup[],offset:number,mem:Mem):void {
 if('rip' in mem){
  if(((mem.addend??0)&7)!==0)throw new Error('Site constants must be 8-aligned');
  fixups.push({offset,kind:'rel32',target:mem.rip,addend:(mem.addend??0)+1});return;
 }
 if(mem.base!=='rbp')throw new Error('Site operands are RBP-relative');
 const disp=mem.disp??0;
 if((disp&15)!==0)throw new Error('Site slots must be 16-byte aligned');
 view.setInt32(offset,disp,true);
}

/**
 * Operand decoding for a stub. `one` holds 1 whenever resolve runs; the
 * constant case is out of line, after the stub's main path (`finish`).
 */
class Operands {
 private readonly cold:(()=>void)[]=[];
 constructor(private readonly a:Assembler,private readonly one:Reg){}
 /** RAX = the address the entry at [base+disp] names. */
 resolve(disp=0,base:Reg='r10'):void {
  const a=this.a,constant=a.unique('constant'),done=a.unique('resolved');
  a.loadSigned32('rax',{base,disp});a.test('rax',this.one);a.jcc('ne',constant);a.add('rax','rbp');a.label(done);
  this.cold.push(()=>{a.label(constant);a.add('rax',base);a.add('rax',disp+3);a.jmp(done);});
 }
 /** Emits the out-of-line cases; `fallsThrough` when the main path continues after them. */
 finish(fallsThrough=true):void {
  const a=this.a,exit=a.unique('exit');if(fallsThrough)a.jmp(exit);for(const emit of this.cold)emit();if(fallsThrough)a.label(exit);
 }
}
/** Copies the 16-byte Value at RAX to [R9] in 8-byte halves (store forwarding). Clobbers R11. */
function copyValue(a:Assembler):void {
 a.load('r11',{base:'rax'});a.store({base:'r9'},'r11');a.load('r11',{base:'rax',disp:8});a.store({base:'r9',disp:8},'r11');
}
/** RAX = RBP + the signed displacement at [base+disp]. */
function frameSlot(a:Assembler,base:Reg,disp:number):void {a.loadSigned32('rax',{base,disp});a.add('rax','rbp');}

export function emitCallSites(b:RuntimeBuilder):void {
 // RCX count, RDX the first entry: a raw environment holding the Values the
 // entries name (like rt.newEnvironment), or 0 for no captures. rt.alloc
 // never collects (collections happen at safepoints), so the raw pointer
 // stays valid until the caller links it into the function object.
 b.fn('rt.newEnvironmentFromFrame',56,a=>{
  const ops=new Operands(a,'rcx'),done=a.unique('done'),loop=a.unique('loop');a.mov('rax',0);a.test('rcx','rcx');a.jcc('e',done);
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.shl('rcx',4);a.add('rcx',E.cells);a.call('rt.alloc');
  a.mov('r10',HeapKind.environment);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.load('r8',slot(40));a.store({base:'rax',disp:E.count},'r8');
  a.lea('r9',{base:'rax',disp:E.cells});a.load('r10',slot(48));a.mov('rdx','rax');a.mov('rcx',1);
  a.label(loop);ops.resolve();copyValue(a);a.add('r10',4);a.add('r9',E.entry);a.sub('r8',1);a.jcc('ne',loop);
  a.mov('rax','rdx');a.label(done);ops.finish();
 });
 // RCX result Value*, RDX ClosureDescriptor: the closure of the descriptor's
 // code over the current frame, with its flags, prototype and metadata.
 // Arrows and plain functions, most closures, have their own entries in
 // which the flags they cannot have are not tested (closureStub).
 // slot(40) result, slot(48) descriptor, slot(56) flags, slot(64) the function object.
 for(const [name,variant] of Object.entries(closureVariants))b.fn(name,88,a=>{
  const ops=new Operands(a,'r11');
  /** Whether one of the flags can be set / is always set in this variant. */
  const may=(flag:number)=>(flag&~variant.never)!==0,always=(flag:number)=>(flag&variant.always)!==0;
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.load('r8',{base:'rdx',disp:ClosureDescriptor.flags},32);a.store(slot(56),'r8');
  a.load('rcx',{base:'rdx',disp:ClosureDescriptor.captures},32);a.lea('rdx',{base:'rdx',disp:ClosureDescriptor.entries});a.call('rt.newEnvironmentFromFrame');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('rdx',{base:'rdx',disp:ClosureDescriptor.code});a.mov('r8','rax');a.call('rt.newFunctionWithEnvironment');
  a.load('rcx',slot(40));a.load('r10',{base:'rcx',disp:8});a.store(slot(64),'r10');
  /** Emits `body` when the flag is set (tested at run time unless the variant decides); R10 = the function object. */
  const when=(flag:number,body:()=>void)=>{
   if(!may(flag))return;
   if(always(flag)){a.load('r10',slot(64));body();return;}
   const skip=a.unique('skip');a.load('rax',slot(56));a.and('rax',flag);a.jcc('e',skip);a.load('r10',slot(64));body();a.label(skip);
  };
  const store=(offset:number,value:number)=>{a.mov('rax',value);a.store({base:'r10',disp:offset},'rax');};
  // Methods, accessors, arrows and async functions have no prototype object
  // and cannot construct (rt.newMethod); the others get one (rt.newFunction).
  if(always(ClosureFlags.bare))store(FunctionLayout.constructable,0);
  else if(!may(ClosureFlags.bare))a.call('rt.installFunctionPrototype');
  else{const bare=a.unique('bare'),flagged=a.unique('flagged');
   a.load('rax',slot(56));a.and('rax',ClosureFlags.bare);a.jcc('ne',bare);a.call('rt.installFunctionPrototype');a.jmp(flagged);
   a.label(bare);store(FunctionLayout.constructable,0);a.label(flagged);}
  when(ClosureFlags.classConstructor,()=>store(FunctionLayout.constructable,2));
  when(ClosureFlags.async,()=>{
   const notGenerator=a.unique('asyncFunction'),done=a.unique('asyncDone');
   store(FunctionLayout.constructable,0);
   a.load('rax',slot(56));a.and('rax',ClosureFlags.generator);a.jcc('e',notGenerator);
   store(FunctionLayout.generator,3);a.load('rcx',slot(40));a.call('rt.initializeAsyncGeneratorFunction');a.jmp(done);
   a.label(notGenerator);store(FunctionLayout.generator,2);a.lea('rax',{rip:'rt.asyncFunctionPrototype'});a.store({base:'r10',disp:O.prototype},'rax');
   a.label(done);
  });
  if(may(ClosureFlags.generator)){
   // A synchronous generator (async generators were handled above).
   const skip=a.unique('notGenerator');a.load('rax',slot(56));a.and('rax',ClosureFlags.generator|ClosureFlags.async);a.cmp('rax',ClosureFlags.generator);a.jcc('ne',skip);
   a.load('r10',slot(64));store(FunctionLayout.generator,1);store(FunctionLayout.constructable,0);a.load('rcx',slot(40));a.call('rt.initializeGeneratorFunction');
   a.label(skip);
  }
  when(ClosureFlags.strict|ClosureFlags.arrow,()=>store(FunctionLayout.rawThis,1));
  when(ClosureFlags.arrow,()=>{
   store(FunctionLayout.arrow,1);
   // The lexical this and new.target are the creating frame's own slots.
   a.load('rdx',slot(48));
   for(const [field,offset] of [[ClosureDescriptor.thisSlot,FunctionLayout.lexicalThis],[ClosureDescriptor.newTargetSlot,FunctionLayout.lexicalNewTarget]] as const){
    frameSlot(a,'rdx',field);for(const half of [0,8]){a.load('r11',{base:'rax',disp:half});a.store({base:'r10',disp:offset+half},'r11');}
   }
  });
  // An arrow inside a function inherits its home object (not at the top level).
  when(ClosureFlags.inheritHomeObject,()=>{
   a.load('rdx',slot(48));frameSlot(a,'rdx',ClosureDescriptor.functionSlot);a.load('rax',{base:'rax'});
   a.load('rax',{base:'rax',disp:FunctionLayout.homeObject});a.store({base:'r10',disp:FunctionLayout.homeObject},'rax');
  });
  when(ClosureFlags.homeObject,()=>{
   a.load('r10',slot(48));a.mov('r11',1);ops.resolve(ClosureDescriptor.homeObject);
   a.load('r10',slot(64));a.load('rax',{base:'rax',disp:8});a.store({base:'r10',disp:FunctionLayout.homeObject},'rax');
  });
  when(ClosureFlags.sourceText|ClosureFlags.sourceRange,()=>{
   const text=a.unique('sourceText');
   a.load('r10',slot(48));a.mov('r11',1);ops.resolve(ClosureDescriptor.sourceText);
   // A source range descriptor is tagged with bit 0 (rt.sourceSlice).
   a.load('r10',slot(56));a.and('r10',ClosureFlags.sourceRange);a.jcc('e',text);a.or('rax',1);a.label(text);
   a.load('r10',slot(64));a.store({base:'r10',disp:FunctionLayout.sourceText},'rax');
  });
  // length and name; the name is a string literal or the payload of a computed key.
  a.load('r10',slot(48));a.mov('r11',1);ops.resolve(ClosureDescriptor.name);a.mov('rdx','rax');
  if(may(ClosureFlags.computedName)){const literal=a.unique('literalName');
   a.load('rax',slot(56));a.and('rax',ClosureFlags.computedName);a.jcc('e',literal);a.load('rdx',{base:'rdx',disp:8});a.label(literal);}
  a.load('rcx',slot(40));a.load('r8',slot(48));a.load('r8',{base:'r8',disp:ClosureDescriptor.parameters},32);a.call('rt.initFunctionMetadata');
  ops.finish();
 });
 // RCX result Value*, RDX CallSiteDescriptor: copies the arguments into the
 // caller's argument area, stores the receiver and (construct) new.target
 // pointers into the caller's outgoing fifth and sixth argument slots and
 // jumps to rt.invoke (rt.invokeConstruct for `new`, rt.prepareTailCall for
 // a tail call) with the site's callee: a tail jump, so the stub has no frame
 // of its own and rt.invoke returns straight to the call site, whose stack map
 // covers the operands. Sites with up to unrolledArguments arguments use a
 // stub for their count (callSiteStub), which keeps everything in registers;
 // the general one keeps the result and argument area pointers in the shadow
 // space the caller allocated for this call.
 for(const [kind,target] of [['invoke','rt.invoke'],['construct','rt.invokeConstruct'],['tail','rt.prepareTailCall']] as const){
  for(let count=0;count<=unrolledArguments+1;count++)b.raw(callSiteStub(kind,count),a=>{
   const ops=new Operands(a,'r11'),fifth={base:'rsp',disp:40} as const,sixth={base:'rsp',disp:48} as const;
   const general=count>unrolledArguments,result={base:'rsp',disp:8} as const,area={base:'rsp',disp:16} as const;
   a.mov('r11',1);a.loadSigned32('r9',{base:'rdx',disp:CallSiteDescriptor.area});a.add('r9','rbp');
   // R10 ends at the entry after the arguments (a construct site's new.target).
   if(general){
    const loop=a.unique('loop'),copied=a.unique('copied');
    a.store(result,'rcx');a.store(area,'r9');
    a.load('r8',{base:'rdx',disp:CallSiteDescriptor.argc},32);a.lea('r10',{base:'rdx',disp:CallSiteDescriptor.entries});a.test('r8','r8');a.jcc('e',copied);
    a.label(loop);ops.resolve();
    a.load('rcx',{base:'rax'});a.store({base:'r9'},'rcx');a.load('rcx',{base:'rax',disp:8});a.store({base:'r9',disp:8},'rcx');
    a.add('r10',4);a.add('r9',16);a.sub('r8',1);a.jcc('ne',loop);
    a.label(copied);
   }else{
    for(let i=0;i<count;i++){
     ops.resolve(CallSiteDescriptor.entries+4*i,'rdx');
     for(const half of [0,8]){a.load('r8',{base:'rax',disp:half});a.store({base:'r9',disp:16*i+half},'r8');}
    }
    if(kind==='construct')a.lea('r10',{base:'rdx',disp:CallSiteDescriptor.entries+4*count});
   }
   if(kind==='construct'){
    // SiteNone passes 0: new.target is the callee.
    const none=a.unique('noNewTarget'),ready=a.unique('newTargetReady');
    a.loadSigned32('rax',{base:'r10'});a.cmp('rax',SiteNone);a.jcc('e',none);ops.resolve();a.jmp(ready);
    a.label(none);a.mov('rax',0);a.label(ready);a.store(sixth,'rax');
   }
   ops.resolve(CallSiteDescriptor.receiver,'rdx');a.store(fifth,'rax');
   ops.resolve(CallSiteDescriptor.callee,'rdx');
   if(general){a.load('r8',{base:'rdx',disp:CallSiteDescriptor.argc},32);a.load('r9',area);a.load('rcx',result);}
   else a.mov('r8',count);
   a.mov('rdx','rax');a.tailJump(target);
   ops.finish(false);
  });
 }
}
