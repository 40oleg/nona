import {Buffer, Blob, File, isUtf8} from 'node:buffer';

const packet = Buffer.alloc(8);
packet.writeUInt32BE(0x12345678, 0);
packet.writeFloatLE(1.5, 4);
console.log(packet.toString('hex'), packet.readUInt32BE(0), packet.readFloatLE(4));

const text = Buffer.from('Hello, é😀');
console.log(text.toString('base64url'), isUtf8(text));
const shared = text.subarray(0, 5);
shared[0] = 104;
console.log(text.toString());

const blob = new Blob([text], {type: 'text/plain'});
const file = new File([blob], 'hello.txt', {lastModified: 123});
console.log(file.name, file.size, file.type);
file.text().then(text => console.log(text));
