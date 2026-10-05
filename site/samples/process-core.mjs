import process, {hrtime, nextTick} from 'node:process';

const started = hrtime.bigint();
console.log(process.platform, process.arch, process.pid, process.ppid);
console.log(process.cwd(), process.argv.slice(1));
nextTick(() => console.log('tick', String(hrtime.bigint() - started)));
Promise.resolve().then(() => console.log('promise'));
