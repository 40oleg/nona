/** Original local database scanner and OS account adapter, inside process build. */
export const processAccountsSource=String.raw`
    function unknownCredential(kind,id){return argumentError('ERR_UNKNOWN_CREDENTIAL','Unknown '+kind+': '+String(id))}
    function accountName(name){if(typeof name!=='string')throw argumentError('ERR_INVALID_ARG_TYPE','The credential must be a number or name');if(name.indexOf('\0')!==-1)throw argumentError('ERR_INVALID_ARG_VALUE','The credential name must not contain NUL');return name}
    function decimalNumber(text,maximum){if(!text.length)return undefined;for(var i=0;i<text.length;i++){var digit=text.charCodeAt(i);if(digit<48||digit>57)return undefined}var number=Number(text);return Number.isInteger(number)&&number>=0&&number<=maximum?number:undefined}
    function accountNumber(text){return decimalNumber(text,4294967295)}
    function localAccounts(group){
      var text=readProcessFile(group?'/etc/group':'/etc/passwd'),lines=text.split('\n'),records=[];
      for(var i=0;i<lines.length;i++){var line=lines[i];if(!line||line[0]==='#'||line[0]==='+'||line[0]==='-')continue;
        if(line.charCodeAt(line.length-1)===13)line=line.slice(0,-1);var fields=line.split(':');if(fields.length<(group?4:7)||!fields[0])continue;
        var id=accountNumber(fields[2]);if(id===undefined)continue;
        if(group)records.push({name:fields[0],id:id,members:fields[3].split(',')});
        else{var gid=accountNumber(fields[3]);if(gid!==undefined)records.push({name:fields[0],id:id,gid:gid})}
      }return records
    }
    function pointerText(pointer){var bytes=new Uint8Array(host.length(pointer));host.copy(bytes,pointer,bytes.length);return decoder.decode(bytes)}
    function findAccount(id,group){
      if(typeof id==='number')numericId(id);else accountName(id);
      if(platform==='darwin'){
        // Copy the ABI prefix before another account lookup can replace OS TLS
        // storage. Native pointer fields are uint64; uid/gid are uint32.
        var pointer=typeof id==='number'?host[group?'getgrgid':'getpwuid'](id):host[group?'getgrnam':'getpwnam'](cstring(id));
        if(!pointer)throw unknownCredential(group?'group':'user',id);
        var fields=new Uint32Array(6);host.copy(fields,pointer,24);
        return {name:pointerText(unsigned64(fields,0)),id:fields[4],gid:group?fields[4]:fields[5]}
      }
      var records=localAccounts(group);for(var i=0;i<records.length;i++)if(typeof id==='number'?records[i].id===id:records[i].name===id)return records[i];
      throw unknownCredential(group?'group':'user',id)
    }
    function credentialId(id,group){return typeof id==='number'?numericId(id):findAccount(id,group).id}
    if(!windows){__nonaRegexpVm.processAccountName=function(id,group){return findAccount(id,group).name};__nonaRegexpVm.processAccountId=function(name,group){return findAccount(name,group).id}}
    if(!windows)value('initgroups',function(user,extraGroup){
      if(platform==='darwin'){
        var name=typeof user==='number'?findAccount(user,false).name:accountName(user),base=credentialId(extraGroup,true);
        if(host.initgroups(cstring(name),base)!==0)throw darwinEnvironmentError('initgroups',name);return
      }
      var account=findAccount(user,false),base=credentialId(extraGroup,true);
      var groups=[base],records=localAccounts(true);for(var i=0;i<records.length;i++)if(records[i].members.indexOf(account.name)!==-1&&groups.indexOf(records[i].id)===-1)groups.push(records[i].id);
      var ids=new Uint32Array(groups),r=host.sys_setgroups(ids.length,ids);if(r<0)throw hostError('initgroups',-r)
    });
`;
