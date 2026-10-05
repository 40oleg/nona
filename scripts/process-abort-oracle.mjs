import {spawnSync} from 'node:child_process';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32')throw Error('Windows abort oracle is restricted to isolated GitHub CI');
const source=`process.on('exit',()=>console.log('unexpected exit'));process.on('beforeExit',()=>console.log('unexpected beforeExit'));process.setUncaughtExceptionCaptureCallback(()=>console.log('unexpected capture'));let ref={};process.finalization.register(ref,()=>console.log('unexpected finalization'));process.abort();console.log('unexpected return');`;
const result=spawnSync(process.execPath,['-e',source],{encoding:'utf8',windowsHide:true,timeout:15000});
if(result.error||result.stdout!==''||result.status===0)throw Error(JSON.stringify({status:result.status,signal:result.signal,stdout:result.stdout,error:result.error?.message}));
console.log('Node abort oracle '+JSON.stringify({version:process.version,platform:process.platform,arch:process.arch,status:result.status,signal:result.signal,stdout:result.stdout}));
