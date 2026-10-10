import {Assembler,type Reg,type Mem,type Xmm,type Condition,type NativeArgumentKind,type CodeFragment,type Fixup} from '../x64/assembler.js';

// Preserve the existing runtime's logical calling convention while lowering
// each operation to A64. x18 stays available to the operating system.
export const arm64Registers:Readonly<Record<Reg,number>>=Object.freeze({
  rax:0,rcx:1,rdx:2,rbx:3,rbp:4,rsi:5,rdi:6,r8:7,r9:8,r10:9,r11:10,
  r12:19,r13:20,r14:21,r15:22,rsp:28,
});

export class Arm64Assembler extends Assembler {
  private instructionFixups:Fixup[]=[];
  private nativeCalls:{offset:number;number:number}[]=[];
  constructor(name='',readonly os:'linux'|'darwin'|'win32'='linux'){super(name);}
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
    return {...fragment,fixups:[...fragment.fixups,...this.instructionFixups.map(f=>({...f}))],
      ...(this.nativeCalls.length?{syscalls:this.nativeCalls.map(call=>({...call}))}:{})};
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
  override initializeStack():void {this.nativeWord(0x910003fc);}
  override timestamp():void {
    this.nativeWord(0xd5033fdf);this.nativeWord(0xd53be04d); // isb; mrs x13, cntvct_el0
    this.extract(2,13,32,32);this.extract(0,13,0,32);
  }
  override syscall(number:number):void {
    if(!Number.isInteger(number)||number<0||number>0xffffffff)throw new RangeError('Invalid syscall number');
    if(this.os==='win32')throw new Error('Raw system calls are unavailable on Windows ARM64');
    // Marshal the runtime's syscall argument registers to x0..x5. Preserve
    // logical non-result registers in scratch registers across the kernel trap.
    for(const [dst,src] of [[12,3],[13,4],[14,5],[15,8],[0,6],[1,5],[3,9],[4,7],[5,8]])this.nativeMove(dst!,src!);
    this.nativeImmediate(this.os==='darwin'?16:8,this.os==='darwin'?number&0xffffff:number);
    this.nativeCalls.push({offset:this.offset,number});this.nativeWord(this.os==='darwin'?0xd4001001:0xd4000001);
    if(this.os==='darwin')this.nativeWord(0xd53b4217);
    if(this.os==='linux'&&number===220){
      const parent=this.unique('cloneParent');this.nativeWord(0xf100001f);this.nativeConditional(1,parent);this.initializeStack();this.label(parent);
    }
    for(const [dst,src] of [[3,12],[4,13],[5,14],[8,15]])this.nativeMove(dst!,src!);
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
  // Memory right operands are loaded into scratch x16 first.
  private memoryArithmetic(dst:Reg,src:Mem,subtract:boolean,compare=false):void {
    this.nativeMemory(true,16,src,64);const d=arm64Registers[dst],result=compare?12:d;
    this.nativeWord(((subtract?0xeb000000:0xab000000)|(16<<16)|(d<<5)|result)>>>0);this.flags(result,subtract);
  }
  override addMemory(dst:Reg,src:Mem):void {this.memoryArithmetic(dst,src,false);}
  override subMemory(dst:Reg,src:Mem):void {this.memoryArithmetic(dst,src,true);}
  override cmpMemory(dst:Reg,src:Mem):void {this.memoryArithmetic(dst,src,true,true);}
  override cmpByte(m:Mem,value:number):void {
    if(!Number.isInteger(value)||value<0||value>255)throw Error('Invalid byte');
    this.nativeMemory(true,16,m,8);this.nativeImmediate(13,value);
    this.nativeWord((0xeb000000|(13<<16)|(16<<5)|12)>>>0);this.flags(12,true);
  }
  override storeByte(m:Mem,value:number):void {
    if(!Number.isInteger(value)||value<0||value>255)throw Error('Invalid byte');
    this.nativeImmediate(16,value);this.nativeMemory(false,16,m,8);
  }
  override callUnless(c:Condition,s:string):void {
    const skip=this.unique('skipCall');this.jcc(c,skip);this.call(s);this.label(skip);
  }
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
  // LDRSW (unsigned scaled offset), LDURSW (signed 9-bit offset) or LDRSW from X11.
  override loadSigned32(dst:Reg,src:Mem):void {
    const register=arm64Registers[dst];
    if('rip' in src){this.nativeAddress(11,src);this.nativeWord((0xb9800000|(11<<5)|register)>>>0);return;}
    const base=arm64Registers[src.base],disp=src.disp??0;
    if(!Number.isSafeInteger(disp))throw new RangeError('ARM64 memory displacement out of range');
    if(disp>=0&&disp%4===0&&disp/4<4096)this.nativeWord((0xb9800000|((disp/4)<<10)|(base<<5)|register)>>>0);
    else if(disp>=-256&&disp<=255)this.nativeWord((0xb8800000|((disp&511)<<12)|(base<<5)|register)>>>0);
    else {this.nativeAddress(11,src);this.nativeWord((0xb9800000|(11<<5)|register)>>>0);}
  }
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
    this.countCall(target);const after=this.returnSlot();this.jmp(target);this.label(after);
  }
  override callImport(target:string,parameters?:readonly NativeArgumentKind[]):void {
    if(this.os==='darwin'&&target.startsWith('libSystem.')){
      if(!parameters||parameters.length>8||parameters.some(k=>k!=='gp'))throw new Error('Darwin system imports require at most eight explicit integer/pointer arguments');
      this.nativeImport(target,parameters);return;
    }
    // Internal helpers and unavailable syscall cells point to Nona code using
    // the logical registers and x28 return stack, rather than the Windows ABI.
    const logicalHost=target.startsWith('hostffi.nona.internal!')||target.startsWith('hostffi.syscall!')||/^ffi\.syscall!\d{1,3}$/.test(target);
    if(this.os==='win32'&&target!=='CreateThread'&&!logicalHost){this.nativeImport(target,parameters);return;}
    this.load('r11',{rip:target});this.callRegister('r11');
  }
  private nativeImport(target:string,parameters?:readonly NativeArgumentKind[]):void {
    // The logical ABI has four positional registers and 8-byte stack slots.
    // Windows A64 uses separate compact GP/FP banks and no shadow space.
    const counts:Record<string,number>={WideCharToMultiByte:8,CreateFileW:7,WriteFile:5,WriteConsoleW:5,ReadFile:5,'CreateThread.native':6};
    const kinds=parameters??Array<NativeArgumentKind>(counts[target]??4).fill('gp');
    if(kinds.length>32||kinds.some(k=>!['gp','f32','f64'].includes(k)))throw new Error('Invalid ARM64 import arguments');
    const outgoing=Math.ceil(kinds.length*8/16)*16,saves=outgoing,staging=saves+208;
    const frame=Math.ceil((staging+kinds.length*8)/16)*16;
    this.nativeImmediate(17,frame);this.nativeWord(0xcb11038b); // sub x11,x28,x17
    this.nativeImmediate(17,-16);this.nativeWord(0x8a11016b); // align the physical SP
    const mem=(load:boolean,reg:number,offset:number)=>this.nativeWord(((load?0xf9400000:0xf9000000)|((offset/8)<<10)|(11<<5)|reg)>>>0);
    this.nativeWord(0x910003f1);mem(false,17,saves); // save original physical SP
    for(let i=0;i<4;i++)mem(false,3+i,saves+8+8*i);
    for(let i=6;i<16;i++)this.nativeWord((0x3d800000|(((saves+48+16*(i-6))/16)<<10)|(11<<5)|i)>>>0);
    const logical=[1,2,7,8];
    for(let i=0;i<kinds.length;i++){
      if(i<4){
        if(kinds[i]==='gp')mem(false,logical[i]!,staging+i*8);
        else this.nativeWord((0xfd000000|(((staging+i*8)/8)<<10)|(11<<5)|i)>>>0);
      }else {this.nativeMemory(true,17,{base:'rsp',disp:32+(i-4)*8},64);mem(false,17,staging+i*8);}
    }
    let gp=0,fp=0,stack=0;
    for(let i=0;i<kinds.length;i++){
      if(kinds[i]==='gp'&&gp<8)mem(true,gp++,staging+i*8);
      else if(kinds[i]!=='gp'&&fp<8)this.nativeWord((0xfd400000|(((staging+i*8)/8)<<10)|(11<<5)|fp++)>>>0);
      else {mem(true,17,staging+i*8);mem(false,17,stack);stack+=8;}
    }
    this.nativeWord(0x9100017f); // mov sp,x11
    this.nativeAddress(16,{rip:target});this.nativeWord(0xf9400210);this.nativeWord(0xd63f0200); // ldr/blr x16
    this.nativeWord(0x910003eb); // mov x11,sp (native volatile registers changed)
    for(let i=6;i<16;i++)this.nativeWord((0x3dc00000|(((saves+48+16*(i-6))/16)<<10)|(11<<5)|i)>>>0);
    for(let i=0;i<4;i++)mem(true,3+i,saves+8+8*i);
    mem(true,17,saves);this.nativeWord(0x9100023f); // restore physical SP
  }
  override incrementMemory(mem:Mem):void {
    this.nativeAddress(11,mem);this.nativeWord(0xf940016c);this.nativeMove(16,23);
    this.nativeImmediate(13,1);this.nativeWord(0xab0d018c);this.flags(12);
    this.nativeImmediate(13,0x20000000);this.nativeWord(0x8a0d0210);this.nativeWord(0x8a2d02f7);this.nativeWord(0xaa1002f7);
    this.nativeWord(0xf900016c);
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
  /** A hint only: x64 prefetcht0 has no required effect, so A64 emits nothing for it. */
  override prefetch(_src:Mem):void {}
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
    this.nativeAddress(11,dst);
    if(width<64)this.extract(16,source,0,width);else this.nativeMove(16,source);
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
