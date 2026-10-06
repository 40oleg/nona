
/** node:string_decoder: decodes byte chunks without splitting multi-byte characters. */
export const stringDecoderModuleSource=String.raw`
import { Buffer } from 'node:buffer';
export class StringDecoder {
  constructor(encoding) {
    const normalized = encoding === undefined ? 'utf8' : String(encoding).toLowerCase().replace('-', '');
    this.encoding = normalized === 'utf8' ? 'utf8' : normalized === 'binary' ? 'latin1' : normalized === 'ucs2' ? 'utf16le' : normalized;
    if (!Buffer.isEncoding(this.encoding)) {
      const error = new TypeError('Unknown encoding: ' + encoding);
      error.code = 'ERR_UNKNOWN_ENCODING';
      throw error;
    }
    this.pending = new Uint8Array(0);
  }
  write(chunk) {
    if (typeof chunk === 'string') return chunk;
    let bytes = chunk;
    if (this.pending.length > 0) { bytes = new Uint8Array(this.pending.length + chunk.length); bytes.set(this.pending); bytes.set(chunk, this.pending.length); }
    let keep = 0;
    if (this.encoding === 'utf8') {
      // Hold back an incomplete sequence at the end of the chunk.
      for (let i = bytes.length - 1, n = 1; i >= 0 && n <= 4; i--, n++) {
        const b = bytes[i];
        if ((b & 0xc0) === 0x80) continue;
        const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
        if (need > n) keep = n;
        break;
      }
    } else if (this.encoding === 'utf16le') keep = bytes.length % 2;
    else if (this.encoding === 'base64' || this.encoding === 'base64url') keep = bytes.length % 3;
    this.pending = bytes.slice(bytes.length - keep);
    const body = bytes.subarray(0, bytes.length - keep);
    return Buffer.from(body.buffer, body.byteOffset, body.length).toString(this.encoding);
  }
  end(chunk) {
    let out = chunk === undefined ? '' : this.write(chunk);
    if (this.pending.length > 0) { out += Buffer.from(this.pending).toString(this.encoding); this.pending = new Uint8Array(0); }
    return out;
  }
}
export default { StringDecoder };
`;
