import {Assembler,type Reg,type Mem,type Xmm,type Condition,type CodeFragment,type Fixup} from '../x64/assembler.js';

// Preserve the existing runtime's logical calling convention while lowering
// each operation to A64. x18 stays available to the operating system.
export const arm64Registers:Readonly<Record<Reg,number>>=Object.freeze({
  rax:0,rcx:1,rdx:2,rbx:3,rbp:4,rsi:5,rdi:6,r8:7,r9:8,r10:9,r11:10,
  r12:19,r13:20,r14:21,r15:22,rsp:28,
});

export class Arm64Assembler extends Assembler {
  private instructionFixups:Fixup[]=[];
  override emit(_bytes:number[]|Uint8Array):void {
    throw new Error('Raw x64 bytes cannot be emitted in an ARM64 assembler');
  }
  /** Emit an explicitly encoded native A64 instruction, including OS bridges. */
  nativeWord(value:number):void {
    if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new Error('Invalid A64 instruction word');
    super.emit([value&255,(value>>>8)&255,(value>>>16)&255,value>>>24]);
  }
  override finish():CodeFragment {
    const fragment=super.finish();
    return {...fragment,fixups:[...fragment.fixups,...this.instructionFixups.map(f=>({...f}))]};
  }
  private relocated(value:number,kind:Fixup['kind'],target:string,addend=0):void {
    this.instructionFixups.push({offset:this.offset,kind,target,addend});this.nativeWord(value>>>0);
  }
  nativeMove(dst:number,src:number):void {this.nativeWord((0xaa0003e0|(src<<16)|dst)>>>0);}
  nativeImmediate(dst:number,value:number|bigint):void {
    if(typeof value==='number'&&!Number.isSafeInteger(value))throw new RangeError('ARM64 immediate must be exact');
    const bits=BigInt.asUintN(64,BigInt(value));let first=true;
    for(let part=0;part<4;part++){
      const half=Number(bits>>BigInt(part*16)&65535n);
      if(!half&&!(part===3&&first))continue;
      this.nativeWord(((first?0xd2800000:0xf2800000)|(part<<21)|(half<<5)|dst)>>>0);first=false;
    }
  }
  override mov(dst:Reg,src:Reg|number|bigint):void {
    const d=arm64Registers[dst];
    if(typeof src==='string')this.nativeMove(d,arm64Registers[src]);else this.nativeImmediate(d,src);
  }
  private operand(src:Reg|number):number {
    if(typeof src==='string')return arm64Registers[src];
    this.nativeImmediate(13,src);return 13;
  }
  private extract(dst:number,src:number,start:number,bits:number):void {
    this.nativeWord((0xd3400000|(start<<16)|((start+bits-1)<<10)|(src<<5)|dst)>>>0);
  }
  private parity(result:number):void {
    this.nativeMove(24,result);
    for(const shift of [4,2,1])this.nativeWord((0xca400000|(24<<16)|(shift<<10)|(24<<5)|24)>>>0);
    this.extract(24,24,0,1);this.nativeImmediate(13,1);this.nativeWord(0xca0d0318);
  }
  private flags(result:number,invertCarry=false):void {
    this.nativeWord(0xd53b4217); // mrs x23, nzcv
    if(invertCarry){this.nativeImmediate(13,0x20000000);this.nativeWord(0xca0d02f7);}
    this.parity(result);
  }
  private restoreFlags():void {
    this.nativeImmediate(13,0x20000000);this.nativeWord(0xca0d02ed);this.nativeWord(0xd51b420d);
  }
  private conditionCode(condition:Condition):number {
    if(condition==='p'||condition==='np'){
      this.nativeWord(0xea18031f);return condition==='p'?1:0;
    }
    this.restoreFlags();return {o:6,no:7,b:3,ae:2,e:0,ne:1,be:9,a:8,s:4,ns:5,l:11,ge:10,le:13,g:12}[condition];
  }
  private nativeConditional(condition:number,target:string):void {
    // A conditional short skip around a full-range B avoids the 1 MiB limit.
    this.nativeWord(0x54000040|(condition^1));this.jmp(target);
  }
  override jcc(condition:Condition,target:string):void {this.nativeConditional(this.conditionCode(condition),target);}
  override setCondition(condition:Condition):void {
    const code=this.conditionCode(condition);this.nativeWord((0x9a9f07e0|((code^1)<<12))>>>0);
  }
  private arithmetic(dst:Reg,src:Reg|number,subtract:boolean,compare=false):void {
    const d=arm64Registers[dst],s=this.operand(src),result=compare?12:d;
    this.nativeWord(((subtract?0xeb000000:0xab000000)|(s<<16)|(d<<5)|result)>>>0);this.flags(result,subtract);
  }
  override add(dst:Reg,src:Reg|number):void {this.arithmetic(dst,src,false);}
  override sub(dst:Reg,src:Reg|number):void {this.arithmetic(dst,src,true);}
  override cmp(dst:Reg,src:Reg|number):void {this.arithmetic(dst,src,true,true);}
  private logical(dst:Reg,src:Reg|number,opcode:number):void {
    const d=arm64Registers[dst],s=this.operand(src);
    this.nativeWord((opcode|(s<<16)|(d<<5)|d)>>>0);this.nativeWord((0xea00001f|(d<<16)|(d<<5))>>>0);this.flags(d);
  }
  override and(dst:Reg,src:Reg|number):void {this.logical(dst,src,0x8a000000);}
  override or(dst:Reg,src:Reg|number):void {this.logical(dst,src,0xaa000000);}
  override xor(dst:Reg,src:Reg|number):void {this.logical(dst,src,0xca000000);}
  override test(left:Reg,right:Reg):void {
    this.nativeWord((0xea000000|(arm64Registers[right]<<16)|(arm64Registers[left]<<5)|12)>>>0);this.flags(12);
  }
  override neg(reg:Reg):void {
    const d=arm64Registers[reg];this.nativeWord((0xeb0003e0|(d<<16)|d)>>>0);this.flags(d,true);
  }
  override not(reg:Reg):void {
    const d=arm64Registers[reg];this.nativeWord((0xaa2003e0|(d<<16)|d)>>>0);
  }
  private shift64(reg:Reg,count:number|'cl',operation:0|1|2):void {
    if(count!=='cl'&&(!Number.isInteger(count)||count<0||count>63))throw new Error('Invalid shift count');
    if(count===0)return;
    const d=arm64Registers[reg],done=this.unique('shiftDone'),noOverflow=this.unique('shiftNoOverflow');
    if(count==='cl'){this.extract(16,1,0,6);this.nativeWord(0xf100021f);this.nativeConditional(0,done);}
    else this.nativeImmediate(16,count);
    this.nativeMove(14,d);
    if(operation===0){this.nativeImmediate(12,64);this.nativeWord(0xcb10018c);}
    else this.nativeWord(0xd100060c); // sub x12, x16, #1
    this.nativeWord((0x9ac02400|(12<<16)|(14<<5)|15)>>>0);this.extract(15,15,0,1);
    this.nativeWord((0x9ac02000|(operation<<10)|(16<<16)|(d<<5)|d)>>>0);
    this.nativeWord((0xea00001f|(d<<16)|(d<<5))>>>0);this.flags(d);
    this.nativeWord(0xaa0f76f7); // orr x23, x23, x15, lsl #29
    this.nativeWord(0xf100061f);this.nativeConditional(1,noOverflow);
    if(operation!==2){
      this.extract(14,operation===0?d:14,63,1);
      if(operation===0)this.nativeWord(0xca0f01ce);
      this.nativeWord(0xaa0e72f7);
    }
    this.label(noOverflow);this.label(done);
  }
  override shl(reg:Reg,count:number|'cl'):void {this.shift64(reg,count,0);}
  override shr(reg:Reg,count:number|'cl'):void {this.shift64(reg,count,1);}
  override sar(reg:Reg,count:number|'cl'):void {this.shift64(reg,count,2);}
  private multiplyFlags(high:number,sign?:number):void {
    this.nativeWord((0xeb00001f|((sign??31)<<16)|(high<<5))>>>0);
    this.nativeWord(0x9a9f07ee);this.nativeWord(0xd36389d7);this.nativeWord(0xaa0e72f7);
  }
  override imul(dst:Reg,src:Reg):void {
    const d=arm64Registers[dst],s=arm64Registers[src];
    this.nativeWord((0x9b407c00|(s<<16)|(d<<5)|14)>>>0);
    this.nativeWord((0x9b007c00|(s<<16)|(d<<5)|d)>>>0);
    this.nativeWord((0x937ffc00|(d<<5)|15)>>>0);this.multiplyFlags(14,15);
  }
  override mul(src:Reg):void {
    this.nativeMove(16,arm64Registers[src]);this.nativeWord(0x9bd07c02);this.nativeWord(0x9b107c00);this.multiplyFlags(2);
  }
  override signExtendRax():void {this.nativeWord(0x937ffc02);}
  private divide128(src:Reg,signed:boolean):void {
    const loop=this.unique('divideLoop'),subtract=this.unique('divideSubtract'),next=this.unique('divideNext'),trap=this.unique('divideTrap'),done=this.unique('divideDone');
    this.nativeMove(16,arm64Registers[src]);this.nativeMove(14,2);this.nativeMove(15,0);
    if(signed){
      this.extract(26,14,63,1);this.extract(25,16,63,1);this.nativeWord(0xca1a0339);
      const positiveDivisor=this.unique('positiveDivisor'),positiveDividend=this.unique('positiveDividend');
      this.nativeWord(0xf100021f);this.nativeConditional(10,positiveDivisor);this.nativeWord(0xcb1003f0);this.label(positiveDivisor);
      this.nativeWord(0xf100035f);this.nativeConditional(0,positiveDividend);
      this.nativeWord(0xeb0f03ef);this.nativeWord(0xda0e03ee);this.label(positiveDividend);
    }
    this.nativeWord(0xf100021f);this.nativeConditional(0,trap);this.nativeWord(0xeb1001df);this.nativeConditional(2,trap);
    this.nativeImmediate(11,0);this.nativeImmediate(17,64);this.label(loop);
    this.extract(12,14,63,1);this.nativeWord(0xd37ff9ce);this.extract(13,15,63,1);this.nativeWord(0xaa0d01ce);
    this.nativeWord(0xd37ff9ef);this.nativeWord(0xd37ff96b);this.nativeWord(0xf100019f);this.nativeConditional(1,subtract);
    this.nativeWord(0xeb1001df);this.nativeConditional(3,next);
    this.label(subtract);this.nativeWord(0xcb1001ce);this.nativeWord(0x9100056b);
    this.label(next);this.nativeWord(0xf1000631);this.nativeConditional(1,loop);
    this.nativeMove(0,11);this.nativeMove(2,14);
    if(signed){
      const positiveQuotient=this.unique('positiveQuotient'),quotientReady=this.unique('quotientReady'),remainderReady=this.unique('remainderReady');
      this.nativeWord(0xf100033f);this.nativeConditional(0,positiveQuotient);
      this.nativeImmediate(13,0x8000000000000000n);this.nativeWord(0xeb0d001f);this.nativeConditional(8,trap);this.nativeWord(0xcb0003e0);this.jmp(quotientReady);
      this.label(positiveQuotient);this.extract(12,0,63,1);this.nativeWord(0xf100019f);this.nativeConditional(1,trap);this.label(quotientReady);
      this.nativeWord(0xf100035f);this.nativeConditional(0,remainderReady);this.nativeWord(0xcb0203e2);this.label(remainderReady);
    }
    this.jmp(done);this.label(trap);this.nativeWord(0xd4200000);this.label(done);
  }
  override div(src:Reg):void {this.divide128(src,false);}
  override idiv(src:Reg):void {this.divide128(src,true);}
  private nativeAddress(dst:number,src:Mem):void {
    if('rip' in src){
      this.relocated(0x90000000|dst,'arm64-page21',src.rip,src.addend??0);
      this.relocated(0x91000000|(dst<<5)|dst,'arm64-pageoff12',src.rip,src.addend??0);
      return;
    }
    const base=arm64Registers[src.base],disp=src.disp??0;
    if(!Number.isSafeInteger(disp))throw new RangeError('ARM64 address displacement out of range');
    if(!disp){this.nativeMove(dst,base);return;}
    if(Math.abs(disp)<4096){this.nativeWord(((disp<0?0xd1000000:0x91000000)|(Math.abs(disp)<<10)|(base<<5)|dst)>>>0);return;}
    this.nativeImmediate(12,disp);this.nativeWord((0x8b000000|(12<<16)|(base<<5)|dst)>>>0);
  }
  override lea(dst:Reg,src:Mem):void {this.nativeAddress(arm64Registers[dst],src);}
  private nativeMemory(load:boolean,register:number,mem:Mem,width:8|16|32|64):void {
    const scale=width/8,size={8:0,16:1,32:2,64:3}[width];
    let base:number,disp:number;
    if('rip' in mem){this.nativeAddress(11,mem);base=11;disp=0;}
    else {base=arm64Registers[mem.base];disp=mem.disp??0;}
    if(!Number.isSafeInteger(disp))throw new RangeError('ARM64 memory displacement out of range');
    if(disp>=0&&disp%scale===0&&disp/scale<4096){
      this.nativeWord(((size<<30)|0x39000000|(load?0x400000:0)|((disp/scale)<<10)|(base<<5)|register)>>>0);
    }else if(disp>=-256&&disp<=255){
      this.nativeWord(((size<<30)|0x38000000|(load?0x400000:0)|((disp&511)<<12)|(base<<5)|register)>>>0);
    }else {
      this.nativeAddress(11,mem);this.nativeWord(((size<<30)|0x39000000|(load?0x400000:0)|(11<<5)|register)>>>0);
    }
  }
  override load(dst:Reg,src:Mem,width:8|16|32|64=64):void {this.nativeMemory(true,arm64Registers[dst],src,width);}
  override store(dst:Mem,src:Reg,width:8|16|32|64=64):void {this.nativeMemory(false,arm64Registers[src],dst,width);}
  override push(reg:Reg):void {
    this.nativeWord(0xd100239c);this.nativeWord((0xf9000380|arm64Registers[reg])>>>0);
  }
  override pop(reg:Reg):void {
    this.nativeWord((0xf9400380|arm64Registers[reg])>>>0);this.nativeWord(0x9100239c);
  }
  private returnSlot():string {
    const after=this.unique('return');this.nativeAddress(30,{rip:after});
    this.nativeWord(0xd100239c);this.nativeWord(0xf900039e);return after;
  }
  override call(target:string):void {
    const after=this.returnSlot();this.jmp(target);this.label(after);
  }
  override callRegister(reg:Reg):void {
    const after=this.returnSlot();this.jumpRegister(reg);this.label(after);
  }
  override jumpRegister(reg:Reg):void {this.nativeWord((0xd61f0000|(arm64Registers[reg]<<5))>>>0);}
  override jmp(target:string):void {this.relocated(0x14000000,'arm64-branch26',target);}
  override ret():void {this.nativeWord(0xf940039e);this.nativeWord(0x9100239c);this.nativeWord(0xd61f03c0);}
  private vector(reg:Xmm):number {
    const n=Number(reg.slice(3));if(!Number.isInteger(n)||n<0||n>15)throw new Error('Invalid FP register');return n;
  }
  private vectorMemory(load:boolean,register:number,mem:Mem,width:32|64|128):void {
    let base:number,disp:number;
    if('rip' in mem){this.nativeAddress(11,mem);base=11;disp=0;}else {base=arm64Registers[mem.base];disp=mem.disp??0;}
    const scale=width/8;
    if(disp>=0&&Number.isInteger(disp)&&disp%scale===0&&disp/scale<4096){
      const opcode=width===128?0x3d800000:width===64?0xfd000000:0xbd000000;
      this.nativeWord((opcode|(load?0x400000:0)|((disp/scale)<<10)|(base<<5)|register)>>>0);
    }else {
      this.nativeAddress(11,mem);const opcode=width===128?0x3d800000:width===64?0xfd000000:0xbd000000;
      this.nativeWord((opcode|(load?0x400000:0)|(11<<5)|register)>>>0);
    }
  }
  override movsd(dst:Xmm,src:Xmm|Mem):void {
    const d=this.vector(dst);if(typeof src==='string')this.nativeWord(0x1e604000|(this.vector(src)<<5)|d);else this.vectorMemory(true,d,src,64);
  }
  override storesd(dst:Mem,src:Xmm):void {this.vectorMemory(false,this.vector(src),dst,64);}
  override loadXmm128(dst:Xmm,src:Mem):void {this.vectorMemory(true,this.vector(dst),src,128);}
  override storeXmm128(dst:Mem,src:Xmm):void {this.vectorMemory(false,this.vector(src),dst,128);}
  private fpOperand(src:Xmm|Mem,width:32|64=64):number {
    if(typeof src==='string')return this.vector(src);this.vectorMemory(true,31,src,width);return 31;
  }
  private fpBinary(dst:Xmm,src:Xmm|Mem,opcode:number):void {
    const d=this.vector(dst),s=this.fpOperand(src);this.nativeWord(opcode|(s<<16)|(d<<5)|d);
  }
  override addsd(dst:Xmm,src:Xmm|Mem):void {this.fpBinary(dst,src,0x1e602800);}
  override subsd(dst:Xmm,src:Xmm|Mem):void {this.fpBinary(dst,src,0x1e603800);}
  override mulsd(dst:Xmm,src:Xmm|Mem):void {this.fpBinary(dst,src,0x1e600800);}
  override divsd(dst:Xmm,src:Xmm|Mem):void {this.fpBinary(dst,src,0x1e601800);}
  override sqrtsd(dst:Xmm,src:Xmm|Mem):void {this.nativeWord(0x1e61c000|(this.fpOperand(src)<<5)|this.vector(dst));}
  override cvtsd2ss(dst:Xmm,src:Xmm|Mem):void {this.nativeWord(0x1e624000|(this.fpOperand(src)<<5)|this.vector(dst));}
  override cvtss2sd(dst:Xmm,src:Xmm|Mem):void {this.nativeWord(0x1e22c000|(this.fpOperand(src,32)<<5)|this.vector(dst));}
  override cvtsi2sd(dst:Xmm,src:Reg):void {this.nativeWord((0x9e620000|(arm64Registers[src]<<5)|this.vector(dst))>>>0);}
  override movqToXmm(dst:Xmm,src:Reg):void {this.nativeWord((0x9e670000|(arm64Registers[src]<<5)|this.vector(dst))>>>0);}
  override movqFromXmm(dst:Reg,src:Xmm):void {this.nativeWord((0x9e660000|(this.vector(src)<<5)|arm64Registers[dst])>>>0);}
  override ucomisd(dst:Xmm,src:Xmm|Mem):void {
    this.nativeWord(0x1e602000|(this.fpOperand(src)<<16)|(this.vector(dst)<<5));this.nativeWord(0xd53b420d);
    // x86 unordered sets CF/ZF/PF; ordered comparisons clear SF/OF.
    this.extract(24,13,28,1);this.extract(14,13,29,1);this.nativeImmediate(15,1);
    this.nativeWord(0xca0f01ce);this.nativeWord(0xaa1801ce);this.extract(15,13,30,1);this.nativeWord(0xaa1801ef);
    this.nativeWord(0xd36389d7); // lsl x23, x14, #29
    this.nativeWord(0xaa0f7af7); // orr x23, x23, x15, lsl #30
  }
  private fpToInteger(dst:Reg,src:Xmm,nearest:boolean):void {
    const s=this.vector(src),d=arm64Registers[dst],invalid=this.unique('invalidConversion'),done=this.unique('converted');
    this.nativeWord(0x1e602000|(s<<16)|(s<<5));this.nativeConditional(6,invalid);
    this.nativeImmediate(13,0x43e0000000000000n);this.nativeWord(0x9e6701bf);
    this.nativeWord(0x1e7f2000|(s<<5));this.nativeConditional(10,invalid);
    this.nativeWord(((nearest?0x9e600000:0x9e780000)|(s<<5)|d)>>>0);this.jmp(done);
    this.label(invalid);this.nativeImmediate(d,0x8000000000000000n);this.label(done);
  }
  override cvttsd2si(dst:Reg,src:Xmm):void {this.fpToInteger(dst,src,false);}
  override cvtsd2si(dst:Reg,src:Xmm):void {this.fpToInteger(dst,src,true);}
  override mfence():void {this.nativeWord(0xd5033bbf);}
  private partialMove(dst:number,src:number,width:8|16|32|64):void {
    if(width>=32)this.nativeWord(((width===32?0x2a0003e0:0xaa0003e0)|(src<<16)|dst)>>>0);
    else this.nativeWord((0xb3400000|((width-1)<<10)|(src<<5)|dst)>>>0);
  }
  private narrowFlags(left:number,right:number,result:number,width:8|16|32,subtract:boolean):void {
    this.extract(14,result,0,width);this.nativeWord(0xea0e01df);this.nativeWord(0xd53b4217);
    this.extract(17,result,width-1,1);this.nativeWord(0xaa117ef7);
    if(subtract){
      this.nativeWord((0xeb00001f|(right<<16)|(left<<5))>>>0);this.nativeWord(0x9a9f27f1); // cset x17, lo
    }else this.extract(17,result,width,1);
    this.nativeWord(0xaa1176f7);
    this.nativeWord((0xca000000|(right<<16)|(left<<5)|13)>>>0);
    if(!subtract)this.nativeWord(0xaa2d03ed);
    this.nativeWord((0xca000000|(result<<16)|(left<<5)|14)>>>0);this.nativeWord(0x8a0e01ad);
    this.extract(17,13,width-1,1);this.nativeWord(0xaa1172f7);this.parity(result);
  }
  private atomic(dst:Mem,src:Reg,width:8|16|32|64,operation:'exchange'|'add'|'compare'):void {
    const loop=this.unique('atomicRetry'),failed=this.unique('atomicMismatch'),done=this.unique('atomicDone'),size={8:0,16:1,32:2,64:3}[width],source=arm64Registers[src];
    this.nativeAddress(11,dst);this.nativeMove(16,source);
    if(operation==='compare'){
      if(width<64)this.extract(26,0,0,width);else this.nativeMove(26,0);
    }
    this.mfence();this.label(loop);this.nativeWord(((size<<30)|0x085ffc00|(11<<5)|15)>>>0);
    if(operation==='compare'){
      this.nativeWord(0xeb0f034c);
      if(width===64)this.flags(12,true);else this.narrowFlags(26,15,12,width,true);
      this.restoreFlags();this.nativeConditional(1,failed);
    }
    if(operation==='add'){
      this.nativeWord(0xab1001ec);
      if(width===64)this.flags(12);else this.narrowFlags(15,16,12,width,false);
    }
    this.nativeWord(((size<<30)|0x0800fc00|(17<<16)|(11<<5)|(operation==='add'?12:16))>>>0);
    this.nativeWord(0x7100023f);this.nativeConditional(1,loop);this.jmp(done);
    this.label(failed);this.nativeWord(0xd5033f5f); // clrex
    this.label(done);this.partialMove(operation==='compare'?0:source,15,width);this.mfence();
  }
  override atomicExchange(dst:Mem,src:Reg,width:8|16|32|64):void {this.atomic(dst,src,width,'exchange');}
  override atomicXadd(dst:Mem,src:Reg,width:8|16|32|64):void {this.atomic(dst,src,width,'add');}
  override atomicCompareExchange(dst:Mem,src:Reg,width:8|16|32|64):void {this.atomic(dst,src,width,'compare');}
  override repMovsb():void {
    const loop=this.unique('copy'),done=this.unique('copied');this.nativeWord(0xf100003f);this.nativeConditional(0,done);
    this.label(loop);this.nativeWord(0x394000ab);this.nativeWord(0x390000cb);this.nativeWord(0x910004a5);this.nativeWord(0x910004c6);
    this.nativeWord(0xf1000421);this.nativeConditional(1,loop);this.label(done);
  }
  override repStosq():void {
    const loop=this.unique('fill'),done=this.unique('filled');this.nativeWord(0xf100003f);this.nativeConditional(0,done);
    this.label(loop);this.nativeWord(0xf90000c0);this.nativeWord(0x910020c6);this.nativeWord(0xf1000421);this.nativeConditional(1,loop);this.label(done);
  }
}
