/** Original POSIX exec boundary; no child runtime or interpreter is involved. */
export const processExecSource=String.raw`
    function execString(text,label){if(typeof text!=='string')throw argumentError('ERR_INVALID_ARG_TYPE',label+' must be a string');if(text.indexOf('\0')!==-1)throw argumentError('ERR_INVALID_ARG_VALUE',label+' must not contain NUL');return text}
    function packedVector(entries,setter){var bytes=encoder.encode(entries.length?entries.join('\0')+'\0':'');host[setter](bytes,bytes.length,entries.length)}
    if(!windows)value('execve',function(file,args,environment){
      file=execString(file,'file');args=args===undefined?[]:args;if(!Array.isArray(args))throw argumentError('ERR_INVALID_ARG_TYPE','args must be an array of strings');
      var argumentsList=[];for(var i=0;i<args.length;i++)argumentsList.push(execString(args[i],'args['+i+']'));
      environment=environment===undefined?process.env:environment;
      var entries,envPointer;if(environment===env){syncEnvironment(env);envPointer=host.environmentVector()}
      else{if(environment===null||typeof environment!=='object')throw argumentError('ERR_INVALID_ARG_TYPE','env must be an object');entries=[];var keys=Object.keys(environment);
        for(var i=0;i<keys.length;i++){var key=execString(keys[i],'env key'),entry=execString(environment[key],'env value');entries.push(key+'='+entry)}
        packedVector(entries,'replaceExecEnvironment');envPointer=host.execEnvironmentVector()
      }
      packedVector(argumentsList,'replaceArguments');var r=host.sys_execve(cstring(file),host.argumentVector(),envPointer);
      if(r<0)throw hostError('execve',-r,file);throw hostError('execve',5,file)
    });
`;
