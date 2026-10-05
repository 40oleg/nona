import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Assembler} from '../src/backend/x64/assembler.js';
import {linkHost} from './helpers/program.js';
import {emitRuntime} from '../src/runtime/index.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {runOracle} from './helpers/oracle.js';
import {expectProgram} from './helpers/program.js';

function native(body:(a:Assembler)=>void):void {
 const r=emitRuntime(),a=new Assembler('entry');
 a.sub('rsp',104);const prologSize=a.offset;a.call('rt.init');
 a.lea('rax',{rip:'test.roots'});a.store({rip:'rt.gcGlobals'},'rax');
 a.mov('rax',2);a.store({rip:'rt.gcGlobalCount'},'rax');
 body(a);a.call('rt.dispose');a.mov('rcx',0);a.callImport('ExitProcess');
 a.label('test.fail');a.mov('rcx',42);a.callImport('ExitProcess');a.label('entry.end');
 r.fragments.push({name:'test.roots',section:'.data',alignment:16,bytes:new Uint8Array(32),fixups:[],symbols:{}},
  {...a.finish(),name:'entry',section:'.text'});
 r.functions.push({begin:'entry',end:'entry.end',prologSize,stackAllocation:104,savedRegisters:[]});
 const run=runNative(linkHost({...r,entry:'entry'}));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
}
function equal(a:Assembler,symbol:string,value:number):void {
 a.load('rax',{rip:symbol});a.cmp('rax',value);a.jcc('ne','test.fail');
}
test('large linked graphs are traced without recursive collector stack growth',()=>{
 const source='let a=null;for(let i=0;i<40000;i++){a={next:a};}let count=0;while(a){count++;a=a.next;}console.log(count);';
 expectProgram(source,runOracle(source).stdout);
});
test('collector frees unrooted raw blocks and tolerates repeated empty collections',()=>native(a=>{
 a.mov('rcx',256);a.call('rt.alloc');a.call('rt.collect');
 equal(a,'rt.blocks',0);equal(a,'rt.liveBytes',0);
 a.call('rt.collect');equal(a,'rt.gcCount',2);
}));
test('interior string roots retain the containing allocation then release it',()=>native(a=>{
 a.mov('rcx',4096);a.call('rt.alloc');a.add('rax',2400);
 a.store({rip:'test.roots',addend:8},'rax');a.mov('rax',4);a.store({rip:'test.roots'},'rax');
 a.call('rt.collect');a.load('rax',{rip:'rt.blocks'});a.test('rax','rax');a.jcc('e','test.fail');
 a.mov('rax',0);a.store({rip:'test.roots'},'rax');a.call('rt.collect');equal(a,'rt.liveBytes',0);
}));
test('numeric bits that resemble heap pointers are not roots',()=>native(a=>{
 a.mov('rcx',64);a.call('rt.alloc');a.store({rip:'test.roots',addend:8},'rax');
 a.mov('rax',3);a.store({rip:'test.roots'},'rax');a.call('rt.collect');equal(a,'rt.blocks',0);
}));
test('rooted object-property cycle survives and unrooted cycle is reclaimed',()=>native(a=>{
 a.lea('rcx',{rip:'test.roots'});a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
 // Static string key Value on the stack, self-referential property.
 a.mov('rax',4);a.store({base:'rsp',disp:48},'rax');a.lea('rax',{rip:'rt.str.length'});a.store({base:'rsp',disp:56},'rax');
 a.lea('rcx',{rip:'test.roots'});a.lea('rdx',{base:'rsp',disp:48});a.lea('r8',{rip:'test.roots'});a.mov('r9',1);a.call('rt.setProperty');
 a.call('rt.collect');a.lea('rcx',{rip:'test.roots',addend:16});a.lea('rdx',{rip:'test.roots'});a.lea('r8',{base:'rsp',disp:48});a.call('rt.getProperty');
 a.load('rax',{rip:'test.roots',addend:8});a.load('r10',{rip:'test.roots',addend:24});a.cmp('rax','r10');a.jcc('ne','test.fail');
 a.mov('rax',0);a.store({rip:'test.roots'},'rax');a.store({rip:'test.roots',addend:16},'rax');
 a.call('rt.collect');equal(a,'rt.blocks',0);
}));

test('static prototypes retain dynamic properties after all Value roots disappear',()=>native(a=>{
 a.lea('rcx',{rip:'test.roots'});a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
 a.mov('rax',5);a.store({rip:'test.roots',addend:16},'rax');a.lea('rax',{rip:'rt.objectPrototype'});a.store({rip:'test.roots',addend:24},'rax');
 a.mov('rax',4);a.store({base:'rsp',disp:48},'rax');a.lea('rax',{rip:'rt.str.length'});a.store({base:'rsp',disp:56},'rax');
 a.lea('rcx',{rip:'test.roots',addend:16});a.lea('rdx',{base:'rsp',disp:48});a.lea('r8',{rip:'test.roots'});a.mov('r9',1);a.call('rt.setProperty');
 a.mov('rax',0);a.store({rip:'test.roots'},'rax');a.call('rt.collect');
 a.load('rax',{rip:'rt.blocks'});a.test('rax','rax');a.jcc('e','test.fail');
 a.lea('rcx',{rip:'test.roots'});a.lea('rdx',{rip:'test.roots',addend:16});a.lea('r8',{base:'rsp',disp:48});a.call('rt.deleteProperty');
 a.call('rt.collect');equal(a,'rt.blocks',0);
}));

for(const source of [
 'function build(n){let a={x:""+n};if(n){a.next=build(n-1);}return a;}let a=build(20);let sum=0;while(a){sum+=+a.x;a=a.next;}console.log(sum);',
 'let a=[1,,3];let k=[1];for(let i=0;i<20;i++){a[k]=(k[0]=2);a[0]={value:""+i};}console.log(a.length,a[0].value,a[2],1 in a);',
 'function f(n){let o={text:""+n};let a=[o,o];return a;}let sum=0;for(let i=0;i<100;i++){let a=f(i);sum+=+a[0].text;console.log(a[0]===a[1] && i===99 ? sum : 0);}',
])test(`compiler roots survive collection at every operation: ${source}`,()=>{
 const module=lower(bind(parse(lex(source))));
 const program=generate(module,{gcStress:true});
 const run=runNative(linkHost(program));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

for(const [name,source,requireCollection] of [
 ['allocation pressure','function work(){let total=0;for(let i=0;i<40000;i++){let o={text:""+i};o.self=o;let a=[o,o];total+=+a[0].text;}return total;}console.log(work());',true],
 ['expired top-level blocks','{let a={x:1};}for(let a={x:2};false;){}outer:{const a={x:3};break outer;}console.log("released");',false],
] as const)test(`exited scopes retain no heap roots: ${name}`,()=>{
 const program=generate(lower(bind(parse(lex(source)))));
 // Observe native counters after js.main, before the ordinary shutdown path.
 // This test-only wrapper does not add a JavaScript-visible GC builtin.
 const a=new Assembler('test.afterMain');a.sub('rsp',40);const prologSize=a.offset;
 if(requireCollection){a.load('rax',{rip:'rt.gcCount'});a.test('rax','rax');a.jcc('e','test.afterMain.fail');}
 a.load('rax',{rip:'rt.gcRoots'});a.test('rax','rax');a.jcc('ne','test.afterMain.fail');
 // The pressure program now legitimately retains its declared function in the
 // global environment. Tear down that environment, not the expired-scope test's
 // roots: the latter must still catch accidentally persistent block bindings.
 if(requireCollection){a.mov('rax',0);a.store({rip:'rt.gcGlobalCount'},'rax');}
 a.call('rt.collect');a.load('rax',{rip:'rt.liveBytes'});a.test('rax','rax');a.jcc('ne','test.afterMain.fail');
 a.call('rt.dispose');a.add('rsp',40);a.ret();
 a.label('test.afterMain.fail');a.mov('rcx',42);a.callImport('ExitProcess');a.label('test.afterMain.end');
 const entry=program.fragments.find(fragment=>fragment.name==='entry')!;
 const dispose=entry.fixups.find(fixup=>fixup.target==='rt.dispose')!;dispose.target='test.afterMain';
 program.fragments.push({...a.finish(),name:'test.afterMain',section:'.text'});
 program.functions.push({begin:'test.afterMain',end:'test.afterMain.end',prologSize,stackAllocation:40,savedRegisters:[]});
 const run=runNative(linkHost(program));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
