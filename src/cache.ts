/**
 * On-disk cache of the compiled runtime and preludes (the "base image" of
 * codegen). Generating it is most of the time of a first compile; with the
 * cache a CLI build only compiles the program itself. Node.js only: the
 * browser playground keeps the in-memory cache.
 *
 * Entries are keyed by the code generation options and a fingerprint of the
 * compiler's own files, so a different compiler build never reads an entry
 * written by another one. A missing, foreign or damaged entry is a miss.
 */
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {BaseImage,BaseImageCache} from './backend/x64/codegen.js';

const magic='NONABAS1';

/** The default cache directory: NONA_CACHE_DIR, else the platform's user cache directory. */
export function defaultCacheDirectory(env:NodeJS.ProcessEnv=process.env,platform:NodeJS.Platform=process.platform):string {
  if(env.NONA_CACHE_DIR)return env.NONA_CACHE_DIR;
  if(platform==='win32')return join(env.LOCALAPPDATA??join(homedir(),'AppData','Local'),'nona','cache');
  if(platform==='darwin')return join(homedir(),'Library','Caches','nona');
  return join(env.XDG_CACHE_HOME??join(homedir(),'.cache'),'nona');
}

let fingerprint:string|undefined;
/** Hash of every JavaScript file of the compiler (the directory of this module). */
function compilerFingerprint():string {
  if(fingerprint!==undefined)return fingerprint;
  const root=dirname(fileURLToPath(import.meta.url)),hash=createHash('sha256');
  const walk=(directory:string):void=>{
    for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
      const path=join(directory,entry.name);
      if(entry.isDirectory())walk(path);
      else if(entry.name.endsWith('.js')){hash.update(path.slice(root.length));hash.update('\0');hash.update(readFileSync(path));hash.update('\0');}
    }
  };
  walk(root);
  return fingerprint=hash.digest('hex');
}

interface StoredFragment {name:string;section:BaseImage['fragments'][number]['section'];alignment?:number;fixups:BaseImage['fragments'][number]['fixups'];symbols:Record<string,number>;offset:number;length:number}
interface StoredImage {fragments:StoredFragment[];functions:BaseImage['functions'];imports:BaseImage['imports'];literals:[string,string][];serial:number}

export function encodeBaseImage(image:BaseImage):Uint8Array {
  let offset=0;
  const fragments:StoredFragment[]=image.fragments.map(f=>{
    const stored:StoredFragment={name:f.name,section:f.section,fixups:f.fixups,symbols:f.symbols,offset,length:f.bytes.length};
    if(f.alignment!==undefined)stored.alignment=f.alignment;
    offset+=f.bytes.length;
    return stored;
  });
  const header=Buffer.from(JSON.stringify({fragments,functions:image.functions,imports:image.imports,literals:[...image.literals],serial:image.serial} satisfies StoredImage));
  const out=Buffer.alloc(12+header.length+offset);
  out.write(magic,0,'latin1');out.writeUInt32LE(header.length,8);header.copy(out,12);
  let at=12+header.length;
  for(const f of image.fragments){out.set(f.bytes,at);at+=f.bytes.length;}
  return out;
}

export function decodeBaseImage(data:Uint8Array):BaseImage|undefined {
  const buffer=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  if(buffer.length<12||buffer.toString('latin1',0,8)!==magic)return undefined;
  const length=buffer.readUInt32LE(8);
  if(12+length>buffer.length)return undefined;
  const stored=JSON.parse(buffer.toString('utf8',12,12+length)) as StoredImage,blob=12+length;
  const fragments=stored.fragments.map(f=>{
    if(blob+f.offset+f.length>buffer.length)throw new Error('truncated');
    const fragment:BaseImage['fragments'][number]={name:f.name,section:f.section,fixups:f.fixups,symbols:f.symbols,bytes:Uint8Array.from(buffer.subarray(blob+f.offset,blob+f.offset+f.length))};
    if(f.alignment!==undefined)fragment.alignment=f.alignment;
    return fragment;
  });
  return {fragments,functions:stored.functions,imports:stored.imports,literals:new Map(stored.literals),serial:stored.serial};
}

/** A BaseImageCache in `directory` (created on first write). */
export function fileBaseImageCache(directory:string=defaultCacheDirectory()):BaseImageCache {
  const file=(key:string)=>join(directory,createHash('sha256').update(compilerFingerprint()).update('\0').update(key).digest('hex').slice(0,40)+'.bin');
  return {
    get(key){
      try{return decodeBaseImage(readFileSync(file(key)));}
      catch{return undefined;}
    },
    set(key,image){
      // Best effort: a read-only or full disk only costs the next build time.
      const target=file(key),temporary=target+'.'+randomUUID()+'.tmp';
      try{mkdirSync(directory,{recursive:true});writeFileSync(temporary,encodeBaseImage(image));renameSync(temporary,target);}
      catch{try{unlinkSync(temporary);}catch{/* nothing was written */}}
    },
  };
}
