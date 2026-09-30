import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Assembler} from '../src/backend/x64/assembler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {linkLinux} from '../src/backend/linux/index.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {runNative} from './helpers/native.js';

test('native host clock uses Unix milliseconds on Windows and links on Linux',()=>{
 const before=Date.now();
 const program=generate(lower(bind(parse(lex('')))));
 const a=new Assembler('test.clock');
 a.sub('rsp',40);a.call('rt.currentTimeMs');
 a.mov('r10',BigInt(before-60_000));a.cmp('rax','r10');a.jcc('b','test.clock.bad');
 a.mov('r10',BigInt(before+60_000));a.cmp('rax','r10');a.jcc('a','test.clock.bad');
 a.mov('rcx',0);a.callImport('ExitProcess');
 a.label('test.clock.bad');a.mov('rcx',1);a.callImport('ExitProcess');
 program.fragments.push({...a.finish(),name:'test.clock',section:'.text'});
 program.entry='test.clock';
 const run=runNative(linkPe(program));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());
 assert.ok(linkLinux(program).length>0);
});
