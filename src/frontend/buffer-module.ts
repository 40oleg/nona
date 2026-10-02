/**
 * Source of the built-in `node:buffer` (alias `nona:buffer`) and
 * `node:string_decoder` modules. Buffer is a Uint8Array subclass, as in
 * Node.js, so typed array methods and nona:ffi `buf` parameters accept it.
 * Importing node:buffer (directly or through node:net/node:http) also
 * installs the global `Buffer` that Node.js programs expect.
 */
export const bufferModuleSource=String.raw`
const encoder = new TextEncoder(), decoder = new TextDecoder();
const fromCharCode = String.fromCharCode;
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64Values = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) base64Values[base64Chars.charCodeAt(i)] = i;
base64Values[45] = 62; base64Values[95] = 63;
function invalidArgType(name, expected, value) {
  const error = new TypeError('The "' + name + '" argument must be ' + expected + '. Received ' + (value === null ? 'null' : value === undefined ? 'undefined' : 'type ' + typeof value));
  error.code = 'ERR_INVALID_ARG_TYPE';
  return error;
}
function normalizeEncoding(encoding) {
  if (encoding === undefined || encoding === null || encoding === '') return 'utf8';
  switch (String(encoding).toLowerCase()) {
    case 'utf8': case 'utf-8': return 'utf8';
    case 'latin1': case 'binary': return 'latin1';
    case 'ascii': return 'ascii';
    case 'hex': return 'hex';
    case 'base64': return 'base64';
    case 'base64url': return 'base64url';
    case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': return 'utf16le';
    default: return undefined;
  }
}
function encodingOrThrow(encoding) {
  const normalized = normalizeEncoding(encoding);
  if (normalized === undefined) {
    const error = new TypeError('Unknown encoding: ' + encoding);
    error.code = 'ERR_UNKNOWN_ENCODING';
    throw error;
  }
  return normalized;
}
function latin1String(bytes, start, end, mask) {
  let out = '';
  for (let i = start; i < end; i += 4096) {
    const stop = Math.min(end, i + 4096), units = [];
    for (let j = i; j < stop; j++) units.push(bytes[j] & mask);
    out += fromCharCode.apply(undefined, units);
  }
  return out;
}
function hexString(bytes, start, end) {
  let out = '';
  for (let i = start; i < end; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return out;
}
function base64String(bytes, start, end, url) {
  const chars = url ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_' : base64Chars;
  let out = '', i = start;
  for (; i + 2 < end; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[n >> 18] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  if (end - i === 1) { const n = bytes[i] << 16; out += chars[n >> 18] + chars[(n >> 12) & 63] + (url ? '' : '=='); }
  else if (end - i === 2) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8); out += chars[n >> 18] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + (url ? '' : '='); }
  return out;
}
function utf16String(bytes, start, end) {
  let out = '';
  for (let i = start; i + 1 < end; i += 2) out += fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  return out;
}
function decodeBase64(string) {
  const out = new Uint8Array(Math.ceil(string.length * 3 / 4));
  let bits = 0, count = 0, n = 0;
  for (let i = 0; i < string.length; i++) {
    const c = string.charCodeAt(i);
    if (c === 61) break;
    const v = c < 128 ? base64Values[c] : -1;
    if (v < 0) continue;
    bits = (bits << 6) | v; count += 6;
    if (count >= 8) { count -= 8; out[n++] = (bits >> count) & 255; }
  }
  return out.subarray(0, n);
}
function decodeHex(string) {
  const out = new Uint8Array(string.length >> 1);
  let n = 0;
  for (; n < out.length; n++) {
    const v = parseInt(string.substr(n * 2, 2), 16);
    if (v !== v || !/^[0-9a-fA-F]{2}$/.test(string.substr(n * 2, 2))) break;
    out[n] = v;
  }
  return out.subarray(0, n);
}
/** The bytes of a string in an encoding, as a plain Uint8Array. */
function encodeString(string, encoding) {
  switch (encoding) {
    case 'utf8': return encoder.encode(string);
    case 'latin1': case 'ascii': { const out = new Uint8Array(string.length); for (let i = 0; i < string.length; i++) out[i] = string.charCodeAt(i) & 255; return out; }
    case 'hex': return decodeHex(string);
    case 'base64': case 'base64url': return decodeBase64(string);
    case 'utf16le': { const out = new Uint8Array(string.length * 2); for (let i = 0; i < string.length; i++) { const c = string.charCodeAt(i); out[2 * i] = c & 255; out[2 * i + 1] = c >> 8; } return out; }
  }
}
function decodeBytes(bytes, encoding, start, end) {
  switch (encoding) {
    case 'utf8': return decoder.decode(start === 0 && end === bytes.length ? bytes : bytes.subarray(start, end));
    case 'latin1': return latin1String(bytes, start, end, 255);
    case 'ascii': return latin1String(bytes, start, end, 127);
    case 'hex': return hexString(bytes, start, end);
    case 'base64': return base64String(bytes, start, end, false);
    case 'base64url': return base64String(bytes, start, end, true);
    case 'utf16le': return utf16String(bytes, start, end);
  }
}
function clampIndex(value, length, fallback) {
  if (value === undefined) return fallback;
  value = Math.trunc(Number(value)) || 0;
  if (value < 0) value = 0;
  return value > length ? length : value;
}
function checkInt(buffer, offset, size) {
  if (offset === undefined) offset = 0;
  if (typeof offset !== 'number' || offset !== Math.floor(offset)) throw invalidArgType('offset', 'of type number', offset);
  if (offset < 0 || offset + size > buffer.length) {
    const error = new RangeError('The value of "offset" is out of range. It must be >= 0 and <= ' + (buffer.length - size) + '. Received ' + offset);
    error.code = 'ERR_OUT_OF_RANGE';
    throw error;
  }
  return offset;
}
function viewOf(buffer) { return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength); }
export class Buffer extends Uint8Array {
  static from(value, encodingOrOffset, length) {
    if (typeof value === 'string') return fromBytes(encodeString(value, encodingOrThrow(encodingOrOffset)));
    if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer === 'function' && value instanceof SharedArrayBuffer)) {
      const offset = encodingOrOffset === undefined ? 0 : Math.trunc(Number(encodingOrOffset)) || 0;
      const size = length === undefined ? value.byteLength - offset : Math.trunc(Number(length)) || 0;
      if (offset < 0 || offset > value.byteLength) { const e = new RangeError('"offset" is outside of buffer bounds'); e.code = 'ERR_BUFFER_OUT_OF_BOUNDS'; throw e; }
      if (size < 0 || offset + size > value.byteLength) { const e = new RangeError('"length" is outside of buffer bounds'); e.code = 'ERR_BUFFER_OUT_OF_BOUNDS'; throw e; }
      return new Buffer(value, offset, size);
    }
    if (ArrayBuffer.isView(value)) {
      const out = new Buffer(value.length === undefined ? value.byteLength : value.length);
      if (value instanceof Uint8Array) out.set(value);
      else if (value.length !== undefined) for (let i = 0; i < value.length; i++) out[i] = value[i];
      else out.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      return out;
    }
    if (value !== null && typeof value === 'object') {
      if (value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
      if (typeof value.length === 'number' || Array.isArray(value)) {
        const out = new Buffer(value.length >>> 0);
        for (let i = 0; i < out.length; i++) out[i] = value[i];
        return out;
      }
      if (typeof value.valueOf === 'function') {
        const primitive = value.valueOf();
        if (primitive !== value && primitive !== null && primitive !== undefined) return Buffer.from(primitive, encodingOrOffset, length);
      }
    }
    throw invalidArgType('first', 'of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object', value);
  }
  static alloc(size, fill, encoding) {
    checkSize(size);
    const out = new Buffer(size);
    if (fill !== undefined && fill !== 0 && size > 0) out.fill(fill, 0, size, encoding);
    return out;
  }
  static allocUnsafe(size) { checkSize(size); return new Buffer(size); }
  static allocUnsafeSlow(size) { checkSize(size); return new Buffer(size); }
  static isBuffer(value) { return value instanceof Buffer; }
  static isEncoding(encoding) { return typeof encoding === 'string' && encoding !== '' && normalizeEncoding(encoding) !== undefined; }
  static byteLength(value, encoding) {
    if (typeof value !== 'string') {
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value.byteLength;
      throw invalidArgType('string', 'of type string or an instance of Buffer or ArrayBuffer', value);
    }
    const normalized = normalizeEncoding(encoding) || 'utf8';
    if (normalized === 'utf8') {
      let n = 0;
      for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length && (value.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
        else n += 3;
      }
      return n;
    }
    if (normalized === 'latin1' || normalized === 'ascii') return value.length;
    if (normalized === 'utf16le') return value.length * 2;
    return encodeString(value, normalized).length;
  }
  static concat(list, totalLength) {
    if (!Array.isArray(list)) throw invalidArgType('list', 'an instance of Array', list);
    if (totalLength === undefined) { totalLength = 0; for (let i = 0; i < list.length; i++) totalLength += list[i].length; }
    const out = new Buffer(totalLength);
    let offset = 0;
    for (let i = 0; i < list.length && offset < totalLength; i++) {
      const item = list[i];
      if (!(item instanceof Uint8Array)) throw invalidArgType('list[' + i + ']', 'an instance of Buffer or Uint8Array', item);
      const part = offset + item.length > totalLength ? item.subarray(0, totalLength - offset) : item;
      out.set(part, offset); offset += part.length;
    }
    return out;
  }
  static compare(a, b) { return a.compare(b); }
  get parent() { return this.buffer; }
  get offset() { return this.byteOffset; }
  toString(encoding, start, end) {
    if (arguments.length === 0) return decoder.decode(this);
    start = clampIndex(start, this.length, 0); end = clampIndex(end, this.length, this.length);
    if (end <= start) return '';
    return decodeBytes(this, encodingOrThrow(encoding), start, end);
  }
  toJSON() { return { type: 'Buffer', data: Array.from(this) }; }
  toLocaleString(encoding, start, end) { return this.toString(encoding, start, end); }
  equals(other) {
    if (!(other instanceof Uint8Array)) throw invalidArgType('otherBuffer', 'an instance of Buffer or Uint8Array', other);
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
    return true;
  }
  compare(target, targetStart, targetEnd, sourceStart, sourceEnd) {
    if (!(target instanceof Uint8Array)) throw invalidArgType('target', 'an instance of Buffer or Uint8Array', target);
    targetStart = targetStart === undefined ? 0 : targetStart; targetEnd = targetEnd === undefined ? target.length : targetEnd;
    sourceStart = sourceStart === undefined ? 0 : sourceStart; sourceEnd = sourceEnd === undefined ? this.length : sourceEnd;
    const a = this.subarray(sourceStart, sourceEnd), b = target.subarray(targetStart, targetEnd);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
  }
  copy(target, targetStart, sourceStart, sourceEnd) {
    targetStart = targetStart === undefined ? 0 : targetStart; sourceStart = sourceStart === undefined ? 0 : sourceStart;
    sourceEnd = sourceEnd === undefined ? this.length : Math.min(sourceEnd, this.length);
    if (sourceEnd <= sourceStart || targetStart >= target.length) return 0;
    const n = Math.min(sourceEnd - sourceStart, target.length - targetStart);
    target.set(this.subarray(sourceStart, sourceStart + n), targetStart);
    return n;
  }
  slice(start, end) { return this.subarray(start, end); }
  write(string, offset, length, encoding) {
    if (typeof offset === 'string') { encoding = offset; offset = 0; length = undefined; }
    else if (typeof length === 'string') { encoding = length; length = undefined; }
    offset = offset === undefined ? 0 : offset >>> 0;
    const bytes = encodeString(String(string), encodingOrThrow(encoding));
    let n = Math.min(bytes.length, this.length - offset);
    if (length !== undefined) n = Math.min(n, length >>> 0);
    this.set(bytes.subarray(0, n), offset);
    return n;
  }
  fill(value, offset, end, encoding) {
    if (typeof offset === 'string') { encoding = offset; offset = 0; end = this.length; }
    else if (typeof end === 'string') { encoding = end; end = this.length; }
    offset = offset === undefined ? 0 : offset; end = end === undefined ? this.length : end;
    if (typeof value === 'number' || typeof value === 'boolean') return Uint8Array.prototype.fill.call(this, value & 255, offset, end), this;
    const bytes = typeof value === 'string' ? encodeString(value, encodingOrThrow(encoding)) : value;
    if (bytes.length === 0) return Uint8Array.prototype.fill.call(this, 0, offset, end), this;
    for (let i = offset, j = 0; i < end; i++, j = (j + 1) % bytes.length) this[i] = bytes[j];
    return this;
  }
  indexOf(value, byteOffset, encoding) {
    if (typeof byteOffset === 'string') { encoding = byteOffset; byteOffset = 0; }
    byteOffset = byteOffset === undefined ? 0 : Math.trunc(Number(byteOffset)) || 0;
    if (byteOffset < 0) byteOffset = Math.max(0, this.length + byteOffset);
    if (typeof value === 'number') return Uint8Array.prototype.indexOf.call(this, value & 255, byteOffset);
    const needle = typeof value === 'string' ? encodeString(value, encodingOrThrow(encoding)) : value;
    if (needle.length === 0) return Math.min(byteOffset, this.length);
    outer: for (let i = byteOffset; i + needle.length <= this.length; i++) {
      for (let j = 0; j < needle.length; j++) if (this[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  }
  includes(value, byteOffset, encoding) { return this.indexOf(value, byteOffset, encoding) !== -1; }
  readUInt8(offset) { return this[checkInt(this, offset, 1)]; }
  readInt8(offset) { const v = this[checkInt(this, offset, 1)]; return v > 127 ? v - 256 : v; }
  readUInt16LE(offset) { return viewOf(this).getUint16(checkInt(this, offset, 2), true); }
  readUInt16BE(offset) { return viewOf(this).getUint16(checkInt(this, offset, 2), false); }
  readInt16LE(offset) { return viewOf(this).getInt16(checkInt(this, offset, 2), true); }
  readInt16BE(offset) { return viewOf(this).getInt16(checkInt(this, offset, 2), false); }
  readUInt32LE(offset) { return viewOf(this).getUint32(checkInt(this, offset, 4), true); }
  readUInt32BE(offset) { return viewOf(this).getUint32(checkInt(this, offset, 4), false); }
  readInt32LE(offset) { return viewOf(this).getInt32(checkInt(this, offset, 4), true); }
  readInt32BE(offset) { return viewOf(this).getInt32(checkInt(this, offset, 4), false); }
  readFloatLE(offset) { return viewOf(this).getFloat32(checkInt(this, offset, 4), true); }
  readFloatBE(offset) { return viewOf(this).getFloat32(checkInt(this, offset, 4), false); }
  readDoubleLE(offset) { return viewOf(this).getFloat64(checkInt(this, offset, 8), true); }
  readDoubleBE(offset) { return viewOf(this).getFloat64(checkInt(this, offset, 8), false); }
  writeUInt8(value, offset) { offset = checkInt(this, offset, 1); this[offset] = value; return offset + 1; }
  writeInt8(value, offset) { offset = checkInt(this, offset, 1); this[offset] = value & 255; return offset + 1; }
  writeUInt16LE(value, offset) { offset = checkInt(this, offset, 2); viewOf(this).setUint16(offset, value, true); return offset + 2; }
  writeUInt16BE(value, offset) { offset = checkInt(this, offset, 2); viewOf(this).setUint16(offset, value, false); return offset + 2; }
  writeInt16LE(value, offset) { offset = checkInt(this, offset, 2); viewOf(this).setInt16(offset, value, true); return offset + 2; }
  writeInt16BE(value, offset) { offset = checkInt(this, offset, 2); viewOf(this).setInt16(offset, value, false); return offset + 2; }
  writeUInt32LE(value, offset) { offset = checkInt(this, offset, 4); viewOf(this).setUint32(offset, value, true); return offset + 4; }
  writeUInt32BE(value, offset) { offset = checkInt(this, offset, 4); viewOf(this).setUint32(offset, value, false); return offset + 4; }
  writeInt32LE(value, offset) { offset = checkInt(this, offset, 4); viewOf(this).setInt32(offset, value, true); return offset + 4; }
  writeInt32BE(value, offset) { offset = checkInt(this, offset, 4); viewOf(this).setInt32(offset, value, false); return offset + 4; }
  writeFloatLE(value, offset) { offset = checkInt(this, offset, 4); viewOf(this).setFloat32(offset, value, true); return offset + 4; }
  writeFloatBE(value, offset) { offset = checkInt(this, offset, 4); viewOf(this).setFloat32(offset, value, false); return offset + 4; }
  writeDoubleLE(value, offset) { offset = checkInt(this, offset, 8); viewOf(this).setFloat64(offset, value, true); return offset + 8; }
  writeDoubleBE(value, offset) { offset = checkInt(this, offset, 8); viewOf(this).setFloat64(offset, value, false); return offset + 8; }
}
for (const name of ['readUInt8', 'readUInt16LE', 'readUInt16BE', 'readUInt32LE', 'readUInt32BE', 'writeUInt8', 'writeUInt16LE', 'writeUInt16BE', 'writeUInt32LE', 'writeUInt32BE'])
  Object.defineProperty(Buffer.prototype, name.replace('UInt', 'Uint'), { value: Buffer.prototype[name], writable: true, configurable: true });
function checkSize(size) {
  if (typeof size !== 'number') throw invalidArgType('size', 'of type number', size);
  if (size < 0 || size !== size || size > 4294967296) {
    const error = new RangeError('The value of "size" is out of range. It must be >= 0 && <= 4294967296. Received ' + size);
    error.code = 'ERR_OUT_OF_RANGE';
    throw error;
  }
}
/** A Buffer over the bytes of a plain Uint8Array (no copy). */
function fromBytes(bytes) { return new Buffer(bytes.buffer, bytes.byteOffset, bytes.length); }
export const kMaxLength = 4294967296;
export const constants = { MAX_LENGTH: kMaxLength, MAX_STRING_LENGTH: 536870888 };
export function isUtf8(input) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(input); return true; } catch (e) { return false; }
}
export function atob(data) { const bytes = decodeBase64(String(data)); return latin1String(bytes, 0, bytes.length, 255); }
export function btoa(data) { data = String(data); return base64String(encodeString(data, 'latin1'), 0, data.length, false); }
if (typeof globalThis.Buffer === 'undefined') Object.defineProperty(globalThis, 'Buffer', { value: Buffer, writable: true, configurable: true });
export default { Buffer, kMaxLength, constants, isUtf8, atob, btoa };
`;

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
