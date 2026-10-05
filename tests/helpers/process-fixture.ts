export const processExtendedOracle=String.raw`
process.stdout.write('stdout\n');process.stderr.write('stderr\n');
console.log(process.stdin.fd,process.stdout.fd,process.stderr.fd);
let count=0;function listener(x){count+=x};process.on('test',listener);process.once('test',listener);console.log(process.emit('test',2),process.emit('test',3),count,process.listenerCount('test'));process.removeListener('test',listener);console.log(process.emit('test',1));
process.env.NONA_PROCESS_TEST=123;console.log(process.env.NONA_PROCESS_TEST,typeof process.env.NONA_PROCESS_TEST);delete process.env.NONA_PROCESS_TEST;console.log(process.env.NONA_PROCESS_TEST);
let cpu=process.cpuUsage();let diff=process.cpuUsage(cpu);console.log(cpu.user>=0,cpu.system>=0,diff.user>=0,diff.system>=0);
console.log(process.kill(process.pid,0));
process.once('warning',w=>console.log(w.name,w.message,w.code,w.detail));process.emitWarning('message',{type:'TestWarning',code:'NONA_TEST',detail:'detail'});
process.on('beforeExit',code=>console.log('beforeExit',code));process.on('exit',code=>console.log('exit',code));
`;

export const processReviewOracle=String.raw`
let n=0;process.on('x',()=>{if(++n===1)process.emit('x')});process.once('x',()=>console.log('once'));process.emit('x');
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>console.log('data',chunk));process.stdin.unref();
setTimeout(()=>console.log('timer'),50);
process.on('exit',code=>{console.log('exit',code);process.exitCode=7});
`;

