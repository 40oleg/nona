import {test} from 'node:test';
import assert from 'node:assert/strict';
const relocationPath='../src/backend/arm64/relocations.js';
const relocations=await import(relocationPath).catch(()=>undefined);

test('ARM64 ADRP and ADD relocation encode forward and backward page-relative addresses',()=>{
  assert.ok(relocations,'ARM64 instruction relocations must exist');
  const apply=relocations.relocateArm64;
  assert.equal(apply('arm64-page21',0x90000001,0x401004,0x430123),0xf0000161);
  assert.equal(apply('arm64-pageoff12',0x91000021,0x401008,0x430123),0x91048c21);
  assert.equal(apply('arm64-page21',0x90000001,0x401000,0x3ff000),0xd0ffffe1);
});

test('ARM64 native branch relocations preserve B/BL and reject misalignment or overflow',()=>{
  assert.ok(relocations,'ARM64 instruction relocations must exist');
  const apply=relocations.relocateArm64;
  assert.equal(apply('arm64-branch26',0x14000000,0x401000,0x401014),0x14000005);
  assert.equal(apply('arm64-branch26',0x94000000,0x401000,0x400ff0),0x97fffffc);
  assert.throws(()=>apply('arm64-branch26',0x14000000,0,134217728),/range/i);
  assert.throws(()=>apply('arm64-branch26',0x14000000,0,2),/align/i);
  assert.throws(()=>apply('arm64-page21',0x90000001,0,0x100000000),/range/i);
  assert.throws(()=>apply('arm64-pageoff12',0xd503201f,0,123),/instruction/i);
});
