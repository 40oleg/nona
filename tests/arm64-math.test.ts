import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
const path='../src/backend/arm64/math.js';
const module=await import(path).catch(()=>undefined);

test('ARM64 logarithm and exponential helpers emit self-contained native code',()=>{
  assert.ok(module,'ARM64 software mathematics must exist');
  const bundle=withNativeTarget('linux-arm64',()=>{const b=new RuntimeBuilder();module.emitArm64Math(b);return b.bundle;});
  for(const name of ['log','exp','log1p','expm1','sin','cos','tan','atan','atan2'])assert.ok(bundle.fragments.some(f=>f.name==='rt.armMath.'+name),'Missing helper '+name);
  assert.deepEqual(bundle.imports,[]);
  for(const f of bundle.fragments.filter(f=>f.section==='.text')){
    assert.equal(f.bytes.length%4,0);assert.ok(f.fixups.every(f=>f.kind.startsWith('arm64-')));
  }
});

test('ARM64 math execution probe includes Node oracle values and domain boundaries',()=>{
  assert.equal(typeof module?.arm64MathProbe,'function','Native math oracle probe must exist');
  const image=module.arm64MathProbe();
  assert.equal(new DataView(image.buffer).getUint16(18,true),183);
  assert.ok(module.arm64MathCases.some((c:{input:number})=>Object.is(c.input,-0)));
  assert.ok(module.arm64MathCases.some((c:{input:number})=>c.input===Number.MIN_VALUE));
});
