// TextEncoder/TextDecoder (UTF-8 only), installed as globals like in Node.js
// and browsers. The prelude adds no prelude globals.
export const encodingPreludeSource=String.raw`
(function(){
  var defineProperty=Object.defineProperty,fromCharCode=String.fromCharCode,U8=Uint8Array,apply=Reflect.apply;
  var isView=ArrayBuffer.isView,hasOwn=Object.prototype.hasOwnProperty;
  var encoderBrand=new WeakMap(),decoderBrand=new WeakMap();
  var hasEncoder=WeakMap.prototype.has.bind(encoderBrand),addEncoder=WeakMap.prototype.set.bind(encoderBrand);
  var getDecoder=WeakMap.prototype.get.bind(decoderBrand),addDecoder=WeakMap.prototype.set.bind(decoderBrand);
  function method(target,name,value){defineProperty(target,name,{value:value,writable:true,enumerable:true,configurable:true})}
  function getter(target,name,get){defineProperty(target,name,{get:get,enumerable:true,configurable:true})}
  function encode(input){
    var s=input===undefined?'':String(input),n=s.length,size=0,i,c,d;
    for(i=0;i<n;i++){
      c=s.charCodeAt(i);
      if(c<0x80)size+=1;
      else if(c<0x800)size+=2;
      else if(c>=0xd800&&c<0xdc00&&i+1<n&&(d=s.charCodeAt(i+1))>=0xdc00&&d<0xe000){size+=4;i++}
      else size+=3;
    }
    var out=new U8(size),p=0;
    for(i=0;i<n;i++){
      c=s.charCodeAt(i);
      if(c<0x80){out[p++]=c;continue}
      if(c<0x800){out[p++]=0xc0|c>>6;out[p++]=0x80|c&63;continue}
      if(c>=0xd800&&c<0xdc00&&i+1<n&&(d=s.charCodeAt(i+1))>=0xdc00&&d<0xe000){
        var cp=0x10000+((c-0xd800)<<10)+(d-0xdc00);i++;
        out[p++]=0xf0|cp>>18;out[p++]=0x80|cp>>12&63;out[p++]=0x80|cp>>6&63;out[p++]=0x80|cp&63;continue
      }
      if(c>=0xd800&&c<0xe000)c=0xfffd;
      out[p++]=0xe0|c>>12;out[p++]=0x80|c>>6&63;out[p++]=0x80|c&63
    }
    return out
  }
  function bytesOf(input){
    if(input===undefined)return new U8(0);
    if(input instanceof ArrayBuffer||(typeof SharedArrayBuffer==='function'&&input instanceof SharedArrayBuffer))return new U8(input);
    if(isView(input))return new U8(input.buffer,input.byteOffset,input.byteLength);
    throw new TypeError('The "input" argument must be an ArrayBuffer or ArrayBufferView')
  }
  function decode(bytes,fatal,ignoreBOM){
    var n=bytes.length,i=0,out='',chunk=new Uint16Array(4100),k=0,c,need,cp,min;
    if(!ignoreBOM&&n>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)i=3;
    function bad(){if(fatal)throw new TypeError('The encoded data was not valid for encoding utf-8');chunk[k++]=0xfffd}
    while(i<n){
      c=bytes[i];
      if(c<0x80){chunk[k++]=c;i++}
      else{
        if(c>=0xc2&&c<0xe0){need=1;cp=c&31;min=0x80}
        else if(c>=0xe0&&c<0xf0){need=2;cp=c&15;min=0x800}
        else if(c>=0xf0&&c<0xf5){need=3;cp=c&7;min=0x10000}
        else{bad();i++;need=-1}
        if(need>0){
          var j=1,ok=true;
          for(;j<=need;j++){
            if(i+j>=n){ok=false;break}
            var t=bytes[i+j];
            // The second byte's range rejects overlongs, surrogates and > U+10FFFF early.
            if(j===1&&((c===0xe0&&t<0xa0)||(c===0xed&&t>0x9f)||(c===0xf0&&t<0x90)||(c===0xf4&&t>0x8f))){ok=false;break}
            if((t&0xc0)!==0x80){ok=false;break}
            cp=cp<<6|t&63
          }
          if(!ok||cp<min){bad();i+=j}
          else{
            i+=need+1;
            if(cp>=0x10000){cp-=0x10000;chunk[k++]=0xd800+(cp>>10);chunk[k++]=0xdc00+(cp&1023)}else chunk[k++]=cp
          }
        }
      }
      if(k>=4096){out+=apply(fromCharCode,undefined,chunk.subarray(0,k));k=0}
    }
    return out+apply(fromCharCode,undefined,chunk.subarray(0,k))
  }
  function TextEncoder(){
    if(new.target===undefined)throw new TypeError("Class constructor TextEncoder cannot be invoked without 'new'");
    addEncoder(this,true)
  }
  method(TextEncoder.prototype,'encode',function encode_(input){
    if(!hasEncoder(this))throw new TypeError('Illegal invocation');return encode(input)
  });
  getter(TextEncoder.prototype,'encoding',function(){return 'utf-8'});
  function TextDecoder(label,options){
    if(new.target===undefined)throw new TypeError("Class constructor TextDecoder cannot be invoked without 'new'");
    var name=label===undefined?'utf-8':String(label).trim().toLowerCase();
    if(name!=='utf-8'&&name!=='utf8'&&name!=='unicode-1-1-utf-8')throw new RangeError('The "'+name+'" encoding is not supported');
    var fatal=false,ignoreBOM=false;
    if(options!==undefined&&options!==null){fatal=!!options.fatal;ignoreBOM=!!options.ignoreBOM}
    addDecoder(this,{fatal:fatal,ignoreBOM:ignoreBOM})
  }
  method(TextDecoder.prototype,'decode',function decode_(input){
    var state=getDecoder(this);if(state===undefined)throw new TypeError('Illegal invocation');
    return decode(bytesOf(input),state.fatal,state.ignoreBOM)
  });
  getter(TextDecoder.prototype,'encoding',function(){return 'utf-8'});
  getter(TextDecoder.prototype,'fatal',function(){var s=getDecoder(this);if(s===undefined)throw new TypeError('Illegal invocation');return s.fatal});
  getter(TextDecoder.prototype,'ignoreBOM',function(){var s=getDecoder(this);if(s===undefined)throw new TypeError('Illegal invocation');return s.ignoreBOM});
  defineProperty(globalThis,'TextEncoder',{value:TextEncoder,writable:true,enumerable:false,configurable:true});
  defineProperty(globalThis,'TextDecoder',{value:TextDecoder,writable:true,enumerable:false,configurable:true});
})();
`;
