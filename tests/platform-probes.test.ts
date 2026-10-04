import {test} from 'node:test';
import assert from 'node:assert/strict';
const probePath='../src/backend/platform-probes.js';
const probes=await import(probePath).catch(()=>undefined);

test('loader probes contain the matching native OS and CPU image',()=>{
  assert.ok(probes,'Loader probes must exist');
  for(const [target,magic,machine] of [
    ['linux-x64',0x464c457f,62],['linux-arm64',0x464c457f,183],
    ['freebsd-x64',0x464c457f,62],['openbsd-x64',0x464c457f,62],
    ['darwin-x64',0xfeedfacf,0x1000007],['darwin-arm64',0xfeedfacf,0x100000c],
  ] as const){
    const image:Uint8Array=probes.loaderProbe(target);
    const v=new DataView(image.buffer,image.byteOffset,image.byteLength);
    assert.equal(v.getUint32(0,true),magic);
    assert.equal(magic===0xfeedfacf?v.getUint32(4,true):v.getUint16(18,true),machine);
  }
});

test('native probe runner refuses OS or CPU mismatches before executing',()=>{
  assert.ok(probes,'Loader probes must exist');
  assert.doesNotThrow(()=>probes.assertNativeHost('darwin-arm64','darwin','arm64'));
  assert.throws(()=>probes.assertNativeHost('darwin-arm64','darwin','x64'),/host.*target|target.*host/i);
  assert.throws(()=>probes.assertNativeHost('linux-x64','win32','x64'),/host.*target|target.*host/i);
  assert.throws(()=>probes.assertNativeHost('linux-mint-x64','linux','x64'),/target/i);
});
