/** Node Buffer backed by the runtime's native typed arrays. */
export const bufferPreludeSource=String.raw`
(function(){
 var U8=Uint8Array,AB=ArrayBuffer,SAB=SharedArrayBuffer,DV=DataView;
 var define=Object.defineProperty,setProto=Object.setPrototypeOf,apply=Reflect.apply;
 var u8sub=U8.prototype.subarray,u8set=U8.prototype.set,encoder=new TextEncoder(),decoder=new TextDecoder('utf8',{ignoreBOM:true});
 var encode=TextEncoder.prototype.encode,decode=TextDecoder.prototype.decode;
 var maxLength=2147483647,hex='0123456789abcdef',alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 function error(kind,code,message){var e=new kind(message);e.code=code;throw e}
 function type(message){error(TypeError,'ERR_INVALID_ARG_TYPE',message)}
 function range(message){error(RangeError,'ERR_OUT_OF_RANGE',message)}
 function integer(value,name,min,max){if(typeof value!=='number')type(name+' must be a number');if(!Number.isInteger(value)||value<min||value>max)range(name+' is out of range');return value}
 function size(value){if(typeof value!=='number')type('size must be a number');if(!Number.isFinite(value)||value<0||value>maxLength)range('size is out of range');return Math.trunc(value)}
 function bytes(value){if(!(value instanceof U8))type('Expected a Buffer or Uint8Array');return value}
 function wrap(value){setProto(value,Buffer.prototype);return value}
 function encoding(value,strict){
  if(value===undefined||value===''||value===null)return 'utf8';
  if(typeof value!=='string'){if(!strict)return 'utf8';type('encoding must be a string')}
  var name=value.toLowerCase();
  if(name==='utf8'||name==='utf-8')return 'utf8';
  if(name==='ucs2'||name==='ucs-2'||name==='utf16le'||name==='utf-16le')return 'utf16le';
  if(name==='binary'||name==='latin1')return 'latin1';
  if(name==='ascii'||name==='hex'||name==='base64'||name==='base64url')return name;
  error(TypeError,'ERR_UNKNOWN_ENCODING','Unknown encoding: '+value)
 }
 function encodeString(text,enc){
  if(enc==='utf8')return apply(encode,encoder,[text]);
  var out=[],i,c,d;
  if(enc==='hex'){
   for(i=0;i+1<text.length;i+=2){c=parseInt(text[i],16);d=parseInt(text[i+1],16);if(c!==c||d!==d)break;out.push(c*16+d)}
  }else if(enc==='base64'||enc==='base64url'){
   var bits=0,count=0;
   for(i=0;i<text.length;i++){c=text[i];if(c==='=')break;d=alphabet.indexOf(c==='-'?'+':c==='_'?'/':c);if(d<0)continue;bits=bits*64+d;count+=6;if(count>=8){count-=8;out.push((bits>>count)&255);bits&=(1<<count)-1}}
  }else{
   for(i=0;i<text.length;i++){c=text.charCodeAt(i);out.push(c&255);if(enc==='utf16le')out.push(c>>8)}
  }
  return new U8(out)
 }
 function decodeBytes(view,enc){
  if(enc==='utf8')return apply(decode,decoder,[view]);
  var text='',i,c,d;
  // ASCII bytes avoid repeated growing-string copies and per-byte allocations.
  if(enc==='hex'){var encoded=new U8(view.length*2),digits=[48,49,50,51,52,53,54,55,56,57,97,98,99,100,101,102];for(i=0;i<view.length;i++){c=view[i];encoded[i*2]=digits[c>>4];encoded[i*2+1]=digits[c&15]}return apply(decode,decoder,[encoded])}
  if(enc==='base64'||enc==='base64url'){
   for(i=0;i<view.length;i+=3){c=view[i];d=i+1<view.length?view[i+1]:0;var e=i+2<view.length?view[i+2]:0;text+=alphabet[c>>2]+alphabet[(c&3)<<4|d>>4]+(i+1<view.length?alphabet[(d&15)<<2|e>>6]:'=')+(i+2<view.length?alphabet[e&63]:'=')}
   if(enc==='base64url')text=text.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return text
  }
  if(enc==='utf16le'){for(i=0;i+1<view.length;i+=2)text+=String.fromCharCode(view[i]|view[i+1]<<8);return text}
  for(i=0;i<view.length;i++)text+=String.fromCharCode(view[i]&(enc==='ascii'?127:255));return text
 }
 function Buffer(value,enc,length){
  if(typeof value==='number'){if(typeof enc==='string')type('The string argument must be of type string');return Buffer.allocUnsafe(value)}
  return Buffer.from(value,enc,length)
 }
 setProto(Buffer,U8);Buffer.prototype=Object.create(U8.prototype);
 define(Buffer.prototype,'constructor',{value:Buffer,writable:true,configurable:true});
 function FastBuffer(value,offset,length){return wrap(length===undefined?(offset===undefined?new U8(value):new U8(value,offset)):new U8(value,offset,length))}
 setProto(FastBuffer,U8);FastBuffer.prototype=Buffer.prototype;
 define(Buffer,Symbol.species,{get:function(){return FastBuffer},configurable:true});
 function method(target,name,fn){if(fn.name==='')define(fn,'name',{value:String(name),configurable:true});define(target,name,{value:fn,writable:true,enumerable:true,configurable:true})}
 method(Buffer,'from',function from(value,enc,length){
  if(typeof value==='string')return wrap(encodeString(value,encoding(enc,false)));
  if(value instanceof AB||value instanceof SAB){var offset=enc===undefined?0:Number(enc);if(offset!==offset)offset=0;offset=Math.trunc(offset);if(offset<0||offset>value.byteLength)error(RangeError,'ERR_BUFFER_OUT_OF_BOUNDS','offset is outside buffer bounds');if(length!==undefined){length=Math.trunc(Number(length));if(length!==length)length=0;if(length<0||offset+length>value.byteLength)error(RangeError,'ERR_BUFFER_OUT_OF_BOUNDS','length is outside buffer bounds')}return wrap(length===undefined?new U8(value,offset):new U8(value,offset,length))}
  if(value===null||value===undefined||typeof value==='number')type('The first argument must be a string, Buffer, ArrayBuffer, Array, or array-like object');
  if(typeof value==='object'||typeof value==='function'){
   if(typeof value.valueOf==='function'){var primitive=value.valueOf();if(primitive!==value&&primitive!==null&&primitive!==undefined)return bufferFrom(primitive,enc,length)}
   if(value.type==='Buffer'&&Array.isArray(value.data))return wrap(new U8(value.data));
   if(AB.isView(value)||'length' in value){var n=typeof value.length==='number'?Math.max(0,Math.trunc(value.length)||0):0;size(n);var out=new U8(n);for(var i=0;i<n;i++)out[i]=value[i];return wrap(out)}
   if(typeof value[Symbol.toPrimitive]==='function')return bufferFrom(value[Symbol.toPrimitive]('string'),enc,length)
  }
  type('The first argument must be a string, Buffer, ArrayBuffer, Array, or array-like object')
 });
 method(Buffer,'alloc',function alloc(length,fill,enc){var out=wrap(new U8(size(length)));if(fill!==undefined)out.fill(fill,0,out.length,enc);return out});
 function unsafe(length,alignment){length=size(length);if(alignment!==undefined){integer(alignment,'alignment',1,1073741824);if((alignment&(alignment-1))!==0)error(TypeError,'ERR_INVALID_ARG_VALUE','alignment must be a power of two');var backing=new AB(size(length+alignment-1)),start=typeof __nonaRegexpVm.arrayBufferAlignment==='function'?__nonaRegexpVm.arrayBufferAlignment(backing,alignment):0;return wrap(new U8(backing,start,length))}return wrap(new U8(length))}
 method(Buffer,'allocUnsafe',unsafe);method(Buffer,'allocUnsafeSlow',unsafe);
 method(Buffer,'isBuffer',function isBuffer(value){return value instanceof Buffer});
 method(Buffer,'isEncoding',function isEncoding(enc){if(typeof enc!=='string'||enc==='')return false;try{encoding(enc,true);return true}catch(e){return false}});
 method(Buffer,'byteLength',function byteLength(value,enc){if(value instanceof AB||value instanceof SAB||AB.isView(value))return value.byteLength;if(typeof value!=='string')type('string must be a string, Buffer or ArrayBuffer');try{enc=encoding(enc,false)}catch(e){enc='utf8'}if(enc==='hex')return value.length>>>1;if(enc==='latin1'||enc==='ascii')return value.length;if(enc==='utf16le')return value.length*2;if(enc==='base64'||enc==='base64url'){var n=value.length;if(n>0&&value[n-1]==='=')n--;if(n>0&&value[n-1]==='=')n--;return Math.floor(n*3/4)}return encodeString(value,enc).length});
 method(Buffer,'compare',function compare(a,b){bytes(a);bytes(b);var n=Math.min(a.length,b.length);for(var i=0;i<n;i++){if(a[i]<b[i])return -1;if(a[i]>b[i])return 1}return a.length<b.length?-1:a.length>b.length?1:0});
 method(Buffer,'concat',function concat(list,totalLength){if(!Array.isArray(list))type('list must be an Array');if(list.length===0)return bufferAlloc(0);var n=0;for(var i=0;i<list.length;i++){bytes(list[i]);n+=list[i].length}if(totalLength!==undefined)n=size(totalLength);var out=bufferAlloc(n),p=0;for(i=0;i<list.length&&p<n;i++){var item=list[i],count=Math.min(n-p,item.length);apply(u8set,out,[apply(u8sub,item,[0,count]),p]);p+=count}return out});
 method(Buffer,'copyBytesFrom',function copyBytesFrom(view,offset,length){if(!AB.isView(view)||view instanceof DV)type('view must be a TypedArray');var count=view.length;if(offset===undefined)offset=0;else integer(offset,'offset',0,Number.MAX_SAFE_INTEGER);if(length===undefined)length=Math.max(0,count-offset);else integer(length,'length',0,Number.MAX_SAFE_INTEGER);length=Math.min(length,Math.max(0,count-offset));if(length===0)return bufferAlloc(0);var width=view.BYTES_PER_ELEMENT,raw=new U8(view.buffer,view.byteOffset+offset*width,length*width);return bufferFrom(raw)});
 var bufferAlloc=Buffer.alloc,bufferFrom=Buffer.from,bufferConcat=Buffer.concat,bufferCompare=Buffer.compare;
 Buffer.poolSize=65536;
 function bound(value,length){value=Number(value);if(value!==value)value=0;value=Math.trunc(value);return value<0?Math.max(length+value,0):Math.min(value,length)}
 function stringBound(value,length,fallback){if(value===undefined)return fallback;value=Number(value);if(value!==value||value<0)return 0;return Math.min(Math.trunc(value),length)}
 method(Buffer.prototype,'subarray',function subarray(start,end){bytes(this);var first=bound(start===undefined?0:start,this.length),last=bound(end===undefined?this.length:end,this.length);return wrap(new U8(this.buffer,this.byteOffset+first,Math.max(0,last-first)))});
 method(Buffer.prototype,'slice',Buffer.prototype.subarray);
 method(Buffer.prototype,'toString',function toString(enc,start,end){bytes(this);if(this.length===0)return '';var first=stringBound(start,this.length,0),last=stringBound(end,this.length,this.length);if(last<=first)return '';if(enc!==undefined&&enc!=='')enc=String(enc);if(enc==='null'||enc==='false'||enc==='0')error(TypeError,'ERR_UNKNOWN_ENCODING','Unknown encoding: '+enc);return decodeBytes(apply(u8sub,this,[first,last]),encoding(enc,true))});
 method(Buffer.prototype,'toLocaleString',Buffer.prototype.toString);
 method(Buffer.prototype,'toJSON',function toJSON(){bytes(this);return {type:'Buffer',data:Array.from(this)}});
 method(Buffer.prototype,'equals',function equals(other){return bufferCompare(this,other)===0});
 method(Buffer.prototype,'compare',function compare(target,targetStart,targetEnd,sourceStart,sourceEnd){bytes(this);bytes(target);targetStart=targetStart===undefined?0:integer(targetStart,'targetStart',0,Number.MAX_SAFE_INTEGER);targetEnd=targetEnd===undefined?target.length:integer(targetEnd,'targetEnd',0,target.length);sourceStart=sourceStart===undefined?0:integer(sourceStart,'sourceStart',0,Number.MAX_SAFE_INTEGER);sourceEnd=sourceEnd===undefined?this.length:integer(sourceEnd,'sourceEnd',0,this.length);return bufferCompare(apply(u8sub,this,[sourceStart,sourceEnd]),apply(u8sub,target,[targetStart,targetEnd]))});
 method(Buffer.prototype,'copy',function copy(target,targetStart,sourceStart,sourceEnd){bytes(this);bytes(target);targetStart=targetStart===undefined?0:Math.trunc(Number(targetStart))||0;sourceStart=sourceStart===undefined?0:Math.trunc(Number(sourceStart))||0;sourceEnd=sourceEnd===undefined?this.length:Math.trunc(Number(sourceEnd))||0;if(targetStart<0||sourceStart<0||sourceStart>this.length||sourceEnd<0)range('copy index is out of range');var n=Math.max(0,Math.min(sourceEnd,this.length)-sourceStart);n=Math.min(n,Math.max(0,target.length-targetStart));if(n===0)return 0;apply(u8set,target,[apply(u8sub,this,[sourceStart,sourceStart+n]),targetStart]);return n});
 method(Buffer.prototype,'fill',function fill(value,start,end,enc){bytes(this);if(typeof start==='string'){enc=start;start=0;end=this.length}else if(typeof end==='string'){enc=end;end=this.length}start=start===undefined?0:integer(start,'offset',0,Number.MAX_SAFE_INTEGER);end=end===undefined?this.length:integer(end,'end',0,this.length);if(typeof value==='string'){enc=encoding(enc,true);if(value==='')value=0;else value=encodeString(value,enc)}else if(!(value instanceof U8))value=Number(value)&255;if(end<=start)return this;if(value instanceof U8){if(value.length===0)error(TypeError,'ERR_INVALID_ARG_VALUE','value is invalid for fill');var pattern=new U8(value);for(var i=start;i<end;i++)this[i]=pattern[(i-start)%pattern.length]}else for(var j=start;j<end;j++)this[j]=value;return this});
 method(Buffer.prototype,'write',function write(text,offset,length,enc){bytes(this);if(typeof text!=='string')type('string must be a string');if(offset===undefined){offset=0;length=this.length;enc='utf8'}else if(typeof offset==='string'){enc=offset;offset=0;length=this.length}else{integer(offset,'offset',0,this.length);if(typeof length==='string'){enc=length;length=this.length-offset}else if(length===undefined)length=this.length-offset;else integer(length,'length',0,maxLength)}enc=encoding(enc?String(enc):undefined,true);var raw=encodeString(text,enc),n=Math.min(length,this.length-offset,raw.length);if(enc==='utf8'&&n<raw.length){while(n>0&&(raw[n]&192)===128)n--}if(enc==='utf16le')n-=n%2;apply(u8set,this,[apply(u8sub,raw,[0,n]),offset]);return n});
 function search(haystack,value,start,end,enc,reverse){
  bytes(haystack);var n=haystack.length;
  // Node 26 adds an optional exclusive end bound to the search methods.
  if(typeof start==='string'){enc=start;start=undefined;end=undefined}else if(typeof end==='string'){enc=end;end=undefined}
  var unicode=false;
  if(typeof value==='string'){enc=encoding(enc,false);unicode=enc==='utf16le';value=encodeString(value,enc)}else if(typeof value==='number')value=new U8([value]);else bytes(value);
  var step=unicode?2:1,needle=value.length;
  if(unicode){n-=n%2;needle-=needle%2;if(needle===0&&value.length>0)return -1}
  var limit=end===undefined?n:bound(end,n);
  if(start===undefined)start=reverse?(needle===0?limit:limit-1):0;else {start=Number(start);if(start!==start)start=reverse?(needle===0?limit:limit-1):0;else start=Math.trunc(start);if(start<0)start+=n}
  if(needle===0)return Math.min(limit,Math.max(0,start));
  if(reverse){if(start<0)return -1;start=Math.min(start,limit-needle)}else{start=Math.max(0,start);if(start>=limit)return -1}
  if(unicode)start-=start%2;
  for(var i=start;reverse?i>=0:i+needle<=limit;i+=reverse?-step:step){var same=true;for(var j=0;j<needle;j++)if(haystack[i+j]!==value[j]){same=false;break}if(same&&i+needle<=limit)return i}
  return -1
 }
 method(Buffer.prototype,'indexOf',function indexOf(value,start,end,enc){return search(this,value,start,end,enc,false)});
 method(Buffer.prototype,'lastIndexOf',function lastIndexOf(value,start,end,enc){return search(this,value,start,end,enc,true)});
 method(Buffer.prototype,'includes',function includes(value,start,end,enc){return search(this,value,start,end,enc,false)!==-1});
 function swap(buffer,width){bytes(buffer);if(buffer.length%width!==0)error(RangeError,'ERR_INVALID_BUFFER_SIZE','Buffer size must be a multiple of '+width*8+'-bits');for(var i=0;i<buffer.length;i+=width)for(var j=0;j<width/2;j++){var c=buffer[i+j];buffer[i+j]=buffer[i+width-j-1];buffer[i+width-j-1]=c}return buffer}
 method(Buffer.prototype,'swap16',function swap16(){return swap(this,2)});method(Buffer.prototype,'swap32',function swap32(){return swap(this,4)});method(Buffer.prototype,'swap64',function swap64(){return swap(this,8)});
 function offset(buffer,value,width){bytes(buffer);value=value===undefined?0:integer(value,'offset',0,maxLength);if(value+width>buffer.length)error(RangeError,buffer.length<width?'ERR_BUFFER_OUT_OF_BOUNDS':'ERR_OUT_OF_RANGE','Attempt to access memory outside buffer bounds');return value}
 function width(value){return integer(value,'byteLength',1,6)}
 function readNumber(buffer,index,count,little,signed){index=offset(buffer,index,count);var result=0;for(var i=0;i<count;i++)result=result*256+buffer[index+(little?count-i-1:i)];if(signed&&result>=Math.pow(2,count*8-1))result-=Math.pow(2,count*8);return result}
 function writeNumber(buffer,value,index,count,little,signed){value=+value;var high=Math.pow(2,count*8-(signed?1:0));if(value< (signed?-high:0)||value>high-1)range('value is out of range');index=offset(buffer,index,count);value=Math.trunc(value)||0;if(value<0)value+=Math.pow(2,count*8);for(var i=0;i<count;i++){buffer[index+(little?i:count-i-1)]=value%256;value=Math.floor(value/256)}return index+count}
 for(var signed of [false,true])for(var little of [false,true]){
  (function(signed,little){var name=signed?'Int':'UInt',order=little?'LE':'BE';method(Buffer.prototype,'read'+name+order,function(index,count){integer(index,'offset',0,maxLength);return readNumber(this,index,width(count),little,signed)});method(Buffer.prototype,'write'+name+order,function(value,index,count){integer(index,'offset',0,maxLength);return writeNumber(this,value,index,width(count),little,signed)});
   for(var count of [1,2,4])(function(count){var suffix=name+(count*8)+(count===1?'':order);method(Buffer.prototype,'read'+suffix,function(index){return readNumber(this,index,count,little,signed)});method(Buffer.prototype,'write'+suffix,function(value,index){return writeNumber(this,value,index,count,little,signed)})})(count)
  })(signed,little)
 }
 function dataView(buffer,index,count){index=offset(buffer,index,count);return new DV(buffer.buffer,buffer.byteOffset+index,count)}
 for(var little of [false,true])for(var float of [true,false]){
  (function(little,float){var count=float?4:8,name=(float?'Float':'Double')+(little?'LE':'BE'),get=float?'getFloat32':'getFloat64',set=float?'setFloat32':'setFloat64';method(Buffer.prototype,'read'+name,function(index){return dataView(this,index,count)[get](0,little)});method(Buffer.prototype,'write'+name,function(value,index){value=+value;index=offset(this,index,count);dataView(this,index,count)[set](0,value,little);return index+count})})(little,float)
 }
 for(var little of [false,true])for(var signed of [false,true]){
  (function(little,signed){var name='Big'+(signed?'Int':'UInt')+'64'+(little?'LE':'BE'),get=signed?'getBigInt64':'getBigUint64',set=signed?'setBigInt64':'setBigUint64';method(Buffer.prototype,'read'+name,function(index){return dataView(this,index,8)[get](0,little)});method(Buffer.prototype,'write'+name,function(value,index){if(typeof value!=='bigint')type('value must be a bigint');var min=signed?-(1n<<63n):0n,max=signed?(1n<<63n)-1n:(1n<<64n)-1n;if(value<min||value>max)range('value is out of range');index=offset(this,index,8);dataView(this,index,8)[set](0,value,little);return index+8})})(little,signed)
 }
 for(var name of Object.keys(Buffer.prototype))if(name.indexOf('UInt')!==-1)method(Buffer.prototype,name.replace('UInt','Uint'),Buffer.prototype[name]);
 define(Buffer.prototype,'parent',{get:function(){return this instanceof Buffer?this.buffer:undefined},enumerable:true,configurable:true});
 define(Buffer.prototype,'offset',{get:function(){return this instanceof Buffer?this.byteOffset:undefined},enumerable:true,configurable:true});
 method(Buffer.prototype,'inspect',function inspect(){var n=Math.min(this.length,__nonaRegexpVm.bufferModule.INSPECT_MAX_BYTES),parts=[];for(var i=0;i<n;i++)parts.push(hex[this[i]>>4]+hex[this[i]&15]);var text=parts.join(' ');if(this.length>n)text+=' ... '+(this.length-n)+' more byte'+(this.length-n===1?'':'s');return '<Buffer '+text+'>'});
 method(Buffer.prototype,Symbol.for('nodejs.util.inspect.custom'),Buffer.prototype.inspect);
 function SlowBuffer(length){length=+length;if(length!==length)length=0;return bufferAlloc(length)}
 function rawInput(value){if(value instanceof AB||value instanceof SAB)return new U8(value);if(AB.isView(value))return new U8(value.buffer,value.byteOffset,value.byteLength);type('input must be an ArrayBuffer or ArrayBufferView')}
 function isAscii(value){var raw=rawInput(value);for(var i=0;i<raw.length;i++)if(raw[i]>127)return false;return true}
 var fatalDecoder=new TextDecoder('utf8',{fatal:true,ignoreBOM:true});
 function isUtf8(value){var raw=rawInput(value);try{apply(decode,fatalDecoder,[raw]);return true}catch(e){return false}}
 function btoa(value){value=String(value);for(var i=0;i<value.length;i++)if(value.charCodeAt(i)>255){var e=new Error('Invalid character');e.name='InvalidCharacterError';e.code=5;throw e}return decodeBytes(encodeString(value,'latin1'),'base64')}
 function atob(value){value=String(value).replace(/[\t\n\f\r ]/g,'');if(value.length%4===0)value=value.replace(/==?$/,'');if(value.length%4===1||/[^A-Za-z0-9+/]/.test(value)){var e=new Error('Invalid character');e.name='InvalidCharacterError';e.code=5;throw e}return decodeBytes(encodeString(value,'base64'),'latin1')}
 function transcode(source,from,to){
  bytes(source);try{from=encoding(from,true);to=encoding(to,true)}catch(e){error(Error,'U_ILLEGAL_ARGUMENT_ERROR','Unable to transcode Buffer')}
  if((from!=='utf8'&&from!=='utf16le'&&from!=='ascii'&&from!=='latin1')||(to!=='utf8'&&to!=='utf16le'&&to!=='ascii'&&to!=='latin1'))error(Error,'U_ILLEGAL_ARGUMENT_ERROR','Unable to transcode Buffer');
  if(source.length===0)return bufferAlloc(0);
  // Node's direct UTF-8/UTF-16 conversion paths reject malformed input.
  if(from==='utf8'&&to==='utf16le'&&!isUtf8(source))error(Error,'U_INVALID_CHAR_FOUND','Unable to transcode Buffer');
  var text=decodeBytes(source,from);
  if(from==='ascii'){text='';for(var j=0;j<source.length;j++)text+=String.fromCharCode(source[j]>127&&to!=='utf16le'?65533:source[j])}
  if(from==='utf16le'){
   if(to==='utf8'){
    if(text.length===0)error(Error,'U_INVALID_CHAR_FOUND','Unable to transcode Buffer');
    for(var j=0;j<text.length;j++){var c=text.charCodeAt(j);if(c>=0xd800&&c<0xdc00){if(j+1>=text.length||text.charCodeAt(j+1)<0xdc00||text.charCodeAt(j+1)>=0xe000)error(Error,'U_INVALID_CHAR_FOUND','Unable to transcode Buffer');j++}else if(c>=0xdc00&&c<0xe000)error(Error,'U_INVALID_CHAR_FOUND','Unable to transcode Buffer')}
   }else{if(to==='utf16le'&&source.length%2!==0)text+='\ufffd';text=decodeBytes(encodeString(text,'utf8'),'utf8')}
  }
  if(to==='ascii'||to==='latin1'){var result=[];for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);if(c>=0xd800&&c<0xdc00&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<0xe000)i++;result.push(c>(to==='ascii'?127:255)?63:c)}return bufferFrom(result)}
  return bufferFrom(text,to)
 }
 var blobBrand=new WeakMap(),fileBrand=new WeakMap(),nativeNewline='\n';
 function blobState(value){var state=blobBrand.get(value);if(state===undefined)error(TypeError,'ERR_INVALID_THIS','Value of this must be of type Blob');return state}
 function mime(value){value=value===undefined?'':String(value);for(var i=0;i<value.length;i++){var c=value.charCodeAt(i);if(c<32||c>126)return ''}return value.toLowerCase()}
 function initializeBlob(value,sources,options){
  if(options===undefined||options===null)options={};else if(typeof options!=='object')type('options must be an object');
  var ending=options.endings===undefined?'transparent':String(options.endings);if(ending!=='transparent'&&ending!=='native')error(TypeError,'ERR_INVALID_ARG_VALUE','endings must be transparent or native');
  if(sources===undefined)sources=[];if(sources===null||typeof sources!=='object'||typeof sources[Symbol.iterator]!=='function')type('sources must be a sequence');
  var list=[];
  for(var source of sources){
   if(blobBrand.has(source)){var nested=blobState(source),begin=0;for(var partEnd of nested.ends){list.push(apply(u8sub,nested.bytes,[begin,partEnd]));begin=partEnd}}
   else if(source instanceof AB||source instanceof SAB||AB.isView(source))list.push(bufferFrom(rawInput(source)));
   else{var text=String(source);if(ending==='native')text=text.replace(/\r\n|\r|\n/g,nativeNewline);list.push(bufferFrom(text))}
  }
  var ends=[],total=0;for(var part of list){total+=part.length;if(part.length)ends.push(total)}blobBrand.set(value,{bytes:bufferConcat(list),ends:ends,type:mime(options.type)})
 }
 function Blob(sources,options){if(new.target===undefined)throw new TypeError("Class constructor Blob cannot be invoked without 'new'");initializeBlob(this,sources,options)}
 function getter(target,name,get){define(target,name,{get:get,enumerable:true,configurable:true})}
 getter(Blob.prototype,'size',function(){return blobState(this).bytes.length});getter(Blob.prototype,'type',function(){return blobState(this).type});
 method(Blob.prototype,'slice',function slice(start,end,type){var state=blobState(this),first=bound(start===undefined?0:start,state.bytes.length),last=Math.max(first,bound(end===undefined?state.bytes.length:end,state.bytes.length)),ends=[];for(var edge of state.ends)if(edge>first)ends.push(Math.min(edge,last)-first);ends=ends.filter(function(edge,i){return edge>0&&(i===0||edge!==ends[i-1])});var result=Object.create(Blob.prototype);blobBrand.set(result,{bytes:bufferFrom(apply(u8sub,state.bytes,[first,last])),ends:ends,type:mime(type)});return result});
 method(Blob.prototype,'arrayBuffer',function arrayBuffer(){try{var raw=bufferFrom(blobState(this).bytes);return Promise.resolve(raw.buffer)}catch(e){return Promise.reject(e)}});
 method(Blob.prototype,'bytes',function bytes_(){try{return Promise.resolve(new U8(blobState(this).bytes))}catch(e){return Promise.reject(e)}});
 method(Blob.prototype,'text',function text(){try{return Promise.resolve(decodeBytes(blobState(this).bytes,'utf8'))}catch(e){return Promise.reject(e)}});
 // Blob streams are immutable sources: every reader owns its cursor and copies.
 var streamBrand=new WeakMap(),readerBrand=new WeakMap();
 function streamState(value){var s=streamBrand.get(value);if(s===undefined)error(TypeError,'ERR_INVALID_THIS','Expected a ReadableStream');return s}
 function readerState(value){var r=readerBrand.get(value);if(r===undefined)error(TypeError,'ERR_INVALID_THIS','Expected a stream reader');return r}
 function streamError(message){var e=new TypeError(message);e.code='ERR_INVALID_STATE';return e}
 function ReadableStream(){throw streamError('Construct Blob streams with Blob.stream() or Blob.textStream()')}
 function makeStream(data,text,ends){var result=Object.create(ReadableStream.prototype);streamBrand.set(result,{data:data,ends:ends||[data.length],text:text,position:0,bom:false,reader:null,closed:false,disturbed:false});return result}
 function completeUtf8End(data,start,end){if(end===data.length)return end;var lead=end-1;while(lead>=start&&(data[lead]&192)===128)lead--;if(lead<start)return end;var c=data[lead],width=c>=194&&c<=223?2:c>=224&&c<=239?3:c>=240&&c<=244?4:1;return end-lead<width?lead:end}
 function finishStream(s){s.closed=true;if(s.reader){var r=readerState(s.reader);r.resolveClosed()}}
 function finishTee(s){var group=s.teeGroup;if(group&&!group.cancelled[s.teeIndex]&&!group.done){group.done=true;group.source.position=group.source.data.length;finishStream(group.source);finishTee(group.source);group.resolve()}}
 function cancelStream(s,reason){s.disturbed=true;var group=s.teeGroup;if(group&&!group.done&&!group.cancelled[s.teeIndex]){group.cancelled[s.teeIndex]=true;group.reasons[s.teeIndex]=reason;finishStream(s);if(!group.done&&group.cancelled[0]&&group.cancelled[1]){group.done=true;var completion=cancelStream(group.source,group.reasons);completion.then(group.resolve,group.reject)}return group.promise}if(s.closed)return Promise.resolve();finishStream(s);return Promise.resolve()}
 getter(ReadableStream.prototype,'locked',function(){return streamState(this).reader!==null});
 function ReadableStreamDefaultReader(stream){if(new.target===undefined)throw new TypeError('Reader requires new');initializeReader(this,stream,false)}
 function ReadableStreamBYOBReader(stream){if(new.target===undefined)throw new TypeError('Reader requires new');initializeReader(this,stream,true)}
 function initializeReader(reader,stream,byob){var s=streamState(stream);if(s.reader!==null)throw streamError('ReadableStream is locked');if(byob&&s.text)error(TypeError,'ERR_INVALID_ARG_VALUE','The stream must be a byte stream');var r={stream:stream,byob:byob,released:false,resolveClosed:null,rejectClosed:null,closed:null};r.closed=new Promise(function(resolve,reject){r.resolveClosed=resolve;r.rejectClosed=reject});r.closed.catch(function(){});readerBrand.set(reader,r);s.reader=reader;if(s.closed)r.resolveClosed()}
 method(ReadableStream.prototype,'getReader',function getReader(options){options=options===undefined?{}:options;if(options===null||typeof options!=='object')type('options must be an object');if(options.mode===undefined)return new ReadableStreamDefaultReader(this);if(String(options.mode)!=='byob')error(TypeError,'ERR_INVALID_ARG_VALUE','Invalid reader mode');return new ReadableStreamBYOBReader(this)});
 function transferBytes(view){var old=view.buffer,copy=new U8(old.byteLength);apply(u8set,copy,[new U8(old)]);if(typeof __nonaRegexpVm.arrayBufferDetach==='function')__nonaRegexpVm.arrayBufferDetach(old);else old.transfer();return copy.buffer}
 function readStream(reader,view,options){try{var r=readerState(reader);if(r.released)throw streamError('Reader has been released');var s=streamState(r.stream);s.disturbed=true;var value,n;
  if(r.byob){if(!AB.isView(view))type('view must be an ArrayBuffer view');if(view.byteLength===0)throw streamError('view must be nonempty');if(!(view.buffer instanceof AB))error(TypeError,'ERR_INVALID_ARG_VALUE','view must have transferable storage');var ctor=view.constructor,offset=view.byteOffset,length=view.byteLength,unit=view instanceof DV?1:view.BYTES_PER_ELEMENT,min=options===undefined||options.min===undefined?1:Number(options.min);if(!Number.isInteger(min)||min<1||min>length/unit)range('min is out of range');var backing=transferBytes(view);n=s.closed?0:Math.min(length,s.data.length-s.position);if(!s.closed)for(var edge of s.ends){var available=Math.min(length,edge-s.position);available-=available%unit;if(available>=min*unit){n=available;break}}n-=n%unit;if(!s.closed&&n===0&&s.position<s.data.length)throw streamError('The remaining bytes cannot fill an element');var out=new U8(backing,offset,n);apply(u8set,out,[apply(u8sub,s.data,[s.position,s.position+n])]);s.position+=n;value=view instanceof DV?new DV(backing,offset,n):new ctor(backing,offset,n/unit);
  }else{if(s.closed||s.position===s.data.length){finishStream(s);finishTee(s);return Promise.resolve({value:undefined,done:true})}var end=s.data.length;for(var edge of s.ends)if(edge>s.position){end=edge;break}if(s.text){var complete=completeUtf8End(s.data,s.position,end);while(complete===s.position&&end<s.data.length){for(var edge of s.ends)if(edge>end){end=edge;break}complete=completeUtf8End(s.data,s.position,end)}end=complete;value=decodeBytes(apply(u8sub,s.data,[s.position,end]),'utf8');if(!s.bom){s.bom=true;if(value.charCodeAt(0)===65279)value=value.slice(1)}n=end-s.position;s.position=end;if(value==='')return readStream(reader)}else{n=end-s.position;value=new U8(apply(u8sub,s.data,[s.position,end]));s.position=end}}
  if(n===0){finishStream(s);finishTee(s);return Promise.resolve({value:value,done:true})}if(s.position===s.data.length)finishStream(s);return Promise.resolve({value:value,done:false})
 }catch(e){return Promise.reject(e)}}
 function cancelReader(reason){try{var r=readerState(this);if(r.released)throw streamError('Reader has been released');return cancelStream(streamState(r.stream),reason)}catch(e){return Promise.reject(e)}}
 function releaseReader(){var r=readerState(this);if(r.released)return;var s=streamState(r.stream);s.reader=null;r.released=true;r.rejectClosed(streamError('Reader has been released'));r.closed=Promise.reject(streamError('Reader has been released'));r.closed.catch(function(){})}
 for(var readerCtor of [ReadableStreamDefaultReader,ReadableStreamBYOBReader]){getter(readerCtor.prototype,'closed',function(){return readerState(this).closed});method(readerCtor.prototype,'cancel',cancelReader);method(readerCtor.prototype,'releaseLock',releaseReader);define(readerCtor.prototype,Symbol.toStringTag,{value:readerCtor.name,configurable:true})}
 method(ReadableStreamDefaultReader.prototype,'read',function read(){return readStream(this)});method(ReadableStreamBYOBReader.prototype,'read',function read(view,options){return readStream(this,view,options)});
 method(ReadableStream.prototype,'cancel',function cancel(reason){try{var s=streamState(this);if(s.reader!==null)throw streamError('ReadableStream is locked');return cancelStream(s,reason)}catch(e){return Promise.reject(e)}});
 method(ReadableStream.prototype,'values',function values(options){var stream=this,reader=stream.getReader(),done=false,prevent=!!(options&&options.preventCancel);var iterator={next:function(){if(done)return Promise.resolve({done:true,value:undefined});return reader.read().then(function(result){if(result.done){done=true;reader.releaseLock()}return result})},return:function(value){if(done)return Promise.resolve({done:true,value:value});done=true;var result=prevent?Promise.resolve():reader.cancel(value);reader.releaseLock();return result.then(function(){return {done:true,value:value}})}};method(iterator,Symbol.asyncIterator,function(){return this});return iterator});
 method(ReadableStream.prototype,Symbol.asyncIterator,ReadableStream.prototype.values);
 method(ReadableStream.prototype,'tee',function tee(){var s=streamState(this);if(s.reader!==null)throw streamError('ReadableStream is locked');this.getReader();var remaining=s.closed?new U8(0):apply(u8sub,s.data,[s.position]),ends=s.ends.filter(function(edge){return edge>s.position}).map(function(edge){return edge-s.position}),branches=[makeStream(remaining,s.text,ends),makeStream(remaining,s.text,ends)],group={source:s,cancelled:[false,false],reasons:[undefined,undefined],done:s.closed,promise:null,resolve:null,reject:null};group.promise=new Promise(function(resolve,reject){group.resolve=resolve;group.reject=reject});if(group.done)group.resolve();for(var i=0;i<2;i++){var branch=streamState(branches[i]);branch.teeGroup=group;branch.teeIndex=i;if(s.closed)finishStream(branch)}return branches});
 method(ReadableStream.prototype,'pipeTo',function pipeTo(destination,options){var source=this;options=options||{};try{streamState(source);if(!destination||typeof destination.getWriter!=='function')type('destination must be a WritableStream');var signal=options.signal;if(signal!==undefined&&(signal===null||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))type('signal must be an AbortSignal');if(source.locked||destination.locked)throw streamError('Stream is locked');var reader=source.getReader(),writer=destination.getWriter(),stopped=false,abort=null;
  function release(){if(signal&&abort)signal.removeEventListener('abort',abort);reader.releaseLock();writer.releaseLock()}
  function pump(){if(stopped)return;return reader.read().then(function(result){if(stopped)return;if(result.done)return options.preventClose?undefined:writer.close();return Promise.resolve(writer.write(result.value)).then(pump)})}
  var aborted=new Promise(function(resolve,reject){abort=function(){stopped=true;reject(signal.reason)};if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true})}}),pumping=signal&&signal.aborted?aborted:pump();if(signal)pumping=Promise.race([pumping,aborted]);return pumping.then(function(){release()},function(e){stopped=true;var tasks=[];if(!options.preventCancel)tasks.push(reader.cancel(e));if(!options.preventAbort)tasks.push(writer.abort(e));return Promise.all(tasks).then(function(){release();throw e},function(cause){release();throw cause})})
 }catch(e){return Promise.reject(e)}});
 method(ReadableStream.prototype,'pipeThrough',function pipeThrough(transform,options){if(!transform||!transform.readable||!transform.writable)type('transform must contain readable and writable');if(this.locked||transform.writable.locked)throw streamError('Stream is locked');this.pipeTo(transform.writable,options).catch(function(){});return transform.readable});
 define(ReadableStream.prototype,Symbol.toStringTag,{value:'ReadableStream',configurable:true});
 // A writer queue lets Blob piping respect asynchronous sink backpressure.
 var writableBrand=new WeakMap(),writerBrand=new WeakMap();
 function writableState(value){var s=writableBrand.get(value);if(!s)throw streamError('Expected a WritableStream');return s}
 function writerState(value){var r=writerBrand.get(value);if(!r||r.released)throw streamError('Writer has been released');return r}
 function failWritable(s,e){if(s.state==='closed'||s.state==='errored')return;s.state='errored';s.failure=e;if(s.writer)writerBrand.get(s.writer).rejectClosed(e)}
 function WritableStream(sink){if(new.target===undefined)throw new TypeError('WritableStream requires new');sink=sink||{};if(typeof sink!=='object')type('sink must be an object');var s={sink:sink,writer:null,state:'writable',failure:undefined,queue:Promise.resolve()};writableBrand.set(this,s);if(sink.start)s.queue=Promise.resolve(sink.start({error:function(e){failWritable(s,e)}})).then(undefined,function(e){failWritable(s,e);throw e});s.queue.catch(function(){})}
 getter(WritableStream.prototype,'locked',function(){return writableState(this).writer!==null});
 function WritableStreamDefaultWriter(stream){if(new.target===undefined)throw new TypeError('Writer requires new');var s=writableState(stream);if(s.writer)throw streamError('WritableStream is locked');var r={stream:stream,released:false,closed:null,resolveClosed:null,rejectClosed:null};r.closed=new Promise(function(resolve,reject){r.resolveClosed=resolve;r.rejectClosed=reject});r.closed.catch(function(){});writerBrand.set(this,r);s.writer=this;if(s.state==='closed')r.resolveClosed();if(s.state==='errored')r.rejectClosed(s.failure)}
 method(WritableStream.prototype,'getWriter',function getWriter(){return new WritableStreamDefaultWriter(this)});
 getter(WritableStreamDefaultWriter.prototype,'closed',function(){return writerState(this).closed});getter(WritableStreamDefaultWriter.prototype,'ready',function(){var r=writerState(this);return writableState(r.stream).queue});getter(WritableStreamDefaultWriter.prototype,'desiredSize',function(){return writableState(writerState(this).stream).state==='errored'?null:1});
 function sinkOperation(writer,operation,value){try{var r=writerState(writer),s=writableState(r.stream);if(s.state==='errored')return Promise.reject(s.failure);if(s.state!=='writable')throw streamError('WritableStream is closed');if(operation==='close')s.state='closing';var result=s.queue.then(function(){if(s.state==='errored')throw s.failure;return s.sink[operation]?s.sink[operation](value):undefined});s.queue=result.then(function(){if(operation==='close'){s.state='closed';r.resolveClosed()}},function(e){s.state='errored';s.failure=e;r.rejectClosed(e);throw e});s.queue.catch(function(){});return result}catch(e){return Promise.reject(e)}}
 method(WritableStreamDefaultWriter.prototype,'write',function write(value){return sinkOperation(this,'write',value)});method(WritableStreamDefaultWriter.prototype,'close',function close(){return sinkOperation(this,'close')});
 method(WritableStreamDefaultWriter.prototype,'abort',function abort(reason){try{var r=writerState(this),s=writableState(r.stream);if(s.state==='closed'||s.state==='errored')return Promise.resolve();s.state='errored';s.failure=reason;r.rejectClosed(reason);return s.queue.then(function(){return s.sink.abort?s.sink.abort(reason):undefined},function(){return s.sink.abort?s.sink.abort(reason):undefined})}catch(e){return Promise.reject(e)}});
 method(WritableStreamDefaultWriter.prototype,'releaseLock',function releaseLock(){var r=writerBrand.get(this);if(!r)throw streamError('Expected a writer');if(r.released)return;writableState(r.stream).writer=null;r.released=true;r.rejectClosed(streamError('Writer has been released'))});
 method(WritableStream.prototype,'close',function close(){try{if(this.locked)throw streamError('WritableStream is locked');var writer=this.getWriter();return writer.close().then(function(){writer.releaseLock()},function(e){writer.releaseLock();throw e})}catch(e){return Promise.reject(e)}});
 method(WritableStream.prototype,'abort',function abort(reason){try{if(this.locked)throw streamError('WritableStream is locked');var writer=this.getWriter();return writer.abort(reason).then(function(){writer.releaseLock()},function(e){writer.releaseLock();throw e})}catch(e){return Promise.reject(e)}});
 define(WritableStream.prototype,Symbol.toStringTag,{value:'WritableStream',configurable:true});define(WritableStreamDefaultWriter.prototype,Symbol.toStringTag,{value:'WritableStreamDefaultWriter',configurable:true});
 method(Blob.prototype,'stream',function stream(){var s=blobState(this);return makeStream(s.bytes,false,s.ends)});method(Blob.prototype,'textStream',function textStream(){var s=blobState(this);return makeStream(s.bytes,true,s.ends)});
 define(Blob.prototype,Symbol.toStringTag,{value:'Blob',configurable:true});
 function File(sources,name,options){if(new.target===undefined)throw new TypeError("Class constructor File cannot be invoked without 'new'");if(arguments.length<2)error(TypeError,'ERR_MISSING_ARGS','The fileBits and fileName arguments must be specified');initializeBlob(this,sources,options);var modified=options===undefined||options===null?undefined:options.lastModified;modified=modified===undefined?Date.now():Number(modified);if(modified!==modified)modified=0;fileBrand.set(this,{name:apply(decode,decoder,[encodeString(String(name),'utf8')]),lastModified:modified})}
 setProto(File,Blob);File.prototype=Object.create(Blob.prototype);define(File.prototype,'constructor',{value:File,writable:true,configurable:true});
 function fileState(value){var state=fileBrand.get(value);if(state===undefined)error(TypeError,'ERR_INVALID_THIS','Value of this must be of type File');return state}
 getter(File.prototype,'name',function(){return fileState(this).name});getter(File.prototype,'lastModified',function(){return fileState(this).lastModified});define(File.prototype,Symbol.toStringTag,{value:'File',configurable:true});
 var objectUrls=new Map(),objectUrlSerial=0,objectUrlPrefix=Date.now().toString(16)+'-'+Math.random().toString(16).slice(2);
 function objectUrlKey(id){var value=String(id),end=value.search(/[?#]/);return end<0?value:value.slice(0,end)}
 function resolveObjectURL(id){var state=objectUrls.get(objectUrlKey(id));if(state===undefined)return undefined;var value=Object.create(Blob.prototype);blobBrand.set(value,state);return value}
 function URL(input){if(new.target===undefined)throw new TypeError('URL requires new');var href=String(input);if(!/^blob:nodedata:[^\s]+$/.test(href))error(TypeError,'ERR_INVALID_URL','Nona URL currently parses blob:nodedata object URLs only');this.href=href;this.protocol='blob:';this.origin='null';this.host='';this.hostname='';this.port='';this.username='';this.password='';var hash=href.indexOf('#'),query=href.indexOf('?');this.hash=hash<0?'':href.slice(hash);this.search=query<0||hash>=0&&query>hash?'':href.slice(query,hash<0?href.length:hash);this.pathname=href.slice(5,Math.min(query<0?href.length:query,hash<0?href.length:hash))}
 method(URL.prototype,'toString',function toString(){return this.href});method(URL.prototype,'toJSON',function toJSON(){return this.href});define(URL.prototype,Symbol.toStringTag,{value:'URL',configurable:true});
 method(URL,'createObjectURL',function createObjectURL(blob){var state=blobState(blob),id='blob:nodedata:'+objectUrlPrefix+'-'+(++objectUrlSerial).toString(16);objectUrls.set(id,state);return id});
 method(URL,'revokeObjectURL',function revokeObjectURL(id){objectUrls.delete(objectUrlKey(id))});
 if(typeof globalThis.URL==='undefined')define(globalThis,'URL',{value:URL,writable:true,enumerable:false,configurable:true});else{method(globalThis.URL,'createObjectURL',URL.createObjectURL);method(globalThis.URL,'revokeObjectURL',URL.revokeObjectURL)}
 if(typeof globalThis.ReadableStream==='undefined')define(globalThis,'ReadableStream',{value:ReadableStream,writable:true,enumerable:false,configurable:true});
 define(globalThis,'ReadableStreamDefaultReader',{value:ReadableStreamDefaultReader,writable:true,enumerable:false,configurable:true});define(globalThis,'ReadableStreamBYOBReader',{value:ReadableStreamBYOBReader,writable:true,enumerable:false,configurable:true});
 if(typeof globalThis.WritableStream==='undefined')define(globalThis,'WritableStream',{value:WritableStream,writable:true,enumerable:false,configurable:true});define(globalThis,'WritableStreamDefaultWriter',{value:WritableStreamDefaultWriter,writable:true,enumerable:false,configurable:true});
 __nonaRegexpVm.bufferModule={Buffer:Buffer,SlowBuffer:SlowBuffer,Blob:Blob,File:File,resolveObjectURL:resolveObjectURL,isAscii:isAscii,isUtf8:isUtf8,atob:atob,btoa:btoa,transcode:transcode,INSPECT_MAX_BYTES:50,kMaxLength:maxLength,kStringMaxLength:maxLength,constants:{MAX_LENGTH:maxLength,MAX_STRING_LENGTH:maxLength}};
 // Built-in ESM sources cannot read the prelude's lexical helper binding.
 define(Buffer,Symbol.for('nona.buffer.module'),{value:__nonaRegexpVm.bufferModule});
 define(globalThis,'Buffer',{value:Buffer,writable:true,enumerable:false,configurable:true});
 define(globalThis,'Blob',{value:Blob,writable:true,enumerable:false,configurable:true});
 define(globalThis,'File',{value:File,writable:true,enumerable:false,configurable:true});
})();
`;
