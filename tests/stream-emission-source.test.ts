import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileModuleToIR} from '../src/compiler.js';
import {streamPreludeForTarget} from '../src/runtime/stream-source.js';
import {supportedNativeTargets} from '../src/target.js';
import {collectSourceUsage,lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {streamProbeCases} from '../src/backend/stream-probes.js';

const emptyHost={resolve:()=>undefined,read:()=>undefined};
for(const target of supportedNativeTargets)test('original stream prelude lowers and emits instructions for '+target,()=>{
 const ir=compileModuleToIR('console.log(1)','stream-syntax.mjs',emptyHost,streamPreludeForTarget(target),target);
 assert.ok(ir.functions.length>50);
 assert.equal(ir.scripts!.filter(path=>path.endsWith('/stream-syntax.mjs')).length,1);
 assert.equal(lower(bind(parse(lex(streamPreludeForTarget(target))))).globalCount,0);
 // The stand-alone syntax gate does not execute the still-unintegrated Events dependency.
 const {usage}=collectSourceUsage(()=>compileModuleToIR('console.log(1)','bare.mjs',emptyHost,'',target));
 const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage}));
 assert.ok(program.fragments.filter(fragment=>fragment.name.startsWith('js.')&&fragment.section==='.text').length>100);
});

for(const target of supportedNativeTargets)test('Stream GC-stress probe bodies emit instructions for '+target,()=>{
 const bindings='var Stream=__nonaRegexpVm.streamModule,{Readable,Writable,Duplex,Transform,PassThrough}=Stream,EventEmitter=__nonaRegexpVm.eventEmitterModule,namespace={default:Stream,Stream:Stream,Readable:Readable},consumers=__nonaRegexpVm.streamConsumersModule;';
 const bodies=streamProbeCases(target).map(probe=>'(function(){'+bindings+probe.source.replace(/^import .*$/gm,'')+'})();').join('\n');
 const ir=compileModuleToIR(bodies,'stream-probe-syntax.mjs',emptyHost,streamPreludeForTarget(target),target);
 // Actual provider linkage and native execution are separate gates after Events integration.
 const {usage}=collectSourceUsage(()=>compileModuleToIR('console.log(1)','bare.mjs',emptyHost,'',target));
 const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage}));
 assert.ok(program.fragments.filter(fragment=>fragment.name.startsWith('js.')&&fragment.section==='.text').length>150);
});
