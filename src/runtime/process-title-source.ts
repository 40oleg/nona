/** Original OS-observable title operations, inside the lazy process build. */
export const processTitleSource=String.raw`
    var titleCapacity,psStrings,windowsTitle=windows?execPath:undefined;
    function processTitle(){
      if(windows)return windowsTitle;
      var pointer=host.titleAddress();return pointer?nativeString(pointer):''
    }
    function setProcessTitle(value){
      var text=''+value,nul=text.indexOf('\0');if(nul>=0)text=text.slice(0,nul);
      if(windows){host.SetConsoleTitleW(wideString(text));windowsTitle=text;return}
      if(platform==='freebsd'||platform==='openbsd'){
        if(psStrings===undefined){
          if(platform==='freebsd')psStrings=freebsdNumber('kern.ps_strings');
          else{var pointer=new Uint32Array(2),length=new Uint32Array([8,0]),r=host.sys_sysctl(new Int32Array([2,3]),2,pointer,length,null,0);if(r<0)throw hostError('title',-r);if(length[0]!==8)throw hostError('title',5);psStrings=unsigned64(pointer,0)}
          if(!psStrings)throw hostError('title',5)
        }
        var bytes=encoder.encode(text);if(bytes.length>2047)bytes=bytes.subarray(0,2047);
        if(platform==='freebsd'){var terminated=new Uint8Array(bytes.length+1);copyProcessBytes(bytes,terminated,0);var r=host.sys_sysctl(new Int32Array([1,14,7,-1]),4,null,null,terminated,terminated.length);if(r<0)throw hostError('title',-r)}
        host.writePsTitle(psStrings,bytes,bytes.length);return
      }
      if(titleCapacity===undefined)titleCapacity=host.titleCapacity();if(!titleCapacity)throw hostError('title',5);
      var bytes=encoder.encode(text);if(bytes.length>titleCapacity)bytes=bytes.subarray(0,titleCapacity);
      if(platform==='linux'){var name=new Uint8Array(16);copyProcessBytes(bytes.subarray(0,15),name,0);var r=host.sys_prctl(15,name,0,0,0);if(r<0)throw hostError('title',-r)}
      host.writeArgumentTitle(bytes,bytes.length,titleCapacity)
    }
    defineProperty(process,'title',{enumerable:true,configurable:true,get:processTitle,set:setProcessTitle});
`;
