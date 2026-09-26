import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';

export function emitJsonComposite(b:RuntimeBuilder):void {
 // Return the next top-level comma or the expected closing bracket. Quotes,
 // escapes and nested structures are skipped without invoking user code.
 b.fn('rt.jsonScanEnd',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rax',{base:'rcx'});a.store(slot(88),'rax');for(const offset of [64,72,80]){a.mov('rax',0);a.store(slot(offset),'rax');}
  const loop=a.unique('loop'),invalid=a.unique('invalid'),found=a.unique('found'),next=a.unique('next'),quoted=a.unique('quoted'),closing=a.unique('closing'),opening=a.unique('opening');
  a.label(loop);a.load('rax',slot(48));a.load('r10',slot(88));a.cmp('rax','r10');a.jcc('ae',invalid);a.shl('rax',1);a.load('r10',slot(40));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);
  a.load('rax',slot(72));a.test('rax','rax');a.jcc('ne',quoted);
  a.cmp('r11',34);const comma=a.unique('comma');a.jcc('ne',comma);a.mov('rax',1);a.store(slot(72),'rax');a.jmp(next);
  a.label(comma);a.cmp('r11',91);a.jcc('e',opening);a.cmp('r11',123);a.jcc('e',opening);a.cmp('r11',93);a.jcc('e',closing);a.cmp('r11',125);a.jcc('e',closing);a.cmp('r11',44);a.jcc('ne',next);a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',found);a.jmp(next);
  a.label(opening);a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(next);
  a.label(closing);a.load('rax',slot(64));a.test('rax','rax');const nested=a.unique('nested');a.jcc('ne',nested);a.load('rax',slot(56));a.cmp('r11','rax');a.jcc('e',found);a.jmp(invalid);a.label(nested);a.sub('rax',1);a.store(slot(64),'rax');a.jmp(next);
  a.label(quoted);a.load('rax',slot(80));a.test('rax','rax');const notEscaped=a.unique('notEscaped');a.jcc('e',notEscaped);a.mov('rax',0);a.store(slot(80),'rax');a.jmp(next);
  a.label(notEscaped);a.cmp('r11',92);const quoteDone=a.unique('quoteDone');a.jcc('ne',quoteDone);a.mov('rax',1);a.store(slot(80),'rax');a.jmp(next);a.label(quoteDone);a.cmp('r11',34);a.jcc('ne',next);a.mov('rax',0);a.store(slot(72),'rax');
  a.label(next);a.load('rax',slot(48));a.add('rax',1);a.store(slot(48),'rax');a.jmp(loop);
  a.label(found);a.load('rax',slot(48));a.mov('rdx','r11');const done=a.unique('done');a.jmp(done);a.label(invalid);a.mov('rax',-1);a.mov('rdx',0);a.label(done);
 });

 // RCX UTF-16 string, RDX opening quote index; RAX closing quote or -1.
 b.fn('rt.jsonFindQuote',72,a=>{
  a.load('r8',{base:'rcx'});a.mov('rax','rdx');a.add('rax',1);a.mov('r9',0);
  const loop=a.unique('loop'),next=a.unique('next'),found=a.unique('found'),invalid=a.unique('invalid'),done=a.unique('done');
  a.label(loop);a.cmp('rax','r8');a.jcc('ae',invalid);a.mov('r10','rax');a.shl('r10',1);a.add('r10','rcx');a.load('r11',{base:'r10',disp:8},16);a.test('r9','r9');const plain=a.unique('plain');a.jcc('e',plain);a.mov('r9',0);a.jmp(next);
  a.label(plain);a.cmp('r11',92);const quote=a.unique('quote');a.jcc('ne',quote);a.mov('r9',1);a.jmp(next);a.label(quote);a.cmp('r11',34);a.jcc('e',found);
  a.label(next);a.add('rax',1);a.jmp(loop);a.label(invalid);a.mov('rax',-1);a.label(found);a.label(done);
 });

 // RCX output Value*, RDX source string, R8 start and R9 exclusive end.
 rootedFn(b,'rt.jsonSlice',120,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(64),'rax');a.store(slot(72),'rdx');a.store(slot(96),'r8');a.store(slot(104),'r9');
  const invalid=a.unique('invalid');a.cmp('r9','r8');a.jcc('b',invalid);a.load('rax',{base:'rdx'});a.cmp('r9','rax');a.jcc('a',invalid);
  a.mov('rax','r9');a.sub('rax','r8');a.store(slot(112),'rax');a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');a.store(slot(88),'rax');a.mov('r10',4);a.store(slot(80),'r10');a.load('r10',slot(112));a.store({base:'rax'},'r10');
  a.mov('r8',0);const copy=a.unique('copy'),finish=a.unique('finish');a.label(copy);a.load('r10',slot(112));a.cmp('r8','r10');a.jcc('ae',finish);
  a.mov('r10','r8');a.load('r11',slot(96));a.add('r10','r11');a.shl('r10',1);a.load('r11',slot(72));a.add('r11','r10');a.load('r11',{base:'r11',disp:8},16);
  a.mov('r10','r8');a.shl('r10',1);a.load('rax',slot(88));a.add('rax','r10');a.store({base:'rax',disp:8},'r11',16);a.add('r8',1);a.jmp(copy);
  a.label(finish);a.load('rcx',slot(40));a.mov('rax',4);a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');const done=a.unique('done');a.jmp(done);a.label(invalid);a.call('rt.throwSyntaxError');a.label(done);
 });

 rootedFn(b,'rt.jsonParseComposite',248,[{kind:'output',register:'rcx'},{kind:'locals',offset:80,count:6}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(80),'rax');a.store(slot(88),'rdx');a.load('rax',{base:'rdx'});a.store(slot(224),'rax');
  const invalid=a.unique('invalid'),finish=a.unique('finish'),object=a.unique('object'),loop=a.unique('loop'),afterValue=a.unique('afterValue');
  a.cmp('rax',2);a.jcc('b',invalid);a.load('r11',{base:'rdx',disp:8},16);a.cmp('r11',91);const array=a.unique('array');a.jcc('e',array);a.cmp('r11',123);a.jcc('ne',invalid);a.mov('rax',1);a.store(slot(208),'rax');a.mov('rax',125);a.jmp('rt.jsonComposite.closeReady');
  a.label(array);a.mov('rax',0);a.store(slot(208),'rax');a.mov('rax',93);a.label('rt.jsonComposite.closeReady');a.store(slot(216),'rax');
  a.load('r10',slot(224));a.sub('r10',1);a.store(slot(184),'r10');a.shl('r10',1);a.load('r11',slot(88));a.add('r11','r10');a.load('r11',{base:'r11',disp:8},16);a.cmp('r11','rax');a.jcc('ne',invalid);
  a.lea('rcx',slot(96));a.mov('rdx',1);a.load('r10',slot(208));a.sub('rdx','r10');a.mov('r8',0);a.call('rt.newObject');a.mov('rax',1);a.store(slot(176),'rax');a.load('r10',slot(184));a.cmp('rax','r10');a.jcc('e',finish);
  const skipWs=()=>{const scan=a.unique('scan'),next=a.unique('next'),ready=a.unique('ready');a.label(scan);a.load('rax',slot(176));a.load('r10',slot(184));a.cmp('rax','r10');a.jcc('ae',invalid);a.shl('rax',1);a.load('r10',slot(88));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);for(const code of [9,10,13,32]){a.cmp('r11',code);a.jcc('e',next);}a.jmp(ready);a.label(next);a.load('rax',slot(176));a.add('rax',1);a.store(slot(176),'rax');a.jmp(scan);a.label(ready);};
  a.label(loop);a.load('rax',slot(208));a.test('rax','rax');a.jcc('ne',object);
  // Array element: scan its complete JSON text and append the parsed value.
  a.load('rcx',slot(88));a.load('rdx',slot(176));a.mov('r8',93);a.call('rt.jsonScanEnd');a.cmp('rax',-1);a.jcc('e',invalid);a.store(slot(192),'rax');a.store(slot(200),'rdx');
  a.lea('rcx',slot(144));a.load('rdx',slot(88));a.load('r8',slot(176));a.load('r9',slot(192));a.call('rt.jsonSlice');
  a.lea('rcx',slot(128));a.mov('rdx',1);a.lea('r8',slot(144));a.call('rt.JSON.parse.fn.code');
  a.lea('rcx',slot(96));a.lea('rdx',slot(128));a.call('rt.appendArrayValue');a.jmp(afterValue);
  a.label(object);skipWs();a.cmp('r11',34);a.jcc('ne',invalid);a.load('rcx',slot(88));a.load('rdx',slot(176));a.call('rt.jsonFindQuote');a.cmp('rax',-1);a.jcc('e',invalid);a.store(slot(216),'rax');a.add('rax',1);
  a.lea('rcx',slot(160));a.load('rdx',slot(88));a.load('r8',slot(176));a.mov('r9','rax');a.call('rt.jsonSlice');
  a.lea('rcx',slot(112));a.mov('rdx',1);a.lea('r8',slot(160));a.call('rt.JSON.parse.fn.code');
  a.load('rax',slot(216));a.add('rax',1);a.store(slot(176),'rax');skipWs();a.cmp('r11',58);a.jcc('ne',invalid);a.load('rax',slot(176));a.add('rax',1);a.store(slot(176),'rax');
  a.load('rcx',slot(88));a.load('rdx',slot(176));a.mov('r8',125);a.call('rt.jsonScanEnd');a.cmp('rax',-1);a.jcc('e',invalid);a.store(slot(192),'rax');a.store(slot(200),'rdx');
  a.lea('rcx',slot(144));a.load('rdx',slot(88));a.load('r8',slot(176));a.load('r9',slot(192));a.call('rt.jsonSlice');
  a.lea('rcx',slot(128));a.mov('rdx',1);a.lea('r8',slot(144));a.call('rt.JSON.parse.fn.code');
  a.lea('rcx',slot(96));a.lea('rdx',slot(112));a.lea('r8',slot(128));a.mov('r9',1);a.call('rt.setProperty');
  a.label(afterValue);a.load('rax',slot(200));a.cmp('rax',44);const close=a.unique('close');a.jcc('ne',close);a.load('rax',slot(192));a.add('rax',1);a.store(slot(176),'rax');a.jmp(loop);
  a.label(close);a.load('r10',slot(208));a.test('r10','r10');const objectClose=a.unique('objectClose');a.jcc('ne',objectClose);a.cmp('rax',93);a.jcc('ne',invalid);a.jmp('rt.jsonComposite.checkEnd');a.label(objectClose);a.cmp('rax',125);a.jcc('ne',invalid);
  a.label('rt.jsonComposite.checkEnd');a.load('rax',slot(192));a.load('r10',slot(184));a.cmp('rax','r10');a.jcc('ne',invalid);
  a.label(finish);a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(96+offset));a.store({base:'rcx',disp:offset},'rax');}const done=a.unique('done');a.jmp(done);
  a.label(invalid);a.call('rt.throwSyntaxError');a.label(done);
 });
}
