/** Original Nona path algorithms. Node.js is used only by behavioral tests. */
export const pathOriginalSource=String.raw`
function pathInvalid(value,name,type){
 const received=value===null?'null':typeof value==='undefined'?'undefined':typeof value==='string'?"type string ('"+value+"')":typeof value==='object'?'an instance of '+(Array.isArray(value)?'Array':'Object'):typeof value==='function'?'type function':'type '+typeof value+' ('+String(value)+')';
 const error=new TypeError('The "'+name+'" argument must be of type '+type+'. Received '+received);error.code='ERR_INVALID_ARG_TYPE';throw error;
}
function pathString(value,name){if(typeof value!=='string')pathInvalid(value,name,'string');}
function pathSeparator(text,index,windows){return text[index]==='/'||(windows&&text[index]==='\\');}
function pathDrive(text){const code=text.charCodeAt(0);return text[1]===':'&&((code>=65&&code<=90)||(code>=97&&code<=122));}
function pathRoot(text,windows){
 let end=0,device='',absolute=false;
 if(windows&&pathDrive(text)){device=text.slice(0,2);end=2;if(pathSeparator(text,2,true)){end=3;absolute=true;}}
 else if(pathSeparator(text,0,windows)){
  end=1;absolute=true;
  if(windows&&pathSeparator(text,1,true)&&!pathSeparator(text,2,true)){
   let serverEnd=2;while(serverEnd<text.length&&!pathSeparator(text,serverEnd,true))serverEnd++;
   let shareStart=serverEnd;while(shareStart<text.length&&pathSeparator(text,shareStart,true))shareStart++;
   let shareEnd=shareStart;while(shareEnd<text.length&&!pathSeparator(text,shareEnd,true))shareEnd++;
   if(serverEnd>2&&shareEnd>shareStart){device='\\\\'+text.slice(2,serverEnd)+'\\'+text.slice(shareStart,shareEnd);end=shareEnd;if(pathSeparator(text,end,true))end++;}
  }
 }
 return {device:device,absolute:absolute,end:end,root:text.slice(0,end)};
}
function pathSegments(text,windows){
 const pieces=[];let start=0;
 for(let i=0;i<=text.length;i++)if(i===text.length||pathSeparator(text,i,windows)){pieces.push(text.slice(start,i));start=i+1;}
 return pieces;
}
function pathNavigationRoot(text,windows){
 const root=pathRoot(text,windows);
 if(windows&&root.device&&pathSeparator(text,0,true)&&pathSeparator(text,1,true)&&(text[2]==='?'||text[2]==='.')&&pathSeparator(text,3,true))return {device:'\\\\'+text[2],absolute:true,end:4,root:text.slice(0,4)};
 return root;
}
function pathReduce(text,windows,above){
 const stack=[];
 for(const part of pathSegments(text,windows)){
  if(!part||part==='.')continue;
  if(part==='..'){if(stack.length&&stack[stack.length-1]!=='..')stack.pop();else if(above)stack.push(part);}
  else stack.push(part);
 }
 return stack.join(windows?'\\':'/');
}
function pathTail(text,windows,start){
 let end=text.length;while(end>start&&pathSeparator(text,end-1,windows))end--;
 let begin=end;while(begin>start&&!pathSeparator(text,begin-1,windows))begin--;
 return {begin:begin,end:end,base:text.slice(begin,end)};
}
function pathExtension(base){const dot=base.lastIndexOf('.');return dot<=0||base==='..'?'':base.slice(dot);}
function pathReserved(text){
 const colon=text.indexOf(':');if(colon<0)return false;
 const name=text.slice(0,colon).toUpperCase();
 return ['CON','PRN','AUX','NUL','COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9','LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9','COM¹','COM²','COM³','LPT¹','LPT²','LPT³'].includes(name);
}
function pathFlavor(windows){
 const sep=windows?'\\':'/';
 function normalize(text){
  pathString(text,'path');if(!text)return '.';
  let root=pathNavigationRoot(text,windows);const trailing=pathSeparator(text,text.length-1,windows);
  const reserved=windows&&pathReserved(text);
  if(reserved){let end=text.indexOf(':')+1;while(pathSeparator(text,end,true))end++;root={device:text.slice(0,text.indexOf(':')+1),absolute:false,end:end,root:''};}
  let tail=pathReduce(text.slice(root.end),windows,!root.absolute);
  if(!tail&&!root.absolute)tail='.';
  if(tail&&trailing)tail+=sep;
  let result=root.device+(root.absolute?sep:'')+tail;
  let colonSeparator=false;for(let i=0;i<text.length;i++)if(text[i]===':'&&(i===text.length-1||pathSeparator(text,i+1,true)))colonSeparator=true;
  if(windows&&!root.absolute&&(reserved||(!root.device&&(pathDrive(result)||colonSeparator))))result='.'+sep+result;
  return result;
 }
 function cwd(){
  let text=pathHost.cwd();
  if(!windows&&pathHost.platform==='win32'){text=text.split('\\').join('/');text=text.slice(text.indexOf('/'));}
  return text;
 }
 function resolve(...args){
  let device='',absolute=false,tail='';
  for(let i=args.length-1;i>=-1;i--){
   let text;
   if(i>=0){text=args[i];pathString(text,'paths['+i+']');if(!text)continue;}
   else{
    text=cwd();
    if(windows&&device){const directory=typeof pathHost.driveDirectory==='function'?pathHost.driveDirectory(device):pathHost.env['='+device];text=directory||text;const current=pathRoot(text,true);if(current.device&&current.device.toLowerCase()!==device.toLowerCase())text=device+'\\';}
   }
   const root=pathNavigationRoot(text,windows);
   if(windows&&root.device){if(device&&root.device.toLowerCase()!==device.toLowerCase())continue;device=root.device;}
   if(!absolute){tail=text.slice(root.end)+sep+tail;absolute=root.absolute;}
   if(absolute&&(!windows||device))break;
  }
  const reduced=pathReduce(tail,windows,!absolute);
  return device+(absolute?sep:'')+reduced||'.';
 }
 function join(...args){
  const pieces=[];for(let i=0;i<args.length;i++){pathString(args[i],'path');if(args[i])pieces.push(args[i]);}
  if(!pieces.length)return '.';
  let text=pieces.join(sep);
  if(windows){const first=pieces[0];const unc=pathSeparator(first,0,true)&&pathSeparator(first,1,true)&&first.length>2&&!pathSeparator(first,2,true);if(!unc){let count=0;while(pathSeparator(text,count,true))count++;if(count>1)text=sep+text.slice(count);}}
  if(windows&&text.split('\\').some(part=>pathReserved(part)))return text.split('/').join('\\');
  return normalize(text);
 }
 function dirname(text){
  pathString(text,'path');if(!text)return '.';
  const root=pathRoot(text,windows),tail=pathTail(text,windows,root.end);
  if(tail.begin<=root.end)return root.root||'.';
  const end=tail.begin-1;
  if(!windows&&end===1&&text[0]==='/')return '//';
  return text.slice(0,end)||root.root||'.';
 }
 function basename(text,suffix){
  if(suffix!==undefined)pathString(suffix,'suffix');pathString(text,'path');
  const start=windows&&pathDrive(text)?2:0,tail=pathTail(text,windows,start),base=tail.base;
  if(!suffix)return base;
  if(text===suffix)return '';
  if(!base&&suffix.length<=text.length)return text.slice(start);
  if(suffix.length<base.length&&base.endsWith(suffix))return base.slice(0,-suffix.length);
  return base;
 }
 function extname(text){pathString(text,'path');return pathExtension(pathTail(text,windows,windows&&pathDrive(text)?2:0).base);}
 function parse(text){
  pathString(text,'path');const root=pathRoot(text,windows),tail=pathTail(text,windows,root.end);
  let ext=pathExtension(tail.base);
  if(!windows){if(root.absolute){if(tail.begin===1){if(tail.base==='..')ext='.';}}}
  let dir=tail.begin>root.end?text.slice(0,tail.begin-1):root.root;
  return {root:root.root,dir:dir,base:tail.base,ext:ext,name:tail.base.slice(0,tail.base.length-ext.length)};
 }
 function format(object){
  if(object===null||typeof object!=='object'||Array.isArray(object))pathInvalid(object,'pathObject','Object');
  const dir=object.dir||object.root,extension=object.ext;
  const base=object.base||String(object.name||'')+(extension?(extension[0]==='.'?'':'.')+String(extension):'');
  return dir?String(dir)+(dir===object.root?'':sep)+base:base;
 }
 function relative(from,to){
  pathString(from,'from');pathString(to,'to');if(from===to)return '';
  const a=resolve(from),b=resolve(to),ra=pathRoot(a,windows),rb=pathRoot(b,windows);
  const left=pathSegments(windows?a:a.slice(ra.end),windows).filter(x=>x),right=pathSegments(windows?b:b.slice(rb.end),windows).filter(x=>x);
  if(windows){
   if(a.toLowerCase()===b.toLowerCase())return '';
   const leftText=left.join(sep),rightText=right.join(sep),lowerLeft=leftText.toLowerCase(),lowerRight=rightText.toLowerCase();
   if(!left.length)return rightText;
   if(!right.length)return Array(left.length).fill('..').join(sep);
   let prefix=0,boundary=-1;
   while(prefix<lowerLeft.length&&prefix<lowerRight.length&&lowerLeft[prefix]===lowerRight[prefix]){if(lowerLeft[prefix]===sep)boundary=prefix;prefix++;}
   if(prefix<lowerLeft.length&&prefix<lowerRight.length&&boundary<0)return b;
   let rightStart=0;while(b[rightStart]===sep)rightStart++;
   if(prefix===lowerLeft.length&&lowerLeft.length<lowerRight.length){
    if(rightText[prefix]===sep)return b.slice(rightStart+prefix+1);
    // A complete two-character prefix is treated as a Windows drive root,
    // including device-less paths resolved from a POSIX working directory.
    if(prefix===2)return b.slice(rightStart+prefix);
   }
   if(prefix===lowerRight.length&&lowerRight.length<lowerLeft.length){
    if(leftText[prefix]===sep)boundary=prefix;
    else if(prefix===2)boundary=3;
   }
   const remaining=boundary+1<=leftText.length?pathSegments(leftText.slice(boundary+1),true).length:0;
   const upward=Array(remaining).fill('..').join(sep),suffix=rightText.slice(Math.max(boundary,0));
   return upward?upward+suffix:suffix[0]===sep?suffix.slice(1):suffix;
  }
  let common=0;while(common<left.length&&common<right.length&&left[common]===right[common])common++;
  return Array(left.length-common).fill('..').concat(right.slice(common)).join(sep);
 }
 function isAbsolute(text){pathString(text,'path');return pathRoot(text,windows).absolute;}
 function toNamespacedPath(text){
  if(!windows||typeof text!=='string'||!text)return text;
  const resolved=resolve(text);
  if(resolved.length<=2)return text;
  if(resolved.startsWith('\\\\')&&resolved[2]!=='?'&&resolved[2]!=='.')return '\\\\?\\UNC\\'+resolved.slice(2);
  if(pathDrive(resolved)&&resolved[2]==='\\')return '\\\\?\\'+resolved;
  return resolved;
 }
 function matchesGlob(text,pattern){pathString(text,'path');pathString(pattern,'pattern');return pathGlobMatch(text,pattern,windows);}
 return {resolve:resolve,normalize:normalize,isAbsolute:isAbsolute,join:join,relative:relative,toNamespacedPath:toNamespacedPath,dirname:dirname,basename:basename,extname:extname,format:format,parse:parse,matchesGlob:matchesGlob,sep:sep,delimiter:windows?';':':',win32:null,posix:null,_makeLong:toNamespacedPath};
}
const posix=pathFlavor(false),win32=pathFlavor(true);
posix.posix=win32.posix=posix;posix.win32=win32.win32=win32;
const path=pathHost.platform==='win32'?win32:posix;
export default path;
export {posix,win32};
export const resolve=path.resolve,normalize=path.normalize,isAbsolute=path.isAbsolute,join=path.join,relative=path.relative,toNamespacedPath=path.toNamespacedPath,dirname=path.dirname,basename=path.basename,extname=path.extname,format=path.format,parse=path.parse,matchesGlob=path.matchesGlob,sep=path.sep,delimiter=path.delimiter,_makeLong=path._makeLong;
`;
