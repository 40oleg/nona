import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModulesOnHost} from './helpers/host.js';

test('compiler filesystem operations preserve exclusive writes, identities and directory entries',()=>{
 const source=`import {writeFileSync,readFileSync,statSync,realpathSync,mkdirSync,readdirSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
 import {resolve} from 'node:path';
 writeFileSync('protected.txt','original',{flag:'wx',mode:0o600});
 try{writeFileSync('protected.txt','changed',{flag:'wx'});console.log('unexpected overwrite');}catch(error){console.log(error.code);}
 console.log(readFileSync('protected.txt','utf8'));
 const first=statSync('protected.txt',{bigint:true}),again=statSync('./protected.txt',{bigint:true});
 console.log(typeof first.dev,typeof first.ino,first.dev===again.dev&&first.ino===again.ino);
 console.log(realpathSync('./protected.txt')===resolve('protected.txt'));
 mkdirSync('nested');writeFileSync('nested/child.js','ok',{flag:'wx',mode:0o755});
 const entries=readdirSync('.',{withFileTypes:true}),directory=entries.find(entry=>entry.name==='nested'),file=entries.find(entry=>entry.name==='protected.txt');
 console.log(directory.isDirectory(),directory.isFile(),file.isFile(),file.isSymbolicLink());
 renameSync('nested/child.js','nested/renamed.js');console.log(readFileSync('nested/renamed.js','utf8'));
 unlinkSync('protected.txt');unlinkSync('nested/renamed.js');rmdirSync('nested');`;
 const {native,oracle}=runModulesOnHost({'main.mjs':source},'main.mjs',{gcStress:true});
 assert.equal(native.status,0,String(native.error??native.stderr));
 assert.equal(native.stdout,oracle);
 assert.equal(oracle,'EEXIST\noriginal\nbigint bigint true\ntrue\ntrue false true false\nok\n');
});
