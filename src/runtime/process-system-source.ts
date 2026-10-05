/** Original OS process helpers, inserted inside the lazy process build. */
export const processSystemSource=String.raw`
    function residentMemory(){
      if(windows){var memory=new Uint32Array(18);memory[0]=72;if(!host.K32GetProcessMemoryInfo(-1,memory,72))throw hostError('memoryUsage',5);return unsigned64(memory,4)}
      if(platform==='linux'){var status=readProcessFile('/proc/self/status'),rss=/^VmRSS:\s*(\d+)\s+kB/m.exec(status);if(!rss)throw hostError('memoryUsage',5);return Number(rss[1])*1024}
      if(platform==='darwin'){var task=new Uint32Array(24),r=host.sys_procinfo(2,host.sys_getpid(),4,0,task,96);if(r<0)throw hostError('memoryUsage',-r);if(r!==96)throw hostError('memoryUsage',5);return unsigned64(task,2)}
      var openbsd=platform==='openbsd',info=new Uint32Array(openbsd?97:1024),length=new Uint32Array([info.byteLength,0]);
      // OpenBSD 7.8 allows a prefix-sized kinfo_proc; RSS is int32 at byte384.
      // FreeBSD 14.3 amd64 RSS is segsz_t at byte264 after the 16 group IDs.
      var mib=openbsd?new Int32Array([1,66,1,host.sys_getpid(),388,1]):new Int32Array([1,14,1,host.sys_getpid()]);
      var r=host.sys_sysctl(mib,mib.length,info,length,null,0);if(r<0)throw hostError('memoryUsage',-r);
      if(length[0]<(openbsd?388:272))throw hostError('memoryUsage',5);
      var pages=openbsd?info[96]:unsigned64(info,66),pageSize;
      if(openbsd){var page=new Uint32Array(1),size=new Uint32Array([4,0]);r=host.sys_sysctl(new Int32Array([6,7]),2,page,size,null,0);if(r<0)throw hostError('memoryUsage',-r);pageSize=page[0]}
      else pageSize=freebsdNumber('hw.pagesize');return pages*pageSize
    }
    function memoryUsage(){var snapshot=new Uint32Array(8);host.heapSnapshot(snapshot);var backing=unsigned64(snapshot,4);return {rss:residentMemory(),heapTotal:unsigned64(snapshot,0),heapUsed:unsigned64(snapshot,2),external:backing,arrayBuffers:backing}}
    memoryUsage.rss=residentMemory;value('memoryUsage',memoryUsage);
    value('getActiveResourcesInfo',function(){
      var list=typeof __nonaRegexpVm.activeTimerResources==='function'?__nonaRegexpVm.activeTimerResources():[];
      if(__nonaRegexpVm.hasPendingIO())list.push('NonaStdin');return list
    });
    for(var action of ['ref','unref']){(function(action){value(action,function(object){
      if(object===null||object===undefined)return;var fn=object[Symbol.for('nodejs.'+action)];
      if(typeof fn==='function')apply(fn,object,[]);else if(typeof object[action]==='function')apply(object[action],object,[])
    })})(action)}
    input[Symbol.for('nodejs.ref')]=input.ref;input[Symbol.for('nodejs.unref')]=input.unref;
    function numericId(id){if(typeof id!=='number')throw argumentError('ERR_INVALID_ARG_TYPE','The id must be a number');if(!Number.isInteger(id)||id<0||id>4294967295)throw argumentError('ERR_OUT_OF_RANGE','The id must be an unsigned 32-bit integer',true);return id}
    if(!windows){
      value('getgroups',function(){
        for(var attempt=0;attempt<3;attempt++){
          var n=host.sys_getgroups(0,null);if(n<0)throw hostError('getgroups',-n);
          var groups=new Uint32Array(n),r=host.sys_getgroups(n,groups);if(r===-22)continue;if(r<0)throw hostError('getgroups',-r);
          var list=[];for(var i=0;i<r;i++)list.push(groups[i]);var effective=host.sys_getegid();if(list.indexOf(effective)===-1)list.push(effective);return list
        }throw hostError('getgroups',22)
      });
      for(var setter of ['setuid','setgid','seteuid','setegid']){(function(name){value(name,function(id){
        id=numericId(id);var r;if(platform==='linux'&&(name==='seteuid'||name==='setegid'))r=host[name==='seteuid'?'sys_setresuid':'sys_setresgid'](4294967295,id,4294967295);
        else r=host['sys_'+name](id);if(r<0)throw hostError(name,-r)
      })})(setter)}
      value('setgroups',function(groups){
        if(!Array.isArray(groups))throw argumentError('ERR_INVALID_ARG_TYPE','Groups must be an array');
        var ids=new Uint32Array(groups.length);for(var i=0;i<groups.length;i++)ids[i]=numericId(groups[i]);
        var r=host.sys_setgroups(ids.length,ids);if(r<0)throw hostError('setgroups',-r)
      });
    }
    function readProcessFile(path){
      var handle=windows?host.CreateFileW(wideString(path),0x80000000,7,null,3,0x80,null):host.sys_open(cstring(path),0,0);
      if(handle<0||handle===18446744073709551616)throw hostError('open',windows?(host.GetLastError()===5?13:2):-handle,path);
      var chunks=[],total=0,counter=new Uint32Array(1);
      try{for(;;){var bytes=new Uint8Array(65536),n;
        if(windows){if(!host.ReadFile(handle,bytes,bytes.length,counter,null))throw hostError('read',5,path);n=counter[0]}
        else{n=host.sys_read(handle,bytes,bytes.length);if(n===-4)continue;if(n<0)throw hostError('read',-n,path)}
        if(!n)break;chunks.push(bytes.subarray(0,n));total+=n
      }}finally{if(windows)host.CloseHandle(handle);else host.sys_close(handle)}
      var all=new Uint8Array(total),offset=0;for(var i=0;i<chunks.length;i++){all.set(chunks[i],offset);offset+=chunks[i].length}return decoder.decode(all)
    }
    function parseEnvironment(text){
      text=text.replace(/\r\n?/g,'\n');
      var result={},i=0,n=text.length;
      function space(c){return c===' '||c==='\t'||c==='\r'}
      function lineEnd(){while(i<n&&text[i]!=='\n')i++;if(i<n)i++}
      while(i<n){
        while(i<n&&(space(text[i])||text[i]==='\n'||text[i]==='\ufeff'))i++;
        if(text[i]==='#'){lineEnd();continue}
        if(text.slice(i,i+6)==='export'&&space(text[i+6])){i+=6;while(space(text[i]))i++}
        var start=i;while(i<n&&text[i]!=='='&&text[i]!=='\n')i++;
        if(text[i]!=='='){lineEnd();continue}var key=text.slice(start,i).trim();i++;
        if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)){lineEnd();continue}
        while(space(text[i]))i++;var quote=text[i],entry='';
        if(quote==='"'||quote==="'"||quote==='\x60'){
          i++;start=i;while(i<n&&text[i]!==quote)i++;entry=text.slice(start,i);if(i<n)i++;
          if(quote==='"')entry=entry.replace(/\\n/g,'\n');lineEnd()
        }else{start=i;while(i<n&&text[i]!=='\n'&&text[i]!=='#')i++;entry=text.slice(start,i).trim();lineEnd()}
        defineProperty(result,key,{value:entry,writable:true,enumerable:true,configurable:true})
      }return result
    }
    value('loadEnvFile',function(path){
      path=path===undefined?'./.env':path;
      if(ArrayBuffer.isView(path)&&path.BYTES_PER_ELEMENT===1)path=decoder.decode(path);
      if(typeof path!=='string')throw argumentError('ERR_INVALID_ARG_TYPE','The path must be a string or byte array');
      if(path.indexOf('\0')!==-1)throw argumentError('ERR_INVALID_ARG_VALUE','The path must not contain NUL');
      var parsed=parseEnvironment(readProcessFile(path));for(var key in parsed)if(env[key]===undefined)env[key]=parsed[key]
    });
    function optionalProcessFile(path){try{return readProcessFile(path)}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return null;throw error}}
    function numericFile(path){var text=optionalProcessFile(path);if(text===null)return 0;var number=Number(text.trim());return Number.isFinite(number)&&number>0&&number<Number.MAX_SAFE_INTEGER?number:0}
    function linuxCgroups(){
      var text=optionalProcessFile('/proc/self/cgroup'),entries=[];if(text===null)return entries;
      var lines=text.split('\n');for(var i=0;i<lines.length;i++){
        var parts=lines[i].split(':');if(parts.length!==3)continue;
        var unified=parts[0]==='0'&&parts[1]==='',memory=parts[1].split(',').indexOf('memory')!==-1;if(!unified&&!memory)continue;
        var segments=parts[2].split('/').filter(function(part){return part&&part!=='.'&&part!=='..'}),root=unified?'/sys/fs/cgroup':'/sys/fs/cgroup/memory';
        for(var depth=segments.length;depth>=0;depth--){var base=root+(depth?'/'+segments.slice(0,depth).join('/'):'');entries.push({limit:base+(unified?'/memory.max':'/memory.limit_in_bytes'),current:base+(unified?'/memory.current':'/memory.usage_in_bytes')})}
      }return entries
    }
    function windowsMemory(){var words=new Uint32Array(16);words[0]=64;if(!host.GlobalMemoryStatusEx(words))throw hostError('GlobalMemoryStatusEx',5);return words}
    function constrainedMemory(){
      var limit=0;
      function include(n){if(n>0&&n<Number.MAX_SAFE_INTEGER&&(limit===0||n<limit))limit=n}
      if(windows){
        var inJob=new Uint32Array(1);if(!host.IsProcessInJob(-1,null,inJob))throw hostError('IsProcessInJob',5);if(!inJob[0])return 0;
        var job=new Uint32Array(36);if(!host.QueryInformationJobObject(null,9,job,144,null))throw hostError('QueryInformationJobObject',5);
        if(job[4]&0x100)include(unsigned64(job,28));if(job[4]&0x200)include(unsigned64(job,30));return limit
      }
      var resources=[2];if(platform==='linux')resources.push(9);else if(platform==='freebsd')resources.push(10);else if(platform==='darwin')resources.push(5);
      for(var i=0;i<resources.length;i++){var bounds=new Uint32Array(4),r=host.sys_getrlimit(resources[i],bounds);if(r<0)throw hostError('getrlimit',-r);include(unsigned64(bounds,0))}
      if(platform==='linux'){var entries=linuxCgroups();for(var i=0;i<entries.length;i++)include(numericFile(entries[i].limit))}return limit
    }
    function sysctlBytes(mib,size,newBytes){var bytes=new Uint8Array(size),length=new Uint32Array([size,0]);var r=host.sys_sysctl(new Int32Array(mib),mib.length,bytes,length,newBytes||null,newBytes?newBytes.length:0);if(r<0)throw hostError('sysctl',-r);return bytes.subarray(0,length[0])}
    function freebsdNumber(name){var oidBytes=sysctlBytes([0,3],96,cstring(name)),oid=[];var words=new Uint32Array(oidBytes.buffer,oidBytes.byteOffset,oidBytes.length/4);for(var i=0;i<words.length;i++)oid.push(words[i]);var result=sysctlBytes(oid,8),value=new Uint32Array(result.buffer,result.byteOffset,result.length/4);return value.length===1?value[0]:unsigned64(value,0)}
    var machHost=null;
    function availableMemory(){
      var available;
      if(windows)available=unsigned64(windowsMemory(),4);
      else if(platform==='linux'){
        var info=readProcessFile('/proc/meminfo'),match=/^MemAvailable:\s*(\d+)\s+kB/m.exec(info);if(!match)throw hostError('meminfo',5);available=Number(match[1])*1024;
        var entries=linuxCgroups();for(var i=0;i<entries.length;i++){var limit=numericFile(entries[i].limit);if(limit)available=Math.min(available,Math.max(0,limit-numericFile(entries[i].current)))}
      }else if(platform==='freebsd')available=freebsdNumber('vm.stats.vm.v_free_count')*freebsdNumber('hw.pagesize');
      else if(platform==='openbsd'){var bytes=sysctlBytes([2,4],4096),stats=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);available=stats[0]*stats[4]}
      else{
        if(machHost===null)machHost=host.mach_host_self();var pageSize=new Uint32Array(1),stats=new Uint32Array(64),count=new Uint32Array([64]);
        var r=host.host_page_size(machHost,pageSize);if(r!==0)throw hostError('host_page_size',5);
        r=host.host_statistics64(machHost,4,stats,count);if(r!==0)throw hostError('host_statistics64',5);available=pageSize[0]*stats[0]
      }
      var limit=constrainedMemory();if(limit)available=Math.min(available,limit);return available
    }
    value('constrainedMemory',constrainedMemory);value('availableMemory',availableMemory);
`;
