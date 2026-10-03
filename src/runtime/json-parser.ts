import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import type {Assembler} from '../backend/x64/assembler.js';

/**
 * JSON.parse as a recursive-descent parser over the source text.
 *
 * The first parser worked on slices: for every value it scanned ahead to the
 * end of the value's text, copied that text into a new string, and parsed
 * the copy, so a nested document was copied once per level of nesting and
 * every key, string and number cost an extra allocation before its result
 * existed. rt.jsonParseAt reads the value at a position of the source string
 * and returns the position after it; strings are decoded straight into
 * their records (one scan for the length, one to decode), keys are defined
 * on the object as they are read, array elements are appended through the
 * dense element path, and numbers that are plain integers are converted
 * in place while the rest go through ToNumber on their text. The result
 * objects and the source are the only managed values it holds, in rooted
 * slots; the recursion keeps one frame per level of nesting.
 */
export function emitJsonParser(b:RuntimeBuilder):void {
 const whitespace=(a:Assembler,reg:'r11',next:string)=>{for(const code of [9,10,13,32]){a.cmp(reg,code);a.jcc('e',next);}};

 // RCX out Value*, RDX source string Value* (rooted by the caller), R8
 // position -> RAX position after the value. Throws a SyntaxError.
 // Frame: 40 out, 48 source Value*, 56 position, 64 length, 72 record, 80
 // current composite Value, 96 key Value, 112 element Value, 128 index key
 // Value, 144 scratch, 152 scratch, 160 scratch.
 rootedFn(b,'rt.jsonParseAt',184,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:4}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(168),'r9');
  a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');a.load('rax',{base:'rax'});a.store(slot(64),'rax');
  const invalid=a.unique('invalid'),done=a.unique('done');
  // R11 = code unit at the position (invalid at the end).
  const peek=()=>{a.load('rax',slot(56));a.load('r10',slot(64));a.cmp('rax','r10');a.jcc('ae',invalid);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);};
  const advance=()=>{a.load('rax',slot(56));a.add('rax',1);a.store(slot(56),'rax');};
  const skipWhitespace=()=>{const scan=a.unique('ws'),next=a.unique('wsNext'),ready=a.unique('wsReady');a.label(scan);peek();whitespace(a,'r11',next);a.jmp(ready);a.label(next);advance();a.jmp(scan);a.label(ready);};
  const expectWord=(word:string)=>{for(const c of word){peek();a.cmp('r11',c.charCodeAt(0));a.jcc('ne',invalid);advance();}};
  const result=(tag:number,payloadSlot?:number)=>{a.load('rcx',slot(40));a.mov('rax',tag);a.store({base:'rcx'},'rax');if(payloadSlot===undefined)a.mov('rax',0);else a.load('rax',slot(payloadSlot));a.store({base:'rcx',disp:8},'rax');};
  skipWhitespace();
  const string=a.unique('string'),object=a.unique('object'),array=a.unique('array'),number=a.unique('number'),literal=a.unique('literal');
  a.cmp('r11',34);a.jcc('e',string);a.cmp('r11',123);a.jcc('e',object);a.cmp('r11',91);a.jcc('e',array);
  a.cmp('r11',116);a.jcc('e',literal);a.cmp('r11',102);a.jcc('e',literal);a.cmp('r11',110);a.jcc('e',literal);a.jmp(number);

  // Literals.
  a.label(literal);
  {const f=a.unique('false'),n=a.unique('null');a.cmp('r11',102);a.jcc('e',f);a.cmp('r11',110);a.jcc('e',n);
   expectWord('true');a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',1);a.store({base:'rcx',disp:8},'rax');a.jmp(done);
   a.label(f);expectWord('false');result(2);a.jmp(done);
   a.label(n);expectWord('null');result(1);a.jmp(done);}

  // Strings: the opening quote is at the position.
  a.label(string);a.lea('rcx',slot(96));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.jsonParseStringAt');a.store(slot(56),'rax');
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(96+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);

  // Objects.
  a.label(object);advance();a.lea('rcx',slot(80));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  {const member=a.unique('member'),first=a.unique('firstMember'),close=a.unique('objectClose');
   skipWhitespace();a.cmp('r11',125);a.jcc('e',close);a.jmp(first);
   a.label(member);skipWhitespace();a.cmp('r11',44);a.jcc('e','rt.jsonParseAt.nextMember');a.cmp('r11',125);a.jcc('ne',invalid);a.jmp(close);
   a.label('rt.jsonParseAt.nextMember');advance();skipWhitespace();
   a.label(first);a.call('rt.safepoint');peek();a.cmp('r11',34);a.jcc('ne',invalid);
   a.lea('rcx',slot(96));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(168));a.call('rt.jsonParseKeyAt');a.store(slot(56),'rax');
   skipWhitespace();a.cmp('r11',58);a.jcc('ne',invalid);advance();
   a.lea('rcx',slot(112));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(168));a.call('rt.jsonParseAt');a.store(slot(56),'rax');
   a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(112));a.mov('r9',1);a.call('rt.setProperty');a.jmp(member);
   a.label(close);advance();a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);}

  // Arrays.
  a.label(array);advance();a.lea('rcx',slot(80));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');a.mov('rax',0);a.store(slot(144),'rax');
  {const element=a.unique('element'),first=a.unique('firstElement'),close=a.unique('arrayClose');
   skipWhitespace();a.cmp('r11',93);a.jcc('e',close);a.jmp(first);
   a.label(element);skipWhitespace();a.cmp('r11',44);a.jcc('e','rt.jsonParseAt.nextElement');a.cmp('r11',93);a.jcc('ne',invalid);a.jmp(close);
   a.label('rt.jsonParseAt.nextElement');advance();
   a.label(first);a.call('rt.safepoint');
   a.lea('rcx',slot(112));a.load('rdx',slot(48));a.load('r8',slot(56));a.load('r9',slot(168));a.call('rt.jsonParseAt');a.store(slot(56),'rax');
   a.load('rax',slot(144));a.cvtsi2sd('xmm0','rax');a.storesd(slot(136),'xmm0');a.mov('r10',3);a.store(slot(128),'r10');a.add('rax',1);a.store(slot(144),'rax');
   a.lea('rcx',slot(80));a.lea('rdx',slot(128));a.lea('r8',slot(112));a.mov('r9',1);a.call('rt.setProperty');a.jmp(element);
   a.label(close);advance();a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}a.jmp(done);}

  // Numbers: the JSON grammar, then the value. Slot 144 = start, 152 = plain
  // integer flag, 160 = negative flag.
  a.label(number);a.load('rax',slot(56));a.store(slot(144),'rax');a.mov('rax',1);a.store(slot(152),'rax');a.mov('rax',0);a.store(slot(160),'rax');
  {const integer=a.unique('integer'),nonzero=a.unique('nonzero'),digitsDone=a.unique('digitsDone'),integerLoop=a.unique('integerLoop'),numberEnd=a.unique('numberEnd'),fraction=a.unique('fraction'),fractionLoop=a.unique('fractionLoop'),exponent=a.unique('exponent'),exponentSign=a.unique('exponentSign'),exponentLoop=a.unique('exponentLoop'),exponentDigit=a.unique('exponentDigit');
   // After the end of the text the number is complete.
   const peekOrEnd=(end:string)=>{a.load('rax',slot(56));a.load('r10',slot(64));a.cmp('rax','r10');a.jcc('ae',end);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);};
   a.cmp('r11',45);a.jcc('ne',integer);a.mov('rax',1);a.store(slot(160),'rax');advance();peek();
   a.label(integer);a.cmp('r11',48);a.jcc('ne',nonzero);advance();peekOrEnd(numberEnd);a.cmp('r11',48);a.jcc('b',digitsDone);a.cmp('r11',57);a.jcc('be',invalid);a.jmp(digitsDone);
   a.label(nonzero);a.cmp('r11',49);a.jcc('b',invalid);a.cmp('r11',57);a.jcc('a',invalid);
   a.label(integerLoop);advance();peekOrEnd(numberEnd);a.cmp('r11',48);a.jcc('b',digitsDone);a.cmp('r11',57);a.jcc('be',integerLoop);
   a.label(digitsDone);a.cmp('r11',46);a.jcc('e',fraction);a.cmp('r11',101);a.jcc('e',exponent);a.cmp('r11',69);a.jcc('e',exponent);a.jmp(numberEnd);
   a.label(fraction);a.mov('rax',2);a.store(slot(152),'rax');a.load('rax',slot(56));a.store(slot(176),'rax');advance();peek();a.cmp('r11',48);a.jcc('b',invalid);a.cmp('r11',57);a.jcc('a',invalid);
   a.label(fractionLoop);advance();peekOrEnd(numberEnd);a.cmp('r11',48);a.jcc('b','rt.jsonParseAt.afterFraction');a.cmp('r11',57);a.jcc('be',fractionLoop);
   a.label('rt.jsonParseAt.afterFraction');a.cmp('r11',101);a.jcc('e',exponent);a.cmp('r11',69);a.jcc('e',exponent);a.jmp(numberEnd);
   a.label(exponent);a.mov('rax',0);a.store(slot(152),'rax');advance();peek();a.cmp('r11',43);a.jcc('e',exponentSign);a.cmp('r11',45);a.jcc('ne',exponentDigit);
   a.label(exponentSign);advance();peek();
   a.label(exponentDigit);a.cmp('r11',48);a.jcc('b',invalid);a.cmp('r11',57);a.jcc('a',invalid);
   a.label(exponentLoop);advance();peekOrEnd(numberEnd);a.cmp('r11',48);a.jcc('b',numberEnd);a.cmp('r11',57);a.jcc('be',exponentLoop);
   a.label(numberEnd);}
  // A plain integer of at most 15 digits is exact as a double and is
  // accumulated directly; everything else is converted from its text.
  {const slow=a.unique('viaText'),loop=a.unique('accumulate'),accumulated=a.unique('accumulated'),positive=a.unique('positive');
   // A decimal of at most 15 significant digits (no exponent) is the exact
   // integer of its digits divided by an exact power of ten: one correctly
   // rounded division, the same double as ToNumber of the text.
   const scaled=a.unique('scaled'),skipDot=a.unique('skipDot');
   a.load('rax',slot(152));a.test('rax','rax');a.jcc('e',slow);
   a.load('rcx',slot(144));a.load('rax',slot(160));a.add('rcx','rax');a.load('rdx',slot(56));a.sub('rdx','rcx');
   {const limit=a.unique('limit');a.mov('r9',15);a.load('rax',slot(152));a.cmp('rax',2);a.jcc('ne',limit);a.mov('r9',16);a.label(limit);a.cmp('rdx','r9');a.jcc('a',slow);}
   a.mov('rax',0);a.load('r10',slot(72));a.shl('rcx',1);a.add('r10','rcx');a.add('r10',8);
   a.label(loop);a.test('rdx','rdx');a.jcc('e',accumulated);a.load('r11',{base:'r10'},16);a.cmp('r11',46);a.jcc('e',skipDot);a.sub('r11',48);a.mov('r9','rax');a.shl('rax',3);a.add('rax','r9');a.add('rax','r9');a.add('rax','r11');a.label(skipDot);a.add('r10',2);a.sub('rdx',1);a.jmp(loop);
   a.label(accumulated);a.cvtsi2sd('xmm0','rax');
   a.load('rax',slot(152));a.cmp('rax',2);a.jcc('ne',scaled);
   a.load('rax',slot(56));a.load('r10',slot(176));a.sub('rax','r10');a.sub('rax',1);a.shl('rax',3);a.lea('r10',{rip:'rt.json.powersOfTen'});a.add('r10','rax');a.movsd('xmm1',{base:'r10'});a.divsd('xmm0','xmm1');
   a.label(scaled);a.load('rax',slot(160));a.test('rax','rax');a.jcc('e',positive);
   // -0 for "-0", otherwise the negated value.
   a.mov('rax',0x8000000000000000n);a.movqToXmm('xmm1','rax');a.movqFromXmm('r10','xmm0');a.xor('r10','rax');a.movqToXmm('xmm0','r10');
   a.label(positive);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');a.jmp(done);
   a.label(slow);a.lea('rcx',slot(96));a.load('rdx',slot(72));a.load('r8',slot(144));a.load('r9',slot(56));a.call('rt.jsonSlice');
   a.load('rcx',slot(40));a.lea('rdx',slot(96));a.call('rt.toNumber');a.jmp(done);}
  a.label(invalid);a.call('rt.throwSyntaxError');
  a.label(done);a.load('rax',slot(56));
 });

 // RCX out Value*, RDX source string Value*, R8 position of the opening quote
 // -> RAX position after the closing quote. Two passes: one for the length
 // (validating the escapes), one to decode into the exactly sized record.
 rootedFn(b,'rt.jsonParseStringAt',120,[{kind:'output',register:'rcx'}],a=>{
  a.store(slot(40),'rcx');a.load('rax',{base:'rdx',disp:8});a.store(slot(48),'rax');a.load('rax',{base:'rax'});a.store(slot(56),'rax');a.store(slot(64),'r8');
  const invalid=a.unique('invalid'),done=a.unique('done');
  // Pass over the text: RCX position, R8 units counted / write cursor, R10
  // chars base, R11 length. Slot 72 = record (0 while counting).
  a.mov('rax',0);a.store(slot(72),'rax');
  const pass=a.unique('pass');a.label(pass);
  a.load('rcx',slot(64));a.add('rcx',1);a.load('r10',slot(48));a.add('r10',8);a.load('r11',slot(56));a.load('r8',slot(72));
  {const ready=a.unique('cursorReady');a.test('r8','r8');a.jcc('e',ready);a.add('r8',8);a.label(ready);}
  a.store(slot(80),'r8');a.mov('r8',0);
  const loop=a.unique('loop'),end=a.unique('end'),escape=a.unique('escape'),emit=a.unique('emit'),plain=a.unique('plain');
  const put=()=>{const skip=a.unique('skip');a.load('rax',slot(80));a.test('rax','rax');a.jcc('e',skip);a.store({base:'rax'},'rdx',16);a.add('rax',2);a.store(slot(80),'rax');a.label(skip);a.add('r8',1);};
  a.label(loop);a.cmp('rcx','r11');a.jcc('ae',invalid);a.mov('rax','rcx');a.add('rax','rax');a.add('rax','r10');a.load('rdx',{base:'rax'},16);a.add('rcx',1);
  a.cmp('rdx',34);a.jcc('e',end);a.cmp('rdx',92);a.jcc('e',escape);a.cmp('rdx',32);a.jcc('b',invalid);a.jmp(emit);
  a.label(escape);a.cmp('rcx','r11');a.jcc('ae',invalid);a.mov('rax','rcx');a.add('rax','rax');a.add('rax','r10');a.load('rdx',{base:'rax'},16);a.add('rcx',1);
  for(const [escaped,decoded] of [[34,34],[92,92],[47,47],[98,8],[102,12],[110,10],[114,13],[116,9]] as const){const next=a.unique('next');a.cmp('rdx',escaped);a.jcc('ne',next);a.mov('rdx',decoded);a.jmp(emit);a.label(next);}
  a.cmp('rdx',117);a.jcc('ne',invalid);a.mov('rdx',0);
  for(let i=0;i<4;i++){
   const upper=a.unique('upper'),lower=a.unique('lower'),nibble=a.unique('nibble');
   a.cmp('rcx','r11');a.jcc('ae',invalid);a.mov('rax','rcx');a.add('rax','rax');a.add('rax','r10');a.load('r9',{base:'rax'},16);a.add('rcx',1);
   a.cmp('r9',48);a.jcc('b',invalid);a.cmp('r9',57);a.jcc('a',upper);a.sub('r9',48);a.jmp(nibble);
   a.label(upper);a.cmp('r9',65);a.jcc('b',invalid);a.cmp('r9',70);a.jcc('a',lower);a.sub('r9',55);a.jmp(nibble);
   a.label(lower);a.cmp('r9',97);a.jcc('b',invalid);a.cmp('r9',102);a.jcc('a',invalid);a.sub('r9',87);
   a.label(nibble);a.shl('rdx',4);a.or('rdx','r9');
  }
  a.label(plain);a.label(emit);put();a.jmp(loop);
  a.label(end);
  {const written=a.unique('written');a.load('rax',slot(72));a.test('rax','rax');a.jcc('ne',written);
   // Counting pass done: allocate the record and decode into it.
   a.store(slot(88),'r8');a.store(slot(96),'rcx');a.mov('rcx','r8');a.shl('rcx',1);a.add('rcx',8);a.call('rt.allocRaw');a.store(slot(72),'rax');a.load('r8',slot(88));a.store({base:'rax'},'r8');a.jmp(pass);
   a.label(written);}
  a.store(slot(96),'rcx');a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');a.load('rax',slot(96));a.jmp(done);
  a.label(invalid);a.call('rt.throwSyntaxError');
  a.label(done);
 });
 // 10^0 … 10^22, all exact doubles.
 {const powers=new Uint8Array(23*8),view=new DataView(powers.buffer);for(let k=0;k<=22;k++)view.setFloat64(k*8,Number('1e'+k),true);b.data('rt.json.powersOfTen',powers,'.rdata');}

 // RCX out Value*, RDX source string Value*, R8 position of a key's opening
 // quote, R9 key cache -> RAX position after the closing quote. Keys repeat
 // in most documents, so a key without escapes is looked up in a small
 // direct-mapped cache of string records first and shares the record on a
 // hit. The cache lives on JSON.parse's frame: an epoch word (rt.gcCount when
 // it was filled; a collection may free records it holds) and 64 records.
 b.fn('rt.jsonParseKeyAt',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');
  const slow=a.unique('slow'),scan=a.unique('scan'),found=a.unique('found'),epochOk=a.unique('epochOk'),clear=a.unique('clear'),miss=a.unique('miss'),compare=a.unique('compare'),hit=a.unique('hit'),done=a.unique('done');
  const resetIfStale=()=>{const fresh=a.unique('fresh');a.load('r9',slot(64));a.load('r8',{rip:'rt.gcCount'});a.load('r10',{base:'r9'});a.cmp('r10','r8');a.jcc('e',fresh);
   a.store({base:'r9'},'r8');a.mov('r10',0);a.mov('rcx',64);const zero=a.unique('zero');a.label(zero);a.store({base:'r9',disp:8},'r10');a.add('r9',8);a.sub('rcx',1);a.jcc('ne',zero);a.label(fresh);};
  a.load('r10',{base:'rdx',disp:8});a.load('r11',{base:'r10'});a.add('r10',8);a.mov('rcx','r8');a.add('rcx',1);a.mov('rax',0);a.mov('r9',31);
  a.label(scan);a.cmp('rcx','r11');a.jcc('ae',slow);a.mov('r8','rcx');a.shl('r8',1);a.add('r8','r10');a.load('rdx',{base:'r8'},16);
  a.cmp('rdx',34);a.jcc('e',found);a.cmp('rdx',92);a.jcc('e',slow);a.cmp('rdx',32);a.jcc('b',slow);
  a.imul('rax','r9');a.add('rax','rdx');a.add('rcx',1);a.jmp(scan);
  // RCX closing quote, RAX hash; slot 72 = entry address, slot 80 = end.
  a.label(found);a.store(slot(80),'rcx');a.and('rax',63);a.shl('rax',3);a.store(slot(72),'rax');
  resetIfStale();
  a.load('r9',slot(64));a.load('rax',slot(72));a.add('r9','rax');a.add('r9',8);a.store(slot(72),'r9');a.load('r11',{base:'r9'});a.test('r11','r11');a.jcc('e',miss);
  // R11 cached record: same length and units?
  a.load('rcx',slot(80));a.load('r8',slot(56));a.sub('rcx','r8');a.sub('rcx',1);a.load('r10',{base:'r11'});a.cmp('r10','rcx');a.jcc('ne',miss);
  a.load('r10',slot(48));a.load('r10',{base:'r10',disp:8});a.add('r10',10);a.load('r8',slot(56));a.shl('r8',1);a.add('r10','r8');a.lea('r8',{base:'r11',disp:8});
  a.label(compare);a.test('rcx','rcx');a.jcc('e',hit);a.load('rax',{base:'r8'},16);a.load('rdx',{base:'r10'},16);a.cmp('rax','rdx');a.jcc('ne',miss);a.add('r8',2);a.add('r10',2);a.sub('rcx',1);a.jmp(compare);
  a.label(hit);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'r11');a.load('rax',slot(80));a.add('rax',1);a.jmp(done);
  // Decode it, then remember the record (after any collection the decode ran).
  a.label(miss);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.jsonParseStringAt');a.store(slot(80),'rax');
  {const same=a.unique('sameEpoch');a.load('r9',slot(64));a.load('r8',{rip:'rt.gcCount'});a.load('r10',{base:'r9'});a.cmp('r10','r8');a.jcc('e',same);resetIfStale();a.label(same);}
  a.load('rcx',slot(40));a.load('r11',{base:'rcx',disp:8});a.load('r9',slot(72));a.store({base:'r9'},'r11');a.load('rax',slot(80));a.jmp(done);
  a.label(slow);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.jsonParseStringAt');
  a.label(done);
 });

}
