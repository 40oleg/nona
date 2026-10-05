import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {emitFfi} from '../src/runtime/ffi.js';
import {compile} from '../src/compiler.js';

test('Darwin raw FFI uses the BSD syscall class while Linux and BSD retain their numbers',()=>{
  for(const [target,number] of [['darwin-x64',0x2000014],['freebsd-x64',20],['openbsd-x64',20],['linux-x64',20],['linux-arm64',20]] as const){
    const bundle=withNativeTarget(target,()=>emitFfi([{dll:'syscall',name:'20',signature:'i64()'}]).bundle);
    const stub=bundle.fragments.find(f=>f.name==='linux.ffi.syscall!20.code');
    assert.ok(stub);assert.equal(stub.syscalls?.[0]?.number,number,target);
  }
});

test('FFI diagnostics describe OS support for both CPU architectures',()=>{
  for(const target of ['win32-arm64','linux-arm64','darwin-x64','freebsd-x64','openbsd-x64'] as const){
    const declaration=target.startsWith('win32')?"'syscall','20'":"'test.dll','Test'";
    const result=compile(`import {define} from 'nona:ffi';const fn=define(${declaration},'i64()');fn()`,{fileName:'ffi.mjs',target,module:true});
    assert.equal(result.ok,false);if(result.ok)continue;
    assert.equal(result.diagnostics[0]?.code,'E_FFI_TARGET');
    assert.doesNotMatch(result.diagnostics[0]!.message,/only supported for the (linux|win32)-x64 target/);
  }
});
