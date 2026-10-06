import type {Target} from '../target.js';

export function selfhostFsProbeSource(target:Target):string {
 return `import {mkdirSync,rmdirSync,writeFileSync,readFileSync,statSync,realpathSync,readdirSync,renameSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
const directory=${JSON.stringify('.nona-selfhost-fs-'+target)};
mkdirSync(directory);
const original=directory+'/original',renamed=directory+'/renamed';
try{
 writeFileSync(original,'original',{flag:'wx',mode:0o600});
 try{writeFileSync(original,'changed',{flag:'wx'});throw new Error('Exclusive write overwrote a file');}catch(error){if(error.code!=='EEXIST')throw error;}
 console.log('exclusive',readFileSync(original,'utf8'));
 const first=statSync(original,{bigint:true}),again=statSync(original,{bigint:true});
 console.log('identity',typeof first.dev,typeof first.ino,first.dev===again.dev&&first.ino===again.ino);
 const canonical=realpathSync(original),identity=statSync(canonical,{bigint:true});
 console.log('realpath',identity.dev===first.dev&&identity.ino===first.ino&&realpathSync(canonical)===canonical);
 const entry=readdirSync(directory,{withFileTypes:true})[0];
 console.log('entry',entry.name,entry.isFile(),entry.isDirectory(),entry.isSymbolicLink());
 renameSync(original,renamed);console.log('renamed',readFileSync(renamed,'utf8'));
}finally{try{unlinkSync(original)}catch{}try{unlinkSync(renamed)}catch{}rmdirSync(directory);}`;
}
export const selfhostFsProbeExpected='exclusive original\nidentity bigint bigint true\nrealpath true\nentry original true false false\nrenamed original\n';
