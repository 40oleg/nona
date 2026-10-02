/**
 * Source of the built-in `node:http` (alias `nona:http`) module: HTTP/1.1
 * servers and clients over node:net. The message parser, header handling and
 * keep-alive rules follow Node.js's lib/_http_*.js so that programs observe
 * the same headers, events and wire format.
 */
export const httpModuleSource=String.raw`
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import * as net from 'node:net';
import { Readable } from 'nona:internal/stream';

export const METHODS = ['ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LINK', 'LOCK', 'M-SEARCH', 'MERGE', 'MKACTIVITY',
  'MKCALENDAR', 'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH', 'POST', 'PROPFIND', 'PROPPATCH', 'PURGE', 'PUT', 'QUERY', 'REBIND', 'REPORT',
  'SEARCH', 'SOURCE', 'SUBSCRIBE', 'TRACE', 'UNBIND', 'UNLINK', 'UNLOCK', 'UNSUBSCRIBE'];
export const STATUS_CODES = {
  100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints', 200: 'OK', 201: 'Created', 202: 'Accepted',
  203: 'Non-Authoritative Information', 204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status',
  208: 'Already Reported', 226: 'IM Used', 300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
  304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized',
  402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable',
  407: 'Proxy Authentication Required', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required',
  412: 'Precondition Failed', 413: 'Payload Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type', 416: 'Range Not Satisfiable',
  417: 'Expectation Failed', 418: "I'm a Teapot", 421: 'Misdirected Request', 422: 'Unprocessable Entity', 423: 'Locked',
  424: 'Failed Dependency', 425: 'Too Early', 426: 'Upgrade Required', 428: 'Precondition Required', 429: 'Too Many Requests',
  431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons', 500: 'Internal Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported', 506: 'Variant Also Negotiates',
  507: 'Insufficient Storage', 508: 'Loop Detected', 509: 'Bandwidth Limit Exceeded', 510: 'Not Extended', 511: 'Network Authentication Required'
};
export const maxHeaderSize = 16384;
const methodSet = new Set(METHODS);
const tokenPattern = /^[\^_\x60a-zA-Z\-0-9!#$%&'*+.|~]+$/;
const invalidHeaderChar = /[^\t\x20-\x7e\x80-\xff]/;
const connectionClose = /(?:^|\W)close(?:$|\W)/i;
const connectionKeepAlive = /(?:^|\W)keep-alive(?:$|\W)/i;
const chunkedPattern = /(?:^|\W)chunked(?:$|\W)/i;
const continuePattern = /(?:^|\W)100-continue(?:$|\W)/i;
const invalidPath = /[^!-ÿ]/;
const { _internal } = net;
const defer = _internal.defer;
function codedError(code, message, Type) {
  const error = new (Type || Error)(message);
  error.code = code;
  return error;
}
function invalidArgType(name, expected, value) {
  return codedError('ERR_INVALID_ARG_TYPE', 'The "' + name + '" argument must be ' + expected + '. Received ' + (value === null ? 'null' : value === undefined ? 'undefined' : 'type ' + typeof value + ' (' + String(value) + ')'), TypeError);
}
export function validateHeaderName(name, label) {
  if (typeof name !== 'string' || !name || !tokenPattern.test(name))
    throw codedError('ERR_INVALID_HTTP_TOKEN', (label || 'Header name') + ' must be a valid HTTP token ["' + name + '"]', TypeError);
}
export function validateHeaderValue(name, value) {
  if (value === undefined) throw codedError('ERR_HTTP_INVALID_HEADER_VALUE', 'Invalid value "' + value + '" for header "' + name + '"', TypeError);
  if (invalidHeaderChar.test(String(value))) throw codedError('ERR_INVALID_CHAR', 'Invalid character in header content ["' + name + '"]', TypeError);
}
function headersSentError(action) { return codedError('ERR_HTTP_HEADERS_SENT', 'Cannot ' + action + ' headers after they are sent to the client'); }
let cachedDate = '', cachedSecond = -1;
function utcDate() {
  const now = Date.now(), second = Math.floor(now / 1000);
  if (second !== cachedSecond) { cachedSecond = second; cachedDate = new Date(now).toUTCString(); }
  return cachedDate;
}
const latin1Bytes = text => Buffer.from(text, 'latin1');

// ---- Parser ------------------------------------------------------------------
const parseMessages = {
  HPE_INVALID_METHOD: 'Invalid method encountered', HPE_INVALID_CONSTANT: 'Expected HTTP/', HPE_INVALID_VERSION: 'Invalid HTTP version',
  HPE_INVALID_URL: 'Invalid URL', HPE_INVALID_HEADER_TOKEN: 'Invalid header token', HPE_HEADER_OVERFLOW: 'Header overflow',
  HPE_INVALID_CONTENT_LENGTH: 'Invalid character in Content-Length', HPE_UNEXPECTED_CONTENT_LENGTH: 'Content-Length can\'t be present with Transfer-Encoding',
  HPE_INVALID_CHUNK_SIZE: 'Invalid character in chunk size', HPE_INVALID_STATUS: 'Invalid status code', HPE_INVALID_TRANSFER_ENCODING: 'Request has invalid \x60Transfer-Encoding\x60',
  HPE_INVALID_EOF_STATE: 'Invalid EOF state', HPE_STRICT: 'Strict fail', HPE_CR_EXPECTED: 'Missing expected CR after header value',
  HPE_LF_EXPECTED: 'Missing expected LF after chunk data'
};
function parseError(code, bytes) {
  const error = new Error('Parse Error: ' + (parseMessages[code] || code));
  error.code = code;
  error.bytesParsed = 0;
  if (bytes) error.rawPacket = Buffer.from(bytes);
  return error;
}
function indexOfHeadEnd(bytes, from) {
  for (let i = Math.max(0, from - 3); i + 3 < bytes.length; i++)
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i;
  return -1;
}
function indexOfLine(bytes, from) {
  for (let i = from; i + 1 < bytes.length; i++) if (bytes[i] === 13 && bytes[i + 1] === 10) return i;
  return -1;
}
/**
 * Incremental HTTP/1.x parser. Callbacks: onHeaders(info) returns true to skip
 * the body (HEAD responses, 1xx, 204, 304), onBody(bytes), onComplete(trailers).
 */
class Parser {
  constructor(kind, maxSize) {
    this.kind = kind;
    this.maxSize = maxSize || maxHeaderSize;
    this.pending = null;
    this.state = 'head';
    this.remaining = 0;
    this.trailers = [];
    this.paused = false;
    this.error = null;
    this.skipBodyNext = false;
  }
  execute(chunk) {
    if (this.error !== null) return this.error;
    let bytes = chunk;
    if (this.pending !== null) { bytes = new Uint8Array(this.pending.length + chunk.length); bytes.set(this.pending); bytes.set(chunk, this.pending.length); this.pending = null; }
    const scanFrom = chunk === bytes ? 0 : bytes.length - chunk.length;
    let offset = 0;
    while (offset < bytes.length && this.error === null) {
      if (this.paused) break;
      const used = this.step(bytes, offset, offset === 0 ? scanFrom : 0);
      if (used < 0) break;
      offset += used;
    }
    if (this.error !== null) return this.error;
    if (offset < bytes.length) this.pending = bytes.slice(offset);
    return undefined;
  }
  /** Bytes consumed, or -1 when more input is needed. */
  step(bytes, offset, scanFrom) {
    switch (this.state) {
      case 'head': {
        // Empty lines before a request line are ignored.
        if (this.kind === 'request' && bytes[offset] === 13 && bytes[offset + 1] === 10) return 2;
        if (this.kind === 'request' && bytes[offset] === 10) return 1;
        const end = indexOfHeadEnd(bytes.subarray(offset), Math.max(0, scanFrom - offset));
        if (end < 0) {
          if (bytes.length - offset > this.maxSize) this.fail('HPE_HEADER_OVERFLOW', bytes);
          return -1;
        }
        if (end > this.maxSize) { this.fail('HPE_HEADER_OVERFLOW', bytes); return -1; }
        this.head(Buffer.from(bytes.buffer, bytes.byteOffset + offset, end).toString('latin1'), bytes);
        return end + 4;
      }
      case 'body': {
        const n = Math.min(this.remaining, bytes.length - offset);
        this.remaining -= n;
        if (n > 0) this.onBody(bytes.slice(offset, offset + n));
        if (this.remaining === 0) this.complete();
        return n;
      }
      case 'eof': {
        this.onBody(bytes.slice(offset));
        return bytes.length - offset;
      }
      case 'chunk-size': {
        const end = indexOfLine(bytes, offset);
        if (end < 0) { if (bytes.length - offset > 4096) this.fail('HPE_INVALID_CHUNK_SIZE', bytes); return -1; }
        const line = Buffer.from(bytes.buffer, bytes.byteOffset + offset, end - offset).toString('latin1');
        const size = line.split(';')[0].trim();
        if (!/^[0-9a-fA-F]+$/.test(size)) { this.fail('HPE_INVALID_CHUNK_SIZE', bytes); return -1; }
        this.remaining = parseInt(size, 16);
        this.state = this.remaining === 0 ? 'trailers' : 'chunk-data';
        return end + 2 - offset;
      }
      case 'chunk-data': {
        const n = Math.min(this.remaining, bytes.length - offset);
        this.remaining -= n;
        if (n > 0) this.onBody(bytes.slice(offset, offset + n));
        if (this.remaining === 0) this.state = 'chunk-end';
        return n;
      }
      case 'chunk-end': {
        if (bytes.length - offset < 2) return -1;
        if (bytes[offset] !== 13 || bytes[offset + 1] !== 10) { this.fail('HPE_LF_EXPECTED', bytes); return -1; }
        this.state = 'chunk-size';
        return 2;
      }
      case 'trailers': {
        const end = indexOfLine(bytes, offset);
        if (end < 0) { if (bytes.length - offset > this.maxSize) this.fail('HPE_HEADER_OVERFLOW', bytes); return -1; }
        if (end === offset) { this.complete(); return 2; }
        const line = Buffer.from(bytes.buffer, bytes.byteOffset + offset, end - offset).toString('latin1');
        const colon = line.indexOf(':');
        if (colon > 0) this.trailers.push(line.slice(0, colon), line.slice(colon + 1).trim());
        return end + 2 - offset;
      }
      default: return bytes.length - offset;
    }
  }
  fail(code, bytes) { this.error = parseError(code, bytes); }
  head(text, bytes) {
    const lines = text.split('\r\n');
    const info = { method: null, url: null, statusCode: null, statusMessage: null, versionMajor: 1, versionMinor: 1, headers: [], upgrade: false, shouldKeepAlive: false };
    let match;
    if (this.kind === 'request') {
      match = /^([^ ]+) ([^ ]+) HTTP\/(\d)\.(\d)$/.exec(lines[0]);
      if (match === null) {
        const method = lines[0].split(' ')[0];
        this.fail(methodSet.has(method) ? (lines[0].split(' ').length < 3 ? 'HPE_INVALID_CONSTANT' : 'HPE_INVALID_VERSION') : 'HPE_INVALID_METHOD', bytes);
        return;
      }
      if (!methodSet.has(match[1])) { this.fail('HPE_INVALID_METHOD', bytes); return; }
      info.method = match[1]; info.url = match[2];
    } else {
      match = /^HTTP\/(\d)\.(\d) (\d{3})(?: (.*))?$/.exec(lines[0]);
      if (match === null) {
        if (/^HTTP\/\d\.\d /.test(lines[0])) this.fail('HPE_INVALID_STATUS', bytes);
        else { this.fail('HPE_INVALID_CONSTANT', bytes); this.error.message = 'Parse Error: Expected HTTP/, RTSP/ or ICE/'; }
        return;
      }
      info.statusCode = Number(match[3]); info.statusMessage = match[4] === undefined ? '' : match[4];
    }
    info.versionMajor = Number(match[this.kind === 'request' ? 3 : 1]); info.versionMinor = Number(match[this.kind === 'request' ? 4 : 2]);
    if (info.versionMajor !== 1 || info.versionMinor > 1) { if (!(info.versionMajor === 0 && info.versionMinor === 9)) { this.fail('HPE_INVALID_VERSION', bytes); return; } }
    let contentLength = null, chunked = false, transferEncoding = false, connection = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i], colon = line.indexOf(':');
      if (colon <= 0 || !tokenPattern.test(line.slice(0, colon))) { this.fail('HPE_INVALID_HEADER_TOKEN', bytes); return; }
      const name = line.slice(0, colon), value = line.slice(colon + 1).replace(/^[ \t]+|[ \t]+$/g, '');
      if (/[\x00-\x08\x0a-\x1f\x7f]/.test(value)) { this.fail('HPE_INVALID_HEADER_TOKEN', bytes); return; }
      info.headers.push(name, value);
      const lower = name.toLowerCase();
      if (lower === 'content-length') {
        if (!/^\d+$/.test(value) || (contentLength !== null && contentLength !== Number(value))) { this.fail('HPE_INVALID_CONTENT_LENGTH', bytes); return; }
        contentLength = Number(value);
      } else if (lower === 'transfer-encoding') {
        transferEncoding = true;
        chunked = /(?:^|,)\s*chunked\s*$/i.test(value);
      } else if (lower === 'connection') connection += (connection ? ',' : '') + value;
      else if (lower === 'upgrade') info.upgrade = true;
    }
    if (transferEncoding && contentLength !== null && this.kind === 'request') { this.fail('HPE_UNEXPECTED_CONTENT_LENGTH', bytes); return; }
    if (transferEncoding && !chunked && this.kind === 'request') { this.fail('HPE_INVALID_TRANSFER_ENCODING', bytes); return; }
    info.upgrade = info.upgrade && /(?:^|\W)upgrade(?:$|\W)/i.test(connection) || info.method === 'CONNECT';
    const http11 = info.versionMajor === 1 && info.versionMinor === 1;
    info.shouldKeepAlive = http11 ? !connectionClose.test(connection) : connectionKeepAlive.test(connection);
    const skip = this.onHeaders(info);
    if (this.error !== null) return;
    if (skip || info.upgrade) { this.complete(); return; }
    if (chunked) this.state = 'chunk-size';
    else if (contentLength !== null) { this.remaining = contentLength; if (contentLength === 0) this.complete(); else this.state = 'body'; }
    else if (this.kind === 'request' || (info.statusCode >= 100 && info.statusCode < 200) || info.statusCode === 204 || info.statusCode === 304) this.complete();
    else { this.state = 'eof'; info.shouldKeepAlive = false; this.eofKeepAlive = false; }
  }
  complete() {
    const trailers = this.trailers;
    this.trailers = [];
    this.state = 'head';
    this.onComplete(trailers);
  }
  /** End of input: a body read until EOF completes, anything else partial is an error. */
  finish() {
    if (this.error !== null) return this.error;
    if (this.state === 'eof') { this.complete(); return undefined; }
    if (this.state !== 'head' || (this.pending !== null && this.pending.length > 0)) return parseError('HPE_INVALID_EOF_STATE');
    return undefined;
  }
}

// ---- IncomingMessage ---------------------------------------------------------
const dropDuplicates = new Set(['age', 'authorization', 'content-length', 'content-type', 'etag', 'expires', 'from', 'host', 'if-modified-since',
  'if-unmodified-since', 'last-modified', 'location', 'max-forwards', 'proxy-authorization', 'referer', 'retry-after', 'server', 'user-agent']);
function addHeaderLine(field, value, dest, joinDuplicates) {
  field = field.toLowerCase();
  if (field === 'set-cookie') { if (dest[field] !== undefined) dest[field].push(value); else dest[field] = [value]; }
  else if (field === 'cookie') dest[field] = typeof dest[field] === 'string' ? dest[field] + '; ' + value : value;
  else if (dropDuplicates.has(field)) { if (joinDuplicates && dest[field] !== undefined) dest[field] += ', ' + value; else if (dest[field] === undefined) dest[field] = value; }
  else dest[field] = typeof dest[field] === 'string' ? dest[field] + ', ' + value : value;
}
export class IncomingMessage extends Readable {
  constructor(socket) {
    super();
    this.socket = socket;
    this.httpVersionMajor = null; this.httpVersionMinor = null; this.httpVersion = null;
    this.complete = false;
    this.rawHeaders = []; this.rawTrailers = [];
    this.joinDuplicateHeaders = false;
    this.aborted = false;
    this.upgrade = null;
    this.url = '';
    this.method = null;
    this.statusCode = null;
    this.statusMessage = null;
    this._headers = null; this._trailers = null;
    this._consuming = false;
    this._dumped = false;
  }
  get connection() { return this.socket; }
  set connection(value) { this.socket = value; }
  get headers() {
    if (this._headers === null) { this._headers = {}; for (let i = 0; i < this.rawHeaders.length; i += 2) addHeaderLine(this.rawHeaders[i], this.rawHeaders[i + 1], this._headers, this.joinDuplicateHeaders); }
    return this._headers;
  }
  set headers(value) { this._headers = value; }
  get headersDistinct() {
    const out = {};
    for (let i = 0; i < this.rawHeaders.length; i += 2) { const key = this.rawHeaders[i].toLowerCase(); (out[key] || (out[key] = [])).push(this.rawHeaders[i + 1]); }
    return out;
  }
  get trailers() {
    if (this._trailers === null) { this._trailers = {}; for (let i = 0; i < this.rawTrailers.length; i += 2) addHeaderLine(this.rawTrailers[i], this.rawTrailers[i + 1], this._trailers, this.joinDuplicateHeaders); }
    return this._trailers;
  }
  set trailers(value) { this._trailers = value; }
  get trailersDistinct() {
    const out = {};
    for (let i = 0; i < this.rawTrailers.length; i += 2) { const key = this.rawTrailers[i].toLowerCase(); (out[key] || (out[key] = [])).push(this.rawTrailers[i + 1]); }
    return out;
  }
  setTimeout(msecs, callback) { if (callback) this.on('timeout', callback); if (this.socket) this.socket.setTimeout(msecs); return this; }
  read(n) { this._consuming = true; return super.read(n); }
  on(type, listener) { if (type === 'data' || type === 'readable') this._consuming = true; return super.on(type, listener); }
  resume() { this._consuming = true; return super.resume(); }
  _read() { if (this.socket && this.socket.isPaused() && !this.socket.destroyed && this._socketPaused) { this._socketPaused = false; this.socket.resume(); } }
  _ended() { queueMicrotask(() => { if (!this.destroyed) this.destroy(); }); }
  _dump() {
    if (!this._dumped) {
      this._dumped = true;
      this.removeAllListeners('data');
      super.resume();
    }
  }
  _destroy(error, callback) {
    if (!this.readableEnded || !this.complete) { this.aborted = true; this.emit('aborted'); }
    if (this.socket && !this.socket.destroyed && this.aborted) { this.socket.destroy(error); callback(error && this.listenerCount('error') > 0 ? error : null); }
    else callback(error && this.listenerCount('error') > 0 ? error : null);
  }
}
function messageFromInfo(socket, info, MessageClass, joinDuplicates) {
  const message = new MessageClass(socket);
  message.httpVersionMajor = info.versionMajor;
  message.httpVersionMinor = info.versionMinor;
  message.httpVersion = info.versionMajor + '.' + info.versionMinor;
  message.rawHeaders = info.headers;
  message.joinDuplicateHeaders = !!joinDuplicates;
  message.upgrade = info.upgrade;
  if (info.method !== null) { message.method = info.method; message.url = info.url; }
  else { message.statusCode = info.statusCode; message.statusMessage = info.statusMessage; }
  return message;
}

// ---- OutgoingMessage ---------------------------------------------------------
export class OutgoingMessage extends EventEmitter {
  constructor() {
    super();
    this.outputData = [];
    this.outputSize = 0;
    this.writable = true;
    this.destroyed = false;
    this._last = false;
    this.chunkedEncoding = false;
    this.shouldKeepAlive = true;
    this.maxRequestsOnConnectionReached = false;
    this._defaultKeepAlive = true;
    this.useChunkedEncodingByDefault = true;
    this.sendDate = false;
    this._removedConnection = false;
    this._removedContLen = false;
    this._removedTE = false;
    this.strictContentLength = false;
    this._bytesWritten = 0;
    this._contentLength = null;
    this._hasBody = true;
    this._trailer = '';
    this.finished = false;
    this._headerSent = false;
    this._closed = false;
    this.socket = null;
    this._header = null;
    this._headers = null;
    this._keepAliveTimeout = 0;
    this._onPendingData = null;
    this.writableFinished = false;
  }
  get connection() { return this.socket; }
  set connection(value) { this.socket = value; }
  get headersSent() { return !!this._header; }
  get writableEnded() { return this.finished; }
  get writableObjectMode() { return false; }
  get writableCorked() { return 0; }
  get writableHighWaterMark() { return 16384; }
  get writableLength() { return this.outputSize + (this.socket ? this.socket.writableLength : 0); }
  get writableNeedDrain() { return !this.destroyed && !this.finished && this.writableLength >= 16384; }
  get closed() { return this._closed; }
  get errored() { return null; }
  setTimeout(msecs, callback) {
    if (callback) this.on('timeout', callback);
    if (!this.socket) this.once('socket', socket => socket.setTimeout(msecs));
    else this.socket.setTimeout(msecs);
    return this;
  }
  destroy(error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    if (this.socket) this.socket.destroy(error);
    else this.once('socket', socket => socket.destroy(error));
    return this;
  }
  setHeader(name, value) {
    if (this._header) throw headersSentError('set');
    validateHeaderName(name);
    validateHeaderValue(name, value);
    if (this._headers === null) this._headers = Object.create(null);
    this._headers[name.toLowerCase()] = [name, value];
    return this;
  }
  setHeaders(headers) {
    if (this._header) throw headersSentError('set');
    if (!headers || typeof headers.forEach !== 'function') throw invalidArgType('headers', 'an instance of Headers or Map', headers);
    headers.forEach((value, key) => this.setHeader(key, value));
    return this;
  }
  appendHeader(name, value) {
    if (this._header) throw headersSentError('append');
    validateHeaderName(name);
    validateHeaderValue(name, value);
    const field = name.toLowerCase();
    if (this._headers === null) this._headers = Object.create(null);
    const existing = this._headers[field];
    if (existing === undefined) this._headers[field] = [name, value];
    else {
      const values = Array.isArray(existing[1]) ? existing[1] : [existing[1]];
      this._headers[field] = [existing[0], values.concat(value)];
    }
    return this;
  }
  getHeader(name) {
    if (typeof name !== 'string') throw invalidArgType('name', 'of type string', name);
    if (this._headers === null) return undefined;
    const entry = this._headers[name.toLowerCase()];
    return entry && entry[1];
  }
  getHeaderNames() { return this._headers === null ? [] : Object.keys(this._headers); }
  getRawHeaderNames() { return this._headers === null ? [] : Object.keys(this._headers).map(key => this._headers[key][0]); }
  getHeaders() {
    const out = Object.create(null);
    if (this._headers !== null) for (const key of Object.keys(this._headers)) out[key] = this._headers[key][1];
    return out;
  }
  hasHeader(name) {
    if (typeof name !== 'string') throw invalidArgType('name', 'of type string', name);
    return this._headers !== null && this._headers[name.toLowerCase()] !== undefined;
  }
  removeHeader(name) {
    if (typeof name !== 'string') throw invalidArgType('name', 'of type string', name);
    if (this._header) throw headersSentError('remove');
    const key = name.toLowerCase();
    if (key === 'connection') this._removedConnection = true;
    else if (key === 'content-length') this._removedContLen = true;
    else if (key === 'transfer-encoding') this._removedTE = true;
    else if (key === 'date') this.sendDate = false;
    if (this._headers !== null) delete this._headers[key];
  }
  _implicitHeader() { throw codedError('ERR_METHOD_NOT_IMPLEMENTED', 'The _implicitHeader() method is not implemented'); }
  _storeHeader(firstLine, headers) {
    const state = { connection: false, contLen: false, te: false, date: false, expect: false, trailer: false, header: firstLine };
    if (headers) {
      if (headers === this._headers) for (const key in headers) { const entry = headers[key]; this._processHeader(state, entry[0], entry[1], false); }
      else if (Array.isArray(headers)) {
        if (headers.length && Array.isArray(headers[0])) for (const entry of headers) this._processHeader(state, entry[0], entry[1], true);
        else {
          if (headers.length % 2 !== 0) throw codedError('ERR_INVALID_ARG_VALUE', "The argument 'headers' is invalid.", TypeError);
          for (let n = 0; n < headers.length; n += 2) this._processHeader(state, headers[n], headers[n + 1], true);
        }
      } else for (const key in headers) if (Object.prototype.hasOwnProperty.call(headers, key)) this._processHeader(state, key, headers[key], true);
    }
    let header = state.header;
    if (this.sendDate && !state.date) header += 'Date: ' + utcDate() + '\r\n';
    if (this.chunkedEncoding && (this.statusCode === 204 || this.statusCode === 304)) { this.chunkedEncoding = false; this.shouldKeepAlive = false; }
    if (this._removedConnection) this._last = !this.shouldKeepAlive;
    else if (!state.connection) {
      const shouldSendKeepAlive = this.shouldKeepAlive && (state.contLen || this.useChunkedEncodingByDefault || this.agent);
      if (shouldSendKeepAlive && this.maxRequestsOnConnectionReached) header += 'Connection: close\r\n';
      else if (shouldSendKeepAlive) {
        header += 'Connection: keep-alive\r\n';
        if (this._keepAliveTimeout && this._defaultKeepAlive) header += 'Keep-Alive: timeout=' + Math.floor(this._keepAliveTimeout / 1000) + (~~this._maxRequestsPerSocket > 0 ? ', max=' + this._maxRequestsPerSocket : '') + '\r\n';
      } else { this._last = true; header += 'Connection: close\r\n'; }
    }
    if (!state.contLen && !state.te) {
      if (!this._hasBody) this.chunkedEncoding = false;
      else if (!this.useChunkedEncodingByDefault) this._last = true;
      else if (!state.trailer && !this._removedContLen && typeof this._contentLength === 'number') header += 'Content-Length: ' + this._contentLength + '\r\n';
      else if (!this._removedTE) { header += 'Transfer-Encoding: chunked\r\n'; this.chunkedEncoding = true; }
      else this._last = true;
    }
    if (this.chunkedEncoding !== true && state.trailer) throw codedError('ERR_HTTP_TRAILER_INVALID', 'Trailers are invalid with this transfer encoding');
    this._header = header + '\r\n';
    this._headerSent = false;
    if (state.expect) this._send('');
  }
  _processHeader(state, key, value, validate) {
    if (validate) validateHeaderName(key);
    if (Array.isArray(value)) {
      if (value.length < 2 || key.toLowerCase() !== 'cookie') { for (const item of value) this._storeOne(state, key, item, validate); return; }
      value = value.join('; ');
    }
    this._storeOne(state, key, value, validate);
  }
  _storeOne(state, key, value, validate) {
    if (validate) validateHeaderValue(key, value);
    state.header += key + ': ' + value + '\r\n';
    if (key.length < 4 || key.length > 17) return;
    switch (key.toLowerCase()) {
      case 'connection': state.connection = true; this._removedConnection = false; if (connectionClose.test(value)) this._last = true; else this.shouldKeepAlive = true; break;
      case 'transfer-encoding': state.te = true; this._removedTE = false; if (chunkedPattern.test(value)) this.chunkedEncoding = true; break;
      case 'content-length': state.contLen = true; this._contentLength = +value; this._removedContLen = false; break;
      case 'date': case 'expect': case 'trailer': state[key.toLowerCase()] = true; break;
      case 'keep-alive': this._defaultKeepAlive = false; break;
    }
  }
  /** Queue bytes (with the header in front of the first ones) for the socket. */
  _send(data, encoding, callback) {
    let bytes = typeof data === 'string' ? Buffer.from(data, encoding || 'utf8') : data;
    if (!this._headerSent && this._header !== null) {
      const head = latin1Bytes(this._header);
      if (bytes.length > 0) { const joined = new Uint8Array(head.length + bytes.length); joined.set(head); joined.set(bytes, head.length); bytes = joined; }
      else bytes = head;
      this._headerSent = true;
    }
    return this._writeRaw(bytes, callback);
  }
  _writeRaw(bytes, callback) {
    const socket = this.socket;
    if (socket !== null && socket._httpMessage === this && socket.writable && !socket.connecting) {
      if (this.outputData.length > 0) this._flushOutput(socket);
      return socket.write(bytes, callback);
    }
    if (socket !== null && socket.destroyed) {
      if (callback) queueMicrotask(() => callback(codedError('ERR_STREAM_DESTROYED', 'Cannot call write after a stream was destroyed')));
      return false;
    }
    this.outputData.push({ bytes, callback });
    this.outputSize += bytes.length;
    return this.outputSize < 16384;
  }
  _flushOutput(socket) {
    const queued = this.outputData;
    this.outputData = []; this.outputSize = 0;
    let ok = true;
    for (const item of queued) ok = socket.write(item.bytes, item.callback);
    return ok;
  }
  _flush() {
    const socket = this.socket;
    if (socket && socket.writable) {
      const ok = this._flushOutput(socket);
      if (this.finished) this._finish();
      else if (ok) this.emit('drain');
    }
  }
  _finish() { this.emit('prefinish'); }
  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') { callback = encoding; encoding = null; }
    return this._write(chunk, encoding, callback, false);
  }
  _write(chunk, encoding, callback, fromEnd) {
    if (typeof callback !== 'function') callback = undefined;
    if (chunk === null) throw codedError('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) throw invalidArgType('chunk', 'of type string or an instance of Buffer or Uint8Array', chunk);
    let error = null;
    if (this.finished) error = codedError('ERR_STREAM_WRITE_AFTER_END', 'write after end');
    else if (this.destroyed) error = codedError('ERR_STREAM_DESTROYED', 'Cannot call write after a stream was destroyed');
    if (error !== null) {
      if (!this.destroyed) { if (this.listenerCount('error') > 0) queueMicrotask(() => this.emit('error', error)); if (callback) queueMicrotask(() => callback(error)); }
      else if (callback) queueMicrotask(() => callback(error));
      return false;
    }
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, encoding || 'utf8') : chunk;
    if (!this._header) {
      if (fromEnd) this._contentLength = bytes.length;
      this._implicitHeader();
    }
    if (!this._hasBody) { if (callback) queueMicrotask(callback); return true; }
    if (this.chunkedEncoding && bytes.length !== 0) {
      const head = latin1Bytes(bytes.length.toString(16) + '\r\n'), framed = new Uint8Array(head.length + bytes.length + 2);
      framed.set(head); framed.set(bytes, head.length); framed[framed.length - 2] = 13; framed[framed.length - 1] = 10;
      return this._send(framed, null, callback);
    }
    return this._send(bytes, null, callback);
  }
  addTrailers(headers) {
    this._trailer = '';
    const isArray = Array.isArray(headers);
    for (const key of Object.keys(headers)) {
      const field = isArray ? headers[key][0] : key, value = isArray ? headers[key][1] : headers[key];
      validateHeaderName(field, 'Trailer name');
      const values = Array.isArray(value) && value.length > 1 ? value : [Array.isArray(value) ? value.join('; ') : value];
      for (const item of values) {
        if (invalidHeaderChar.test(String(item))) throw codedError('ERR_INVALID_CHAR', 'Invalid character in trailer content ["' + field + '"]', TypeError);
        this._trailer += field + ': ' + item + '\r\n';
      }
    }
  }
  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') { callback = chunk; chunk = null; encoding = null; }
    else if (typeof encoding === 'function') { callback = encoding; encoding = null; }
    if (chunk) {
      if (this.finished) {
        const error = codedError('ERR_STREAM_WRITE_AFTER_END', 'write after end');
        if (this.listenerCount('error') > 0) queueMicrotask(() => this.emit('error', error));
        if (typeof callback === 'function') queueMicrotask(() => callback(error));
        return this;
      }
      this._write(chunk, encoding, null, true);
    } else if (this.finished) {
      if (typeof callback === 'function') {
        if (!this.writableFinished) this.on('finish', callback);
        else callback(codedError('ERR_STREAM_ALREADY_FINISHED', 'Cannot call end after a stream was finished'));
      }
      return this;
    } else if (!this._header) {
      this._contentLength = 0;
      this._implicitHeader();
    }
    if (typeof callback === 'function') this.once('finish', callback);
    const finish = () => { if (this.socket && this.socket._hadError) return; this.writableFinished = true; this.emit('finish'); };
    if (this._hasBody && this.chunkedEncoding) this._send('0\r\n' + this._trailer + '\r\n', 'latin1', finish);
    else if (!this._headerSent || this.writableLength || chunk) this._send('', 'latin1', finish);
    else queueMicrotask(finish);
    this.finished = true;
    if (this.outputData.length === 0 && this.socket && this.socket._httpMessage === this) this._finish();
    return this;
  }
  flushHeaders() {
    if (!this._header) this._implicitHeader();
    this._send('');
  }
  pipe() { this.emit('error', codedError('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable')); }
  cork() {}
  uncork() {}
}

// ---- ServerResponse ----------------------------------------------------------
export class ServerResponse extends OutgoingMessage {
  constructor(req, options) {
    super(options);
    if (req.method === 'HEAD') this._hasBody = false;
    this.req = req;
    this.sendDate = true;
    this._sent100 = false;
    this._expect_continue = false;
    this.statusCode = 200;
    this.statusMessage = undefined;
    if (req.httpVersionMajor < 1 || req.httpVersionMinor < 1) {
      this.useChunkedEncodingByDefault = chunkedPattern.test(req.headers.te || '');
      this.shouldKeepAlive = false;
    }
  }
  _finish() { super._finish(); }
  assignSocket(socket) {
    if (socket._httpMessage) throw codedError('ERR_HTTP_SOCKET_ASSIGNED', 'Socket already assigned');
    socket._httpMessage = this;
    socket.on('close', onServerResponseClose);
    this.socket = socket;
    this.emit('socket', socket);
    this._flush();
  }
  detachSocket(socket) {
    socket.removeListener('close', onServerResponseClose);
    socket._httpMessage = null;
    this.socket = null;
  }
  writeContinue(callback) { this._writeRaw(latin1Bytes('HTTP/1.1 100 Continue\r\n\r\n'), callback); this._sent100 = true; }
  writeProcessing(callback) { this._writeRaw(latin1Bytes('HTTP/1.1 102 Processing\r\n\r\n'), callback); }
  writeEarlyHints(hints, callback) {
    let head = 'HTTP/1.1 103 Early Hints\r\n';
    for (const key of Object.keys(hints)) { const value = hints[key]; head += key + ': ' + (Array.isArray(value) ? value.join(', ') : value) + '\r\n'; }
    this._writeRaw(latin1Bytes(head + '\r\n'), callback);
  }
  _implicitHeader() { this.writeHead(this.statusCode); }
  writeHead(statusCode, reason, obj) {
    if (this._header) throw headersSentError('write');
    const originalStatusCode = statusCode;
    statusCode |= 0;
    if (statusCode < 100 || statusCode > 999) throw codedError('ERR_HTTP_INVALID_STATUS_CODE', 'Invalid status code: ' + originalStatusCode, RangeError);
    if (typeof reason === 'string') this.statusMessage = reason;
    else {
      this.statusMessage = this.statusMessage || STATUS_CODES[statusCode] || 'unknown';
      if (obj === undefined || obj === null) obj = reason;
    }
    this.statusCode = statusCode;
    let headers;
    if (this._headers !== null) {
      if (Array.isArray(obj)) {
        if (obj.length % 2 !== 0) throw codedError('ERR_INVALID_ARG_VALUE', "The argument 'headers' is invalid.", TypeError);
        for (let n = 0; n < obj.length; n += 2) this.removeHeader(obj[n]);
        for (let n = 0; n < obj.length; n += 2) if (obj[n]) this.appendHeader(obj[n], obj[n + 1]);
      } else if (obj) for (const key of Object.keys(obj)) if (key) this.setHeader(key, obj[key]);
      headers = this._headers;
    } else headers = obj;
    if (invalidHeaderChar.test(this.statusMessage)) throw codedError('ERR_INVALID_CHAR', 'Invalid character in statusMessage', TypeError);
    const statusLine = 'HTTP/1.1 ' + statusCode + ' ' + this.statusMessage + '\r\n';
    if (statusCode === 204 || statusCode === 304 || (statusCode >= 100 && statusCode <= 199)) this._hasBody = false;
    if (this._expect_continue && !this._sent100) this.shouldKeepAlive = false;
    this._storeHeader(statusLine, headers);
    return this;
  }
  writeHeader(statusCode, reason, obj) { return this.writeHead(statusCode, reason, obj); }
}
function onServerResponseClose() {
  const message = this._httpMessage;
  if (message) { message.destroyed = true; message._closed = true; message.emit('close'); }
}

// ---- Server ------------------------------------------------------------------
const kIncomingMessage = Symbol('IncomingMessage'), kServerResponse = Symbol('ServerResponse');
export class Server extends net.Server {
  constructor(options, requestListener) {
    if (typeof options === 'function') { requestListener = options; options = {}; }
    else if (options === undefined || options === null) options = {};
    else if (typeof options !== 'object') throw invalidArgType('options', 'of type object', options);
    super({ allowHalfOpen: true, noDelay: options.noDelay === undefined ? true : options.noDelay });
    this[kIncomingMessage] = options.IncomingMessage || IncomingMessage;
    this[kServerResponse] = options.ServerResponse || ServerResponse;
    this.maxHeaderSize = options.maxHeaderSize;
    this.requireHostHeader = options.requireHostHeader === undefined ? true : !!options.requireHostHeader;
    this.joinDuplicateHeaders = !!options.joinDuplicateHeaders;
    this.rejectNonStandardBodyWrites = !!options.rejectNonStandardBodyWrites;
    this.httpAllowHalfOpen = false;
    this.timeout = 0;
    this.maxHeadersCount = null;
    this.maxRequestsPerSocket = 0;
    this.headersTimeout = options.headersTimeout === undefined ? 60000 : options.headersTimeout;
    this.requestTimeout = options.requestTimeout === undefined ? 300000 : options.requestTimeout;
    this.keepAliveTimeout = options.keepAliveTimeout === undefined ? 5000 : options.keepAliveTimeout;
    this.keepAliveTimeoutBuffer = 1000;
    if (requestListener) this.on('request', requestListener);
    this.on('connection', connectionListener);
  }
  setTimeout(msecs, callback) { this.timeout = msecs; if (callback) this.on('timeout', callback); return this; }
  close(callback) { this.closeIdleConnections(); return super.close(callback); }
  closeAllConnections() { for (const socket of Array.from(this._connections)) socket.destroy(); }
  closeIdleConnections() {
    for (const socket of Array.from(this._connections)) {
      const state = socket._httpState;
      if (state && state.incoming.length === 0 && !socket._httpMessage) socket.destroy();
    }
  }
}
export function createServer(options, requestListener) { return new Server(options, requestListener); }
const badRequestResponse = 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n';
const headerFieldsTooLargeResponse = 'HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n';
function connectionListener(socket) {
  const server = this;
  const state = { incoming: [], outgoing: [], keepAliveTimeoutSet: false };
  socket._httpState = state;
  socket._httpMessage = null;
  const parser = new Parser('request', server.maxHeaderSize);
  socket.parser = parser;
  if (server.timeout && typeof socket.setTimeout === 'function') socket.setTimeout(server.timeout);
  socket.on('timeout', () => {
    const req = parser.incoming;
    const reqTimeout = req && !req.complete && req.emit('timeout', socket);
    const res = socket._httpMessage;
    const resTimeout = res && res.emit('timeout', socket);
    const serverTimeout = server.emit('timeout', socket);
    if (!reqTimeout && !resTimeout && !serverTimeout) socket.destroy();
  });
  parser.onHeaders = info => {
    const req = messageFromInfo(socket, info, server[kIncomingMessage], server.joinDuplicateHeaders);
    parser.incoming = req;
    if (state.keepAliveTimeoutSet) { socket.setTimeout(server.timeout || 0); state.keepAliveTimeoutSet = false; }
    if (info.upgrade && server.listenerCount(info.method === 'CONNECT' ? 'connect' : 'upgrade') > 0) {
      parser.paused = true;
      parser.upgraded = { req, event: info.method === 'CONNECT' ? 'connect' : 'upgrade' };
      return true;
    }
    req.upgrade = false;
    state.incoming.push(req);
    const res = new server[kServerResponse](req);
    res._keepAliveTimeout = server.keepAliveTimeout;
    res._maxRequestsPerSocket = server.maxRequestsPerSocket;
    res.shouldKeepAlive = info.shouldKeepAlive;
    if (socket._httpMessage) state.outgoing.push(res);
    else res.assignSocket(socket);
    res.on('finish', () => resOnFinish(req, res, socket, state, server));
    let handled = false;
    if (req.httpVersionMajor === 1 && req.httpVersionMinor === 1) {
      if (server.requireHostHeader && req.headers.host === undefined) {
        res.writeHead(400, ['Connection', 'close']);
        res.end();
        return false;
      }
      const limited = typeof server.maxRequestsPerSocket === 'number' && server.maxRequestsPerSocket > 0;
      if (limited) { state.requestsCount = (state.requestsCount || 0) + 1; res.maxRequestsOnConnectionReached = server.maxRequestsPerSocket <= state.requestsCount; }
      if (limited && server.maxRequestsPerSocket < state.requestsCount) {
        handled = true;
        server.emit('dropRequest', req, socket);
        res.writeHead(503);
        res.end();
      } else if (req.headers.expect !== undefined) {
        handled = true;
        if (continuePattern.test(req.headers.expect)) {
          res._expect_continue = true;
          if (server.listenerCount('checkContinue') > 0) server.emit('checkContinue', req, res);
          else { res.writeContinue(); server.emit('request', req, res); }
        } else if (server.listenerCount('checkExpectation') > 0) server.emit('checkExpectation', req, res);
        else { res.writeHead(417); res.end(); }
      }
    }
    if (!handled) server.emit('request', req, res);
    return false;
  };
  parser.onBody = bytes => {
    const req = parser.incoming;
    if (req && !req.destroyed && req.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length)) === false && !socket.isPaused()) { req._socketPaused = true; socket.pause(); }
  };
  parser.onComplete = trailers => {
    const req = parser.incoming;
    parser.incoming = null;
    if (!req || parser.upgraded) return;
    req.rawTrailers = trailers;
    req.complete = true;
    req.push(null);
  };
  const onData = data => {
    const error = parser.execute(data);
    if (error) { socketOnError(server, socket, error); return; }
    if (parser.upgraded) {
      // The rest of the input belongs to the new protocol.
      const upgrade = parser.upgraded;
      parser.upgraded = null;
      socket.removeListener('data', onData);
      socket.removeListener('end', onEnd);
      const head = parser.pending ? Buffer.from(parser.pending) : Buffer.alloc(0);
      parser.pending = null;
      server._connections.delete(socket);
      socket.server = null;
      server.emit(upgrade.event, upgrade.req, socket, head);
    }
  };
  const onEnd = () => {
    const error = parser.finish();
    if (error) { socketOnError(server, socket, error); return; }
    if (!server.httpAllowHalfOpen) {
      while (state.incoming.length) { const req = state.incoming.shift(); req.destroy(); }
      if (socket.writable) socket.end();
    } else if (state.outgoing.length) state.outgoing[state.outgoing.length - 1]._last = true;
    else if (socket._httpMessage) socket._httpMessage._last = true;
    else if (socket.writable) socket.end();
  };
  socket.on('data', onData);
  socket.on('end', onEnd);
  socket.on('error', error => socketOnError(server, socket, error));
  socket.on('close', () => {
    while (state.incoming.length) {
      const req = state.incoming.shift();
      if (!req.complete) { const error = codedError('ECONNRESET', 'aborted'); req.destroy(error); }
      else if (!req.destroyed) req.destroy();
    }
    while (state.outgoing.length) { const res = state.outgoing.shift(); res.destroyed = true; res._closed = true; res.emit('close'); }
  });
}
function socketOnError(server, socket, error) {
  if (socket._parseFailed) return;
  socket._parseFailed = true;
  if (!server.emit('clientError', error, socket)) {
    if (socket.writable && socket.bytesWritten === 0 && error.code && error.code.startsWith('HPE_'))
      socket.write(error.code === 'HPE_HEADER_OVERFLOW' ? headerFieldsTooLargeResponse : badRequestResponse);
    socket.destroy(error.code && error.code.startsWith('HPE_') ? undefined : error);
  }
}
function resOnFinish(req, res, socket, state, server) {
  if (state.incoming[0] === req) state.incoming.shift();
  if (!req._consuming) req._dump();
  res.detachSocket(socket);
  queueMicrotask(() => { res._closed = true; res.emit('close'); });
  if (res._last) socket.destroySoon();
  else if (state.outgoing.length === 0) {
    if (server.keepAliveTimeout && typeof socket.setTimeout === 'function') { socket.setTimeout(server.keepAliveTimeout + server.keepAliveTimeoutBuffer); state.keepAliveTimeoutSet = true; }
  } else {
    const next = state.outgoing.shift();
    if (next) next.assignSocket(socket);
  }
}

// ---- Agent -------------------------------------------------------------------
export class Agent extends EventEmitter {
  constructor(options) {
    super();
    this.defaultPort = 80;
    this.protocol = 'http:';
    this.options = Object.assign({ __proto__: null }, options);
    if (this.options.noDelay === undefined) this.options.noDelay = true;
    this.options.path = null;
    this.requests = Object.create(null);
    this.sockets = Object.create(null);
    this.freeSockets = Object.create(null);
    this.keepAliveMsecs = this.options.keepAliveMsecs || 1000;
    this.keepAlive = this.options.keepAlive || false;
    this.maxSockets = this.options.maxSockets || Agent.defaultMaxSockets;
    this.maxFreeSockets = this.options.maxFreeSockets || 256;
    this.scheduling = this.options.scheduling || 'lifo';
    this.maxTotalSockets = this.options.maxTotalSockets || Infinity;
    this.totalSocketCount = 0;
    this.on('free', (socket, options) => {
      const name = this.getName(options);
      if (!socket.writable) { socket.destroy(); return; }
      const requests = this.requests[name];
      if (requests && requests.length) {
        const req = requests.shift();
        if (!requests.length) delete this.requests[name];
        setRequestSocket(this, req, socket);
        return;
      }
      const req = socket._httpMessage;
      if (!req || !req.shouldKeepAlive || !this.keepAlive) { socket.destroy(); return; }
      const free = this.freeSockets[name] || [];
      if (this.totalSocketCount > this.maxTotalSockets || free.length >= this.maxFreeSockets || !this.keepSocketAlive(socket)) { socket.destroy(); return; }
      this.freeSockets[name] = free;
      socket._httpMessage = null;
      socket.once('error', freeSocketErrorListener);
      removeSocket(this.sockets, name, socket);
      free.push(socket);
    });
  }
  static get defaultMaxSockets() { return Infinity; }
  createConnection(options, callback) { const socket = net.createConnection(options); if (callback) socket.once('connect', () => callback(null, socket)); return socket; }
  getName(options) {
    options = options || {};
    let name = options.host || 'localhost';
    name += ':';
    if (options.port) name += options.port;
    name += ':';
    if (options.localAddress) name += options.localAddress;
    if (options.family === 4 || options.family === 6) name += ':' + options.family;
    return name;
  }
  addRequest(req, options) {
    options = Object.assign({ __proto__: null }, options, this.options);
    if (!options.servername && options.servername !== '') options.servername = options.host;
    const name = this.getName(options);
    if (!this.sockets[name]) this.sockets[name] = [];
    const free = this.freeSockets[name];
    let socket;
    while (free && free.length) {
      socket = this.scheduling === 'fifo' ? free.shift() : free.pop();
      if (!free.length) delete this.freeSockets[name];
      if (!socket.destroyed) break;
      socket = undefined;
    }
    if (socket) {
      this.reuseSocket(socket, req);
      setRequestSocket(this, req, socket);
      this.sockets[name].push(socket);
    } else if (this.sockets[name].length < this.maxSockets && this.totalSocketCount < this.maxTotalSockets) {
      const created = this.createSocket(req, options);
      setRequestSocket(this, req, created);
    } else {
      if (!this.requests[name]) this.requests[name] = [];
      this.requests[name].push(req);
    }
  }
  createSocket(req, options) {
    options = Object.assign({ __proto__: null }, options, this.options);
    if (!options.servername && options.servername !== '') options.servername = options.host;
    const name = this.getName(options);
    options._agentKey = name;
    options.encoding = null;
    const socket = this.createConnection(options);
    this.totalSocketCount++;
    if (!this.sockets[name]) this.sockets[name] = [];
    this.sockets[name].push(socket);
    const onFree = () => this.emit('free', socket, options);
    const onClose = () => { this.removeSocket(socket, options); };
    const onTimeout = () => {
      const free = this.freeSockets[name];
      if (free && free.indexOf(socket) >= 0) { socket.destroy(); this.removeSocket(socket, options); this.emit('timeout'); }
    };
    const onRemove = () => {
      this.totalSocketCount--;
      removeSocket(this.sockets, name, socket);
      removeSocket(this.freeSockets, name, socket);
      socket.removeListener('close', onClose);
      socket.removeListener('free', onFree);
      socket.removeListener('timeout', onTimeout);
      socket.removeListener('agentRemove', onRemove);
    };
    socket.on('free', onFree);
    socket.on('close', onClose);
    socket.on('timeout', onTimeout);
    socket.on('agentRemove', onRemove);
    socket._agentRemove = onRemove;
    return socket;
  }
  removeSocket(socket, options) {
    const name = this.getName(options);
    if (removeSocket(this.sockets, name, socket) | removeSocket(this.freeSockets, name, socket)) this.totalSocketCount--;
    const requests = this.requests[name];
    if (requests && requests.length && (!this.sockets[name] || this.sockets[name].length < this.maxSockets)) {
      const req = requests.shift();
      if (!requests.length) delete this.requests[name];
      setRequestSocket(this, req, this.createSocket(req, options));
    }
  }
  keepSocketAlive(socket) {
    socket.setKeepAlive(true, this.keepAliveMsecs);
    socket.unref();
    let timeout = this.options.timeout;
    if (socket._keepAliveHint !== undefined) timeout = timeout === undefined ? socket._keepAliveHint : Math.min(timeout, socket._keepAliveHint);
    if (timeout !== undefined && socket._timeout !== timeout) socket.setTimeout(timeout);
    return true;
  }
  reuseSocket(socket, req) { socket.removeListener('error', freeSocketErrorListener); req.reusedSocket = true; socket.ref(); }
  destroy() {
    for (const set of [this.freeSockets, this.sockets]) for (const key of Object.keys(set)) for (const socket of set[key].slice()) socket.destroy();
  }
}
// Free sockets with no request attached may still see an error; it only removes them.
function freeSocketErrorListener() {}
function removeSocket(sets, name, socket) {
  const list = sets[name];
  if (!list) return false;
  const index = list.indexOf(socket);
  if (index < 0) return false;
  list.splice(index, 1);
  if (list.length === 0) delete sets[name];
  return true;
}
function setRequestSocket(agent, req, socket) {
  req.onSocket(socket);
  const agentTimeout = agent.options.timeout || 0;
  if (req.timeout === undefined || req.timeout === agentTimeout) return;
  socket.setTimeout(req.timeout);
}
export let globalAgent = new Agent({ keepAlive: true, scheduling: 'lifo', timeout: 5000 });

// ---- ClientRequest -----------------------------------------------------------
function parseUrl(input) {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/(?:([^@\/?#]*)@)?(\[[^\]]*\]|[^:\/?#]*)(?::(\d*))?([^?#]*)(\?[^#]*)?/.exec(input);
  if (match === null) throw codedError('ERR_INVALID_URL', 'Invalid URL', TypeError);
  const host = match[3].toLowerCase();
  return { protocol: match[1].toLowerCase(), auth: match[2] === undefined ? undefined : decodeURIComponent(match[2]), hostname: host, port: match[4] === undefined || match[4] === '' ? '' : match[4], pathname: match[5] || '/', search: match[6] || '' };
}
function urlToHttpOptions(url) {
  const hostname = typeof url.hostname === 'string' && url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const options = { protocol: url.protocol, hostname, hash: url.hash, search: url.search, pathname: url.pathname, path: (url.pathname || '') + (url.search || ''), href: url.href };
  if (url.port !== '' && url.port !== undefined) options.port = Number(url.port);
  if (url.username || url.password) options.auth = decodeURIComponent(url.username) + ':' + decodeURIComponent(url.password);
  else if (url.auth) options.auth = url.auth;
  return options;
}
export class ClientRequest extends OutgoingMessage {
  constructor(input, options, cb) {
    super();
    if (typeof input === 'string') input = urlToHttpOptions(parseUrl(input));
    else if (input !== null && typeof input === 'object' && typeof input.href === 'string' && typeof input.hostname === 'string') input = urlToHttpOptions(input);
    else { cb = options; options = input; input = null; }
    if (typeof options === 'function') { cb = options; options = input || {}; }
    else options = Object.assign({}, input, options);
    let agent = options.agent;
    const defaultAgent = options._defaultAgent || globalAgent;
    if (agent === false) agent = new defaultAgent.constructor();
    else if (agent === null || agent === undefined) { if (typeof options.createConnection !== 'function') agent = defaultAgent; }
    else if (typeof agent.addRequest !== 'function') throw invalidArgType('options.agent', 'of type Agent-like Object, undefined, or false', agent);
    this.agent = agent;
    const protocol = options.protocol || defaultAgent.protocol;
    let expectedProtocol = defaultAgent.protocol;
    if (this.agent && this.agent.protocol) expectedProtocol = this.agent.protocol;
    if (protocol !== expectedProtocol) throw codedError('ERR_INVALID_PROTOCOL', 'Protocol "' + protocol + '" not supported. Expected "' + expectedProtocol + '"', TypeError);
    const defaultPort = options.defaultPort || (this.agent && this.agent.defaultPort) || 80;
    const port = options.port = options.port || defaultPort || 80;
    const host = options.host = validateHost(options.hostname, 'hostname') || validateHost(options.host, 'host') || 'localhost';
    const setHost = options.setHost === undefined || Boolean(options.setHost);
    if (options.timeout !== undefined) {
      if (typeof options.timeout !== 'number') throw invalidArgType('timeout', 'of type number', options.timeout);
      this.timeout = options.timeout;
    }
    const method = options.method;
    const methodIsString = typeof method === 'string';
    if (method !== null && method !== undefined && !methodIsString) throw invalidArgType('options.method', 'of type string', method);
    if (methodIsString && method) {
      if (!tokenPattern.test(method)) throw codedError('ERR_INVALID_HTTP_TOKEN', 'Method must be a valid HTTP token ["' + method + '"]', TypeError);
      this.method = method.toUpperCase();
    } else this.method = 'GET';
    this.path = options.path || '/';
    if (invalidPath.test(this.path)) throw codedError('ERR_UNESCAPED_CHARACTERS', 'Request path contains unescaped characters', TypeError);
    if (cb) this.once('response', cb);
    const m = this.method;
    this.useChunkedEncodingByDefault = !(m === 'GET' || m === 'HEAD' || m === 'DELETE' || m === 'OPTIONS' || m === 'TRACE' || m === 'CONNECT');
    this._ended = false;
    this.res = null;
    this.aborted = false;
    this.timeoutCb = null;
    this.upgradeOrConnect = false;
    this.parser = null;
    this.maxHeadersCount = null;
    this.reusedSocket = false;
    this.host = host;
    this.protocol = protocol;
    this.joinDuplicateHeaders = !!options.joinDuplicateHeaders;
    this.maxHeaderSize = options.maxHeaderSize;
    if (this.agent) {
      if (!this.agent.keepAlive && !Number.isFinite(this.agent.maxSockets)) { this._last = true; this.shouldKeepAlive = false; }
      else { this._last = false; this.shouldKeepAlive = true; }
    }
    const headersArray = Array.isArray(options.headers);
    if (!headersArray) {
      if (options.headers) for (const key of Object.keys(options.headers)) this.setHeader(key, options.headers[key]);
      if (host && !this.getHeader('host') && setHost) {
        let hostHeader = host;
        const colon = hostHeader.indexOf(':');
        if (colon !== -1 && hostHeader.includes(':', colon + 1) && hostHeader.charCodeAt(0) !== 91) hostHeader = '[' + hostHeader + ']';
        if (port && +port !== defaultPort) hostHeader += ':' + port;
        this.setHeader('Host', hostHeader);
      }
      if (options.auth && !this.getHeader('Authorization')) this.setHeader('Authorization', 'Basic ' + Buffer.from(options.auth).toString('base64'));
      if (this.getHeader('expect')) this._storeHeader(this.method + ' ' + this.path + ' HTTP/1.1\r\n', this._headers);
    } else this._storeHeader(this.method + ' ' + this.path + ' HTTP/1.1\r\n', options.headers);
    const connectOptions = Object.assign({}, options);
    delete connectOptions.signal;
    if (this.agent) this.agent.addRequest(this, connectOptions);
    else {
      this._last = true;
      this.shouldKeepAlive = false;
      const socket = typeof options.createConnection === 'function' ? options.createConnection(connectOptions) : net.createConnection(connectOptions);
      this.onSocket(socket);
    }
    if (options.signal) {
      const signal = options.signal;
      const abort = () => this.destroy(codedError('ABORT_ERR', 'The operation was aborted'));
      if (signal.aborted) abort(); else if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', abort, { once: true });
    }
  }
  get path() { return this._path; }
  set path(value) { this._path = value; }
  _implicitHeader() {
    if (this._header) throw headersSentError('render');
    this._storeHeader(this.method + ' ' + this.path + ' HTTP/1.1\r\n', this._headers);
  }
  abort() {
    if (this.aborted) return;
    this.aborted = true;
    queueMicrotask(() => this.emit('abort'));
    this.destroy();
  }
  destroy(error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    if (this.res) this.res._dump();
    this._destroyError = error;
    if (this.socket) this.socket.destroy(error);
    else {
      queueMicrotask(() => {
        if (error) emitErrorOnce(this, error);
        else if (!this.res) emitErrorOnce(this, connResetError('socket hang up'));
        this._closed = true;
        this.emit('close');
      });
    }
    return this;
  }
  onSocket(socket) {
    queueMicrotask(() => this._tickOnSocket(socket));
  }
  _tickOnSocket(socket) {
    if (this.destroyed) {
      if (this.agent) socket.emit('free'); else socket.destroy();
      if (!this._closedEmitted) { this._closedEmitted = true; if (this._destroyError) emitErrorOnce(this, this._destroyError); this._closed = true; this.emit('close'); }
      return;
    }
    const parser = new Parser('response', this.maxHeaderSize);
    this.socket = socket;
    this.parser = parser;
    socket.parser = parser;
    socket._httpMessage = this;
    if (typeof this.maxHeadersCount === 'number') parser.maxHeadersCount = this.maxHeadersCount;
    const req = this;
    parser.onHeaders = info => {
      const res = messageFromInfo(socket, info, IncomingMessage, req.joinDuplicateHeaders);
      if (req.res) { socket.destroy(); return true; }
      if (info.statusCode >= 100 && info.statusCode < 200 && info.statusCode !== 101) {
        if (info.statusCode === 100) req.emit('continue');
        req.emit('information', { statusCode: res.statusCode, statusMessage: res.statusMessage, httpVersion: res.httpVersion, httpVersionMajor: res.httpVersionMajor,
          httpVersionMinor: res.httpVersionMinor, headers: res.headers, rawHeaders: res.rawHeaders });
        parser.informational = true;
        return true;
      }
      if (info.statusCode === 101 || (req.method === 'CONNECT' && info.statusCode >= 200 && info.statusCode < 300)) {
        req.res = res;
        res.req = req;
        req.upgradeOrConnect = true;
        parser.paused = true;
        parser.upgraded = res;
        return true;
      }
      parser.incoming = res;
      req.res = res;
      res.req = req;
      if (req.shouldKeepAlive && !info.shouldKeepAlive) req.shouldKeepAlive = false;
      const keepAliveHeader = res.headers['keep-alive'];
      if (typeof keepAliveHeader === 'string') { const hint = /timeout=(\d+)/.exec(keepAliveHeader); if (hint) socket._keepAliveHint = Math.max(0, Number(hint[1]) * 1000 - 1000); }
      res.on('end', responseOnEnd);
      req.on('finish', requestOnFinish);
      if (req.aborted || !req.emit('response', res)) res._dump();
      if (req.method === 'HEAD' || res.statusCode === 304) return true;
      return false;
    };
    parser.onBody = bytes => {
      const res = parser.incoming;
      if (res && !res.destroyed && res.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length)) === false && !socket.isPaused()) { res._socketPaused = true; socket.pause(); }
    };
    parser.onComplete = trailers => {
      if (parser.informational) { parser.informational = false; return; }
      if (parser.upgraded) return;
      const res = parser.incoming;
      parser.incoming = null;
      if (!res) return;
      res.rawTrailers = trailers;
      res.complete = true;
      res.push(null);
    };
    const onData = data => {
      const error = parser.execute(data);
      if (error) {
        socket.removeListener('data', onData);
        socket.removeListener('end', onEnd);
        socket.destroy();
        socket._hadError = true;
        emitErrorOnce(req, error);
        return;
      }
      if (parser.upgraded) {
        const res = parser.upgraded;
        parser.upgraded = null;
        socket.removeListener('data', onData);
        socket.removeListener('end', onEnd);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
        const head = parser.pending ? Buffer.from(parser.pending) : Buffer.alloc(0);
        parser.pending = null;
        socket._httpMessage = null;
        socket.parser = null;
        const event = req.method === 'CONNECT' ? 'connect' : 'upgrade';
        if (req.listenerCount(event) > 0) {
          if (socket._agentRemove) socket._agentRemove();
          req.emit(event, res, socket, head);
          req.destroyed = true;
          req._closed = true;
          req.emit('close');
        } else socket.destroy();
      }
    };
    const onEnd = () => {
      if (!req.res && !socket._hadError) { socket._hadError = true; emitErrorOnce(req, connResetError('socket hang up')); }
      const error = parser.finish();
      if (error && req.res && !req.res.complete) req.res.destroy(connResetError('aborted'));
      socket.destroy();
    };
    const onError = error => {
      if (req.socket !== socket) return;
      socket._hadError = true;
      emitErrorOnce(req, error);
    };
    const onClose = () => {
      if (req.socket !== socket || socket._httpMessage !== req) return;
      req.destroyed = true;
      const res = req.res;
      if (res) {
        if (!res.complete) res.destroy(connResetError('aborted'));
        req._closed = true;
        req.emit('close');
        if (!res.aborted && res.readable) res.push(null);
      } else {
        if (!socket._hadError) { socket._hadError = true; emitErrorOnce(req, connResetError('socket hang up')); }
        req._closed = true;
        req.emit('close');
      }
    };
    const onTimeout = () => { const res = req.res; if (res) res.emit('timeout'); req.emit('timeout'); };
    socket.on('data', onData);
    socket.on('end', onEnd);
    socket.on('error', onError);
    socket.on('close', onClose);
    if (this.timeout !== undefined) socket.on('timeout', onTimeout);
    req._socketListeners = { onData, onEnd, onError, onClose, onTimeout };
    if (socket.connecting) socket.once('connect', () => this._flush());
    this.emit('socket', socket);
    if (!socket.connecting) this._flush();
  }
  _flush() {
    const socket = this.socket;
    if (socket && socket.writable && !socket.connecting) {
      const ok = this._flushOutput(socket);
      if (this.finished) this._finish();
      else if (ok) this.emit('drain');
    }
  }
  setTimeout(msecs, callback) {
    if (callback) this.once('timeout', callback);
    this.timeout = msecs;
    if (this.socket) { this.socket.setTimeout(msecs); if (!this.socket.listenerCount('timeout') || !this._socketListeners) {} else if (this._socketListeners) { this.socket.removeListener('timeout', this._socketListeners.onTimeout); this.socket.on('timeout', this._socketListeners.onTimeout); } }
    else this.once('socket', socket => { socket.setTimeout(msecs); if (this._socketListeners) socket.on('timeout', this._socketListeners.onTimeout); });
    return this;
  }
  setNoDelay(noDelay) { if (this.socket) this.socket.setNoDelay(noDelay); else this.once('socket', socket => socket.setNoDelay(noDelay)); }
  setSocketKeepAlive(enable, delay) { if (this.socket) this.socket.setKeepAlive(enable, delay); else this.once('socket', socket => socket.setKeepAlive(enable, delay)); }
  clearTimeout(callback) { this.setTimeout(0, callback); }
}
function validateHost(host, name) {
  if (host !== null && host !== undefined && typeof host !== 'string') throw invalidArgType('options.' + name, 'of type string or one of undefined or null', host);
  return host;
}
function connResetError(message) {
  const error = new Error(message);
  error.code = 'ECONNRESET';
  return error;
}
function emitErrorOnce(req, error) {
  if (req._errorEmitted) return;
  req._errorEmitted = true;
  req.emit('error', error);
}
function requestOnFinish() {
  const req = this;
  if (req.shouldKeepAlive && req._ended) responseKeepAlive(req);
}
function responseOnEnd() {
  const req = this.req;
  const socket = req.socket;
  req._ended = true;
  if (!req.shouldKeepAlive) {
    if (socket.writable) socket.destroySoon();
  } else if (req.writableFinished && !this.aborted) responseKeepAlive(req);
}
function responseKeepAlive(req) {
  const socket = req.socket;
  if (req._keptAlive) return;
  req._keptAlive = true;
  const listeners = req._socketListeners;
  socket.removeListener('data', listeners.onData);
  socket.removeListener('end', listeners.onEnd);
  socket.removeListener('error', listeners.onError);
  socket.removeListener('close', listeners.onClose);
  socket.removeListener('timeout', listeners.onTimeout);
  if (req.timeout !== undefined) socket.setTimeout(0);
  socket.parser = null;
  req.destroyed = true;
  if (req.res) req.res.socket = null;
  queueMicrotask(() => {
    req._closed = true;
    req.emit('close');
    if (req.agent) socket.emit('free'); else socket.destroy();
  });
}

export function request(url, options, cb) { return new ClientRequest(url, options, cb); }
export function get(url, options, cb) { const req = request(url, options, cb); req.end(); return req; }
export function setMaxIdleHTTPParsers(max) {}
export default {
  METHODS, STATUS_CODES, Agent, ClientRequest, IncomingMessage, OutgoingMessage, Server, ServerResponse, createServer, validateHeaderName,
  validateHeaderValue, get, request, setMaxIdleHTTPParsers, maxHeaderSize,
  get globalAgent() { return globalAgent; }, set globalAgent(value) { globalAgent = value; }
};
`;
