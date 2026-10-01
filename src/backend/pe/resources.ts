/** PE resources (.rsrc): the resource directory tree and common resource types. */
export interface PeResource {type:number;id:number;language?:number;data:Uint8Array}
export const ResourceType={icon:3,groupIcon:14,version:16,manifest:24} as const;
const neutralEnglish=0x409;

/**
 * Build the .rsrc section for resources placed at `rva`: a three-level
 * directory (type → id → language) with ascending numeric IDs, data entries
 * holding absolute RVAs, and 8-byte aligned resource data.
 */
export function buildResources(resources:PeResource[],rva:number):Uint8Array {
  const types=new Map<number,Map<number,Map<number,Uint8Array>>>();
  for(const r of resources){
    for(const [name,value] of [['type',r.type],['id',r.id],['language',r.language??neutralEnglish]] as const)
      if(!Number.isInteger(value)||value<0||value>0xffff)throw Error(`Invalid resource ${name} ${value}`);
    const ids=types.get(r.type)??new Map<number,Map<number,Uint8Array>>();types.set(r.type,ids);
    const languages=ids.get(r.id)??new Map<number,Uint8Array>();ids.set(r.id,languages);
    const language=r.language??neutralEnglish;
    if(languages.has(language))throw Error(`Duplicate resource ${r.type}/${r.id}/${language}`);
    languages.set(language,r.data);
  }
  const sorted=<T>(m:Map<number,T>)=>[...m.entries()].sort((a,b)=>a[0]-b[0]);
  // Directory sizes first, then data entries, then data.
  const directorySize=(n:number)=>16+8*n;
  let size=directorySize(types.size);
  const typeDirs=sorted(types).map(([type,ids])=>{const offset=size;size+=directorySize(ids.size);return {type,ids,offset};});
  const idDirs=typeDirs.flatMap(t=>sorted(t.ids).map(([id,languages])=>{const offset=size;size+=directorySize(languages.size);return {t,id,languages,offset};}));
  const leaves=idDirs.flatMap(d=>sorted(d.languages).map(([language,data])=>{const offset=size;size+=16;return {d,language,data,offset,dataOffset:0};}));
  for(const leaf of leaves){size=Math.ceil(size/8)*8;leaf.dataOffset=size;size+=leaf.data.length;}
  const bytes=new Uint8Array(Math.ceil(size/8)*8),v=new DataView(bytes.buffer);
  const directory=(offset:number,entries:[number,number][])=>{
    v.setUint16(offset+14,entries.length,true);
    entries.forEach(([id,target],i)=>{v.setUint32(offset+16+8*i,id,true);v.setUint32(offset+20+8*i,target,true);});
  };
  const subdirectory=(offset:number)=>(0x80000000|offset)>>>0;
  directory(0,typeDirs.map(t=>[t.type,subdirectory(t.offset)]));
  for(const t of typeDirs)directory(t.offset,idDirs.filter(d=>d.t===t).map(d=>[d.id,subdirectory(d.offset)]));
  for(const d of idDirs)directory(d.offset,leaves.filter(l=>l.d===d).map(l=>[l.language,l.offset]));
  for(const leaf of leaves){
    v.setUint32(leaf.offset,rva+leaf.dataOffset,true);v.setUint32(leaf.offset+4,leaf.data.length,true);
    bytes.set(leaf.data,leaf.dataOffset);
  }
  return bytes;
}

/** RT_ICON entries and the RT_GROUP_ICON directory (id 1) from a .ico file. */
export function iconResources(ico:Uint8Array):PeResource[] {
  const v=new DataView(ico.buffer,ico.byteOffset,ico.byteLength);
  if(ico.length<6||v.getUint16(0,true)!==0||v.getUint16(2,true)!==1)throw Error('Invalid .ico file: missing ICONDIR header');
  const count=v.getUint16(4,true);
  if(count===0||ico.length<6+16*count)throw Error('Invalid .ico file: bad image count');
  const group=new Uint8Array(6+14*count),g=new DataView(group.buffer);
  g.setUint16(2,1,true);g.setUint16(4,count,true);
  const resources:PeResource[]=[];
  for(let i=0;i<count;i++){
    const e=6+16*i,size=v.getUint32(e+8,true),offset=v.getUint32(e+12,true);
    if(offset+size>ico.length||size===0)throw Error(`Invalid .ico file: image ${i} is out of bounds`);
    resources.push({type:ResourceType.icon,id:i+1,data:ico.slice(offset,offset+size)});
    group.set(ico.subarray(e,e+12),6+14*i);g.setUint16(6+14*i+12,i+1,true);
  }
  resources.push({type:ResourceType.groupIcon,id:1,data:group});
  return resources;
}

/** Manifest used for GUI programs that do not provide one. */
export const defaultManifest=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security>
  </trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </windowsSettings>
  </application>
</assembly>
`;

export function manifestResource(xml:string):PeResource {
  return {type:ResourceType.manifest,id:1,data:new TextEncoder().encode(xml)};
}

/** VERSIONINFO fields; versions are "major.minor.build.revision" (missing parts are 0). */
export interface VersionInfo {
  FileVersion?:string;ProductVersion?:string;ProductName?:string;FileDescription?:string;
  CompanyName?:string;LegalCopyright?:string;OriginalFilename?:string;InternalName?:string;Comments?:string;
}
export const versionInfoKeys=['FileVersion','ProductVersion','ProductName','FileDescription','CompanyName','LegalCopyright','OriginalFilename','InternalName','Comments'] as const;

function parseVersion(text:string|undefined):[number,number] {
  if(text===undefined)return [0,0];
  const parts=text.split('.').map(p=>p.trim());
  if(parts.length>4||parts.some(p=>!/^\d{1,5}$/.test(p)||Number(p)>0xffff))throw Error(`Invalid version '${text}': expected up to four numbers 0-65535`);
  const [a=0,b=0,c=0,d=0]=parts.map(Number);
  return [(a*0x10000+b)>>>0,(c*0x10000+d)>>>0];
}

/** RT_VERSION (id 1): VS_VERSIONINFO with a 040904B0 string table and translation. */
export function versionResource(info:VersionInfo):PeResource {
  for(const key of Object.keys(info))if(!(versionInfoKeys as readonly string[]).includes(key))throw Error(`Unknown version-info field '${key}'`);
  const out:number[]=[];
  const pad=()=>{while(out.length%4)out.push(0);};
  const u16=(n:number)=>{out.push(n&255,n>>>8&255);};
  const u32=(n:number)=>{u16(n&0xffff);u16(n>>>16);};
  const wide=(s:string)=>{for(let i=0;i<s.length;i++)u16(s.charCodeAt(i));u16(0);};
  // A version node: wLength, wValueLength, wType, key, padding, value, padding, children.
  const node=(key:string,type:0|1,value:(()=>number)|null,children:()=>void)=>{
    pad();const start=out.length;u16(0);u16(0);u16(type);wide(key);pad();
    let valueLength=0;if(value)valueLength=value();
    children();
    const length=out.length-start;out[start]=length&255;out[start+1]=length>>>8;out[start+2]=valueLength&255;out[start+3]=valueLength>>>8;
  };
  const [fileMs,fileLs]=parseVersion(info.FileVersion),[productMs,productLs]=parseVersion(info.ProductVersion??info.FileVersion);
  node('VS_VERSION_INFO',0,()=>{
    for(const n of [0xfeef04bd,0x10000,fileMs,fileLs,productMs,productLs,0x3f,0,0x40004,1,0,0,0])u32(n);
    return 52;
  },()=>{
    node('StringFileInfo',1,null,()=>node('040904B0',1,null,()=>{
      for(const key of versionInfoKeys){
        const text=info[key];if(text===undefined)continue;
        if(typeof text!=='string')throw Error(`Version-info field '${key}' must be a string`);
        node(key,1,()=>{const before=out.length;wide(text);return (out.length-before)/2;},()=>{});
      }
    }));
    node('VarFileInfo',1,null,()=>node('Translation',0,()=>{u16(0x0409);u16(0x04b0);return 4;},()=>{}));
  });
  return {type:ResourceType.version,id:1,data:Uint8Array.from(out)};
}
