import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {collectSourceUsage} from '../src/frontend/lexer.js';
import {generate} from '../src/backend/x64/codegen.js';
import {withNativeTarget} from '../src/backend/machine/context.js';

test('ARM64 semantic runtime and prelude emission contain native instruction fixups',()=>{
  const {result,usage}=collectSourceUsage(()=>compileToIR('console.log(6*7,Math.sin(.5),Math.log(2),2**10)',undefined,undefined,'linux-arm64'));
  const program=withNativeTarget('linux-arm64',()=>generate(result,{link:usage}));
  const code=program.fragments.filter(f=>f.section==='.text');assert.ok(code.length>100);
  for(const f of code){assert.equal(f.bytes.length%4,0,f.name);assert.ok(f.fixups.every(f=>f.kind.startsWith('arm64-')),f.name);}
});
