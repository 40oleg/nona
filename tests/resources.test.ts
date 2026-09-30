import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile} from '../src/compiler.js';
import {defaultManifest,versionResource} from '../src/backend/pe/resources.js';
import {readPe} from './helpers/pe-reader.js';

/** A .ico with 32-bpp BMP images of the given sizes. */
function icon(sizes:number[]):Uint8Array {
  const images=sizes.map(size=>{
    const mask=Math.ceil(size/32)*4*size,bytes=new Uint8Array(40+size*size*4+mask),v=new DataView(bytes.buffer);
    v.setUint32(0,40,true);v.setInt32(4,size,true);v.setInt32(8,size*2,true);v.setUint16(12,1,true);v.setUint16(14,32,true);
    for(let i=0;i<size*size;i++){bytes[40+4*i]=size;bytes[40+4*i+1]=128;bytes[40+4*i+2]=255;bytes[40+4*i+3]=255;}
    return bytes;
  });
  const header=6+16*images.length,total=header+images.reduce((n,b)=>n+b.length,0),ico=new Uint8Array(total),v=new DataView(ico.buffer);
  v.setUint16(2,1,true);v.setUint16(4,images.length,true);
  let offset=header;
  images.forEach((image,i)=>{
    const e=6+16*i;ico[e]=sizes[i]!;ico[e+1]=sizes[i]!;v.setUint16(e+4,1,true);v.setUint16(e+6,32,true);
    v.setUint32(e+8,image.length,true);v.setUint32(e+12,offset,true);ico.set(image,offset);offset+=image.length;
  });
  return ico;
}
const utf16=(text:string)=>Buffer.from(text,'utf16le').toString('latin1');
const source="console.log('resources');\n";
const versionInfo={FileVersion:'1.2.3.4',ProductVersion:'1.2',ProductName:'Museum',FileDescription:'Картины на рабочем столе',CompanyName:'Nona',LegalCopyright:'© 2026'};

test('icons, manifest and version information are written to .rsrc',()=>{
  const ico=icon([16,32]);
  const result=compile(source,{fileName:'main.js',target:'win32-x64',icon:ico,manifest:'<assembly/>',versionInfo});
  assert.ok(result.ok);
  const pe=readPe(result.image);pe.checkDirectories();
  const resources=pe.resources();
  assert.deepEqual(resources.map(r=>[r.type,r.id,r.language]),[[3,1,0x409],[3,2,0x409],[14,1,0x409],[16,1,0x409],[24,1,0x409]]);
  assert.equal(resources[0]!.data.length,40+16*16*4+16*4);
  const group=new DataView(resources[2]!.data.buffer);
  assert.equal(group.getUint16(4,true),2);assert.equal(group.getUint16(6+12,true),1);assert.equal(group.getUint16(6+14+12,true),2);
  assert.equal(resources[2]!.data[6+14],32);
  assert.equal(Buffer.from(resources[4]!.data).toString(),'<assembly/>');
  const version=resources[3]!.data,v=new DataView(version.buffer);
  assert.equal(v.getUint16(0,true),version.length);
  const text=Buffer.from(version).toString('latin1');
  const fixed=text.indexOf(Buffer.from([0xbd,0x04,0xef,0xfe]).toString('latin1'));
  assert.ok(fixed>0&&fixed%4===0);
  assert.deepEqual([v.getUint32(fixed+8,true),v.getUint32(fixed+12,true),v.getUint32(fixed+16,true),v.getUint32(fixed+20,true)],[0x10002,0x30004,0x10002,0]);
  for(const value of ['VS_VERSION_INFO','StringFileInfo','040904B0','ProductName\0','Museum\0','Картины на рабочем столе\0','VarFileInfo','Translation'])assert.ok(text.includes(utf16(value)),value);
});

test('GUI programs get a default manifest; resources need the Windows target',()=>{
  const gui=compile(source,{fileName:'main.js',target:'win32-x64',subsystem:'windows'});
  assert.ok(gui.ok);
  assert.deepEqual(readPe(gui.image).resources().map(r=>[r.type,Buffer.from(r.data).toString()]),[[24,defaultManifest]]);
  const plain=compile(source,{fileName:'main.js',target:'win32-x64'});
  assert.ok(plain.ok);assert.equal(readPe(plain.image).directories[2]!.size,0);
  const linux=compile(source,{fileName:'main.js',target:'linux-x64',icon:icon([16])});
  assert.ok(!linux.ok&&linux.diagnostics[0]!.code==='E_RESOURCE');
  for(const bad of [{icon:new Uint8Array([1,2,3])},{versionInfo:{FileVersion:'1.x'}},{versionInfo:{Unknown:'x'} as never}]){
    const r=compile(source,{fileName:'main.js',target:'win32-x64',...bad});
    assert.ok(!r.ok&&r.diagnostics[0]!.code==='E_RESOURCE',JSON.stringify(bad));
  }
  assert.throws(()=>versionResource({FileVersion:'1.2.3.4.5'}),/Invalid version/);
});

test('CLI resource options',()=>{
  const directory=mkdtempSync(join(tmpdir(),'nona-resources-'));
  try{
    const input=join(directory,'app.js');writeFileSync(input,source);
    writeFileSync(join(directory,'app.ico'),icon([16]));// Windows refuses to start a program with a malformed manifest, so use a real one.
    writeFileSync(join(directory,'app.manifest'),defaultManifest);
    writeFileSync(join(directory,'version.json'),JSON.stringify(versionInfo));
    const cli=(args:string[])=>spawnSync(process.execPath,['dist/cli.js','build',input,...args],{encoding:'utf8',windowsHide:true});
    const ok=cli(['-o',join(directory,'app.exe'),'--icon',join(directory,'app.ico'),'--manifest',join(directory,'app.manifest'),'--version-info',join(directory,'version.json')]);
    assert.equal(ok.status,0,ok.stderr);
    writeFileSync(join(directory,'bad.json'),'[1]');
    const bad=cli(['-o',join(directory,'bad.exe'),'--version-info',join(directory,'bad.json')]);
    assert.equal(bad.status,1);assert.match(bad.stderr,/JSON object/);
    if(process.platform==='win32'){
      const ps=spawnSync('powershell',['-NoProfile','-Command',`[Console]::OutputEncoding=[Text.Encoding]::UTF8; $v=(Get-Item '${join(directory,'app.exe')}').VersionInfo; "$($v.FileVersion)|$($v.ProductName)|$($v.CompanyName)|$($v.FileDescription)"; Add-Type -AssemblyName System.Drawing; [System.Drawing.Icon]::ExtractAssociatedIcon('${join(directory,'app.exe')}').Width; & '${join(directory,'app.exe')}'`],{encoding:'utf8',windowsHide:true});
      assert.equal(ps.status,0,ps.stderr);
      const lines=ps.stdout.trim().split(/\r?\n/);
      assert.equal(lines[0],'1.2.3.4|Museum|Nona|Картины на рабочем столе');
      assert.ok(Number(lines[1])>0);
      assert.equal(lines[2],'resources');
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
