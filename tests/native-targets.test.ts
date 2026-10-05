import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import * as registry from '../src/target.js';
import {withBuiltinModules} from '../src/frontend/builtin-modules.js';

test('host detection selects the CPU and OS instead of falling back to Windows',()=>{
  assert.ok(registry,'The native target registry must exist');
  for(const [platform,arch,want] of [
    ['linux','x64','linux-x64'],['linux','arm64','linux-arm64'],
    ['win32','x64','win32-x64'],['win32','arm64','win32-arm64'],
    ['darwin','x64','darwin-x64'],['darwin','arm64','darwin-arm64'],
    ['freebsd','x64','freebsd-x64'],['openbsd','x64','openbsd-x64'],
    ['linux','ia32',undefined],['freebsd','arm64',undefined],
    ['aix','ppc64',undefined],['darwin','riscv64',undefined],
  ])assert.equal(registry.detectHostTarget(platform,arch),want,`${platform}/${arch}`);
});

test('target descriptors choose executable format and permissions',()=>{
  assert.ok(registry,'The native target registry must exist');
  for(const [target,format,mode] of [
    ['linux-x64','elf',0o755],['linux-arm64','elf',0o755],
    ['freebsd-x64','elf',0o755],['openbsd-x64','elf',0o755],
    ['darwin-x64','macho',0o755],['darwin-arm64','macho',0o755],
    ['win32-x64','pe',0o666],['win32-arm64','pe',0o666],
  ] as const){
    const descriptor=registry.getTarget(target);
    assert.equal(descriptor?.format,format,target as string);
    assert.equal(descriptor?.fileMode,mode,target as string);
  }
  assert.equal(registry.getTarget('linux-mint-x64'),undefined);
  assert.equal(registry.getTarget('toString'),undefined);
});

test('unknown native target produces a positioned diagnostic',()=>{
  const result=compile('console.log(1)',{fileName:'target.js',target:'linux-mint-x64' as never});
  assert.equal(result.ok,false);
  if(result.ok)return;
  assert.equal(result.diagnostics[0]?.code,'E_TARGET');
  assert.equal(result.diagnostics[0]?.file,'target.js');
  assert.deepEqual(result.diagnostics[0]?.span,{start:0,end:0});
});

test('unfinished filesystem adapters fail explicitly instead of importing Windows services',()=>{
  const host=withBuiltinModules({resolve:()=>undefined,read:()=>undefined},'darwin-arm64' as never);
  assert.throws(()=>host.read('node:fs'),/Filesystem adapter.*darwin-arm64/);
});

test('existing targets keep their x64 native executable identity',()=>{
  const windows=compile('console.log(6*7,"a"+"b")',{fileName:'probe.js',target:'win32-x64'});
  const linux=compile('console.log(6*7,"a"+"b")',{fileName:'probe.js',target:'linux-x64'});
  assert.equal(windows.ok,true);assert.equal(linux.ok,true);
  if(!windows.ok||!linux.ok)return;
  const pe=new DataView(windows.image.buffer,windows.image.byteOffset,windows.image.byteLength);
  assert.equal(pe.getUint16(0,true),0x5a4d);
  assert.equal(pe.getUint16(pe.getUint32(0x3c,true)+4,true),0x8664);
  const elf=new DataView(linux.image.buffer,linux.image.byteOffset,linux.image.byteLength);
  assert.equal(elf.getUint32(0,true),0x464c457f);assert.equal(elf.getUint16(18,true),62);
});
