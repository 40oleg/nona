import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withNativeTarget} from '../src/backend/machine/context.js';
const probePath='../tests/probes/platform-probes.js';
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

test('Buffer platform probe uses the x64 PE linker for Windows x64',()=>{
 assert.ok(probes);
 const buffer=probes.runtimeProbes('win32-x64').find((probe:{name:string})=>probe.name==='buffer');
 assert.ok(buffer);
 const view=new DataView(buffer.image.buffer,buffer.image.byteOffset,buffer.image.byteLength);
 const pe=view.getUint32(0x3c,true);
 assert.equal(view.getUint16(pe+4,true),0x8664);
});

test('BSD cross-compilation under an ARM64 emission scope also scopes OS service linking',()=>{
  assert.ok(probes);
  const images=withNativeTarget('linux-arm64',()=>probes.runtimeProbes('freebsd-x64'));
  assert.ok(images.some((probe:{name:string})=>probe.name==='process-core'));
  for(const name of ['path','path-lazy-startup'])assert.ok(images.some((probe:{name:string})=>probe.name===name),name);
  for(const name of ['process-abort','process-builtin-literal','process-builtin-dynamic','process-builtin-escaped','process-builtin-folded','process-signals-delivery','process-signals-unreferenced','process-signals-restoration'])assert.ok(images.some((probe:{name:string})=>probe.name===name),name);
  for(const probe of images){
    if(probe.name.startsWith('process-signals-')||probe.name.startsWith('process-report-')||probe.name==='process-finalization'||probe.name==='process-network-stream-integration'||probe.name.startsWith('process-builtin-')||probe.name.startsWith('stream-'))assert.equal(probe.minimalEnvironment,true,probe.name);
    else assert.notEqual(probe.minimalEnvironment,true,probe.name);
    if(probe.name==='process-abort'){assert.equal(probe.status,134);assert.equal(probe.signal,'SIGABRT')}
  }
  for(const probe of images){
    assert.equal(probe.timeoutMs,probe.name.startsWith('buffer')||probe.name==='process-network-stream-integration'||probe.name.startsWith('stream-')||probe.name.startsWith('process-builtin-')||probe.name.startsWith('process-report-')||probe.name.startsWith('process-signals-')?60000:undefined,probe.name);
    const image:Uint8Array=probe.image,v=new DataView(image.buffer,image.byteOffset,image.byteLength);
    assert.equal(v.getUint16(18,true),62,probe.name);
  }
});
