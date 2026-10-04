import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Arm64Assembler} from '../src/backend/arm64/assembler.js';
import {linkPe} from '../src/backend/pe/writer.js';
test('Windows ARM64 imports marshal typed arguments through a native BLR bridge',()=>{
 const a=new Arm64Assembler('entry','win32');a.initializeStack();a.sub('rsp',72);
 (a.callImport as (target:string,types:string[])=>void).call(a,'native.test',['gp','f64','gp','f32','gp','gp','gp','gp','gp','gp','gp']);
 const code=a.finish();assert.ok(code.bytes.length>200);assert.ok(code.fixups.some(f=>f.target==='native.test'));
 assert.ok(Array.from({length:code.bytes.length/4},(_,i)=>new DataView(code.bytes.buffer).getUint32(i*4,true)).includes(0xd63f0200));
});
test('ARM64 PE identifies the machine and applies native instruction fixups',()=>{
 const a=new Arm64Assembler('entry','win32');a.lea('rax',{rip:'data'});
 const image=linkPe({entry:'entry',functions:[],imports:[],fragments:[{...a.finish(),name:'entry',section:'.text'},{name:'data',section:'.data',bytes:new Uint8Array(8),symbols:{},fixups:[]}]},{arch:'arm64'} as never);
 const v=new DataView(image.buffer);assert.equal(v.getUint16(v.getUint32(60,true)+4,true),0xaa64);
});
