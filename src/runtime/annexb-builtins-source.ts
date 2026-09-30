// Annex B.2 additional built-in properties: escape/unescape (B.2.1),
// String.prototype.substr and the HTML methods (B.2.3), Date.prototype.setYear
// and toGMTString (B.2.4). Intrinsics are captured while the prelude runs so
// later user mutation cannot change the algorithms.
export const annexBBuiltinsPreludeSource=String.raw`;(function(){
  'use strict';
  var defineProperty=Object.defineProperty,markNative=Function.prototype.__nonaMarkNativeInternal;
  var fromCharCode=String.fromCharCode,charCodeAt=String.prototype.charCodeAt,call=Function.prototype.call.bind(Function.prototype.call);
  var mathFloor=Math.floor,mathMin=Math.min,mathMax=Math.max,mathAbs=Math.abs;
  var DateConstructor=Date,dateGetTime=Date.prototype.getTime,dateSetTime=Date.prototype.setTime,dateSetFullYear=Date.prototype.setFullYear;
  function install(object,name,length,fn){
    defineProperty(fn,'name',{value:name,configurable:true});
    defineProperty(fn,'length',{value:length,configurable:true});
    markNative(fn);
    defineProperty(object,name,{value:fn,writable:true,enumerable:false,configurable:true})
  }
  var StringConstructor=String;
  function toStr(value){if(typeof value==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');return StringConstructor(value)}
  function thisString(value,name){
    if(value===undefined||value===null)throw new TypeError('String.prototype.'+name+' called on null or undefined');
    return toStr(value)
  }
  function toInteger(value){var n=+value;if(n!==n)return 0;if(n===0||n===1/0||n===-1/0)return n;return n<0?-mathFloor(-n):mathFloor(n)}
  var hex='0123456789ABCDEF';
  // B.2.1.1 escape ( string )
  install(globalThis,'escape',1,({escape(string){
    var s=toStr(string),r='';
    for(var k=0;k<s.length;k++){
      var c=call(charCodeAt,s,k);
      if(c>=65&&c<=90||c>=97&&c<=122||c>=48&&c<=57||c===64||c===42||c===95||c===43||c===45||c===46||c===47)r+=fromCharCode(c);
      else if(c<256)r+='%'+hex[c>>4]+hex[c&15];
      else r+='%u'+hex[c>>12]+hex[(c>>8)&15]+hex[(c>>4)&15]+hex[c&15];
    }
    return r
  }}).escape);
  function hexValue(c){return c>=48&&c<=57?c-48:c>=65&&c<=70?c-55:c>=97&&c<=102?c-87:-1}
  // B.2.1.2 unescape ( string )
  install(globalThis,'unescape',1,({unescape(string){
    var s=toStr(string),r='',length=s.length;
    for(var k=0;k<length;k++){
      var c=call(charCodeAt,s,k);
      if(c===37){
        if(k+6<=length&&call(charCodeAt,s,k+1)===117){
          var a=hexValue(call(charCodeAt,s,k+2)),b=hexValue(call(charCodeAt,s,k+3)),d=hexValue(call(charCodeAt,s,k+4)),e=hexValue(call(charCodeAt,s,k+5));
          if(a>=0&&b>=0&&d>=0&&e>=0){c=(a<<12)|(b<<8)|(d<<4)|e;k+=5;r+=fromCharCode(c);continue}
        }
        if(k+3<=length){
          var h=hexValue(call(charCodeAt,s,k+1)),l=hexValue(call(charCodeAt,s,k+2));
          if(h>=0&&l>=0){c=(h<<4)|l;k+=2}
        }
      }
      r+=fromCharCode(c)
    }
    return r
  }}).unescape);
  var stringPrototype=String.prototype;
  // B.2.3.1 String.prototype.substr ( start, length )
  install(stringPrototype,'substr',2,({substr(start,length){
    var s=thisString(this,'substr'),size=s.length;
    var intStart=toInteger(start);
    var intLength=length===undefined?1/0:toInteger(length);
    if(intStart===-1/0)intStart=0;else if(intStart<0)intStart=mathMax(size+intStart,0);else intStart=mathMin(intStart,size);
    var resultLength=mathMin(mathMax(intLength,0),size-intStart);
    if(resultLength<=0)return '';
    var r='';for(var i=0;i<resultLength;i++)r+=fromCharCode(call(charCodeAt,s,intStart+i));
    return r
  }}).substr);
  // B.2.3.2.1 CreateHTML ( string, tag, attribute, value )
  function createHTML(string,tag,attribute,value,name){
    var s=thisString(string,name),p1='<'+tag;
    if(attribute!==''){
      var v=toStr(value),escaped='';
      for(var i=0;i<v.length;i++){var c=call(charCodeAt,v,i);escaped+=c===34?'&quot;':fromCharCode(c)}
      p1+=' '+attribute+'="'+escaped+'"'
    }
    return p1+'>'+s+'</'+tag+'>'
  }
  var html=[['anchor','a','name'],['big','big',''],['blink','blink',''],['bold','b',''],['fixed','tt',''],['fontcolor','font','color'],['fontsize','font','size'],
    ['italics','i',''],['link','a','href'],['small','small',''],['strike','strike',''],['sub','sub',''],['sup','sup','']];
  for(var i=0;i<html.length;i++)(function(name,tag,attribute){
    var fn=attribute===''?({m(){return createHTML(this,tag,'',undefined,name)}}).m:({m(value){return createHTML(this,tag,attribute,value,name)}}).m;
    install(stringPrototype,name,attribute===''?0:1,fn)
  })(html[i][0],html[i][1],html[i][2]);
  var datePrototype=Date.prototype;
  // B.2.4.2 Date.prototype.setYear ( year )
  install(datePrototype,'setYear',1,({setYear(year){
    var t=call(dateGetTime,this);
    var y=+year;
    if(y!==y){call(dateSetTime,this,NaN);return NaN}
    var yi=toInteger(y),full=yi>=0&&yi<=99?1900+yi:y;
    // LocalTime(t), or +0 when t is NaN; then MakeDay/MakeDate/UTC/TimeClip via setFullYear.
    var scratch=new DateConstructor(t===t?t:call(dateGetTime,new DateConstructor(1970,0,1,0,0,0,0)));
    call(dateSetFullYear,scratch,full);
    return call(dateSetTime,this,call(dateGetTime,scratch))
  }}).setYear);
  // B.2.4.3 Date.prototype.toGMTString is the same function object as toUTCString.
  defineProperty(datePrototype,'toGMTString',{value:datePrototype.toUTCString,writable:true,enumerable:false,configurable:true});
})();`;
