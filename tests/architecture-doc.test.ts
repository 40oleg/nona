import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ObjectLayout,PropertyLayout} from '../src/runtime/object-layout.js';
import {HeapLayout,HeapKind} from '../src/runtime/heap-layout.js';
import {FunctionLayout} from '../src/runtime/functions.js';
import {ValueTag} from '../src/runtime/value.js';

// docs/architecture.md states the memory layouts; this test fails when a
// layout changes and the page is not updated (and when the page lists a
// constant that no longer exists). docs/README.md must index every document.

const root=join(dirname(fileURLToPath(import.meta.url)),'..','..');
const docs=join(root,'docs');
const architecture=readFileSync(join(docs,'architecture.md'),'utf8');
const tables:Record<string,Readonly<Record<string,number>>>={ValueTag,HeapLayout,HeapKind,ObjectLayout,PropertyLayout,FunctionLayout};

test('architecture.md states every layout constant with its current value',()=>{
  for(const [name,table] of Object.entries(tables)){
    for(const [key,value] of Object.entries(table)){
      assert.ok(architecture.includes(`| \`${name}.${key}\` | ${value} |`),`docs/architecture.md must contain the row "| \`${name}.${key}\` | ${value} |"`);
    }
  }
});

test('architecture.md lists no constant that does not exist or has another value',()=>{
  const rows=[...architecture.matchAll(/\| `(\w+)\.(\w+)` \| (\d+) \|/g)];
  assert.ok(rows.length>=50,'the layout tables are missing');
  for(const [,name,key,value] of rows){
    const table=tables[name!];
    assert.ok(table,`unknown table ${name}`);
    assert.equal(table[key!],Number(value),`${name}.${key} in docs/architecture.md`);
  }
});

test('docs/README.md links every document in docs/',()=>{
  const index=readFileSync(join(docs,'README.md'),'utf8');
  for(const file of readdirSync(docs).filter(f=>f.endsWith('.md')&&f!=='README.md')){
    assert.ok(index.includes(`(${file})`),`docs/README.md must link ${file}`);
  }
  assert.ok(index.includes('(history/README.md)'),'docs/README.md must link history/README.md');
});
