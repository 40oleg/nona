import process, {hrtime, nextTick} from 'node:process';

const started = hrtime.bigint();
if (process.env.NONA_SAMPLE_ENV_FILE) process.loadEnvFile(process.env.NONA_SAMPLE_ENV_FILE);
process.stdout.write('Native process APIs\n');
console.log(process.availableMemory(), process.constrainedMemory());
if (typeof process.getgroups === 'function') console.log(process.getgroups().join(','));
console.log(process.platform, process.arch, process.pid, process.ppid);
console.log(process.cwd(), process.argv.slice(1));
nextTick(() => console.log('tick', String(hrtime.bigint() - started)));
Promise.resolve().then(() => console.log('promise'));
console.log(process.memoryUsage());
