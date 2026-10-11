import {Buffer} from 'node:buffer';
const consumers=Buffer[Symbol.for('nona.stream.consumers')];
export default consumers;
export const arrayBuffer=consumers.arrayBuffer,blob=consumers.blob,buffer=consumers.buffer,bytes=consumers.bytes,json=consumers.json,text=consumers.text;
