import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
test('portable SHA256 matches an independent implementation at padding and page boundaries',async()=>{
 const path='../src/backend/macho/sha256.js',module=await import(path).catch(()=>undefined);assert.ok(module,'Portable hash must exist');
 for(const length of [0,1,55,56,63,64,65,4095,4096,4097,10000]){
  const bytes=Uint8Array.from({length},(_,i)=>(i*173+31)&255),copy=bytes.slice();
  assert.deepEqual(module.sha256(bytes),new Uint8Array(createHash('sha256').update(bytes).digest()),String(length));assert.deepEqual(bytes,copy);
 }
});
