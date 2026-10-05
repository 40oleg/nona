export const processExtendedOracle=String.raw`
process.stdout.write('stdout\n');process.stderr.write('stderr\n');
console.log(process.stdin.fd,process.stdout.fd,process.stderr.fd);
let count=0;function listener(x){count+=x};process.on('test',listener);process.once('test',listener);console.log(process.emit('test',2),process.emit('test',3),count,process.listenerCount('test'));process.removeListener('test',listener);console.log(process.emit('test',1));
process.env.NONA_PROCESS_TEST=123;console.log(process.env.NONA_PROCESS_TEST,typeof process.env.NONA_PROCESS_TEST);delete process.env.NONA_PROCESS_TEST;console.log(process.env.NONA_PROCESS_TEST);
let cpu=process.cpuUsage();let diff=process.cpuUsage(cpu);console.log(cpu.user>=0,cpu.system>=0,diff.user>=0,diff.system>=0);
console.log(process.kill(process.pid,0));
process.once('warning',w=>console.log(w.name,w.message,w.code,w.detail));process.emitWarning('message',{type:'TestWarning',code:'NONA_TEST',detail:'detail'});
process.on('beforeExit',code=>console.log('beforeExit',code));process.on('exit',code=>console.log('exit',code));
let inventory=setTimeout(()=>{},10);console.log(process.getActiveResourcesInfo().filter(name=>name==='Timeout').length);clearTimeout(inventory);
if(typeof process.getgroups==='function'){console.log(process.getgroups().includes(process.getegid()));if(process.getuid()===process.geteuid()&&process.getgid()===process.getegid()){process.setuid(process.getuid());process.seteuid(process.geteuid());process.setgid(process.getgid());process.setegid(process.getegid());console.log('same identities')}}
console.log(typeof process.loadEnvFile,typeof process.constrainedMemory,typeof process.availableMemory);
let memoryBuffer=new ArrayBuffer(262144),sharedMemoryBuffer=new SharedArrayBuffer(1024),memory=process.memoryUsage();
console.log(Object.keys(memory).join(','),memory.rss>0,memory.heapTotal>=memory.heapUsed,memory.external>=memory.arrayBuffers,memory.arrayBuffers>=memoryBuffer.byteLength+sharedMemoryBuffer.byteLength,process.memoryUsage.rss()>0);
`;

export const processReviewOracle=String.raw`
let n=0;process.on('x',()=>{if(++n===1)process.emit('x')});process.once('x',()=>console.log('once'));process.emit('x');
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>console.log('data',chunk));process.stdin.unref();
setTimeout(()=>console.log('timer'),50);
process.on('exit',code=>{console.log('exit',code);process.exitCode=7});
`;
export const processEnvironmentOracle=String.raw`
Object.assign(process.env,{NONA_ASSIGN:42});
Object.defineProperty(process.env,'NONA_DEFINE',{value:73,writable:true,enumerable:true,configurable:true});
try{Object.defineProperty(process.env,'NONA_INVALID',{value:1})}catch(error){console.log(error.code)}
process.env['NONA_NUL\0suffix']='a\0b';process.env['NONA=INVALID']='ignored';process.env['']='ignored';
console.log(JSON.stringify([process.env.NONA_ASSIGN,process.env.NONA_DEFINE,process.env.NONA_NUL,process.env['NONA_NUL\0suffix'],process.env['NONA=INVALID'],process.env[''],'NONA_NUL\0suffix' in process.env,Object.getOwnPropertyDescriptor(process.env,'NONA_NUL\0suffix').value]));
delete process.env['NONA_NUL\0suffix'];console.log(process.env.NONA_NUL===undefined);
`;

