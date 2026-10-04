import {Arm64Assembler} from './assembler.js';
import {linkElf} from '../elf/writer.js';
import type {Condition,Reg} from '../x64/assembler.js';

/** Native A64 execution checks; expected arithmetic is computed by Node BigInt. */
export function arm64CpuProbe():Uint8Array {
  const a=new Arm64Assembler('cpu.start'),failures:{label:string;status:number}[]=[];
  let stage=0;
  const check=(condition:Condition)=>{const label=a.unique('failed');failures.push({label,status:++stage});a.jcc(condition,label);};
  const equal=(reg:Reg,expected:number|bigint)=>{a.mov('r11',expected);a.cmp(reg,'r11');check('ne');};
  a.nativeWord(0x910003fc); // initialize the runtime stack from native SP
  a.mov('rax',-1);a.add('rax',1);check('ne');check('ae');equal('rax',0);
  a.mov('rax',0);a.sub('rax',1);check('ae');check('ns');equal('rax',-1);
  a.mov('rax',0x7fffffffffffffffn);a.add('rax',1);check('no');
  a.mov('rax',3);a.test('rax','rax');check('np');a.mov('rax',7);a.test('rax','rax');check('p');
  a.mov('rax',-1);a.mov('rdx',1);a.cmp('rax','rdx');check('be');check('ge');
  a.mov('rax',0x8123456789abcdefn);a.shl('rax',7);equal('rax',BigInt.asUintN(64,0x8123456789abcdefn<<7n));
  a.mov('rax',-123456789);a.sar('rax',13);equal('rax',-123456789n>>13n);
  a.mov('rax',0x8123456789abcdefn);a.mov('rcx',68);a.shr('rax','cl');equal('rax',0x8123456789abcdefn>>4n);
  for(const [high,low,divisor] of [[0n,1234567890123456789n,7n],[3n,0xfedcba9876543210n,0x7123456789abcdefn],[0x7ffffffffffffffen,0xffffffffffffffffn,0x8000000000000001n]] as const){
    const dividend=(high<<64n)|low;a.mov('rdx',high);a.mov('rax',low);a.mov('r10',divisor);a.div('r10');
    equal('rax',dividend/divisor);equal('rdx',dividend%divisor);
  }
  a.mov('rax',-9876543210n);a.signExtendRax();a.mov('r10',37);a.idiv('r10');equal('rax',-9876543210n/37n);equal('rdx',-9876543210n%37n);
  for(const [high,low,divisor] of [[-3n,0xfedcba9876543210n,-0x7123456789abcdefn],[2n,0xfedcba9876543210n,-0x7123456789abcdefn]] as const){
    const dividend=(high<<64n)|low;a.mov('rdx',high);a.mov('rax',low);a.mov('r10',divisor);a.idiv('r10');equal('rax',dividend/divisor);equal('rdx',dividend%divisor);
  }
  const left=0xf123456789abcdefn,right=0x7123456789abcdefn,product=left*right;
  a.mov('rax',left);a.mov('r10',right);a.mul('r10');equal('rax',BigInt.asUintN(64,product));equal('rdx',product>>64n);
  a.mov('rax',-7);a.mov('r10',6);a.imul('rax','r10');check('o');equal('rax',-42);
  a.mov('rax',36);a.cvtsi2sd('xmm0','rax');a.sqrtsd('xmm0','xmm0');a.cvttsd2si('rax','xmm0');equal('rax',6);
  a.mov('rax',0x7ff8000000000001n);a.movqToXmm('xmm0','rax');a.ucomisd('xmm0','xmm0');check('np');check('ne');check('ae');
  a.cvttsd2si('rax','xmm0');equal('rax',0x8000000000000000n);
  a.mov('rax',0x43e0000000000000n);a.movqToXmm('xmm0','rax');a.cvttsd2si('rax','xmm0');equal('rax',0x8000000000000000n);
  a.mov('rax',0xc004000000000000n);a.movqToXmm('xmm0','rax');a.cvtsd2si('rax','xmm0');equal('rax',-2);
  a.lea('rdi',{rip:'cpu.state'});a.mov('rax',5);a.store({base:'rdi'},'rax');a.mov('r10',7);a.atomicXadd({base:'rdi'},'r10',64);equal('r10',5);a.load('rax',{base:'rdi'});equal('rax',12);
  a.mov('rax',12);a.mov('r10',99);a.atomicCompareExchange({base:'rdi'},'r10',64);check('ne');a.load('rax',{base:'rdi'});equal('rax',99);
  a.mov('rax',12);a.atomicCompareExchange({base:'rdi'},'r10',64);check('e');equal('rax',99);
  a.mov('r10',0x1234);a.atomicExchange({base:'rdi'},'r10',16);equal('r10',99);
  for(const width of [8,16,32] as const){
    const max=(1n<<BigInt(width))-1n;a.mov('rax',max);a.store({base:'rdi',disp:8},'rax',width);a.mov('r10',1);
    a.atomicXadd({base:'rdi',disp:8},'r10',width);check('ne');check('ae');check('o');equal('r10',max);a.load('rax',{base:'rdi',disp:8},width);equal('rax',0);
  }
  a.mov('rax',127);a.store({base:'rdi',disp:8},'rax',8);a.mov('rax',0x10080);a.mov('r10',18);
  a.atomicCompareExchange({base:'rdi',disp:8},'r10',8);check('e');check('b');check('no');equal('rax',0x1007f);
  a.mov('rax',0x1007f);a.atomicCompareExchange({base:'rdi',disp:8},'r10',8);check('ne');a.load('rax',{base:'rdi',disp:8},8);equal('rax',18);
  a.lea('rsi',{rip:'cpu.message'});a.add('rdi',16);a.mov('rcx',6);a.repMovsb();equal('rcx',0);
  a.sub('rdi',6);a.mov('rax',0);a.load('rax',{base:'rdi'},32);equal('rax',0x6c6c6568);
  a.call('cpu.child');equal('rax',42);
  a.callImport('cpu.childPointer');equal('rax',42);
  a.mov('rax',0);a.sub('rax',1);a.shr('rax',0);check('ae');a.mov('rcx',64);a.shl('rax','cl');check('ae');
  a.incrementMemory({rip:'cpu.state',addend:32});check('ae');a.load('rax',{rip:'cpu.state',addend:32});equal('rax',1);
  a.timestamp();a.shl('rdx',32);a.or('rax','rdx');a.test('rax','rax');check('e');
  a.mov('rdi',1);a.lea('rsi',{rip:'cpu.message'});a.mov('rdx',6);a.syscall(64);
  a.nativeImmediate(0,0);a.nativeImmediate(8,93);a.nativeWord(0xd4000001);
  a.label('cpu.child');a.mov('rax',42);a.ret();
  for(const f of failures){a.label(f.label);a.nativeImmediate(0,f.status);a.nativeImmediate(8,93);a.nativeWord(0xd4000001);}
  return linkElf({entry:'cpu.start',imports:[],functions:[],fragments:[
    {...a.finish(),name:'cpu.start',section:'.text'},
    {name:'cpu.message',section:'.rdata',bytes:new TextEncoder().encode('hello\n'),symbols:{},fixups:[]},
    {name:'cpu.state',section:'.data',alignment:16,bytes:new Uint8Array(64),symbols:{},fixups:[]},
    {name:'cpu.childPointer',section:'.rdata',bytes:new Uint8Array(8),symbols:{},fixups:[{offset:0,kind:'va64',target:'cpu.child',addend:0}]},
  ]},{machine:'arm64'});
}
