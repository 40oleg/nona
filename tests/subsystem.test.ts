import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile} from '../src/compiler.js';
import {readPe} from './helpers/pe-reader.js';

const source="console.log('hello'); console.log('world');\n";

test('--subsystem windows marks the PE as a GUI program',()=>{
 const gui=compile(source,{fileName:'main.js',target:'win32-x64',subsystem:'windows'});
 const console_=compile(source,{fileName:'main.js',target:'win32-x64'});
 assert.ok(gui.ok&&console_.ok);
 assert.equal(readPe(gui.image).subsystem,2);
 assert.equal(readPe(console_.image).subsystem,3);
 assert.equal(compile(source,{fileName:'main.js',target:'linux-x64',subsystem:'windows'}).ok,false);
 assert.equal(compile(source,{fileName:'main.js',target:'win32-x64',subsystem:'native' as 'windows'}).ok,false);
});

function withImage(image:Uint8Array,name:string,body:(path:string)=>void):void {
 const directory=mkdtempSync(join(tmpdir(),'nona-subsystem-'));
 try{const path=join(directory,name);writeFileSync(path,image);chmodSync(path,0o755);body(path);}
 finally{rmSync(directory,{recursive:true,force:true});}
}

test('console.log without standard output does not fail the program (Linux)',{skip:process.platform!=='linux'&&'Linux only'},()=>{
 const result=compile(source+"console.log('done');\n",{fileName:'main.js',target:'linux-x64'});
 assert.ok(result.ok);
 withImage(result.image,'image',path=>{
  const closed=spawnSync('sh',['-c','exec "$0" 1>&-',path],{encoding:'utf8'});
  assert.equal(closed.status,0,closed.stderr);
  const open=spawnSync(path,[],{encoding:'utf8'});
  assert.equal(open.stdout,'hello\nworld\ndone\n');
 });
});

test('a GUI subsystem program writes to inherited pipes and survives without them (Windows)',{skip:process.platform!=='win32'&&'Windows only'},()=>{
 const result=compile(source,{fileName:'main.js',target:'win32-x64',subsystem:'windows'});
 assert.ok(result.ok);
 withImage(result.image,'gui.exe',path=>{
  const piped=spawnSync(path,[],{encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(piped.status,0,piped.stderr);
  assert.equal(piped.stdout,'hello\nworld\n');
  const ignored=spawnSync(path,[],{stdio:'ignore',timeout:60_000,windowsHide:true});
  assert.equal(ignored.status,0);
  // Detached from any console and without redirected handles.
  const detached=spawnSync('powershell',['-NoProfile','-Command',`$p = Start-Process -FilePath '${path}' -PassThru -Wait -WindowStyle Hidden; exit $p.ExitCode`],{timeout:60_000,windowsHide:true});
  assert.equal(detached.status,0);
 });
});
