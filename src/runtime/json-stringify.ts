import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,ObjectFlags,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {CellTag} from './environment-layout.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {stringLiteral} from './value.js';
import {ShapeLayout,ShapeToJSON,emitSlotAddress} from './shapes.js';
import {ElementsLayout as E,HoleTag} from './array-elements.js';

export function emitJsonStringify(b:RuntimeBuilder):void {
 for(const [name,value] of [['openArray','['],['closeArray',']'],['openObject','{'],['closeObject','}'],['colon',':']] as const)b.bundle.fragments.push(stringLiteral('rt.json.'+name,value));
 b.bundle.fragments.push(stringLiteral('rt.json.toJSON','toJSON'));
 b.bundle.fragments.push(stringLiteral('rt.json.newline','\n'));
 b.bundle.fragments.push(stringLiteral('rt.json.space',' '));
 // RCX object payload -> RAX 1 when it certainly has no `toJSON`: an
 // ordinary object or array whose complete key filter lacks the name's bit,
 // inheriting from Object.prototype or Array.prototype while neither has one.
 // That check of the prototypes holds for the shape epoch it was made in
 // (both are flagged, so a change to either advances it). Otherwise 0.
 b.data('rt.json.toJSONBit',new Uint8Array(8),'.data');
 b.data('rt.json.protoEpoch',new Uint8Array(8),'.data');
 b.fn('rt.jsonNoToJSON',72,a=>{
  const no=a.unique('no'),yes=a.unique('yes'),haveBit=a.unique('haveBit'),protoOk=a.unique('protoOk'),done=a.unique('done'),unshaped=a.unique('unshaped'),ownKeysClear=a.unique('ownKeysClear');
  a.store(slot(40),'rcx');a.load('rax',{base:'rcx',disp:O.kind});a.cmp('rax',1);a.jcc('a',no);
  // A shaped object: whether its keys include "toJSON" is a fact about the
  // (immutable) shape chain, found once and cached on the shape.
  {const walk=a.unique('walk'),nextShape=a.unique('nextShape'),found=a.unique('found'),none=a.unique('none');
   a.load('r10',{base:'rcx',disp:O.shape});a.test('r10','r10');a.jcc('e',unshaped);
   a.store(slot(56),'r10');a.store(slot(48),'r10');a.load('rax',{base:'r10',disp:ShapeLayout.toJSON});a.cmp('rax',ShapeToJSON.yes);a.jcc('e',no);a.cmp('rax',ShapeToJSON.no);a.jcc('e',ownKeysClear);
   a.label(walk);a.load('r11',slot(48));a.load('r9',{base:'r11',disp:ShapeLayout.parent});a.test('r9','r9');a.jcc('e',none);
   a.load('r10',{base:'r11',disp:ShapeLayout.key});a.lea('rax',{rip:'rt.json.toJSON'});a.cmp('r10','rax');a.jcc('e',found);
   a.load('rax',{base:'r10'});a.cmp('rax',6);a.jcc('ne',nextShape);
   a.mov('rcx','r10');a.lea('rdx',{rip:'rt.json.toJSON'});a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',found);
   a.label(nextShape);a.load('r11',slot(48));a.load('r11',{base:'r11',disp:ShapeLayout.parent});a.store(slot(48),'r11');a.jmp(walk);
   a.label(found);a.load('r10',slot(56));a.mov('rax',ShapeToJSON.yes);a.store({base:'r10',disp:ShapeLayout.toJSON},'rax');a.jmp(no);
   a.label(none);a.load('r10',slot(56));a.mov('rax',ShapeToJSON.no);a.store({base:'r10',disp:ShapeLayout.toJSON},'rax');a.jmp(ownKeysClear);}
  a.label(unshaped);
  a.load('rax',{rip:'rt.json.toJSONBit'});a.test('rax','rax');a.jcc('ne',haveBit);
  a.lea('rcx',{rip:'rt.json.toJSON'});a.call('rt.keyFilterBit');a.store({rip:'rt.json.toJSONBit'},'rax');a.load('rcx',slot(40));
  a.label(haveBit);a.load('r10',{base:'rcx',disp:O.keys});a.test('r10','r10');a.jcc('ns',no);a.and('r10','rax');a.jcc('ne',no);
  a.label(ownKeysClear);a.load('rcx',slot(40));
  a.load('r10',{base:'rcx',disp:O.prototype});a.lea('r11',{rip:'rt.objectPrototype'});a.cmp('r10','r11');a.jcc('e',protoOk);
  a.lea('r11',{rip:'rt.arrayPrototype'});a.cmp('r10','r11');a.jcc('ne',no);
  a.label(protoOk);a.load('rax',{rip:'rt.json.protoEpoch'});a.load('r10',{rip:'rt.shapeEpoch'});a.cmp('rax','r10');a.jcc('e',yes);
  for(const proto of ['rt.objectPrototype','rt.arrayPrototype']){a.lea('r10',{rip:proto});a.load('r11',{base:'r10',disp:O.flags});a.or('r11',ObjectFlags.cachedPrototype);a.store({base:'r10',disp:O.flags},'r11');}
  a.lea('r10',{rip:'rt.arrayPrototype'});a.load('r10',{base:'r10',disp:O.prototype});a.lea('r11',{rip:'rt.objectPrototype'});a.cmp('r10','r11');a.jcc('ne',no);
  for(const proto of ['rt.objectPrototype','rt.arrayPrototype']){a.lea('rcx',{rip:proto});a.lea('rdx',{rip:'rt.json.toJSON'});a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('ne',no);}
  a.load('rax',{rip:'rt.shapeEpoch'});a.store({rip:'rt.json.protoEpoch'},'rax');
  a.label(yes);a.mov('rax',1);a.jmp(done);a.label(no);a.mov('rax',0);a.label(done);
 });
 rootedFn(b,'rt.jsonNormalizeGap',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  const raw=a.unique('raw'),number=a.unique('number'),string=a.unique('string'),done=a.unique('done');a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',raw);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',BoxKind);a.jcc('ne',raw);a.load('rax',{base:'r10',disp:BoxLayout.value});a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('e',string);a.jmp(raw);
  a.label(raw);a.load('rax',slot(64));a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('e',string);
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(88),'rax');a.jmp(done);
  a.label(number);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.movsd('xmm0',slot(72));a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');const zero=a.unique('zero'),ready=a.unique('ready');a.jcc('p',zero);a.jcc('be',zero);a.mov('rax',10);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',ready);a.cvttsd2si('rax','xmm0');a.jmp(ready);a.label(zero);a.mov('rax',0);a.label(ready);a.store(slot(112),'rax');
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(88),'rax');a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.json.space'});a.store(slot(104),'rax');a.mov('rax',0);a.store(slot(120),'rax');const loop=a.unique('gapLoop');a.label(loop);a.load('rax',slot(120));a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('ae',done);a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.concat');a.load('rax',slot(120));a.add('rax',1);a.store(slot(120),'rax');a.jmp(loop);
  a.label(string);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toString');a.load('r10',slot(72));a.load('rax',{base:'r10'});a.cmp('rax',10);const copy=a.unique('copy');a.jcc('be',copy);a.lea('rcx',slot(80));a.mov('rdx','r10');a.mov('r8',0);a.mov('r9',10);a.call('rt.jsonSlice');a.jmp(done);a.label(copy);for(const n of [0,8]){a.load('rax',slot(64+n));a.store(slot(80+n),'rax');}
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 rootedFn(b,'rt.jsonBuildPropertyList',232,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:8}],a=>{
  a.store(slot(40),'rcx');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  const original=a.unique('original'),loop=a.unique('loop'),next=a.unique('next'),check=a.unique('check'),append=a.unique('append'),done=a.unique('done');
  a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',original);a.lea('rcx',slot(64));a.call('rt.isArray');a.test('rax','rax');a.jcc('e',original);
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(184),'rax');
  a.lea('rcx',slot(176));a.lea('rdx',slot(64));a.lea('r8',slot(176));a.call('rt.getProperty');a.lea('rcx',slot(176));a.lea('rdx',slot(176));a.call('rt.toNumber');
  a.movsd('xmm0',slot(184));a.ucomisd('xmm0','xmm0');const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');a.jcc('p',zeroLength);a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zeroLength);a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(200),'rax');
  a.lea('rcx',slot(80));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');a.mov('rax',0);a.store(slot(192),'rax');
  a.label(loop);a.load('rax',slot(192));a.load('r10',slot(200));a.cmp('rax','r10');a.jcc('ae',done);
  a.lea('rcx',slot(96));a.mov('rdx','rax');a.call('rt.arrayIndexKey');a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.load('rax',slot(112));a.cmp('rax',3);a.jcc('e',append);a.cmp('rax',4);a.jcc('e',append);a.cmp('rax',5);a.jcc('ne',next);
  a.load('r10',slot(120));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',4);a.jcc('ne',next);a.load('rax',{base:'r10',disp:O.size});a.cmp('rax',3);a.jcc('e',append);a.cmp('rax',4);a.jcc('ne',next);
  a.label(append);a.lea('rcx',slot(112));a.lea('rdx',slot(112));a.call('rt.toString');a.mov('rax',0);a.store(slot(208),'rax');
  a.label(check);a.load('rax',slot(208));a.load('r10',slot(88));a.load('r10',{base:'r10',disp:O.length});a.cmp('rax','r10');const fresh=a.unique('fresh');a.jcc('ae',fresh);
  a.lea('rcx',slot(128));a.mov('rdx','rax');a.call('rt.arrayIndexKey');a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.load('rcx',slot(120));a.load('rdx',slot(152));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',next);a.load('rax',slot(208));a.add('rax',1);a.store(slot(208),'rax');a.jmp(check);
  a.label(fresh);a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.call('rt.appendArrayValue');
  a.label(next);a.load('rax',slot(192));a.add('rax',1);a.store(slot(192),'rax');a.jmp(loop);
  a.label(original);for(const n of [0,8]){a.load('rax',slot(64+n));a.store(slot(80+n),'rax');}
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 // Appends the serialization of the value to the builder of the state record
 // (fifth argument: replacer, gap, indent, builder) and returns true, or
 // returns undefined and appends nothing when the value is omitted.
 // Plain data takes a direct path: a shaped object (shapes.ts) without
 // elements and with at most shapedKeyLimit properties has its keys read
 // off the shape chain into this frame (slot(shapedKeys) on) and its values
 // read from the slots while the shape stays the same; a dense array element
 // is read from the element table. Both go through the generic [[Get]] the
 // moment the object changes under them (toJSON and replacers run user code).
 const shapedKeyLimit=64,shapedKeys=344;
 rootedFn(b,'rt.jsonStringifyValue',shapedKeys+8*shapedKeyLimit,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:64,count:8},{kind:'locals',offset:248,count:2},{kind:'locals',offset:296,count:1},{kind:'locals',offset:328,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'r8');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');a.load('rax',{base:'r9',disp:n});a.store(slot(248+n),'rax');}
  // An array index arrives as a Number key (rt.arrayIndexKey); toJSON and the
  // replacer observe the key, so they get its string form.
  a.load('r10',slot(frame+40));a.store(slot(56),'r10');for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(264+n),'rax');}
  const builder=()=>{a.load('rcx',slot(56));a.add('rcx',48);};
  // Only toJSON and a replacer observe the key: an array index (a Number)
  // becomes its string form just before one of them is called.
  const stringKey=()=>{const ready=a.unique('stringKey');a.load('r8',slot(48));a.load('rax',{base:'r8'});a.cmp('rax',3);a.jcc('ne',ready);
   a.lea('rcx',slot(328));a.mov('rdx','r8');a.call('rt.toString');a.lea('rax',slot(328));a.store(slot(48),'rax');a.label(ready);};
  const units:Record<string,number>={'rt.json.openArray':91,'rt.json.closeArray':93,'rt.json.openObject':123,'rt.json.closeObject':125,'rt.json.colon':58,'rt.str.comma':44,'rt.json.newline':10,'rt.json.space':32};
  const appendLiteral=(name:string)=>{builder();if(units[name]!==undefined){a.mov('rdx',units[name]!);a.call('rt.builderAppendUnit');}else{a.lea('rdx',{rip:name});a.call('rt.builderAppend');}};
  const dispatch=a.unique('dispatch'),checkToJson=a.unique('checkToJson');a.load('rax',slot(64));a.cmp('rax',5);a.jcc('e',checkToJson);a.cmp('rax',7);a.jcc('ne',dispatch);a.label(checkToJson);
  {const lookup=a.unique('lookup');a.cmp('rax',5);a.jcc('ne',lookup);a.load('rcx',slot(72));a.call('rt.jsonNoToJSON');a.test('rax','rax');a.jcc('ne',dispatch);a.label(lookup);}
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.json.toJSON'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.load('rax',slot(112));a.cmp('rax',5);a.jcc('ne',dispatch);a.load('r10',slot(120));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('ne',dispatch);
  stringKey();a.lea('rax',slot(64));a.store(slot(32),'rax');a.lea('rcx',slot(64));a.lea('rdx',slot(112));a.mov('r8',1);a.load('r9',slot(48));a.call('rt.invoke');
  a.label(dispatch);const noReplacer=a.unique('noReplacer');a.load('rax',slot(264));a.cmp('rax',5);a.jcc('ne',noReplacer);a.load('r10',slot(272));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('ne',noReplacer);
  stringKey();a.load('r10',slot(48));for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(144+n),'rax');a.load('rax',slot(64+n));a.store(slot(160+n),'rax');}
  a.lea('rax',slot(248));a.store(slot(32),'rax');a.lea('rcx',slot(64));a.lea('rdx',slot(264));a.mov('r8',2);a.lea('r9',slot(144));a.call('rt.invoke');
  a.label(noReplacer);a.load('rax',slot(64));const primitiveReady=a.unique('primitiveReady'),numberBox=a.unique('numberBox'),stringBox=a.unique('stringBox');a.cmp('rax',5);a.jcc('ne',primitiveReady);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',BoxKind);a.jcc('ne',primitiveReady);
  a.load('rax',{base:'r10',disp:BoxLayout.value});a.cmp('rax',2);const booleanBox=a.unique('booleanBox');a.jcc('e',booleanBox);a.cmp('rax',7);a.jcc('e',booleanBox);a.cmp('rax',3);a.jcc('e',numberBox);a.cmp('rax',4);a.jcc('e',stringBox);a.jmp(primitiveReady);
  a.label(booleanBox);for(const n of [0,8]){a.load('rax',{base:'r10',disp:BoxLayout.value+n});a.store(slot(64+n),'rax');}a.jmp(primitiveReady);
  a.label(numberBox);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.jmp(primitiveReady);
  a.label(stringBox);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toString');
  a.label(primitiveReady);
  const omitted=a.unique('omitted'),nullValue=a.unique('nullValue'),convert=a.unique('convert'),quote=a.unique('quote'),composite=a.unique('composite'),array=a.unique('array'),loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done'),produced=a.unique('produced');
  a.load('rax',slot(64));a.cmp('rax',7);const notBigInt=a.unique('notBigInt');a.jcc('ne',notBigInt);a.call('rt.throwTypeError');a.label(notBigInt);a.cmp('rax',1);a.jcc('e',convert);a.cmp('rax',2);a.jcc('e',convert);a.cmp('rax',4);a.jcc('e',quote);a.cmp('rax',5);a.jcc('e',composite);a.cmp('rax',3);a.jcc('ne',omitted);
  a.movsd('xmm0',slot(72));a.ucomisd('xmm0','xmm0');a.jcc('p',nullValue);for(const bits of [0x7ff0000000000000n,0xfff0000000000000n]){a.mov('rax',bits);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('e',nullValue);}
  // An exact integer below 2^53 in magnitude: its digits go straight to the builder.
  {const general=a.unique('general');a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ne',general);a.jcc('p',general);
   a.mov('r10',9007199254740992n);a.cmp('rax','r10');a.jcc('ge',general);a.neg('r10');a.cmp('rax','r10');a.jcc('le',general);
   builder();a.mov('rdx','rax');a.call('rt.builderAppendInteger');a.jmp(produced);a.label(general);}
  // A primitive: its text goes to the builder.
  a.label(convert);a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toString');builder();a.load('rdx',slot(88));a.call('rt.builderAppend');a.jmp(produced);
  a.label(quote);builder();a.load('rdx',slot(72));a.call('rt.builderAppendQuoted');a.jmp(produced);
  a.label(nullValue);appendLiteral('rt.json.null');a.jmp(produced);
  a.label(composite);a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('e',omitted);
  // Nesting recurses here: past the stack budget it is a RangeError, as in
  // a JS prologue (rt.stackLimit), not a crash.
  {const fits=a.unique('stackFits');a.load('r11',{rip:'rt.stackLimit'});a.cmp('rsp','r11');a.jcc('ae',fits);a.call('rt.throwStackOverflow');a.label(fits);}
  a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ObjectFlags.stringifying);a.test('rax','rax');const enter=a.unique('enter');a.jcc('e',enter);a.call('rt.throwTypeError');a.label(enter);
  a.load('rax',{base:'r10',disp:O.flags});a.or('rax',ObjectFlags.stringifying);a.store({base:'r10',disp:O.flags},'rax');a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(224),'rax');a.store(slot(232),'r10');a.lea('rax',slot(224));a.store({rip:'rt.cleanupHead'},'rax');
  a.lea('rcx',slot(64));a.call('rt.isArray');a.test('rax','rax');a.jcc('ne',array);a.mov('rax',1);a.store(slot(208),'rax');a.store(slot(192),'rax');
  const ordinaryKeys=a.unique('ordinaryKeys'),keysReady=a.unique('keysReady'),listKeys=a.unique('listKeys');a.load('rax',slot(264));a.cmp('rax',5);a.jcc('ne',ordinaryKeys);a.load('r10',slot(272));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',ordinaryKeys);
  for(const n of [0,8]){a.load('rax',slot(264+n));a.store(slot(144+n),'rax');}a.jmp(keysReady);
  // Slot 192 is the member source: 1 a key list (slot 144), 2 the shape
  // chain (keys in slot(shapedKeys), the shape in slot 288, its count in
  // slot 216). A shaped object's keys are strings that are not indices,
  // every one an enumerable own data property, in slot order.
  a.label(ordinaryKeys);
  {const fill=a.unique('fillKeys'),filled=a.unique('keysFilled');
   a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.test('rax','rax');a.jcc('ne',listKeys);
   a.load('rax',{base:'r10',disp:O.shape});a.test('rax','rax');a.jcc('e',listKeys);a.load('r11',{base:'r10',disp:O.elements});a.test('r11','r11');a.jcc('ne',listKeys);
   a.load('rdx',{base:'rax',disp:ShapeLayout.count});a.cmp('rdx',shapedKeyLimit);a.jcc('a',listKeys);
   a.store(slot(288),'rax');a.store(slot(216),'rdx');a.mov('r10',2);a.store(slot(192),'r10');
   a.label(fill);a.load('r9',{base:'rax',disp:ShapeLayout.parent});a.test('r9','r9');a.jcc('e',filled);
   a.load('r8',{base:'rax',disp:ShapeLayout.count});a.sub('r8',1);a.shl('r8',3);a.lea('r11',slot(shapedKeys));a.add('r11','r8');a.load('r10',{base:'rax',disp:ShapeLayout.key});a.store({base:'r11'},'r10');
   a.mov('rax','r9');a.jmp(fill);
   a.label(filled);appendLiteral('rt.json.openObject');a.jmp(loop);}
  a.label(listKeys);a.lea('rcx',slot(144));a.mov('rdx',1);a.lea('r8',slot(64));a.call('rt.Object.keys.fn.code');
  a.label(keysReady);a.load('r10',slot(152));a.load('rax',{base:'r10',disp:O.length});a.store(slot(216),'rax');
  appendLiteral('rt.json.openObject');a.jmp(loop);
  a.label(array);a.mov('rax',0);a.store(slot(208),'rax');
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(184),'rax');
  a.lea('rcx',slot(176));a.lea('rdx',slot(64));a.lea('r8',slot(176));a.call('rt.getProperty');a.lea('rcx',slot(176));a.lea('rdx',slot(176));a.call('rt.toNumber');
  a.movsd('xmm0',slot(184));a.ucomisd('xmm0','xmm0');const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');a.jcc('p',zeroLength);a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zeroLength);a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(216),'rax');
  appendLiteral('rt.json.openArray');
  a.label(loop);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:32+n});a.store(slot(296+n),'rax');}
  a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');const noIndent=a.unique('noIndent');a.jcc('e',noIndent);
  a.lea('rcx',slot(312));a.lea('rdx',slot(296));a.load('r8',slot(56));a.add('r8',16);a.call('rt.concat');a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',slot(312+n));a.store({base:'r10',disp:32+n},'rax');}a.label(noIndent);
  a.mov('rax',0);a.store(slot(200),'rax');a.store(slot(240),'rax');const iterate=a.unique('iterate'),finish=a.unique('finish'),objectKey=a.unique('objectKey'),prefixed=a.unique('prefixed'),notFirst=a.unique('notFirst');a.label(iterate);
  // Every Value this frame holds is rooted, so a collection may run here;
  // without it a large document kept all its temporaries until the end.
  a.call('rt.safepoint');
  a.load('rax',slot(200));a.load('r10',slot(216));a.cmp('rax','r10');a.jcc('ae',finish);
  a.load('r10',slot(208));a.test('r10','r10');a.jcc('ne',objectKey);
  // Array elements are read with a Number key (the dense-element fast path);
  // toJSON and a replacer still receive its string form (see stringKey above).
  a.load('rax',slot(200));a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
  // A dense element (array-elements.ts) is read from the table; a hole, a
  // sparse index and an array Proxy take the generic [[Get]].
  {const generic='rt.jsonStringifyValue.keyReady';
   a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',generic);
   a.load('r11',{base:'r10',disp:O.elements});a.test('r11','r11');a.jcc('e',generic);
   a.load('rax',slot(200));a.load('r9',{base:'r11',disp:E.capacity});a.cmp('rax','r9');a.jcc('ae',generic);
   a.shl('rax',4);a.add('rax','r11');a.load('r9',{base:'rax',disp:E.values});a.cmp('r9',HoleTag);a.jcc('e',generic);
   a.store(slot(112),'r9');a.load('r9',{base:'rax',disp:E.values+8});a.store(slot(120),'r9');a.jmp('rt.jsonStringifyValue.memberRead');}
  a.label(objectKey);
  // A shaped object's key comes from the snapshot and its value from the
  // slot, as long as the object still has the shape the snapshot was taken
  // from (a toJSON or replacer may have changed it; then the key goes
  // through [[Get]], which also finds it deleted).
  {const generic=a.unique('shapedGeneric'),listed=a.unique('listedKey');
   a.load('rax',slot(192));a.cmp('rax',2);a.jcc('ne',listed);
   a.load('rax',slot(200));a.shl('rax',3);a.lea('r11',slot(shapedKeys));a.add('r11','rax');a.load('r10',{base:'r11'});a.store(slot(104),'r10');a.mov('rax',4);a.store(slot(96),'rax');
   a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.shape});a.load('r11',slot(288));a.cmp('rax','r11');a.jcc('ne',generic);
   a.mov('rcx','r10');a.load('rdx',slot(200));emitSlotAddress(a,'rcx','rdx','rax');
   a.load('r10',{base:'rax'});a.cmp('r10',CellTag);a.jcc('e',generic);
   a.store(slot(112),'r10');a.load('r10',{base:'rax',disp:8});a.store(slot(120),'r10');a.jmp('rt.jsonStringifyValue.memberRead');
   a.label(generic);a.jmp('rt.jsonStringifyValue.keyReady');
   a.label(listed);}
  a.load('rax',slot(200));a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
  a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.lea('r8',slot(96));a.call('rt.getProperty');for(const n of [0,8]){a.load('rax',slot(160+n));a.store(slot(96+n),'rax');}
  // A dictionary-mode object's member is usually still the data node the key
  // came from: read it directly (a getter, a deleted or inherited member and
  // any other holder take the generic [[Get]]; a shaped object is not
  // materialized for the scan).
  {const generic=a.unique('memberGeneric'),read='rt.jsonStringifyValue.memberRead';
   a.load('rax',slot(96));a.cmp('rax',4);a.jcc('ne',generic);a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.test('rax','rax');a.jcc('ne',generic);
   a.load('rax',{base:'r10',disp:O.shape});a.test('rax','rax');a.jcc('ne',generic);
   a.mov('rcx','r10');a.load('rdx',slot(104));a.call('rt.ownNamedNodeScan');a.test('rax','rax');a.jcc('e',generic);
   a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.accessor);a.jcc('ne',generic);
   a.load('r10',{base:'rax',disp:P.value});a.cmp('r10',CellTag);a.jcc('e',generic);
   a.store(slot(112),'r10');a.load('r10',{base:'rax',disp:P.value+8});a.store(slot(120),'r10');a.jmp(read);
   a.label('rt.jsonStringifyValue.keyReady');a.label(generic);a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.getProperty');
   a.label(read);}
  // The separator, line break, indent and (for objects) the quoted key go in
  // first; the mark lets an omitted member take them back out again.
  builder();a.load('rax',{base:'rcx',disp:8});a.store(slot(320),'rax');
  a.load('rax',slot(240));a.test('rax','rax');a.jcc('e',notFirst);appendLiteral('rt.str.comma');a.label(notFirst);
  a.load('r10',slot(56));a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');const noLine=a.unique('noLine');a.jcc('e',noLine);
  appendLiteral('rt.json.newline');builder();a.load('r10',slot(56));a.load('rdx',{base:'r10',disp:40});a.call('rt.builderAppend');a.label(noLine);
  a.load('rax',slot(208));a.test('rax','rax');a.jcc('e',prefixed);
  builder();a.load('rdx',slot(104));a.call('rt.builderAppendQuoted');
  appendLiteral('rt.json.colon');
  a.load('r10',slot(56));a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');const noColonSpace=a.unique('noColonSpace');a.jcc('e',noColonSpace);appendLiteral('rt.json.space');a.label(noColonSpace);
  a.label(prefixed);a.load('rax',slot(56));a.store(slot(32),'rax');a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.lea('r8',slot(96));a.lea('r9',slot(64));a.call('rt.jsonStringifyValue');
  a.load('rax',slot(128));a.test('rax','rax');const kept=a.unique('kept');a.jcc('ne',kept);
  a.load('r10',slot(208));a.test('r10','r10');const dropMember=a.unique('dropMember');a.jcc('ne',dropMember);appendLiteral('rt.json.null');a.jmp(kept);
  a.label(dropMember);builder();a.load('rax',slot(320));a.store({base:'rcx',disp:8},'rax');a.jmp(next);
  a.label(kept);a.mov('rax',1);a.store(slot(240),'rax');
  a.label(next);a.load('rax',slot(200));a.add('rax',1);a.store(slot(200),'rax');a.jmp(iterate);
  a.label(finish);a.load('rax',slot(240));a.test('rax','rax');const noClosingLine=a.unique('noClosingLine');a.jcc('e',noClosingLine);a.load('r10',slot(56));a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',noClosingLine);
  appendLiteral('rt.json.newline');builder();a.load('rdx',slot(304));a.call('rt.builderAppend');a.label(noClosingLine);
  a.load('r10',slot(208));a.test('r10','r10');const objectClose=a.unique('objectClose'),closed=a.unique('closed');a.jcc('ne',objectClose);appendLiteral('rt.json.closeArray');a.jmp(closed);a.label(objectClose);appendLiteral('rt.json.closeObject');a.label(closed);
  a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',slot(296+n));a.store({base:'r10',disp:32+n},'rax');}
  a.load('rax',slot(224));a.store({rip:'rt.cleanupHead'},'rax');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.flags});a.and('rax',~ObjectFlags.stringifying);a.store({base:'r10',disp:O.flags},'rax');
  a.label(produced);a.load('rcx',slot(40));a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',1);a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(omitted);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
  a.label(done);
 });
}
