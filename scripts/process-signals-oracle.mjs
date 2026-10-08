// CI-only same-OS Node behavior recorder; never signals the harness process.
import {spawnSync} from 'node:child_process';
import {processSignalDeliveryProbe,processSignalUnreferencedProbe,processSignalRestorationProbe,processSignalBurstProbe} from '../dist/tests/probes/process-signals-probe.js';
if(process.env.GITHUB_ACTIONS!=='true'||!['linux','darwin'].includes(process.platform))throw new Error('Signal oracle requires isolated POSIX GitHub CI');
for(const [name,source,expected,signal] of [
 ['delivery',processSignalDeliveryProbe,'SIGTERM 1 0\ndone 1\n',null],
 ['unreferenced',processSignalUnreferencedProbe,'registered\n',null],
 ['restoration',processSignalRestorationProbe,'','SIGTERM'],
 ['burst',processSignalBurstProbe,null,null],
]){
 const result=spawnSync(process.execPath,['-e',source],{encoding:'utf8',env:{},timeout:15000});
 if(result.error||(signal?result.status!==null||result.signal!==signal:result.status!==0||result.signal!==null)||(expected!==null&&result.stdout!==expected)||(name==='burst'&&!/^hits [1-5]\n$/.test(result.stdout)))throw new Error(`Signal oracle ${name} failed: ${JSON.stringify({status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr,error:String(result.error??'')})}`);
 console.log(JSON.stringify({name,version:process.version,platform:process.platform,arch:process.arch,status:result.status,signal:result.signal,stdout:result.stdout}));
}
