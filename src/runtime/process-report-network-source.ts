/** Original native interface snapshots, inserted inside the process build. */
export const processReportNetworkIntrinsicsSource=String.raw`
  var networkIntrinsics={Uint8Array:Uint8Array,Uint32Array:Uint32Array,Int32Array:Int32Array,DataView:DataView,Map:Map,Set:Set,Math:{min:Math.min,max:Math.max,pow:Math.pow},String:{fromCharCode:String.fromCharCode},Array:{from:Array.from}};
`;
export const processReportNetworkSource=String.raw`
    __nonaRegexpVm.processReportNetworkInterfaces=(function(){
      var Uint8Array=networkIntrinsics.Uint8Array,Uint32Array=networkIntrinsics.Uint32Array,Int32Array=networkIntrinsics.Int32Array,DataView=networkIntrinsics.DataView,Map=networkIntrinsics.Map,Set=networkIntrinsics.Set,Math=networkIntrinsics.Math,String=networkIntrinsics.String,Array=networkIntrinsics.Array;
      function view(bytes){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)}
      function u16(bytes,at){return view(bytes).getUint16(at,true)}
      function u32(bytes,at){return view(bytes).getUint32(at,true)}
      function pointer(bytes,at){return u32(bytes,at)+u32(bytes,at+4)*4294967296}
      function read(address,size){var bytes=new Uint8Array(size);host.copy(bytes,address,size);return bytes}
      function text(bytes){var end=0;while(end<bytes.length&&bytes[end])end++;return decoder.decode(bytes.subarray(0,end))}
      function nativeText(address){return text(read(address,host.length(address)))}
      function nativeWide(address){if(typeof wide==='function')return wide(address,host.lstrlenW(address));var result='';for(var i=0;i<32768;i++){var unit=u16(read(address+i*2,2),0);if(!unit)return result;result+=String.fromCharCode(unit)}throw hostError('networkInterfaces',22)}
      function mac(bytes){var parts=[];for(var i=0;i<bytes.length;i++)parts.push(bytes[i].toString(16).padStart(2,'0'));return parts.join(':')}
      function ip(bytes){
        if(bytes.length===4)return Array.from(bytes).join('.');
        var words=[];for(var i=0;i<16;i+=2)words.push(bytes[i]*256+bytes[i+1]);
        if(words[0]===0&&words[1]===0&&words[2]===0&&words[3]===0&&words[4]===0&&words[5]===65535)return '::ffff:'+ip(bytes.subarray(12));
        var start=-1,length=0;for(var i=0;i<8;){if(words[i]!==0){i++;continue}var end=i;while(end<8&&words[end]===0)end++;if(end-i>length){start=i;length=end-i}i=end}
        if(length<2)return words.map(function(n){return n.toString(16)}).join(':');
        return words.slice(0,start).map(function(n){return n.toString(16)}).join(':')+'::'+words.slice(start+length).map(function(n){return n.toString(16)}).join(':')
      }
      function mask(length,prefix){var bytes=new Uint8Array(length);for(var i=0;i<length;i++){var bits=Math.min(8,Math.max(0,prefix-i*8));bytes[i]=bits?256-Math.pow(2,8-bits):0}return bytes}
      function entry(info,address,netmask,scope){var result={name:info.name,internal:info.internal,mac:info.mac||'00:00:00:00:00:00',address:ip(address),netmask:ip(netmask),family:address.length===4?'IPv4':'IPv6'};if(address.length===16)result.scopeid=scope||0;return result}
      function windowsSnapshot(){
        var size=new Uint32Array(1),status=host.GetAdaptersAddresses(0,14,null,null,size);if(status===232)return [];if(status!==111&&status!==0)throw hostError('networkInterfaces',status);
        var bytes;
        for(var attempt=0;attempt<8;attempt++){if(!size[0]||size[0]>16777216)throw hostError('networkInterfaces',12);bytes=new Uint8Array(size[0]);status=host.GetAdaptersAddresses(0,14,null,bytes,size);if(status!==111)break}
        if(status===232)return [];if(status!==0)throw hostError('networkInterfaces',status);
        var output=[],adapter=bytes,seen=new Set();
        for(;;){
          var length=u32(adapter,0);if(length<112)throw hostError('networkInterfaces',22);
          var friendly=pointer(adapter,72),info={name:friendly?nativeWide(friendly):nativeText(pointer(adapter,16)),internal:u32(adapter,100)===24,mac:mac(adapter.subarray(80,80+Math.min(8,u32(adapter,88))))};
          var current=pointer(adapter,24),addresses=new Set();
          while(current){if(addresses.has(current))throw hostError('networkInterfaces',22);addresses.add(current);var unicast=read(current,64);if(u32(unicast,0)<57)throw hostError('networkInterfaces',22);var socket=read(pointer(unicast,16),Math.min(28,u32(unicast,24))),family=u16(socket,0),count=family===2?4:family===23?16:0;
            if(count){var at=count===4?4:8;if(socket.length<at+count)throw hostError('networkInterfaces',22);var prefix=unicast[56];if(prefix<=count*8)output.push(entry(info,socket.subarray(at,at+count),mask(count,prefix),count===16?u32(socket,24):0))}
            current=pointer(unicast,8)
          }
          var next=pointer(adapter,8);if(!next)break;if(seen.has(next))throw hostError('networkInterfaces',22);seen.add(next);adapter=read(next,112)
        }return output
      }
      function linuxSnapshot(){
        var fd=host.networkSocket(16,524291,0);if(fd<0)throw hostError('networkInterfaces',-fd);
        var interfaces=new Map(),output=[];
        function attributes(bytes,start,end){var result=new Map();for(var at=start;at<end;){if(at+4>end)throw hostError('networkInterfaces',22);var length=u16(bytes,at);if(length<4||at+length>end)throw hostError('networkInterfaces',22);result.set(u16(bytes,at+2)&16383,bytes.slice(at+4,at+length));at+=(length+3)&~3}return result}
        function dump(kind,sequence){
          var request=new Uint8Array(kind===18?32:24),header=view(request);header.setUint32(0,request.length,true);header.setUint16(4,kind,true);header.setUint16(6,769,true);header.setUint32(8,sequence,true);var destination=new Uint8Array(12);view(destination).setUint16(0,16,true);
          var sent;do{sent=host.networkSend(fd,request,request.length,0,destination,destination.length)}while(sent===-4);if(sent!==request.length)throw hostError('networkInterfaces',sent<0?-sent:5);
          var packet=new Uint8Array(1048576);
          for(;;){var count;do{count=host.networkReceive(fd,packet,packet.length,32,null,null)}while(count===-4);if(count<=0||count>packet.length)throw hostError('networkInterfaces',count<0?-count:105);
            for(var at=0;at<count;){if(at+16>count)throw hostError('networkInterfaces',22);var length=u32(packet,at),type=u16(packet,at+4),flags=u16(packet,at+6);if(length<16||at+length>count)throw hostError('networkInterfaces',22);
              if(u32(packet,at+8)===sequence){if(flags&16)throw hostError('networkInterfaces',4);if(type===3){if(length>=20&&view(packet).getInt32(at+16,true)!==0)throw hostError('networkInterfaces',-view(packet).getInt32(at+16,true));return}if(type===2){if(length<20)throw hostError('networkInterfaces',22);var error=view(packet).getInt32(at+16,true);if(error)throw hostError('networkInterfaces',-error)}
                if(type===16&&length>=32){var attrs=attributes(packet,at+32,at+length),name=attrs.get(3);interfaces.set(u32(packet,at+20),{name:name?text(name):'',internal:!!(u32(packet,at+24)&8),mac:attrs.has(1)?mac(attrs.get(1)):''})}
                if(type===20&&length>=24){var family=packet[at+16],size=family===2?4:family===10?16:0,attrs=attributes(packet,at+24,at+length),address=attrs.get(family===2?2:1)||attrs.get(1),info=interfaces.get(u32(packet,at+20));if(size&&info&&address&&address.length===size&&packet[at+17]<=size*8){var label=attrs.get(3);if(label)info={name:text(label),internal:info.internal,mac:info.mac};var scope=size===16&&address[0]===254&&(address[1]&192)===128?u32(packet,at+20):0;output.push(entry(info,address,mask(size,packet[at+17]),scope))}}
              }at+=(length+3)&~3
            }
          }
        }
        try{dump(18,1);dump(22,2);return output}finally{host.sys_close(fd)}
      }
      function darwinSnapshot(){
        var first=new Uint32Array(2);if(host.getifaddrs(first)!==0)throw hostError('networkInterfaces',5);var head=first[0]+first[1]*4294967296,rows=[],interfaces=new Map(),seen=new Set();
        try{for(var current=head;current;){if(seen.has(current))throw hostError('networkInterfaces',22);seen.add(current);var record=read(current,56),name=nativeText(pointer(record,8)),address=pointer(record,24),netmask=pointer(record,32);if(address){var header=read(address,2),socket=read(address,header[0]),family=header[1];if(family===18&&socket.length>=8){var nameLength=socket[5],macLength=socket[6];if(8+nameLength+macLength>socket.length)throw hostError('networkInterfaces',22);interfaces.set(name,{name:name,internal:!!(u32(record,16)&8),mac:mac(socket.subarray(8+nameLength,8+nameLength+macLength))})}else if((family===2&&socket.length>=8)||(family===30&&socket.length>=28)){rows.push({name:name,internal:!!(u32(record,16)&8),socket:socket,mask:netmask?read(netmask,read(netmask,1)[0]):new Uint8Array(0)})}}current=pointer(record,0)}
          var output=[];for(var i=0;i<rows.length;i++){var row=rows[i],size=row.socket[1]===2?4:16,at=size===4?4:8,maskBytes=new Uint8Array(size);maskBytes.set(row.mask.subarray(at,Math.min(at+size,row.mask.length)));output.push(entry(interfaces.get(row.name)||{name:row.name,internal:row.internal,mac:''},row.socket.subarray(at,at+size),maskBytes,size===16?u32(row.socket,24):0))}return output
        }finally{if(head)host.freeifaddrs(head)}
      }
      function bsdSnapshot(){
        var open=platform==='openbsd',mib=new Int32Array([4,17,0,0,open?3:5,0]),size=new Uint32Array(2),bytes,status;
        for(var attempt=0;attempt<8;attempt++){status=host.sys_sysctl(mib,6,null,size,null,0);if(status<0)throw hostError('networkInterfaces',-status);if(size[1]||size[0]>16777216)throw hostError('networkInterfaces',12);bytes=new Uint8Array(size[0]);status=host.sys_sysctl(mib,6,bytes,size,null,0);if(status!==-12)break}
        if(status<0)throw hostError('networkInterfaces',-status);if(size[1]||size[0]>bytes.length)throw hostError('networkInterfaces',22);
        var interfaces=new Map(),rows=[];
        for(var at=0;at<size[0];){if(at+4>size[0])throw hostError('networkInterfaces',22);var length=u16(bytes,at),type=bytes[at+3];if(length<4||at+length>size[0])throw hostError('networkInterfaces',22);if(type!==14&&type!==12){at+=length;continue}if(length<20)throw hostError('networkInterfaces',22);var header=u16(bytes,at+(open?4:16)),index=u16(bytes,at+(open?6:12)),bits=u32(bytes,at+(open?12:4)),flags=u32(bytes,at+(open?16:8));if(header<20||header>length)throw hostError('networkInterfaces',22);
          if(type===14||type===12){var addresses=new Map(),offset=at+header;for(var bit=0;bit<8;bit++)if(bits&(1<<bit)){if(offset+2>at+length)throw hostError('networkInterfaces',22);var count=bytes[offset];if(offset+count>at+length)throw hostError('networkInterfaces',22);addresses.set(bit,bytes.slice(offset,offset+count));offset+=count?(count+7)&~7:8}
            if(type===14){var link=addresses.get(4);if(link&&link.length>=8){var nameLength=link[5],macLength=link[6];if(8+nameLength+macLength>link.length)throw hostError('networkInterfaces',22);interfaces.set(index,{name:decoder.decode(link.subarray(8,8+nameLength)),internal:!!(flags&8),mac:mac(link.subarray(8+nameLength,8+nameLength+macLength))})}}
            else{var address=addresses.get(5);if(address)rows.push({index:index,address:address,mask:addresses.get(2)||new Uint8Array(0)})}
          }at+=length
        }
        var output=[];for(var i=0;i<rows.length;i++){var row=rows[i],info=interfaces.get(row.index),family=row.address[1],size=family===2?4:family===(open?24:28)?16:0;if(!info||!size)continue;var at=size===4?4:8;if(row.address.length<at+size)throw hostError('networkInterfaces',22);var address=row.address.slice(at,at+size),maskBytes=new Uint8Array(size),scope=size===16&&row.address.length>=28?u32(row.address,24):0;maskBytes.set(row.mask.subarray(at,Math.min(at+size,row.mask.length)));if(size===16&&address[0]===254&&(address[1]&192)===128){scope=scope||(address[2]*256+address[3]);address[2]=0;address[3]=0}output.push(entry(info,address,maskBytes,scope))}return output
      }
      return function(){return windows?windowsSnapshot():platform==='linux'?linuxSnapshot():platform==='darwin'?darwinSnapshot():bsdSnapshot()}
    })();
`;

/** The network snapshot adds OS services only to the corresponding target. */
export function processReportNetworkHosts(target:string):[string,string,string,string][] {
 if(target==='win32-x64')return [['GetAdaptersAddresses','IPHLPAPI.dll','GetAdaptersAddresses','u32(u32,u32,ptr,buf,buf)'],...processReportNetworkHosts('linux-x64')];
 if(target==='win32-arm64')return [['GetAdaptersAddresses','IPHLPAPI.dll','GetAdaptersAddresses','u32(u32,u32,ptr,buf,buf)']];
 if(target.startsWith('darwin-'))return [['getifaddrs','/usr/lib/libSystem.B.dylib','getifaddrs','i32(buf)'],['freeifaddrs','/usr/lib/libSystem.B.dylib','freeifaddrs','void(ptr)']];
 if(target.startsWith('linux-')){const arm=target.endsWith('arm64');return [['networkSocket','syscall',arm?'198':'41','i64(i32,i32,i32)'],['networkSend','syscall',arm?'206':'44','i64(i64,buf,u64,i32,buf,u32)'],['networkReceive','syscall',arm?'207':'45','i64(i64,buf,u64,i32,ptr,ptr)']]}
 return [];
}
