import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import * as generated from '../src/lib/sources.generated.js';

// The runtime preludes and node:* module bodies live in src/lib/**/*.js;
// scripts/build.mjs turns them into src/lib/sources.generated.ts.
const lib=resolve('src/lib');
function files(directory:string,prefix=''):string[] {
  return readdirSync(join(directory,prefix),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(directory,prefix+entry.name+'/'):entry.name.endsWith('.js')?[prefix+entry.name]:[]);
}
const name=(path:string)=>path.replace(/\.js$/,'').replace(/[-/.]+([a-z0-9])/g,(_,c:string)=>c.toUpperCase());
const sources=files(lib);
const exported=generated as Record<string,string|{raw:readonly string[]}>;

test('every src/lib file is a generated constant with its exact text',()=>{
  assert.ok(sources.length>40);
  assert.deepEqual(Object.keys(exported).sort(),sources.map(name).sort());
  for(const file of sources){
    const text=readFileSync(join(lib,file),'utf8').replace(/\r\n?/g,'\n'),value=exported[name(file)]!;
    // A template object reproduces the file when its substitutions are filled with their own text.
    const filled=typeof value==='string'?value:String.raw(value,...[...text.matchAll(/\$\{[^}]*\}/g)].map(match=>match[0]));
    assert.equal(filled,text,file);
  }
});

test('every src/lib file is used by the compiler and shipped in dist',()=>{
  const users=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?users(join(directory,entry.name)):entry.name.endsWith('.ts')&&!entry.name.endsWith('.generated.ts')?[readFileSync(join(directory,entry.name),'utf8')]:[]);
  const text=users(resolve('src')).join('\n');
  for(const file of sources){
    assert.match(text,new RegExp(`\\b${name(file)}\\b`),`src/lib/${file} is not used`);
    assert.ok(existsSync(resolve('dist/src/lib',file)),`dist/src/lib/${file}`);
  }
});

test('prelude JavaScript is not kept in TypeScript template literals',()=>{
  // Small templates with substitutions may stay inline; anything of 20 lines or more belongs in src/lib.
  const offenders:string[]=[];
  for(const directory of ['src/runtime','src/frontend'])
    for(const file of readdirSync(directory).filter(file=>file.endsWith('.ts'))){
      const text=readFileSync(join(directory,file),'utf8');
      for(const match of text.matchAll(/String\.raw`/g)){
        const end=text.indexOf('`',match.index!+match[0].length);
        if(text.slice(match.index!,end).split('\n').length>=20)offenders.push(directory+'/'+file);
      }
    }
  assert.deepEqual(offenders,[]);
});
