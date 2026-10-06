import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';

test('BSD targets compile arithmetic and strings into native ELF images',()=>{
  for(const [target,osabi] of [['freebsd-x64',9],['openbsd-x64',12]] as const){
    const result=compile('function twice(x){return x*2}console.log(twice(21),"a"+"b")',{fileName:'bsd.js',target});
    assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)continue;
    const v=new DataView(result.image.buffer,result.image.byteOffset,result.image.byteLength);
    assert.equal(v.getUint32(0,true),0x464c457f);assert.equal(result.image[7],osabi);
    assert.equal(v.getUint16(18,true),62);assert.deepEqual(result.imports,[]);
  }
});

test('BSD process adapters compile with their target host boundary',()=>{
  const result=compile('console.log(process.platform,process.arch)',{fileName:'process.js',target:'openbsd-x64'});
  assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});
