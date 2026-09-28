import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {expectProgram} from './helpers/program.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

test('Reflect intrinsic key order and tag',()=>{
 const source='console.log(Object.getOwnPropertyNames(Reflect).join("|"),Object.prototype.toString.call(Reflect));';
 expectProgram(source,runOracle(source).stdout);
});

test('DataView Reflect.construct keeps buffer alive through prototype getter GC',()=>{
 const source='var b=new ArrayBuffer(8);var C=function(){}.bind(null);Object.defineProperty(C,"prototype",{get:function(){for(var i=0;i<30;i++)({i:i});return DataView.prototype;}});var v=Reflect.construct(DataView,[b,0],C);console.log(v.byteLength,Object.getPrototypeOf(v)===DataView.prototype);';
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
