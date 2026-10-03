import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compile} from '../src/compiler.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

// A diagnostic from an imported module names that module and is positioned
// in its text, not the entry's.
const files:Record<string,string>={'/app.mjs':'import {x} from "./lib.mjs";\nconsole.log(x);\n','/lib.mjs':'export const x = 1;\nclass A {\n  #p = 2;\n}\n'};
const moduleHost={resolve:(specifier:string)=>'/'+specifier.replace(/^\.\//,''),read:(path:string)=>files[path]};

test('compile reports a module error with the module path',()=>{
 const result=compile(files['/app.mjs']!,{fileName:'/app.mjs',target:'linux-x64',module:true,moduleHost});
 assert.equal(result.ok,false);
 if(result.ok)return;
 assert.equal(result.diagnostics[0]!.file,'/lib.mjs');
 assert.equal(files['/lib.mjs']!.slice(result.diagnostics[0]!.span.start,result.diagnostics[0]!.span.end),'#');
});

test('the command line positions a module error in the module',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-diagnostics-'));
 try{
  writeFileSync(join(directory,'app.mjs'),files['/app.mjs']!);writeFileSync(join(directory,'lib.mjs'),files['/lib.mjs']!);
  const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const run=spawnSync(process.execPath,[cli,'build',join(directory,'app.mjs'),'-o',join(directory,'out'),'--target','linux-x64'],{encoding:'utf8'});
  assert.equal(run.status,1);
  assert.equal(run.stderr,`${join(directory,'lib.mjs')}:3:3 E_LEX: Unsupported character "#"\n`);
 }finally{removeTemporaryDirectory(directory);}
});
