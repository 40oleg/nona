import {Readable, Transform, Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {text} from 'node:stream/consumers';

async function main() {
const upper = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});
const sink = new Writable({
  write(chunk, encoding, callback) {
    console.log(chunk.toString());
    callback();
  }
});
await pipeline(Readable.from(['hello', 'streams']), upper, sink);
console.log(await text(Readable.from(['finished', '\n'])));
console.log(await Readable.from([1, 2, 3]).map(value => value * 2).toArray());

}
main().catch(error => { console.error(error); process.exitCode = 1; });
