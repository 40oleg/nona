import { Assembler, type Reg } from '../../backend/x64/assembler.js';
import type { RuntimeBundle } from '../abi.js';

/** Private fixed scratch big integers: 256 base-2^32 limbs, little endian. */
export const BIG_BYTES = 1032;
export class Native {
  a: Assembler;
  readonly saved = ['rbx','rsi','rdi','r12','r13','r14','r15'] as const;
  saves: {register:number;codeOffset:number;stackOffset:number}[]=[];
  prolog: number;
  allocationCodeOffset: number;
  constructor(readonly name:string, readonly frame=360) {
    this.a=new Assembler(name);
    // A frame of a page or more touches each page first, as Windows guard pages require.
    if(frame>=4096){
      this.a.mov('r11','rsp');this.a.mov('rax',Math.floor(frame/4096));
      const probe=this.a.unique('probe');this.a.label(probe);this.a.sub('r11',4096);this.a.load('r10',{base:'r11'});this.a.sub('rax',1);this.a.jcc('ne',probe);
      if(frame%4096){this.a.sub('r11',frame%4096);this.a.load('r10',{base:'r11'});}
    }
    this.a.sub('rsp',frame);this.allocationCodeOffset=this.a.offset;
    for(let i=0;i<this.saved.length;i++) {
      const r=this.saved[i]!; this.a.store({base:'rsp',disp:32+i*8},r);
      this.saves.push({register:{rbx:3,rsi:6,rdi:7,r12:12,r13:13,r14:14,r15:15}[r],codeOffset:this.a.offset,stackOffset:32+i*8});
    }
    this.prolog=this.a.offset;
  }
  get(r:Reg,slot:number){this.a.load(r,{base:'rsp',disp:96+slot*8});}
  set(slot:number,r:Reg){this.a.store({base:'rsp',disp:96+slot*8},r);}
  imm(slot:number,n:number|bigint){this.a.mov('rax',n);this.set(slot,'rax');}
  end(bundle:RuntimeBundle){
    for(let i=0;i<this.saved.length;i++)this.a.load(this.saved[i]!,{base:'rsp',disp:32+i*8});
    this.a.add('rsp',this.frame);this.a.ret();this.a.label(this.name+'.end');
    bundle.fragments.push({...this.a.finish(),name:this.name,section:'.text'});
    bundle.functions.push({begin:this.name,end:this.name+'.end',prologSize:this.prolog,stackAllocation:this.frame,savedRegisters:this.saves,allocationCodeOffset:this.allocationCodeOffset});
  }
}
