
// The WHATWG URL and URLSearchParams globals (issue #249).
//
// The parser follows the URL Standard's basic URL parser for the parts
// programs and npm packages rely on: special schemes (http, https, ws, wss,
// ftp, file) with authority, default ports, backslashes, dot segments and
// relative references against a base; other schemes with an authority or an
// opaque path; percent-encoding sets; IPv4 numbers and IPv6 brackets. Hosts
// are lowercased but not converted with IDNA (non-ASCII hosts are rejected).
// It adds no prelude globals. Everything but the two constructors is set
// up on first use (a constructor call, URL.canParse or URL.parse), so that a
// program that never uses a URL keeps a small heap: until then
// URL.prototype and URLSearchParams.prototype have no members.
(function(){
 var define=Object.defineProperty,impl=null;
 function URL(input,base){
  if(new.target===undefined)throw new TypeError("Class constructor URL cannot be invoked without 'new'");
  if(arguments.length===0)throw new TypeError('The "url" argument must be specified');
  (impl||install()).initURL(this,input,base);
 }
 function URLSearchParams(init){
  if(new.target===undefined)throw new TypeError("Class constructor URLSearchParams cannot be invoked without 'new'");
  (impl||install()).initParams(this,init);
 }
 function staticMethod(name,fn){define(URL,name,{value:fn,writable:true,enumerable:true,configurable:true})}
 staticMethod('canParse',function canParse(input,base){return (impl||install()).canParse(input,base)});
 staticMethod('parse',function parse(input,base){try{return new URL(input,base)}catch(e){return null}});
 define(globalThis,'URL',{value:URL,writable:true,enumerable:false,configurable:true});
 define(globalThis,'URLSearchParams',{value:URLSearchParams,writable:true,enumerable:false,configurable:true});
 function install(){
 var special={'http:':80,'https:':443,'ws:':80,'wss:':443,'ftp:':21,'file:':null};
 var isSpecial=function(scheme){return Object.prototype.hasOwnProperty.call(special,scheme)};
 var hex='0123456789ABCDEF';
 var encoder=typeof TextEncoder==='function'?new TextEncoder():null;
 function invalid(input){var error=new TypeError('Invalid URL');error.code='ERR_INVALID_URL';error.input=input;return error}
 // Scanning helpers without regular expressions: a URL is parsed with few allocations.
 function search(text,chars,from){for(var i=from||0;i<text.length;i++)if(chars.indexOf(text[i])>=0)return i;return -1}
 function stop(text,chars){var at=search(text,chars);return at<0?text.length:at}
 function isAlpha(c){return c>=65&&c<=90||c>=97&&c<=122}
 function isDigit(c){return c>=48&&c<=57}
 function allDigits(text){if(text==='')return false;for(var i=0;i<text.length;i++)if(!isDigit(text.charCodeAt(i)))return false;return true}
 function isSlash(ch,special){return ch==='/'||special&&ch==='\\'}
 function leadingSlashes(text,special){var n=0;while(n<text.length&&isSlash(text[n],special))n++;return n}
 function cleanInput(text){
  var start=0,end=text.length;
  while(start<end&&text.charCodeAt(start)<=0x20)start++;
  while(end>start&&text.charCodeAt(end-1)<=0x20)end--;
  if(start!==0||end!==text.length)text=text.slice(start,end);
  if(search(text,'\t\n\r')<0)return text;
  var out='';for(var i=0;i<text.length;i++){var ch=text[i];if(ch!=='\t'&&ch!=='\n'&&ch!=='\r')out+=ch}return out;
 }
 function schemeLength(text){
  if(!text.length||!isAlpha(text.charCodeAt(0)))return -1;
  for(var i=1;i<text.length;i++){var c=text.charCodeAt(i);if(c===58)return i;if(!(isAlpha(c)||isDigit(c)||c===43||c===45||c===46))return -1}
  return -1;
 }
 function utf8(ch){
  if(encoder!==null)return encoder.encode(ch);
  var c=ch.codePointAt(0),out=[];
  if(c<0x80)out.push(c);else if(c<0x800)out.push(0xc0|c>>6,0x80|c&63);else if(c<0x10000)out.push(0xe0|c>>12,0x80|c>>6&63,0x80|c&63);else out.push(0xf0|c>>18,0x80|c>>12&63,0x80|c>>6&63,0x80|c&63);
  return out;
 }
 function encodeSet(text,extra){
  var clean=true;
  for(var k=0;k<text.length;k++){var code0=text.charCodeAt(k);if(code0<=0x20||code0>=0x7f||extra.indexOf(text[k])>=0){clean=false;break}}
  if(clean)return text;
  var out='';
  for(var i=0;i<text.length;i++){
   var code=text.charCodeAt(i),ch=text[i];
   if(code>=0xd800&&code<0xdc00&&i+1<text.length){var low=text.charCodeAt(i+1);if(low>=0xdc00&&low<0xe000){ch=text.slice(i,i+2);i++}}
   if(code>0x20&&code<0x7f&&extra.indexOf(ch)<0){out+=ch;continue}
   if(code>=0xd800&&code<0xe000&&ch.length===1)ch='�';
   var bytes=utf8(ch);
   for(var j=0;j<bytes.length;j++)out+='%'+hex[bytes[j]>>4]+hex[bytes[j]&15];
  }
  return out;
 }
 var fragmentSet=' "<>\x60';
 var querySet=' "#<>';
 var specialQuerySet=' "#<>\'';
 var pathSet=' "#<>?\x60{}^';
 var userinfoSet=' "#<>?\x60{}/:;=@[\\]^|';
 var componentSet=userinfoSet+'$%&+,';
 var formSet=componentSet+'!\'()~';
 function isHex(c){return isDigit(c)||c>=65&&c<=70||c>=97&&c<=102}
 function percentDecodeBytes(text){
  var bytes=[];
  for(var i=0;i<text.length;i++){
   var c=text.charCodeAt(i);
   if(c===37&&i+2<text.length&&isHex(text.charCodeAt(i+1))&&isHex(text.charCodeAt(i+2))){bytes.push(parseInt(text.slice(i+1,i+3),16));i+=2;continue}
   var b=utf8(text[i]);
   if(c>=0xd800&&c<0xdc00&&i+1<text.length){b=utf8(text.slice(i,i+2));i++}
   for(var j=0;j<b.length;j++)bytes.push(b[j]);
  }
  return bytes;
 }
 function decodeUtf8(bytes){
  if(typeof TextDecoder==='function')return new TextDecoder().decode(new Uint8Array(bytes));
  var out='';for(var i=0;i<bytes.length;i++)out+=String.fromCharCode(bytes[i]);return out;
 }
 function parseIPv4Number(part){
  if(part==='')return NaN;
  var radix=10;
  if(part.length>=2&&(part.slice(0,2)==='0x'||part.slice(0,2)==='0X')){part=part.slice(2);radix=16}
  else if(part.length>=2&&part[0]==='0'){part=part.slice(1);radix=8}
  if(part==='')return 0;
  var pattern=radix===16?/^[0-9A-Fa-f]+$/:radix===8?/^[0-7]+$/:/^[0-9]+$/;
  if(!pattern.test(part))return NaN;
  return parseInt(part,radix);
 }
 function endsInNumber(host){
  var parts=host.split('.');
  if(parts[parts.length-1]===''){if(parts.length===1)return false;parts.pop()}
  var last=parts[parts.length-1];
  if(allDigits(last))return true;
  if(!(last.length>1&&last[0]==='0'&&(last[1]==='x'||last[1]==='X')))return false;
  return !isNaN(parseIPv4Number(last))&&/^(0[xX][0-9A-Fa-f]*|[0-9]+)$/.test(last);
 }
 function parseIPv4(host,input){
  var parts=host.split('.');
  if(parts[parts.length-1]===''&&parts.length>1)parts.pop();
  if(parts.length>4)throw invalid(input);
  var numbers=[];
  for(var i=0;i<parts.length;i++){var n=parseIPv4Number(parts[i]);if(isNaN(n))throw invalid(input);numbers.push(n)}
  for(i=0;i<numbers.length-1;i++)if(numbers[i]>255)throw invalid(input);
  if(numbers[numbers.length-1]>=Math.pow(256,5-numbers.length))throw invalid(input);
  var value=numbers[numbers.length-1];
  for(i=0;i<numbers.length-1;i++)value+=numbers[i]*Math.pow(256,3-i);
  var out=[];
  for(i=0;i<4;i++){out.unshift(String(value%256));value=Math.floor(value/256)}
  return out.join('.');
 }
 function parseIPv6(text,input){
  var pieces=[0,0,0,0,0,0,0,0],index=0,compress=-1,i=0;
  if(text[0]===':'){if(text[1]!==':')throw invalid(input);i=2;index=1;compress=1}
  while(i<text.length){
   if(index===8)throw invalid(input);
   if(text[i]===':'){if(compress>=0)throw invalid(input);i++;index++;compress=index;continue}
   var value=0,length=0;
   while(length<4&&i<text.length&&/[0-9A-Fa-f]/.test(text[i])){value=value*16+parseInt(text[i],16);i++;length++}
   if(text[i]==='.'){
    if(length===0||index>6)throw invalid(input);
    i-=length;
    var seen=0;
    while(i<text.length){
     var part=-1;
     if(seen>0){if(text[i]==='.'&&seen<4)i++;else throw invalid(input)}
     if(!/[0-9]/.test(text[i]||''))throw invalid(input);
     while(/[0-9]/.test(text[i]||'')){var d=+text[i];if(part===-1)part=d;else if(part===0)throw invalid(input);else part=part*10+d;if(part>255)throw invalid(input);i++}
     pieces[index]=pieces[index]*256+part;seen++;
     if(seen===2||seen===4)index++;
    }
    if(seen!==4)throw invalid(input);
    break;
   }
   if(text[i]===':'){i++;if(i>=text.length)throw invalid(input)}
   else if(i<text.length)throw invalid(input);
   pieces[index]=value;index++;
  }
  if(compress>=0){var swaps=index-compress;index=7;while(index!==0&&swaps>0){var t=pieces[compress+swaps-1];pieces[compress+swaps-1]=pieces[index];pieces[index]=t;index--;swaps--}}
  else if(index!==8)throw invalid(input);
  // Serialize with the longest run of zeros (length > 1) compressed.
  var best=-1,bestLength=1;
  for(var s=0;s<8;){if(pieces[s]!==0){s++;continue}var e=s;while(e<8&&pieces[e]===0)e++;if(e-s>bestLength){best=s;bestLength=e-s}s=e}
  var out='',ignore=false;
  for(var k=0;k<8;k++){
   if(ignore&&pieces[k]===0)continue;ignore=false;
   if(best===k){out+=k===0?'::':':';ignore=true;continue}
   out+=pieces[k].toString(16);if(k!==7)out+=':';
  }
  return '['+out+']';
 }
 function parseHost(text,specialScheme,input){
  if(text[0]==='['){if(text[text.length-1]!==']')throw invalid(input);return parseIPv6(text.slice(1,-1),input)}
  if(!specialScheme){
   if(search(text,'\x00\t\n\r #/:<>?@[\\]^|')>=0)throw invalid(input);
   return encodeSet(text,'');
  }
  var domain=(text.indexOf('%')>=0?decodeUtf8(percentDecodeBytes(text)):text).toLowerCase();
  if(domain==='')throw invalid(input);
  for(var i=0;i<domain.length;i++){var c=domain.charCodeAt(i);if(c<=0x20||c>=0x7f||'#%/:<>?@[\\]^|'.indexOf(domain[i])>=0)throw invalid(input)}
  if(endsInNumber(domain))return parseIPv4(domain,input);
  return domain;
 }
 function isWindowsDrive(text,normalizedOnly){return text.length===2&&isAlpha(text.charCodeAt(0))&&(text[1]===':'||!normalizedOnly&&text[1]==='|')}
 function startsWithDrive(text){return text.length>=2&&isWindowsDrive(text.slice(0,2),false)&&(text.length===2||'/\\?#'.indexOf(text[2])>=0)}
 function shortenPath(record){
  var path=record.path;
  if(record.scheme==='file:'&&path.length===1&&isWindowsDrive(path[0],true))return;
  path.pop();
 }
 function cloneRecord(r){return {scheme:r.scheme,username:r.username,password:r.password,host:r.host,port:r.port,path:Array.isArray(r.path)?r.path.slice():r.path,query:r.query,fragment:r.fragment}}
 // Splits the remaining input of a hierarchical URL into path segments, query and fragment.
 function parseTail(record,rest,input,startPath){
  var specialScheme=isSpecial(record.scheme);
  var hash=rest.indexOf('#');
  if(hash>=0){record.fragment=encodeSet(rest.slice(hash+1),fragmentSet);rest=rest.slice(0,hash)}
  var query=rest.indexOf('?');
  if(query>=0){record.query=encodeSet(rest.slice(query+1),specialScheme?specialQuerySet:querySet);rest=rest.slice(0,query)}
  if(startPath===false)return;
  var segments=(specialScheme&&rest.indexOf('\\')>=0?rest.split('\\').join('/'):rest).split('/');
  // A leading separator produces an empty first segment, which is not a segment.
  if(segments.length&&segments[0]===''&&rest!=='')segments.shift();
  else if(rest===''){if(!specialScheme)return;segments=[]}
  for(var i=0;i<segments.length;i++){
   var segment=segments[i],last=i===segments.length-1;
   var lower=segment.toLowerCase();
   if(lower==='..'||lower==='.%2e'||lower==='%2e.'||lower==='%2e%2e'){shortenPath(record);if(last)record.path.push('');continue}
   if(lower==='.'||lower==='%2e'){if(last)record.path.push('');continue}
   if(record.scheme==='file:'&&record.path.length===0&&isWindowsDrive(segment,false)){
    segment=segment[0]+':';
   }
   record.path.push(encodeSet(segment,pathSet));
  }
 }
 function parseAuthority(record,authority,input){
  var specialScheme=isSpecial(record.scheme);
  var at=authority.lastIndexOf('@');
  if(at>=0){
   var info=authority.slice(0,at);authority=authority.slice(at+1);
   var colon=info.indexOf(':');
   record.username=encodeSet(colon<0?info:info.slice(0,colon),userinfoSet);
   record.password=colon<0?'':encodeSet(info.slice(colon+1),userinfoSet);
   if(authority==='')throw invalid(input);
  }
  var hostText=authority,portText='';
  var bracket=authority.lastIndexOf(']'),portColon=authority.lastIndexOf(':');
  if(portColon>bracket){hostText=authority.slice(0,portColon);portText=authority.slice(portColon+1)}
  if(hostText===''){
   if(specialScheme&&record.scheme!=='file:')throw invalid(input);
   if(portText!==''||at>=0)throw invalid(input);
   record.host='';
  }
  else record.host=parseHost(hostText,specialScheme,input);
  if(record.scheme==='file:'&&record.host==='localhost')record.host='';
  if(portText!==''){
   if(!allDigits(portText))throw invalid(input);
   var port=parseInt(portText,10);
   if(port>65535)throw invalid(input);
   record.port=special[record.scheme]===port?null:port;
  }
 }
 function parse(input,base){
  input=cleanInput(String(input));
  var record={scheme:'',username:'',password:'',host:null,port:null,path:[],query:null,fragment:null};
  var colon=schemeLength(input);
  if(colon>0){
   record.scheme=input.slice(0,colon+1).toLowerCase();
   var rest=input.slice(colon+1);
   var specialScheme=isSpecial(record.scheme);
   if(record.scheme==='file:'){
    // file: always has a host (possibly empty); a missing authority takes the base's.
    if(leadingSlashes(rest,true)>=2){
     rest=rest.slice(2);
     var end=stop(rest,'/\\?#');
     var authority=rest.slice(0,end);
     if(isWindowsDrive(authority,false)){record.host='';parseTail(record,'/'+rest,input);return record}
     parseAuthority(record,authority,input);parseTail(record,rest.slice(end),input);return record;
    }
    if(base&&base.scheme==='file:'&&!isSlash(rest[0],true)){return relative(record,rest,base,input)}
    record.host='';parseTail(record,'/'+(isSlash(rest[0],true)?rest.slice(1):rest),input);return record;
   }
   if(specialScheme){
    if(base&&base.scheme===record.scheme&&!isSlash(rest[0],true))return relative(record,rest,base,input);
    rest=rest.slice(leadingSlashes(rest,true));
    var at=stop(rest,'/\\?#');
    parseAuthority(record,rest.slice(0,at),input);
    parseTail(record,rest.slice(at)||'/',input);
    return record;
   }
   if(rest.slice(0,2)==='//'){
    rest=rest.slice(2);
    var stop2=stop(rest,'/?#');
    parseAuthority(record,rest.slice(0,stop2),input);
    parseTail(record,rest.slice(stop2),input);
    return record;
   }
   if(rest[0]==='/'){parseTail(record,rest,input);return record}
   // An opaque path (mailto:, data:, blob:, javascript:...).
   var hashAt=rest.indexOf('#');
   if(hashAt>=0){record.fragment=encodeSet(rest.slice(hashAt+1),fragmentSet);rest=rest.slice(0,hashAt)}
   var queryAt=rest.indexOf('?');
   if(queryAt>=0){record.query=encodeSet(rest.slice(queryAt+1),querySet);rest=rest.slice(0,queryAt)}
   record.path=rest.indexOf(' ')<0?encodeSet(rest,''):encodeSet(rest,'').split('%20').join(' ');
   return record;
  }
  if(!base)throw invalid(input);
  if(typeof base.path==='string'){
   if(input[0]!=='#')throw invalid(input);
   var opaque=cloneRecord(base);opaque.fragment=encodeSet(input.slice(1),fragmentSet);return opaque;
  }
  record.scheme=base.scheme;
  return relative(record,input,base,input);
 }
 function relative(record,rest,base,input){
  var specialScheme=isSpecial(record.scheme);
  if(leadingSlashes(rest,specialScheme)>=2){
   rest=rest.slice(2);
   if(record.scheme==='file:'){
    var e=stop(rest,'/\\?#');
    var authority=rest.slice(0,e);
    if(isWindowsDrive(authority,false)){record.host='';parseTail(record,'/'+rest,input);return record}
    parseAuthority(record,authority,input);parseTail(record,rest.slice(e),input);return record;
   }
   var at=stop(rest,specialScheme?'/\\?#':'/?#');
   parseAuthority(record,rest.slice(0,at),input);
   parseTail(record,rest.slice(at)||(specialScheme?'/':''),input);
   return record;
  }
  record.username=base.username;record.password=base.password;record.host=base.host;record.port=base.port;
  if(rest===''){record.path=base.path.slice();record.query=base.query;return record}
  if(isSlash(rest[0],specialScheme)){
   if(record.scheme==='file:'&&base.path.length&&isWindowsDrive(base.path[0],true)&&!startsWithDrive(rest.slice(1)))record.path.push(base.path[0]);
   parseTail(record,rest,input);return record;
  }
  if(rest[0]==='?'){record.path=base.path.slice();parseTail(record,rest,input,false);return record}
  if(rest[0]==='#'){record.path=base.path.slice();record.query=base.query;parseTail(record,rest,input,false);return record}
  if(record.scheme==='file:'&&startsWithDrive(rest)){record.host='';parseTail(record,'/'+rest,input);return record}
  record.path=base.path.slice();
  if(record.path.length)shortenPath(record);
  parseTail(record,'/'+rest,input);
  return record;
 }
 function serializePath(r){
  if(typeof r.path==='string')return r.path;
  var out='';
  if(r.host===null&&r.path.length>1&&r.path[0]==='')out+='/.';
  for(var i=0;i<r.path.length;i++)out+='/'+r.path[i];
  return out;
 }
 function serialize(r,excludeFragment){
  var out=r.scheme;
  if(r.host!==null){
   out+='//';
   if(r.username!==''||r.password!==''){out+=r.username;if(r.password!=='')out+=':'+r.password;out+='@'}
   out+=r.host;
   if(r.port!==null)out+=':'+r.port;
  }
  out+=serializePath(r);
  if(r.query!==null)out+='?'+r.query;
  if(!excludeFragment&&r.fragment!==null)out+='#'+r.fragment;
  return out;
 }
 var records=new WeakMap(),paramsOf=new WeakMap(),paramsUrl=new WeakMap();
 function recordOf(url){var r=records.get(url);if(r===undefined)throw new TypeError('Value of "this" must be of type URL');return r}

 // application/x-www-form-urlencoded
 function formDecode(text){return decodeUtf8(percentDecodeBytes(text.replace(/\+/g,' ')))}
 function formParse(text){
  var list=[];
  if(text==='')return list;
  var pairs=text.split('&');
  for(var i=0;i<pairs.length;i++){
   if(pairs[i]==='')continue;
   var eq=pairs[i].indexOf('=');
   list.push([formDecode(eq<0?pairs[i]:pairs[i].slice(0,eq)),formDecode(eq<0?'':pairs[i].slice(eq+1))]);
  }
  return list;
 }
 function formEncode(text){return encodeSet(text,formSet).replace(/%20/g,'+').replace(/ /g,'+')}
 function formSerialize(list){
  var out=[];
  for(var i=0;i<list.length;i++)out.push(formEncode(list[i][0])+'='+formEncode(list[i][1]));
  return out.join('&');
 }
 function toUSV(value){
  var text=String(value),out='',k;
  for(k=0;k<text.length;k++){var c0=text.charCodeAt(k);if(c0>=0xd800&&c0<0xe000)break}
  if(k===text.length)return text;
  for(var i=0;i<text.length;i++){
   var c=text.charCodeAt(i);
   if(c>=0xd800&&c<0xdc00&&i+1<text.length){var d=text.charCodeAt(i+1);if(d>=0xdc00&&d<0xe000){out+=text[i]+text[i+1];i++;continue}}
   out+=c>=0xd800&&c<0xe000?'�':text[i];
  }
  return out;
 }

 function initParams(self,init){
  var list=[];
  if(init!==undefined&&init!==null&&typeof init==='object'||typeof init==='function'){
   if(typeof init[Symbol.iterator]==='function'){
    for(var pair of init){
     var items=[];for(var item of pair)items.push(item);
     if(items.length!==2)throw new TypeError('Each query pair must be an iterable [name, value] tuple');
     list.push([toUSV(items[0]),toUSV(items[1])]);
    }
   }
   else{var keys=Reflect.ownKeys(init);for(var k=0;k<keys.length;k++){var desc=Object.getOwnPropertyDescriptor(init,keys[k]);if(desc&&desc.enumerable&&typeof keys[k]==='string')list.push([toUSV(keys[k]),toUSV(init[keys[k]])])}}
  }
  else if(init!==undefined){var text=toUSV(init);if(text[0]==='?')text=text.slice(1);list=formParse(text)}
  paramsOf.set(self,list);
 }
 function listOf(params){var list=paramsOf.get(params);if(list===undefined)throw new TypeError('Value of "this" must be of type URLSearchParams');return list}
 function update(params){
  var url=paramsUrl.get(params);if(url===undefined)return;
  var r=records.get(url),text=formSerialize(paramsOf.get(params));
  r.query=text===''?null:text;
 }
 function method(target,name,fn){define(target,name,{value:fn,writable:true,enumerable:true,configurable:true})}
 var P=URLSearchParams.prototype;
 method(P,'append',function append(name,value){if(arguments.length<2)throw new TypeError('The "name" and "value" arguments must be specified');listOf(this).push([toUSV(name),toUSV(value)]);update(this)});
 method(P,'delete',function(name,value){var list=listOf(this);name=toUSV(name);var hasValue=value!==undefined;if(hasValue)value=toUSV(value);for(var i=list.length-1;i>=0;i--)if(list[i][0]===name&&(!hasValue||list[i][1]===value))list.splice(i,1);update(this)});
 method(P,'get',function get(name){var list=listOf(this);name=toUSV(name);for(var i=0;i<list.length;i++)if(list[i][0]===name)return list[i][1];return null});
 method(P,'getAll',function getAll(name){var list=listOf(this),out=[];name=toUSV(name);for(var i=0;i<list.length;i++)if(list[i][0]===name)out.push(list[i][1]);return out});
 method(P,'has',function has(name,value){var list=listOf(this);name=toUSV(name);var hasValue=value!==undefined;if(hasValue)value=toUSV(value);for(var i=0;i<list.length;i++)if(list[i][0]===name&&(!hasValue||list[i][1]===value))return true;return false});
 method(P,'set',function set(name,value){var list=listOf(this);name=toUSV(name);value=toUSV(value);var found=false;for(var i=0;i<list.length;i++){if(list[i][0]!==name)continue;if(found){list.splice(i,1);i--}else{list[i][1]=value;found=true}}if(!found)list.push([name,value]);update(this)});
 method(P,'sort',function sort(){var list=listOf(this);var indexed=list.map(function(pair,i){return [pair,i]});indexed.sort(function(a,b){return a[0][0]<b[0][0]?-1:a[0][0]>b[0][0]?1:a[1]-b[1]});for(var i=0;i<list.length;i++)list[i]=indexed[i][0];update(this)});
 method(P,'forEach',function forEach(callback,thisArg){var list=listOf(this);if(typeof callback!=='function')throw new TypeError('The "callback" argument must be of type function');for(var i=0;i<list.length;i++)callback.call(thisArg,list[i][1],list[i][0],this)});
 function iterator(params,kind){
  var index=0;
  var it=Object.create(IteratorPrototype);
  define(it,'next',{value:function next(){var list=listOf(params);if(index>=list.length)return {value:undefined,done:true};var pair=list[index++];return {value:kind==='keys'?pair[0]:kind==='values'?pair[1]:[pair[0],pair[1]],done:false}},writable:true,configurable:true});
  return it;
 }
 var IteratorPrototype=Object.create(Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())));
 define(IteratorPrototype,Symbol.toStringTag,{value:'URLSearchParams Iterator',configurable:true});
 method(P,'keys',function keys(){listOf(this);return iterator(this,'keys')});
 method(P,'values',function values(){listOf(this);return iterator(this,'values')});
 method(P,'entries',function entries(){listOf(this);return iterator(this,'entries')});
 define(P,Symbol.iterator,{value:P.entries,writable:true,configurable:true});
 method(P,'toString',function toString(){return formSerialize(listOf(this))});
 define(P,'size',{get:function(){return listOf(this).length},enumerable:true,configurable:true});
 define(P,Symbol.toStringTag,{value:'URLSearchParams',configurable:true});
 define(P,Symbol.for('nodejs.util.inspect.custom'),{value:function(depth,options,inspect){
  var list=listOf(this);if(!list.length)return 'URLSearchParams {}';
  return 'URLSearchParams { '+list.map(function(pair){return inspect(pair[0])+' => '+inspect(pair[1])}).join(', ')+' }';
 },writable:true,configurable:true});

 function initURL(self,input,base){
  var baseRecord;
  if(base!==undefined)baseRecord=parse(toUSV(base));
  var record=parse(toUSV(input),baseRecord);
  records.set(self,record);
 }
 var U=URL.prototype,searchParams=new WeakMap();
 function accessor(name,get,set){define(U,name,{get:get,set:set,enumerable:true,configurable:true})}
 function reparse(url,text){var r=recordOf(url);var next=parse(text);records.set(url,next);var params=searchParams.get(url);if(params!==undefined)paramsOf.set(params,next.query===null?[]:formParse(next.query))}
 accessor('href',function(){return serialize(recordOf(this))},function(value){reparse(this,toUSV(value))});
 accessor('origin',function(){
  var r=recordOf(this);
  if(r.scheme==='blob:'){try{var inner=parse(typeof r.path==='string'?r.path:serializePath(r));if(inner.scheme==='http:'||inner.scheme==='https:')return inner.scheme+'//'+inner.host+(inner.port!==null?':'+inner.port:'')}catch(e){}return 'null'}
  if(r.scheme==='file:'||!isSpecial(r.scheme))return 'null';
  return r.scheme+'//'+r.host+(r.port!==null?':'+r.port:'');
 });
 accessor('protocol',function(){return recordOf(this).scheme},function(value){
  var r=recordOf(this),m=/^([A-Za-z][A-Za-z0-9+.\-]*)(:|$)/.exec(toUSV(value));if(!m)return;
  var scheme=m[1].toLowerCase()+':';
  if(isSpecial(scheme)!==isSpecial(r.scheme))return;
  if(scheme==='file:'&&(r.username!==''||r.password!==''||r.port!==null))return;
  if(r.scheme==='file:'&&r.host==='')return;
  r.scheme=scheme;if(r.port===special[scheme])r.port=null;
 });
 function cannotHaveCredentials(r){return r.host===null||r.host===''||r.scheme==='file:'}
 accessor('username',function(){return recordOf(this).username},function(value){var r=recordOf(this);if(!cannotHaveCredentials(r))r.username=encodeSet(toUSV(value),userinfoSet)});
 accessor('password',function(){return recordOf(this).password},function(value){var r=recordOf(this);if(!cannotHaveCredentials(r))r.password=encodeSet(toUSV(value),userinfoSet)});
 accessor('host',function(){var r=recordOf(this);return r.host===null?'':r.host+(r.port!==null?':'+r.port:'')},function(value){
  var r=recordOf(this);if(typeof r.path==='string')return;
  var copy=cloneRecord(r);
  try{var text=toUSV(value),stop=text.search(/[\/\\?#]/);parseAuthority(copy,stop<0?text:text.slice(0,stop),text);if(copy.host===''&&isSpecial(r.scheme)&&r.scheme!=='file:')return;r.host=copy.host;r.port=copy.port}catch(e){}
 });
 accessor('hostname',function(){var r=recordOf(this);return r.host===null?'':r.host},function(value){
  var r=recordOf(this);if(typeof r.path==='string')return;
  try{var text=toUSV(value),stop=text.search(/[\/\\?#:]/);text=stop<0?text:text.slice(0,stop);if(text===''&&isSpecial(r.scheme)&&r.scheme!=='file:')return;r.host=text===''?'':parseHost(text,isSpecial(r.scheme),text)}catch(e){}
 });
 accessor('port',function(){var r=recordOf(this);return r.port===null?'':String(r.port)},function(value){
  var r=recordOf(this);if(r.host===null||r.host===''||r.scheme==='file:')return;
  var text=toUSV(value);if(text===''){r.port=null;return}
  var m=/^[0-9]+/.exec(text);if(!m)return;var port=parseInt(m[0],10);if(port>65535)return;
  r.port=special[r.scheme]===port?null:port;
 });
 accessor('pathname',function(){return serializePath(recordOf(this))},function(value){
  var r=recordOf(this);if(typeof r.path==='string')return;
  r.path=[];var text=toUSV(value);
  var special_=isSpecial(r.scheme);
  if(text===''&&!special_)return;
  var q=r.query,f=r.fragment;
  parseTail(r,(special_?/^[\/\\]/:/^\//).test(text)?text.replace(/[?#]/g,function(c){return c==='?'?'%3F':'%23'}):'/'+text.replace(/[?#]/g,function(c){return c==='?'?'%3F':'%23'}),text);
  r.query=q;r.fragment=f;
 });
 accessor('search',function(){var r=recordOf(this);return r.query===null||r.query===''?'':'?'+r.query},function(value){
  var r=recordOf(this),text=toUSV(value);
  if(text===''){r.query=null}else{if(text[0]==='?')text=text.slice(1);r.query=encodeSet(text,isSpecial(r.scheme)?specialQuerySet:querySet)}
  var params=searchParams.get(this);if(params!==undefined)paramsOf.set(params,r.query===null?[]:formParse(r.query));
 });
 accessor('searchParams',function(){
  var params=searchParams.get(this);
  if(params===undefined){var r=recordOf(this);params=new URLSearchParams(r.query===null?'':r.query);paramsUrl.set(params,this);searchParams.set(this,params)}
  return params;
 });
 accessor('hash',function(){var r=recordOf(this);return r.fragment===null||r.fragment===''?'':'#'+r.fragment},function(value){
  var r=recordOf(this),text=toUSV(value);
  if(text===''){r.fragment=null;return}
  if(text[0]==='#')text=text.slice(1);r.fragment=encodeSet(text,fragmentSet);
 });
 method(U,'toString',function toString(){return serialize(recordOf(this))});
 method(U,'toJSON',function toJSON(){return serialize(recordOf(this))});
 define(U,Symbol.toStringTag,{value:'URL',configurable:true});
 define(U,Symbol.for('nodejs.util.inspect.custom'),{value:function(depth,options,inspect){
  var self=this,names=['href','origin','protocol','username','password','host','hostname','port','pathname','search','searchParams','hash'];
  return 'URL {\n'+names.map(function(name){return '  '+name+': '+(name==='searchParams'?inspect(self.searchParams):inspect(self[name]))}).join(',\n')+'\n}';
 },writable:true,configurable:true});
 function canParse(input,base){try{var b=base===undefined?undefined:parse(toUSV(base));parse(toUSV(input),b);return true}catch(e){return false}}
 impl={initURL:initURL,initParams:initParams,canParse:canParse};
 return impl;
 }
})();
