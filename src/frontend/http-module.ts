/**
 * Source of the built-in `node:http` (alias `nona:http`) module: Nona's own
 * HTTP/1.1 server and client behind the Node.js API.
 *
 * The design follows from what costs time in Nona: a generic JavaScript
 * step costs far more than in a JIT, while native runtime code and system
 * calls are cheap. So request bytes never go through JavaScript loops:
 *
 * - The server reads straight from the socket's read buffer (no chunk object
 *   per read) and parses request heads with a native parser
 *   (nona:internal/native) that returns offsets. A request keeps a copy of
 *   its head bytes; the method comes from a table, the URL is one native
 *   slice, and header strings are only made when the program asks for them.
 * - A response head is one string built from cached pieces (status line,
 *   Date, connection fields); head and body are encoded natively into one
 *   output buffer and written with a single system call.
 * - Events nobody listens to are not scheduled. Work that Node.js defers per
 *   request (finish, close, discarding an unread request) runs in one job
 *   per batch of requests.
 *
 * What programs observe (headers and their order, duplicate merging, events,
 * keep-alive and pipelining, errors) matches Node.js; tests/http.test.ts
 * runs the same programs under Node.js and compares the output.
 */
export const httpModuleSource=String.raw`
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import * as net from 'node:net';
import { Readable, defaults } from 'nona:internal/stream';
import { parse as parseHead, latin1, write as writeString, copy as copyBytes, check as checkChars } from 'nona:internal/native';

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
const closeToken = /(?:^|\W)close(?:$|\W)/i, keepAliveToken = /(?:^|\W)keep-alive(?:$|\W)/i, upgradeToken = /(?:^|\W)upgrade(?:$|\W)/i;
const chunkedToken = /(?:^|\W)chunked(?:$|\W)/i, continueToken = /(?:^|\W)100-continue(?:$|\W)/i;
// Flags of the native parser (src/runtime/http-native.ts).
const F_CHUNKED = 1, F_TE = 2, F_CL = 4, F_CLOSE = 8, F_KEEPALIVE = 16, F_UPGRADE_TOKEN = 32, F_UPGRADE = 64, F_EXPECT = 128, F_HOST = 256,
  F_OTHER_TE = 2048, F_OTHER_CONNECTION = 4096;
const MAX_HEADERS = 128;
const OUT = new Int32Array(11 + 4 * MAX_HEADERS);

function codedError(code, message, Type) {
  const error = new (Type || Error)(message);
  error.code = code;
  return error;
}
function invalidArgType(name, expected, value) {
  return codedError('ERR_INVALID_ARG_TYPE', 'The "' + name + '" argument must be ' + expected + '. Received ' + (value === null ? 'null' : value === undefined ? 'undefined' : 'type ' + typeof value + ' (' + String(value) + ')'), TypeError);
}
const isToken = text => text.length > 0 && checkChars(text, 0) < 0;
export function validateHeaderName(name, label) {
  if (typeof name !== 'string' || !isToken(name))
    throw codedError('ERR_INVALID_HTTP_TOKEN', (label || 'Header name') + ' must be a valid HTTP token ["' + name + '"]', TypeError);
}
export function validateHeaderValue(name, value) {
  if (value === undefined) throw codedError('ERR_HTTP_INVALID_HEADER_VALUE', 'Invalid value "' + value + '" for header "' + name + '"', TypeError);
  if (checkChars(typeof value === 'string' ? value : String(value), 1) >= 0) throw codedError('ERR_INVALID_CHAR', 'Invalid character in header content ["' + name + '"]', TypeError);
}
function headersSentError(action) { return codedError('ERR_HTTP_HEADERS_SENT', 'Cannot ' + action + ' headers after they are sent to the client'); }

// ---- Small caches ------------------------------------------------------------
// Method names by a hash of their bytes (the native parser computes the same hash).
function methodHash(text) { let h = 0; for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0; return h; }
const methodByHash = new Map();
for (const method of METHODS) methodByHash.set(methodHash(method), method);
// Lower-case header names: programs set the same few names over and over.
const lowerNames = new Map();
function lowerName(name) {
  let lower = lowerNames.get(name);
  if (lower === undefined) { lower = name.toLowerCase(); if (lowerNames.size < 512) lowerNames.set(name, lower); }
  return lower;
}
const statusLines = new Map();
function statusLine(code, message) {
  if (message === STATUS_CODES[code]) {
    let line = statusLines.get(code);
    if (line === undefined) { line = 'HTTP/1.1 ' + code + ' ' + message + '\r\n'; statusLines.set(code, line); }
    return line;
  }
  return 'HTTP/1.1 ' + code + ' ' + message + '\r\n';
}
let dateSecond = -1, dateField = '';
/** The Date header field, formatted once per second. */
function dateLine() {
  const now = Date.now(), second = (now / 1000) | 0;
  if (second !== dateSecond) { dateSecond = second; dateField = 'Date: ' + new Date(now).toUTCString() + '\r\n'; }
  return dateField;
}
// One output buffer for all writes: a message is encoded into it and sent at once.
let outBuffer = new Uint8Array(65536);
let lastBody = null, lastBytes = null;
function reserve(size) { if (outBuffer.length < size) outBuffer = new Uint8Array(Math.max(size, outBuffer.length * 2)); return outBuffer; }

// ---- Deferred notifications ----------------------------------------------------
// Per-request events that Node.js emits on a later tick run in one job for
// every batch of requests, and only for objects that have listeners.
let laterQueue = [], laterScheduled = false;
function later(target, kind) {
  laterQueue.push(target, kind);
  if (!laterScheduled) { laterScheduled = true; queueMicrotask(runLater); }
}
function runLater() {
  laterScheduled = false;
  const queue = laterQueue;
  laterQueue = [];
  for (let i = 0; i < queue.length; i += 2) {
    const target = queue[i], kind = queue[i + 1];
    if (kind === 0) { target.writableFinished = true; target.emit('finish'); }
    else if (kind === 1) { target._closed = true; target.emit('close'); }
    else if (kind === 2) target._dumpNow();
  }
}
function hasListener(emitter, type) { const events = emitter._events; return events !== undefined && events[type] !== undefined; }

// ---- Header field merging (IncomingMessage.headers) ---------------------------
const firstWins = new Set(['age', 'authorization', 'content-length', 'content-type', 'etag', 'expires', 'from', 'host', 'if-modified-since',
  'if-unmodified-since', 'last-modified', 'location', 'max-forwards', 'proxy-authorization', 'referer', 'retry-after', 'server', 'user-agent']);
function mergeHeaders(raw, joinDuplicates) {
  const out = {};
  for (let i = 0; i < raw.length; i += 2) {
    const field = lowerName(raw[i]), value = raw[i + 1], existing = out[field];
    if (existing === undefined) out[field] = field === 'set-cookie' ? [value] : value;
    else if (field === 'set-cookie') existing.push(value);
    else if (field === 'cookie') out[field] = existing + '; ' + value;
    else if (!firstWins.has(field) || joinDuplicates) out[field] = existing + ', ' + value;
  }
  return out;
}
function distinctHeaders(raw) {
  const out = {};
  for (let i = 0; i < raw.length; i += 2) { const field = lowerName(raw[i]); (out[field] || (out[field] = [])).push(raw[i + 1]); }
  return out;
}
/** The header lines of a request head copied by the server, as [name, value, ...]. */
function headLines(head) {
  const end = parseHead(head, 0, head.length, OUT), raw = [];
  if (end > 0) for (let i = 0, n = OUT[6]; i < n; i++) { const k = 11 + 4 * i; raw.push(latin1(head, OUT[k], OUT[k + 1]), latin1(head, OUT[k + 2], OUT[k + 3])); }
  return raw;
}

// ---- IncomingMessage -----------------------------------------------------------
export class IncomingMessage extends Readable {
  constructor(socket) {
    super();
    this.socket = socket;
  }
  get connection() { return this.socket; }
  set connection(value) { this.socket = value; }
  get rawHeaders() { if (this._raw === null) this._raw = this._head === null ? [] : headLines(this._head); return this._raw; }
  set rawHeaders(value) { this._raw = value; }
  get headers() { if (this._headers === null) this._headers = mergeHeaders(this.rawHeaders, this.joinDuplicateHeaders); return this._headers; }
  set headers(value) { this._headers = value; }
  get headersDistinct() { return distinctHeaders(this.rawHeaders); }
  get trailers() { if (this._trailers === null) this._trailers = mergeHeaders(this.rawTrailers, this.joinDuplicateHeaders); return this._trailers; }
  set trailers(value) { this._trailers = value; }
  get trailersDistinct() { return distinctHeaders(this.rawTrailers); }
  get rawTrailers() { if (this._rawTrailers === null) this._rawTrailers = []; return this._rawTrailers; }
  set rawTrailers(value) { this._rawTrailers = value; }
  setTimeout(msecs, callback) { if (callback) this.on('timeout', callback); if (this.socket) this.socket.setTimeout(msecs); return this; }
  read(n) { this._consuming = true; return super.read(n); }
  on(type, listener) { if (type === 'data' || type === 'readable') this._consuming = true; return super.on(type, listener); }
  resume() { this._consuming = true; return super.resume(); }
  _read() { if (this._socketPaused && this.socket && !this.socket.destroyed) { this._socketPaused = false; this.socket.resume(); } }
  // Like Node.js, a message destroys itself (and emits 'close') after 'end'.
  _ended_() { if (!this._destroyed) this.destroy(); }
  /** The request's response is done: unread data is discarded. */
  _dump() {
    if (this._dumped) return;
    this._dumped = true;
    // Nobody can observe a message without listeners: finish it in place.
    if (this._events === undefined || this._eventsCount === 0) {
      this._queue = null; this._queued = 0;
      if (this._ended) { this._endEmitted = true; this._destroyed = true; this._closed = true; }
      else this._flowing = true;
      return;
    }
    later(this, 2);
  }
  _dumpNow() { this.removeAllListeners('data'); super.resume(); }
  _destroy(error, callback) {
    if (!this._endEmitted || !this.complete) { this.aborted = true; this.emit('aborted'); }
    if (this.socket && !this.socket.destroyed && this.aborted) this.socket.destroy(error);
    callback(error && this.listenerCount('error') > 0 ? error : null);
  }
}
defaults(IncomingMessage.prototype, {
  httpVersionMajor: 1, httpVersionMinor: 1, httpVersion: '1.1', complete: false, aborted: false, upgrade: false, url: '', method: null,
  statusCode: null, statusMessage: null, joinDuplicateHeaders: false, socket: null, _rawTrailers: null, _head: null, _raw: null, _headers: null,
  _trailers: null, _consuming: false, _dumped: false, _socketPaused: false
});

// ---- OutgoingMessage -------------------------------------------------------------
/**
 * Headers set with setHeader live in three parallel arrays (lower-case name,
 * name as given, value); messages carry a handful, so a linear search beats
 * any table. The head is composed once, when the first bytes are written.
 */
export class OutgoingMessage extends EventEmitter {
  constructor() { super(); }
  get connection() { return this.socket; }
  set connection(value) { this.socket = value; }
  get headersSent() { return this._header !== null; }
  get writableEnded() { return this.finished; }
  get writable() { return !this.destroyed && !this.finished; }
  get writableObjectMode() { return false; }
  get writableCorked() { return 0; }
  get writableHighWaterMark() { return 16384; }
  get writableLength() { return this._outputSize + (this.socket ? this.socket.writableLength : 0); }
  get writableNeedDrain() { return !this.destroyed && !this.finished && this.writableLength >= 16384; }
  get closed() { return this._closed; }
  get errored() { return null; }
  /** Index of the field's entry in _fields ([key, name, value, ...]), or -1. */
  _find(key) {
    const fields = this._fields;
    if (fields !== null) for (let i = 0; i < fields.length; i += 3) if (fields[i] === key) return i;
    return -1;
  }
  setHeader(name, value) {
    if (this._header !== null) throw headersSentError('set');
    validateHeaderName(name);
    validateHeaderValue(name, value);
    const key = lowerName(name), index = this._find(key);
    const special = specialFields.get(key);
    if (special !== undefined) this._special |= special;
    if (index >= 0) { this._fields[index + 1] = name; this._fields[index + 2] = value; }
    else if (this._fields === null) this._fields = [key, name, value];
    else this._fields.push(key, name, value);
    return this;
  }
  appendHeader(name, value) {
    if (this._header !== null) throw headersSentError('append');
    validateHeaderName(name);
    validateHeaderValue(name, value);
    const index = this._find(lowerName(name));
    if (index < 0) return this.setHeader(name, value);
    this._special |= SPECIAL_ARRAY;
    const existing = this._fields[index + 2];
    this._fields[index + 2] = (Array.isArray(existing) ? existing : [existing]).concat(value);
    return this;
  }
  setHeaders(headers) {
    if (this._header !== null) throw headersSentError('set');
    if (!headers || typeof headers.forEach !== 'function') throw invalidArgType('headers', 'an instance of Headers or Map', headers);
    headers.forEach((value, key) => this.setHeader(key, value));
    return this;
  }
  getHeader(name) {
    if (typeof name !== 'string') throw invalidArgType('name', 'of type string', name);
    const index = this._find(lowerName(name));
    return index < 0 ? undefined : this._fields[index + 2];
  }
  getHeaderNames() { const out = []; if (this._fields !== null) for (let i = 0; i < this._fields.length; i += 3) out.push(this._fields[i]); return out; }
  getRawHeaderNames() { const out = []; if (this._fields !== null) for (let i = 1; i < this._fields.length; i += 3) out.push(this._fields[i]); return out; }
  getHeaders() {
    const out = Object.create(null);
    if (this._fields !== null) for (let i = 0; i < this._fields.length; i += 3) out[this._fields[i]] = this._fields[i + 2];
    return out;
  }
  hasHeader(name) {
    if (typeof name !== 'string') throw invalidArgType('name', 'of type string', name);
    return this._find(lowerName(name)) >= 0;
  }
  removeHeader(name) {
    if (typeof name !== 'string') throw invalidArgType('name', 'of type string', name);
    if (this._header !== null) throw headersSentError('remove');
    const key = lowerName(name);
    this._special |= SPECIAL_REMOVED;
    if (key === 'connection') this._removedConnection = true;
    else if (key === 'content-length') this._removedContLen = true;
    else if (key === 'transfer-encoding') this._removedTE = true;
    else if (key === 'date') this.sendDate = false;
    const index = this._find(key);
    if (index >= 0) this._fields.splice(index, 3);
  }
  /**
   * Composes the head: the first line, the given fields (this message's own,
   * or the object or array passed to writeHead, validated here), then Date,
   * Connection/Keep-Alive and the body framing the fields did not decide.
   */
  _compose(firstLine, fields) {
    const state = { head: firstLine, date: false, connection: false, length: false, encoding: false, trailer: false, expect: false };
    if (fields === this) { const own = this._fields; if (own !== null) for (let i = 0; i < own.length; i += 3) this._field(state, own[i + 1], own[i + 2], false); }
    else if (Array.isArray(fields)) {
      if (fields.length && Array.isArray(fields[0])) for (const entry of fields) this._field(state, entry[0], entry[1], true);
      else {
        if (fields.length % 2 !== 0) throw codedError('ERR_INVALID_ARG_VALUE', "The argument 'headers' is invalid.", TypeError);
        for (let i = 0; i < fields.length; i += 2) this._field(state, fields[i], fields[i + 1], true);
      }
    } else if (fields) for (const key in fields) if (Object.prototype.hasOwnProperty.call(fields, key)) this._field(state, key, fields[key], true);
    let head = state.head;
    if (this.sendDate && !state.date) head += dateLine();
    if (this.chunkedEncoding && (this.statusCode === 204 || this.statusCode === 304)) { this.chunkedEncoding = false; this.shouldKeepAlive = false; }
    if (this._removedConnection) this._last = !this.shouldKeepAlive;
    else if (!state.connection) {
      if (this.shouldKeepAlive && (state.length || this.useChunkedEncodingByDefault || this.agent)) {
        if (this.maxRequestsOnConnectionReached) head += 'Connection: close\r\n';
        else {
          const server = this._connection === null ? null : this._connection.server;
          if (server !== null && server.keepAliveTimeout && this._defaultKeepAlive) head += keepAliveLines(server.keepAliveTimeout, server.maxRequestsPerSocket);
          else head += 'Connection: keep-alive\r\n';
        }
      } else { this._last = true; head += 'Connection: close\r\n'; }
    }
    if (!state.length && !state.encoding) {
      if (!this._hasBody) this.chunkedEncoding = false;
      else if (!this.useChunkedEncodingByDefault) this._last = true;
      else if (!state.trailer && !this._removedContLen && typeof this._contentLength === 'number') head += 'Content-Length: ' + this._contentLength + '\r\n';
      else if (!this._removedTE) { head += 'Transfer-Encoding: chunked\r\n'; this.chunkedEncoding = true; }
      else this._last = true;
    }
    if (this.chunkedEncoding !== true && state.trailer) throw codedError('ERR_HTTP_TRAILER_INVALID', 'Trailers are invalid with this transfer encoding');
    this._header = head + '\r\n';
    this._headerSent = false;
    if (state.expect) this._emit(null, null, null, null);
  }
  _field(state, name, value, validate) {
    if (validate) validateHeaderName(name);
    if (Array.isArray(value)) {
      if (value.length < 2 || lowerName(name) !== 'cookie') { for (let i = 0; i < value.length; i++) this._line(state, name, value[i], validate); return; }
      value = value.join('; ');
    }
    this._line(state, name, value, validate);
  }
  _line(state, name, value, validate) {
    if (validate) validateHeaderValue(name, value);
    state.head += name + ': ' + value + '\r\n';
    const n = name.length;
    if (n < 4 || n > 17) return;
    switch (lowerName(name)) {
      case 'connection': state.connection = true; this._removedConnection = false; if (closeToken.test(value)) this._last = true; else this.shouldKeepAlive = true; break;
      case 'transfer-encoding': state.encoding = true; this._removedTE = false; if (chunkedToken.test(value)) this.chunkedEncoding = true; break;
      case 'content-length': state.length = true; this._contentLength = +value; this._removedContLen = false; break;
      case 'date': state.date = true; break;
      case 'expect': state.expect = true; break;
      case 'trailer': state.trailer = true; break;
      case 'keep-alive': this._defaultKeepAlive = false; break;
    }
  }
  /**
   * Encodes [the head, if not sent yet] + prefix + body + suffix into the
   * output buffer and hands it to the socket (or keeps a copy until there is
   * one). body is a string (in the given encoding) or bytes; prefix and suffix are
   * ASCII.
   */
  _emit(prefix, body, encoding, suffix, callback) {
    const head = this._headerSent ? null : this._header;
    const latin = encoding === 'latin1' || encoding === 'binary' || encoding === 'ascii';
    let size = 0, bodyBytes = null;
    if (head !== null) size += head.length;
    if (prefix !== null) size += prefix.length;
    if (body !== null) {
      if (typeof body !== 'string') size += body.length;
      else if (latin) size += body.length;
      else if (encoding === null || encoding === undefined || encoding === 'utf8' || encoding === 'utf-8') size += writeString(body, undefined, 0, false);
      else { bodyBytes = Buffer.from(body, encoding); size += bodyBytes.length; }
    }
    if (suffix !== null) size += suffix.length;
    const out = reserve(size);
    let offset = 0;
    if (head !== null) { offset += writeString(head, out, offset, true); this._headerSent = true; }
    if (prefix !== null) offset += writeString(prefix, out, offset, true);
    if (body !== null) {
      if (bodyBytes !== null) { copyBytes(bodyBytes, 0, bodyBytes.length, out, offset); offset += bodyBytes.length; }
      else if (typeof body === 'string') offset += writeString(body, out, offset, latin);
      else { copyBytes(body, 0, body.length, out, offset); offset += body.length; }
    }
    if (suffix !== null) offset += writeString(suffix, out, offset, true);
    return this._writeOut(out, offset, callback);
  }
  _writeOut(bytes, length, callback) {
    const socket = this.socket;
    if (socket !== null && socket._httpMessage === this && !socket.connecting && !socket._destroyed) {
      if (this._output !== null) this._flushOutput();
      if (length === 0) { if (callback) done(callback, null); return true; }
      return socket._sendNow(bytes, length, callback);
    }
    if (socket !== null && socket._destroyed) {
      if (callback && typeof callback === 'function') queueMicrotask(() => callback(codedError('ERR_STREAM_DESTROYED', 'Cannot call write after a stream was destroyed')));
      return false;
    }
    const copy = new Uint8Array(length);
    copyBytes(bytes, 0, length, copy, 0);
    if (this._output === null) this._output = [];
    this._output.push(copy, callback);
    this._outputSize += length;
    return this._outputSize < 16384;
  }
  _flushOutput() {
    const output = this._output, socket = this.socket;
    this._output = null; this._outputSize = 0;
    let ok = true;
    for (let i = 0; i < output.length; i += 2) {
      const bytes = output[i], callback = output[i + 1];
      if (bytes.length === 0) { if (callback) done(callback, null); continue; }
      ok = socket._sendNow(bytes, bytes.length, callback);
    }
    return ok;
  }
  _implicitHeader() { throw codedError('ERR_METHOD_NOT_IMPLEMENTED', 'The _implicitHeader() method is not implemented'); }
  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') { callback = encoding; encoding = null; }
    return this._write(chunk, encoding, callback, false);
  }
  _write(chunk, encoding, callback, fromEnd) {
    if (typeof callback !== 'function') callback = undefined;
    if (chunk === null) throw codedError('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) throw invalidArgType('chunk', 'of type string or an instance of Buffer or Uint8Array', chunk);
    if (this.finished || this.destroyed) {
      const error = this.finished ? codedError('ERR_STREAM_WRITE_AFTER_END', 'write after end') : codedError('ERR_STREAM_DESTROYED', 'Cannot call write after a stream was destroyed');
      if (!this.destroyed && this.listenerCount('error') > 0) queueMicrotask(() => this.emit('error', error));
      if (callback) queueMicrotask(() => callback(error));
      return false;
    }
    if (this._header === null) {
      if (fromEnd) this._contentLength = byteLength(chunk, encoding);
      this._implicitHeader();
    }
    if (!this._hasBody) {
      if (this._headerSent) { if (callback) queueMicrotask(callback); return true; }
      return this._emit(null, null, null, null, callback);
    }
    if (this.chunkedEncoding) {
      const length = byteLength(chunk, encoding);
      if (length === 0) return this._headerSent ? true : this._emit(null, null, null, null, callback);
      return this._emit(length.toString(16) + '\r\n', chunk, encoding, '\r\n', callback);
    }
    return this._emit(null, chunk, encoding, null, callback);
  }
  addTrailers(headers) {
    this._trailer = '';
    const isArray = Array.isArray(headers);
    for (const key of Object.keys(headers)) {
      const field = isArray ? headers[key][0] : key, value = isArray ? headers[key][1] : headers[key];
      validateHeaderName(field, 'Trailer name');
      const values = Array.isArray(value) && value.length > 1 ? value : [Array.isArray(value) ? value.join('; ') : value];
      for (const item of values) {
        if (checkChars(String(item), 1) >= 0) throw codedError('ERR_INVALID_CHAR', 'Invalid character in trailer content ["' + field + '"]', TypeError);
        this._trailer += field + ': ' + item + '\r\n';
      }
    }
  }
  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') { callback = chunk; chunk = null; encoding = null; }
    else if (typeof encoding === 'function') { callback = encoding; encoding = null; }
    if (chunk) {
      if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) throw invalidArgType('chunk', 'of type string or an instance of Buffer or Uint8Array', chunk);
      if (this.finished) {
        const error = codedError('ERR_STREAM_WRITE_AFTER_END', 'write after end');
        if (this.listenerCount('error') > 0) queueMicrotask(() => this.emit('error', error));
        if (typeof callback === 'function') queueMicrotask(() => callback(error));
        return this;
      }
    } else if (this.finished) {
      if (typeof callback === 'function') {
        if (!this.writableFinished) this.once('finish', callback);
        else callback(codedError('ERR_STREAM_ALREADY_FINISHED', 'Cannot call end after a stream was finished'));
      }
      return this;
    }
    if (typeof callback === 'function') this.once('finish', callback);
    if (this._header === null) {
      this._contentLength = chunk ? byteLength(chunk, encoding) : 0;
      this._implicitHeader();
    }
    this.finished = true;
    // Head, last data and terminator go out in one write.
    const done = this;
    if (chunk && this._hasBody) {
      if (this.chunkedEncoding) {
        const length = byteLength(chunk, encoding);
        if (length === 0) this._emit(null, null, null, '0\r\n' + this._trailer + '\r\n', done);
        else this._emit(length.toString(16) + '\r\n', chunk, encoding, '\r\n0\r\n' + this._trailer + '\r\n', done);
      } else this._emit(null, chunk, encoding, null, done);
    } else if (this._hasBody && this.chunkedEncoding) this._emit(null, null, null, '0\r\n' + this._trailer + '\r\n', done);
    else this._emit(null, null, null, null, done);
    return this;
  }
  /** Write completion when the message itself is the callback (no closure per message). */
  _sent(error) { if (!error) this._finished(); }
  /** All bytes of the message are with the socket. */
  _finished() {
    if (this.socket !== null && this.socket._hadError) return;
    if (hasListener(this, 'finish')) later(this, 0); else this.writableFinished = true;
    this._afterFinish();
  }
  _afterFinish() {}
  flushHeaders() {
    if (this._header === null) this._implicitHeader();
    if (!this._headerSent) this._emit(null, null, null, null);
  }
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
  pipe() { this.emit('error', codedError('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable')); }
  cork() {}
  uncork() {}
}
defaults(OutgoingMessage.prototype, {
  _special: 0, _fields: null, _connection: null, _header: null, _headerSent: false, finished: false, writableFinished: false, destroyed: false,
  _closed: false, chunkedEncoding: false, useChunkedEncodingByDefault: true, shouldKeepAlive: true, sendDate: false, _last: false, _hasBody: true,
  _contentLength: null, _removedConnection: false, _removedContLen: false, _removedTE: false, _defaultKeepAlive: true,
  maxRequestsOnConnectionReached: false, _trailer: '', socket: null, _output: null, _outputSize: 0, strictContentLength: false,
  agent: undefined
});
/** Calls a write callback: a function, or a message (its _sent method). */
function done(callback, error) { if (typeof callback === 'function') callback(error); else callback._sent(error); }
function byteLength(chunk, encoding) {
  if (typeof chunk !== 'string') return chunk.length;
  if (encoding === null || encoding === undefined || encoding === 'utf8' || encoding === 'utf-8') return writeString(chunk, undefined, 0, false);
  return Buffer.byteLength(chunk, encoding);
}
// Header fields that change how a head is composed (see _compose). A message
// whose fields include none of them can use ServerResponse's fast path.
const SPECIAL_ARRAY = 256, SPECIAL_REMOVED = 512;
const specialFields = new Map([['connection', 1], ['transfer-encoding', 2], ['content-length', 4], ['date', 8], ['expect', 16], ['trailer', 32], ['keep-alive', 64], ['cookie', 128]]);
/** The lines of one header field set with setHeader (validated then). */
function fieldLines(name, value) {
  if (!Array.isArray(value)) return name + ': ' + value + '\r\n';
  let lines = '';
  for (let i = 0; i < value.length; i++) lines += name + ': ' + value[i] + '\r\n';
  return lines;
}
const keepAliveCache = new Map();
function keepAliveLines(timeout, maxRequests) {
  const key = timeout * 65536 + (~~maxRequests > 0 ? maxRequests : 0);
  let lines = keepAliveCache.get(key);
  if (lines === undefined) {
    lines = 'Connection: keep-alive\r\nKeep-Alive: timeout=' + ((timeout / 1000) | 0) + (~~maxRequests > 0 ? ', max=' + maxRequests : '') + '\r\n';
    keepAliveCache.set(key, lines);
  }
  return lines;
}

// ---- Parse errors ------------------------------------------------------------------
const parseMessages = {
  HPE_INVALID_METHOD: 'Invalid method encountered', HPE_INVALID_CONSTANT: 'Expected HTTP/', HPE_INVALID_VERSION: 'Invalid HTTP version',
  HPE_INVALID_URL: 'Invalid URL', HPE_INVALID_HEADER_TOKEN: 'Invalid header token', HPE_HEADER_OVERFLOW: 'Header overflow',
  HPE_INVALID_CONTENT_LENGTH: 'Invalid character in Content-Length', HPE_UNEXPECTED_CONTENT_LENGTH: "Content-Length can't be present with Transfer-Encoding",
  HPE_INVALID_CHUNK_SIZE: 'Invalid character in chunk size', HPE_INVALID_STATUS: 'Invalid status code', HPE_INVALID_TRANSFER_ENCODING: 'Request has invalid \x60Transfer-Encoding\x60',
  HPE_INVALID_EOF_STATE: 'Invalid EOF state', HPE_LF_EXPECTED: 'Missing expected LF after chunk data'
};
// Native parser results -1..-7.
const nativeErrors = [null, 'HPE_INVALID_METHOD', 'HPE_INVALID_URL', 'HPE_INVALID_VERSION', 'HPE_INVALID_HEADER_TOKEN', 'HPE_INVALID_CONTENT_LENGTH', 'HPE_HEADER_OVERFLOW', 'HPE_HEADER_OVERFLOW'];
function parseError(code, data, start, end, message) {
  const error = new Error('Parse Error: ' + (message || parseMessages[code] || code));
  error.code = code;
  error.bytesParsed = 0;
  if (data) { const raw = Buffer.allocUnsafe(end - start); copyBytes(data, start, end, raw, 0); error.rawPacket = raw; }
  return error;
}

// ---- Chunked bodies --------------------------------------------------------------
/**
 * Decodes a chunked body fed in pieces. Partial size and trailer lines are
 * kept as text, so every byte offered is consumed until the message ends.
 * feed() returns the offset after the last byte of the message, -1 when the
 * piece was consumed and more is needed, or -2 on a malformed body.
 */
class ChunkedDecoder {
  constructor(onChunk) { this.onChunk = onChunk; this.state = 0; this.remaining = 0; this.line = ''; this.trailers = []; }
  feed(data, start, end) {
    let i = start;
    while (i < end) {
      if (this.state === 1) {
        const n = Math.min(this.remaining, end - i);
        const chunk = Buffer.allocUnsafe(n);
        copyBytes(data, i, i + n, chunk, 0);
        i += n; this.remaining -= n;
        this.onChunk(chunk);
        if (this.remaining === 0) this.state = 2;
        continue;
      }
      // States 0 (size line), 2 (CRLF after data), 3 (trailer lines): read a line.
      let j = i;
      while (j < end && data[j] !== 10) j++;
      if (j === end) { this.line += latin1(data, i, end); return -1; }
      let line = this.line + latin1(data, i, j);
      this.line = '';
      i = j + 1;
      if (line.length > 0 && line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
      if (this.state === 2) { if (line !== '') return -2; this.state = 0; continue; }
      if (this.state === 0) {
        const size = line.split(';')[0].trim();
        if (!/^[0-9a-fA-F]+$/.test(size)) return -2;
        this.remaining = parseInt(size, 16);
        this.state = this.remaining === 0 ? 3 : 1;
        continue;
      }
      if (line === '') { this.state = 4; return i; }
      const colon = line.indexOf(':');
      if (colon > 0) this.trailers.push(line.slice(0, colon), line.slice(colon + 1).trim());
    }
    return -1;
  }
}

// ---- ServerResponse ----------------------------------------------------------------
export class ServerResponse extends OutgoingMessage {
  constructor(req, options) {
    super();
    this.req = req;
    if (req.method === 'HEAD') this._hasBody = false;
    if (req.httpVersionMajor < 1 || req.httpVersionMinor < 1) {
      this.useChunkedEncodingByDefault = chunkedToken.test(req.headers.te || '');
      this.shouldKeepAlive = false;
    }
  }
  assignSocket(socket) {
    if (socket._httpMessage) throw codedError('ERR_HTTP_SOCKET_ASSIGNED', 'Socket already assigned');
    socket._httpMessage = this;
    this.socket = socket;
    if (hasListener(this, 'socket')) this.emit('socket', socket);
    if (this._output !== null) this._flushOutput();
  }
  detachSocket(socket) { if (socket._httpMessage === this) socket._httpMessage = null; this.socket = null; }
  _raw(text, callback) {
    const out = reserve(text.length);
    return this._writeOut(out, writeString(text, out, 0, true), callback);
  }
  writeContinue(callback) { this._raw('HTTP/1.1 100 Continue\r\n\r\n', callback); this._sent100 = true; }
  writeProcessing(callback) { this._raw('HTTP/1.1 102 Processing\r\n\r\n', callback); }
  writeEarlyHints(hints, callback) {
    let head = 'HTTP/1.1 103 Early Hints\r\n';
    for (const key of Object.keys(hints)) { const value = hints[key]; head += key + ': ' + (Array.isArray(value) ? value.join(', ') : value) + '\r\n'; }
    this._raw(head + '\r\n', callback);
  }
  _implicitHeader() { this.writeHead(this.statusCode); }
  writeHead(statusCode, reason, obj) {
    if (this._header !== null) throw headersSentError('write');
    const original = statusCode;
    statusCode |= 0;
    if (statusCode < 100 || statusCode > 999) throw codedError('ERR_HTTP_INVALID_STATUS_CODE', 'Invalid status code: ' + original, RangeError);
    if (typeof reason === 'string') this.statusMessage = reason;
    else {
      if (!this.statusMessage) this.statusMessage = STATUS_CODES[statusCode] || 'unknown';
      if (obj === undefined || obj === null) obj = reason;
    }
    this.statusCode = statusCode;
    let fields = obj;
    if (this._fields !== null) {
      if (Array.isArray(obj)) {
        if (obj.length % 2 !== 0) throw codedError('ERR_INVALID_ARG_VALUE', "The argument 'headers' is invalid.", TypeError);
        for (let n = 0; n < obj.length; n += 2) this.removeHeader(obj[n]);
        for (let n = 0; n < obj.length; n += 2) if (obj[n]) this.appendHeader(obj[n], obj[n + 1]);
      } else if (obj) for (const key of Object.keys(obj)) if (key) this.setHeader(key, obj[key]);
      fields = this;
    }
    if (checkChars(this.statusMessage, 1) >= 0) throw codedError('ERR_INVALID_CHAR', 'Invalid character in statusMessage', TypeError);
    if (statusCode === 204 || statusCode === 304 || (statusCode >= 100 && statusCode <= 199)) this._hasBody = false;
    if (this._expect_continue && !this._sent100) this.shouldKeepAlive = false;
    this._compose(statusLine(statusCode, this.statusMessage), fields);
    return this;
  }
  writeHeader(statusCode, reason, obj) { return this.writeHead(statusCode, reason, obj); }
  /**
   * end(body) before any head was written, for the common response: no
   * fields that change framing, a string body (or none). Builds the same head
   * _compose would, without validating fields twice, and sends head and body
   * in one write.
   */
  end(chunk, encoding, callback) {
    if (this._header !== null || callback !== undefined || encoding !== undefined || this._special !== 0 || !this.useChunkedEncodingByDefault
      || (chunk !== undefined && chunk !== null && typeof chunk !== 'string') || this.finished || this.destroyed) return super.end(chunk, encoding, callback);
    const code = this.statusCode | 0;
    if (code < 100 || code > 999 || code !== this.statusCode) return super.end(chunk, encoding, callback);
    let message = this.statusMessage;
    if (!message) { message = STATUS_CODES[code] || 'unknown'; this.statusMessage = message; }
    else if (message !== STATUS_CODES[code] && checkChars(message, 1) >= 0) return super.end(chunk, encoding, callback);
    let head = statusLine(code, message);
    const fields = this._fields;
    if (fields !== null) for (let i = 1; i < fields.length; i += 3) head += fieldLines(fields[i], fields[i + 1]);
    if (this.sendDate) head += dateLine();
    if (!this.shouldKeepAlive) { this._last = true; head += 'Connection: close\r\n'; }
    else if (this.maxRequestsOnConnectionReached) head += 'Connection: close\r\n';
    else {
      const server = this._connection === null ? null : this._connection.server;
      if (server !== null && server.keepAliveTimeout && this._defaultKeepAlive) head += keepAliveLines(server.keepAliveTimeout, server.maxRequestsPerSocket);
      else head += 'Connection: keep-alive\r\n';
    }
    const hasBody = this._hasBody && code !== 204 && code !== 304 && (code < 100 || code > 199);
    if (!hasBody) this._hasBody = false;
    const body = hasBody && chunk ? chunk : '';
    // A large body that was just sent is likely sent again (a cached page):
    // its bytes are kept and copied instead of encoded twice per response.
    const cached = body.length >= 2048 && body === lastBody;
    const length = body === '' ? 0 : cached ? lastBytes.length : writeString(body, undefined, 0, false);
    this._contentLength = chunk ? (typeof chunk === 'string' ? (length || writeString(chunk, undefined, 0, false)) : chunk.length) : 0;
    if (hasBody) head += 'Content-Length: ' + this._contentLength + '\r\n\r\n'; else head += '\r\n';
    this._header = head;
    this.finished = true;
    const out = reserve(head.length + length);
    let size = writeString(head, out, 0, true);
    this._headerSent = true;
    if (cached) { copyBytes(lastBytes, 0, length, out, size); size += length; }
    else if (length > 0) {
      const written = writeString(body, out, size, false);
      if (body.length >= 2048) { lastBody = body; lastBytes = new Uint8Array(written); copyBytes(out, size, size + written, lastBytes, 0); }
      size += written;
    }
    this._writeOut(out, size, this);
    return this;
  }
  _afterFinish() { if (this._connection !== null) this._connection.finished(this); }
}
defaults(ServerResponse.prototype, { statusCode: 200, statusMessage: undefined, sendDate: true, _sent100: false, _expect_continue: false, req: null });

// ---- Server --------------------------------------------------------------------------
export class Server extends net.Server {
  constructor(options, requestListener) {
    if (typeof options === 'function') { requestListener = options; options = {}; }
    else if (options === undefined || options === null) options = {};
    else if (typeof options !== 'object') throw invalidArgType('options', 'of type object', options);
    super({ allowHalfOpen: true, noDelay: options.noDelay === undefined ? true : options.noDelay });
    this._IncomingMessage = options.IncomingMessage || IncomingMessage;
    this._ServerResponse = options.ServerResponse || ServerResponse;
    this.maxHeaderSize = options.maxHeaderSize;
    this.requireHostHeader = options.requireHostHeader === undefined ? true : !!options.requireHostHeader;
    this.joinDuplicateHeaders = !!options.joinDuplicateHeaders;
    this.httpAllowHalfOpen = false;
    this.timeout = 0;
    this.maxHeadersCount = null;
    this.maxRequestsPerSocket = 0;
    this.headersTimeout = options.headersTimeout === undefined ? 60000 : options.headersTimeout;
    this.requestTimeout = options.requestTimeout === undefined ? 300000 : options.requestTimeout;
    this.keepAliveTimeout = options.keepAliveTimeout === undefined ? 5000 : options.keepAliveTimeout;
    this.keepAliveTimeoutBuffer = 1000;
    if (requestListener) this.on('request', requestListener);
  }
  _onConnection(socket) {
    new ServerConnection(this, socket);
    if (hasListener(this, 'connection')) this.emit('connection', socket);
  }
  setTimeout(msecs, callback) { this.timeout = msecs; if (callback) this.on('timeout', callback); return this; }
  close(callback) { this.closeIdleConnections(); return super.close(callback); }
  closeAllConnections() { for (const socket of this._connections.values()) socket.destroy(); }
  closeIdleConnections() {
    for (const socket of this._connections.values()) {
      const connection = socket._httpConnection;
      if (connection && connection.incoming.length === 0 && !socket._httpMessage) socket.destroy();
    }
  }
}
export function createServer(options, requestListener) { return new Server(options, requestListener); }

const badRequest = 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n';
const fieldsTooLarge = 'HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n';
/**
 * One accepted connection. The socket hands it every read directly
 * (socket._consumer); bytes that do not complete a head stay in pending.
 * Requests are answered in order: a response that is not first waits in
 * waiting with its output buffered until the socket is its turn.
 */
class ServerConnection {
  constructor(server, socket) {
    this.server = server;
    this.socket = socket;
    this.pending = null;
    this.pendingLength = 0;
    this.incoming = [];
    this.waiting = [];
    this.body = null;
    this.bodyRemaining = 0;
    this.decoder = null;
    this.keepAliveSet = false;
    this.stopped = false;
    socket._consumer = this;
    socket._httpConnection = this;
    socket._httpMessage = null;
    socket.on('error', onServerSocketError);
    socket.on('close', onServerSocketClose);
    socket.on('timeout', onServerSocketTimeout);
    if (server.timeout) socket.setTimeout(server.timeout);
  }
  onData(bytes, n) {
    let data = bytes, end = n, start = 0;
    if (this.pendingLength > 0) {
      const total = this.pendingLength + n;
      if (this.pending.length < total) { const grown = new Uint8Array(Math.max(total, 2 * this.pending.length)); copyBytes(this.pending, 0, this.pendingLength, grown, 0); this.pending = grown; }
      copyBytes(bytes, 0, n, this.pending, this.pendingLength);
      data = this.pending; end = total; this.pendingLength = 0;
    }
    while (start < end && !this.stopped) {
      if (this.body !== null) {
        const next = this.decoder !== null ? this.chunkedBody(data, start, end) : this.fixedBody(data, start, end);
        if (next < 0) { start = end; break; }
        start = next;
        continue;
      }
      const result = parseHead(data, start, end, OUT);
      if (result === 0) {
        if (end - start > (this.server.maxHeaderSize || maxHeaderSize)) { this.fail(parseError('HPE_HEADER_OVERFLOW', data, start, end)); return; }
        break;
      }
      if (result < 0) { this.fail(parseError(nativeErrors[-result], data, start, end)); return; }
      if (result - OUT[10] > (this.server.maxHeaderSize || maxHeaderSize)) { this.fail(parseError('HPE_HEADER_OVERFLOW', data, start, end)); return; }
      if (!this.request(data, start, result, end)) return;
      start = result;
    }
    if (start < end && !this.stopped) {
      const rest = end - start;
      if (data === this.pending) copyBytes(data, start, end, data, 0);
      else { if (this.pending === null || this.pending.length < rest) this.pending = new Uint8Array(Math.max(rest, 4096)); copyBytes(data, start, end, this.pending, 0); }
      this.pendingLength = rest;
    }
  }
  /** A complete head in data[start, headEnd): creates the request and its response. Returns false to stop reading. */
  request(data, start, headEnd, end) {
    const server = this.server, socket = this.socket;
    const method = methodByHash.get(OUT[9]);
    if (method === undefined || method.length !== OUT[1] - OUT[0]) { this.fail(parseError('HPE_INVALID_METHOD', data, start, end)); return false; }
    const major = OUT[4], minor = OUT[5], flags = OUT[7];
    if (major !== 1 || minor > 1) { if (major !== 0 || minor !== 9) { this.fail(parseError('HPE_INVALID_VERSION', data, start, end)); return false; } }
    const req = new server._IncomingMessage(socket);
    req.method = method;
    req.url = latin1(data, OUT[2], OUT[3]);
    if (major !== 1 || minor !== 1) { req.httpVersionMajor = major; req.httpVersionMinor = minor; req.httpVersion = major + '.' + minor; }
    const lineStart = OUT[10], head = new Uint8Array(headEnd - lineStart);
    copyBytes(data, lineStart, headEnd, head, 0);
    req._head = head;
    if (server.joinDuplicateHeaders) req.joinDuplicateHeaders = true;
    // Body framing.
    let chunked = false, length = OUT[8];
    if (flags & F_TE) {
      if (flags & F_CL) { this.fail(parseError('HPE_UNEXPECTED_CONTENT_LENGTH', data, start, end)); return false; }
      if (flags & F_CHUNKED) chunked = true;
      else if (/(?:^|,)\s*chunked\s*$/i.test(req.headers['transfer-encoding'])) chunked = true;
      else { this.fail(parseError('HPE_INVALID_TRANSFER_ENCODING', data, start, end)); return false; }
    }
    if (length === -2) length = Number(req.headers['content-length']);
    let keepAlive, upgrade = method === 'CONNECT';
    if (flags & F_OTHER_CONNECTION) {
      const connection = req.headersDistinct.connection.join(',');
      keepAlive = major === 1 && minor === 1 ? !closeToken.test(connection) : keepAliveToken.test(connection);
      if ((flags & F_UPGRADE) && upgradeToken.test(connection)) upgrade = true;
    } else {
      keepAlive = major === 1 && minor === 1 ? (flags & F_CLOSE) === 0 : (flags & F_KEEPALIVE) !== 0;
      if ((flags & F_UPGRADE) && (flags & F_UPGRADE_TOKEN)) upgrade = true;
    }
    if (upgrade) {
      const event = method === 'CONNECT' ? 'connect' : 'upgrade';
      if (hasListener(server, event)) {
        // The rest of the input belongs to the new protocol.
        this.stopped = true;
        req.upgrade = true;
        socket._consumer = null;
        socket.removeListener('error', onServerSocketError);
        socket.removeListener('close', onServerSocketClose);
        socket.removeListener('timeout', onServerSocketTimeout);
        server._connections.delete(socket);
        socket.server = null;
        const rest = Buffer.allocUnsafe(end - headEnd);
        copyBytes(data, headEnd, end, rest, 0);
        req.complete = true;
        server.emit(event, req, socket, rest);
        return false;
      }
    }
    if (this.keepAliveSet) { socket.setTimeout(server.timeout || 0); this.keepAliveSet = false; }
    this.incoming.push(req);
    const res = new server._ServerResponse(req);
    res._connection = this;
    if (!keepAlive) res.shouldKeepAlive = false;
    res.socket = socket;
    if (socket._httpMessage === null) socket._httpMessage = res; else this.waiting.push(res);
    if (chunked) { this.body = req; this.decoder = new ChunkedDecoder(chunk => this.deliver(chunk)); }
    else if (length > 0) { this.body = req; this.decoder = null; this.bodyRemaining = length; }
    else { req.complete = true; req.push(null); }
    if (major === 1 && minor === 1) {
      if (server.requireHostHeader && (flags & F_HOST) === 0) { res.writeHead(400, ['Connection', 'close']); res.end(); return true; }
      if (server.maxRequestsPerSocket > 0) {
        this.requests = (this.requests || 0) + 1;
        res.maxRequestsOnConnectionReached = server.maxRequestsPerSocket <= this.requests;
        if (server.maxRequestsPerSocket < this.requests) { server.emit('dropRequest', req, socket); res.writeHead(503); res.end(); return true; }
      }
      if (flags & F_EXPECT) {
        if (continueToken.test(req.headers.expect)) {
          res._expect_continue = true;
          if (hasListener(server, 'checkContinue')) server.emit('checkContinue', req, res);
          else { res.writeContinue(); server.emit('request', req, res); }
        } else if (hasListener(server, 'checkExpectation')) server.emit('checkExpectation', req, res);
        else { res.writeHead(417); res.end(); }
        return true;
      }
    }
    server.emit('request', req, res);
    return true;
  }
  deliver(chunk) {
    const req = this.body;
    if (!req._destroyed && req.push(chunk) === false && !this.socket.isPaused()) { req._socketPaused = true; this.socket.pause(); }
  }
  fixedBody(data, start, end) {
    const n = Math.min(this.bodyRemaining, end - start);
    const chunk = Buffer.allocUnsafe(n);
    copyBytes(data, start, start + n, chunk, 0);
    this.bodyRemaining -= n;
    this.deliver(chunk);
    if (this.bodyRemaining === 0) { const req = this.body; this.body = null; req.complete = true; req.push(null); }
    return start + n;
  }
  chunkedBody(data, start, end) {
    const result = this.decoder.feed(data, start, end);
    if (result === -2) { this.fail(parseError('HPE_INVALID_CHUNK_SIZE', data, start, end)); return -1; }
    if (result === -1) return -1;
    const req = this.body;
    req.rawTrailers = this.decoder.trailers;
    this.body = null; this.decoder = null;
    req.complete = true;
    req.push(null);
    return result;
  }
  onEnd() {
    if (this.stopped) return;
    if (this.pendingLength > 0 || this.body !== null) { this.fail(parseError('HPE_INVALID_EOF_STATE')); return; }
    const server = this.server, socket = this.socket;
    if (!server.httpAllowHalfOpen) {
      while (this.incoming.length > 0) this.incoming.shift().destroy();
      if (socket.writable) socket.end();
    } else if (this.waiting.length > 0) this.waiting[this.waiting.length - 1]._last = true;
    else if (socket._httpMessage) socket._httpMessage._last = true;
    else if (socket.writable) socket.end();
  }
  fail(error) {
    this.stopped = true;
    const socket = this.socket;
    if (!this.server.emit('clientError', error, socket)) {
      if (socket.writable && socket.bytesWritten === 0 && error.code.startsWith('HPE_')) socket.write(error.code === 'HPE_HEADER_OVERFLOW' ? fieldsTooLarge : badRequest);
      socket.destroy();
    }
  }
  /** The response has handed all its bytes to the socket. */
  finished(res) {
    const req = res.req, socket = this.socket, server = this.server;
    if (this.incoming[0] === req) this.incoming.shift();
    else { const index = this.incoming.indexOf(req); if (index >= 0) this.incoming.splice(index, 1); }
    if (!req._consuming) req._dump();
    if (socket._httpMessage === res) socket._httpMessage = null;
    res.socket = null;
    if (hasListener(res, 'close')) later(res, 1); else res._closed = true;
    if (res._last) socket.destroySoon();
    else if (this.waiting.length > 0) { const next = this.waiting.shift(); next.socket = socket; socket._httpMessage = next; if (next._output !== null) next._flushOutput(); }
    else if (server.keepAliveTimeout) { socket.setTimeout(server.keepAliveTimeout + server.keepAliveTimeoutBuffer); this.keepAliveSet = true; }
  }
}
function onServerSocketError(error) {
  const connection = this._httpConnection;
  if (connection.stopped) return;
  connection.stopped = true;
  if (!connection.server.emit('clientError', error, this)) this.destroy();
}
function onServerSocketClose() {
  const connection = this._httpConnection;
  while (connection.incoming.length > 0) {
    const req = connection.incoming.shift();
    if (!req.complete) req.destroy(codedError('ECONNRESET', 'aborted'));
    else if (!req._destroyed) req.destroy();
  }
  const active = this._httpMessage;
  if (active) { active.destroyed = true; active._closed = true; active.emit('close'); }
  while (connection.waiting.length > 0) { const res = connection.waiting.shift(); res.destroyed = true; res._closed = true; res.emit('close'); }
}
function onServerSocketTimeout() {
  const connection = this._httpConnection, server = connection.server;
  const req = connection.body;
  const reqTimeout = req !== null && !req.complete && req.emit('timeout', this);
  const res = this._httpMessage;
  const resTimeout = res && res.emit('timeout', this);
  const serverTimeout = server.emit('timeout', this);
  if (!reqTimeout && !resTimeout && !serverTimeout) this.destroy();
}

// ---- Agent --------------------------------------------------------------------------
/**
 * Connection pool of the client: per host:port, sockets in use, free
 * keep-alive sockets (unreferenced, closed after the idle timeout) and
 * requests waiting for a socket when maxSockets is reached.
 */
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
  }
  static get defaultMaxSockets() { return Infinity; }
  createConnection(options, callback) { const socket = net.createConnection(options); if (callback) socket.once('connect', () => callback(null, socket)); return socket; }
  getName(options) {
    options = options || {};
    let name = (options.host || 'localhost') + ':';
    if (options.port) name += options.port;
    name += ':';
    if (options.localAddress) name += options.localAddress;
    if (options.family === 4 || options.family === 6) name += ':' + options.family;
    return name;
  }
  addRequest(req, options) {
    options = Object.assign({ __proto__: null }, options, this.options);
    const name = this.getName(options);
    const free = this.freeSockets[name];
    let socket;
    while (free !== undefined && free.length > 0) {
      const candidate = this.scheduling === 'fifo' ? free.shift() : free.pop();
      if (free.length === 0) delete this.freeSockets[name];
      if (!candidate.destroyed) { socket = candidate; break; }
    }
    if (socket !== undefined) {
      this.reuseSocket(socket, req);
      list(this.sockets, name).push(socket);
      assignSocket(this, req, socket);
    } else if ((this.sockets[name] === undefined || this.sockets[name].length < this.maxSockets) && this.totalSocketCount < this.maxTotalSockets) {
      assignSocket(this, req, this.createSocket(req, options));
    } else list(this.requests, name).push(req);
  }
  createSocket(req, options) {
    options = Object.assign({ __proto__: null }, options, this.options);
    const name = this.getName(options);
    options._agentKey = name;
    const socket = this.createConnection(options);
    this.totalSocketCount++;
    list(this.sockets, name).push(socket);
    socket._agent = this;
    socket._agentName = name;
    socket._agentOptions = options;
    socket.on('close', onAgentSocketClose);
    socket.on('timeout', onAgentSocketTimeout);
    return socket;
  }
  /** The response on socket is complete and its request finished. */
  _release(socket) {
    const name = socket._agentName;
    this.emit('free', socket, socket._agentOptions);
    if (!socket.writable || socket.destroyed) { socket.destroy(); return; }
    const waiting = this.requests[name];
    if (waiting !== undefined && waiting.length > 0) {
      const req = waiting.shift();
      if (waiting.length === 0) delete this.requests[name];
      assignSocket(this, req, socket);
      return;
    }
    const req = socket._httpMessage;
    socket._httpMessage = null;
    if (!req || !req.shouldKeepAlive || !this.keepAlive) { socket.destroy(); return; }
    const free = this.freeSockets[name] || [];
    if (this.totalSocketCount > this.maxTotalSockets || free.length >= this.maxFreeSockets || !this.keepSocketAlive(socket)) { socket.destroy(); return; }
    this.freeSockets[name] = free;
    removeFrom(this.sockets, name, socket);
    free.push(socket);
    socket.once('error', freeSocketError);
  }
  removeSocket(socket) {
    const name = socket._agentName;
    if (removeFrom(this.sockets, name, socket) | removeFrom(this.freeSockets, name, socket)) this.totalSocketCount--;
    const waiting = this.requests[name];
    if (waiting !== undefined && waiting.length > 0 && (this.sockets[name] === undefined || this.sockets[name].length < this.maxSockets)) {
      const req = waiting.shift();
      if (waiting.length === 0) delete this.requests[name];
      assignSocket(this, req, this.createSocket(req, socket._agentOptions));
    }
  }
  keepSocketAlive(socket) {
    socket.setKeepAlive(true, this.keepAliveMsecs);
    socket.unref();
    let timeout = this.options.timeout;
    if (socket._keepAliveHint !== undefined) timeout = timeout === undefined ? socket._keepAliveHint : Math.min(timeout, socket._keepAliveHint);
    if (timeout !== undefined) socket.setTimeout(timeout);
    return true;
  }
  reuseSocket(socket, req) { socket.removeListener('error', freeSocketError); req.reusedSocket = true; socket.ref(); }
  destroy() {
    for (const table of [this.freeSockets, this.sockets]) for (const name of Object.keys(table)) for (const socket of table[name].slice()) socket.destroy();
  }
}
function list(table, name) { return table[name] || (table[name] = []); }
function removeFrom(table, name, socket) {
  const sockets = table[name];
  if (sockets === undefined) return false;
  const index = sockets.indexOf(socket);
  if (index < 0) return false;
  sockets.splice(index, 1);
  if (sockets.length === 0) delete table[name];
  return true;
}
function freeSocketError() {}
function onAgentSocketClose() { this._agent.removeSocket(this); }
function onAgentSocketTimeout() {
  const agent = this._agent, free = agent.freeSockets[this._agentName];
  if (free !== undefined && free.indexOf(this) >= 0) { this.destroy(); agent.emit('timeout'); }
}
function assignSocket(agent, req, socket) {
  req.onSocket(socket);
  const agentTimeout = agent.options.timeout || 0;
  if (req.timeout !== undefined && req.timeout !== agentTimeout) socket.setTimeout(req.timeout);
}
export let globalAgent = new Agent({ keepAlive: true, scheduling: 'lifo', timeout: 5000 });

// ---- ClientRequest -----------------------------------------------------------------
function parseUrl(input) {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/(?:([^@\/?#]*)@)?(\[[^\]]*\]|[^:\/?#]*)(?::(\d*))?([^?#]*)(\?[^#]*)?/.exec(input);
  if (match === null) throw codedError('ERR_INVALID_URL', 'Invalid URL', TypeError);
  return { protocol: match[1].toLowerCase(), auth: match[2] === undefined ? undefined : decodeURIComponent(match[2]), hostname: match[3].toLowerCase(),
    port: match[4] === undefined ? '' : match[4], pathname: match[5] || '/', search: match[6] || '' };
}
function urlOptions(url) {
  const hostname = typeof url.hostname === 'string' && url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const options = { protocol: url.protocol, hostname, hash: url.hash, search: url.search, pathname: url.pathname, path: (url.pathname || '') + (url.search || ''), href: url.href };
  if (url.port !== '' && url.port !== undefined) options.port = Number(url.port);
  if (url.username || url.password) options.auth = decodeURIComponent(url.username) + ':' + decodeURIComponent(url.password);
  else if (url.auth) options.auth = url.auth;
  return options;
}
function checkHost(host, name) {
  if (host !== null && host !== undefined && typeof host !== 'string') throw invalidArgType('options.' + name, 'of type string or one of undefined or null', host);
  return host;
}
function hangUp(message) { return codedError('ECONNRESET', message); }
export class ClientRequest extends OutgoingMessage {
  constructor(input, options, callback) {
    super();
    if (typeof input === 'string') input = urlOptions(parseUrl(input));
    else if (input !== null && typeof input === 'object' && typeof input.href === 'string' && typeof input.hostname === 'string') input = urlOptions(input);
    else { callback = options; options = input; input = null; }
    if (typeof options === 'function') { callback = options; options = input || {}; }
    else options = Object.assign({}, input, options);
    const defaultAgent = options._defaultAgent || globalAgent;
    let agent = options.agent;
    if (agent === false) agent = new defaultAgent.constructor();
    else if (agent === null || agent === undefined) { if (typeof options.createConnection !== 'function') agent = defaultAgent; }
    else if (typeof agent.addRequest !== 'function') throw invalidArgType('options.agent', 'of type Agent-like Object, undefined, or false', agent);
    this.agent = agent;
    const protocol = options.protocol || defaultAgent.protocol;
    const expected = agent && agent.protocol ? agent.protocol : defaultAgent.protocol;
    if (protocol !== expected) throw codedError('ERR_INVALID_PROTOCOL', 'Protocol "' + protocol + '" not supported. Expected "' + expected + '"', TypeError);
    const defaultPort = options.defaultPort || (agent && agent.defaultPort) || 80;
    const port = options.port = options.port || defaultPort;
    const host = options.host = checkHost(options.hostname, 'hostname') || checkHost(options.host, 'host') || 'localhost';
    if (options.timeout !== undefined) {
      if (typeof options.timeout !== 'number') throw invalidArgType('timeout', 'of type number', options.timeout);
      this.timeout = options.timeout;
    }
    const method = options.method;
    if (method !== null && method !== undefined && typeof method !== 'string') throw invalidArgType('options.method', 'of type string', method);
    if (method) {
      if (!isToken(method)) throw codedError('ERR_INVALID_HTTP_TOKEN', 'Method must be a valid HTTP token ["' + method + '"]', TypeError);
      this.method = method.toUpperCase();
    } else this.method = 'GET';
    this.path = options.path || '/';
    if (checkChars(this.path, 2) >= 0) throw codedError('ERR_UNESCAPED_CHARACTERS', 'Request path contains unescaped characters', TypeError);
    if (callback) this.once('response', callback);
    const m = this.method;
    this.useChunkedEncodingByDefault = !(m === 'GET' || m === 'HEAD' || m === 'DELETE' || m === 'OPTIONS' || m === 'TRACE' || m === 'CONNECT');
    this.res = null;
    this.aborted = false;
    this.reusedSocket = false;
    this.upgradeOrConnect = false;
    this.maxHeadersCount = null;
    this.host = host;
    this.protocol = protocol;
    this.joinDuplicateHeaders = !!options.joinDuplicateHeaders;
    this._responseEnded = false;
    this._errorEmitted = false;
    this._released = false;
    this._requestDone = false;
    if (agent) {
      if (!agent.keepAlive && !Number.isFinite(agent.maxSockets)) { this._last = true; this.shouldKeepAlive = false; }
      else { this._last = false; this.shouldKeepAlive = true; }
    }
    if (!Array.isArray(options.headers)) {
      if (options.headers) for (const key of Object.keys(options.headers)) this.setHeader(key, options.headers[key]);
      if (host && !this.getHeader('host') && (options.setHost === undefined || options.setHost)) {
        let field = host;
        const colon = field.indexOf(':');
        if (colon !== -1 && field.includes(':', colon + 1) && field.charCodeAt(0) !== 91) field = '[' + field + ']';
        if (port && +port !== defaultPort) field += ':' + port;
        this.setHeader('Host', field);
      }
      if (options.auth && !this.getHeader('Authorization')) this.setHeader('Authorization', 'Basic ' + Buffer.from(options.auth).toString('base64'));
      if (this.getHeader('expect')) this._implicitHeader();
    } else this._compose(this.method + ' ' + this.path + ' HTTP/1.1\r\n', options.headers);
    const connectOptions = Object.assign({}, options);
    delete connectOptions.signal;
    if (agent) agent.addRequest(this, connectOptions);
    else {
      this._last = true;
      this.shouldKeepAlive = false;
      this.onSocket(typeof options.createConnection === 'function' ? options.createConnection(connectOptions) : net.createConnection(connectOptions));
    }
    if (options.signal) {
      const signal = options.signal, abort = () => this.destroy(codedError('ABORT_ERR', 'The operation was aborted'));
      if (signal.aborted) abort(); else if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', abort, { once: true });
    }
  }
  _implicitHeader() {
    if (this._header !== null) throw headersSentError('render');
    this._compose(this.method + ' ' + this.path + ' HTTP/1.1\r\n', this);
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
    else queueMicrotask(() => {
      this._error(error || (this.res ? null : hangUp('socket hang up')));
      this._closed = true;
      this.emit('close');
    });
    return this;
  }
  _error(error) {
    if (error === null || this._errorEmitted) return;
    this._errorEmitted = true;
    this.emit('error', error);
  }
  onSocket(socket) { queueMicrotask(() => this._useSocket(socket)); }
  _useSocket(socket) {
    if (this.destroyed) {
      if (this.agent) this.agent._release(socket); else socket.destroy();
      if (!this._closed) { this._error(this._destroyError || null); this._closed = true; this.emit('close'); }
      return;
    }
    this.socket = socket;
    socket._httpMessage = this;
    socket._consumer = new ResponseReader(this, socket);
    socket.on('error', onClientSocketError);
    socket.on('close', onClientSocketClose);
    if (this.timeout !== undefined) socket.on('timeout', onClientSocketTimeout);
    this.emit('socket', socket);
    if (socket.connecting) socket.once('connect', () => this._flushWhenReady());
    else this._flushWhenReady();
  }
  _flushWhenReady() {
    const socket = this.socket;
    if (socket === null || socket._httpMessage !== this || socket.destroyed) return;
    if (this._output !== null) this._flushOutput();
  }
  _afterFinish() { this._requestDone = true; if (this._responseEnded) this._release(); }
  /** Response complete and request finished: the socket goes back to the agent (or closes). */
  _release() {
    if (this._released) return;
    this._released = true;
    const socket = this.socket;
    socket.removeListener('error', onClientSocketError);
    socket.removeListener('close', onClientSocketClose);
    socket.removeListener('timeout', onClientSocketTimeout);
    socket._consumer = null;
    if (this.timeout !== undefined) socket.setTimeout(0);
    if (this.res) this.res.socket = null;
    queueMicrotask(() => {
      this._closed = true;
      this.emit('close');
      if (this.agent) this.agent._release(socket); else socket.destroy();
    });
  }
  setTimeout(msecs, callback) {
    if (callback) this.once('timeout', callback);
    this.timeout = msecs;
    const socket = this.socket;
    if (socket) { socket.setTimeout(msecs); socket.removeListener('timeout', onClientSocketTimeout); socket.on('timeout', onClientSocketTimeout); }
    else this.once('socket', socket => socket.setTimeout(msecs));
    return this;
  }
  setNoDelay(noDelay) { if (this.socket) this.socket.setNoDelay(noDelay); else this.once('socket', socket => socket.setNoDelay(noDelay)); }
  setSocketKeepAlive(enable, delay) { if (this.socket) this.socket.setKeepAlive(enable, delay); else this.once('socket', socket => socket.setKeepAlive(enable, delay)); }
  clearTimeout(callback) { this.setTimeout(0, callback); }
}
function onClientSocketError(error) {
  const req = this._httpMessage;
  if (!req) return;
  this._hadError = true;
  req._error(error);
}
function onClientSocketClose() {
  const req = this._httpMessage;
  if (!req || req.socket !== this) return;
  req.destroyed = true;
  const res = req.res;
  if (res) {
    if (!res.complete) res.destroy(hangUp('aborted'));
    req._closed = true;
    req.emit('close');
    if (!res.aborted && res.readable) res.push(null);
  } else {
    if (!this._hadError) { this._hadError = true; req._error(hangUp('socket hang up')); }
    req._closed = true;
    req.emit('close');
  }
}
function onClientSocketTimeout() {
  const req = this._httpMessage;
  if (!req) return;
  if (req.res) req.res.emit('timeout');
  req.emit('timeout');
}
/**
 * Reads responses for a ClientRequest from its socket: the head is
 * collected as latin1 text, the body is copied out of the read buffer.
 */
class ResponseReader {
  constructor(req, socket) {
    this.req = req;
    this.socket = socket;
    this.text = '';
    this.res = null;
    this.mode = 0;          // 0 head, 1 fixed length, 2 chunked, 3 until EOF, 4 done
    this.remaining = 0;
    this.decoder = null;
  }
  onData(data, n) {
    let start = 0;
    while (start < n && this.mode !== 4) {
      if (this.mode === 0) {
        const before = this.text.length;
        this.text += latin1(data, start, n);
        const end = this.text.indexOf('\r\n\r\n');
        if (end < 0) {
          if (this.text.length > maxHeaderSize) { this.fail(parseError('HPE_HEADER_OVERFLOW', data, start, n)); return; }
          return;
        }
        const consumed = end + 4 - before;
        const head = this.text.slice(0, end);
        this.text = '';
        start += consumed;
        const next = this.head(head, data, start, n);
        if (next === -1) return;
        if (next === -2) continue;   // informational response: read the next head
      } else if (this.mode === 1) {
        const take = Math.min(this.remaining, n - start);
        const chunk = Buffer.allocUnsafe(take);
        copyBytes(data, start, start + take, chunk, 0);
        start += take;
        this.remaining -= take;
        this.deliver(chunk);
        if (this.remaining === 0) this.complete([]);
      } else if (this.mode === 2) {
        const result = this.decoder.feed(data, start, n);
        if (result === -2) { this.fail(parseError('HPE_INVALID_CHUNK_SIZE', data, start, n)); return; }
        if (result === -1) return;
        start = result;
        this.complete(this.decoder.trailers);
      } else {
        const chunk = Buffer.allocUnsafe(n - start);
        copyBytes(data, start, n, chunk, 0);
        start = n;
        this.deliver(chunk);
      }
    }
  }
  deliver(chunk) {
    const res = this.res;
    if (!res._destroyed && res.push(chunk) === false && !this.socket.isPaused()) { res._socketPaused = true; this.socket.pause(); }
  }
  /** Parses a response head; returns -1 to stop, -2 after an informational response, else 0. */
  head(text, data, bodyStart, end) {
    const req = this.req;
    const lines = text.split('\r\n');
    const status = /^HTTP\/(\d)\.(\d) (\d{3})(?: (.*))?$/.exec(lines[0]);
    if (status === null) {
      if (/^HTTP\/\d\.\d /.test(lines[0])) this.fail(parseError('HPE_INVALID_STATUS'));
      else this.fail(parseError('HPE_INVALID_CONSTANT', null, 0, 0, 'Expected HTTP/, RTSP/ or ICE/'));
      return -1;
    }
    const raw = [];
    let length = null, chunked = false, encoding = false, connection = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i], colon = line.indexOf(':');
      if (colon <= 0 || !isToken(line.slice(0, colon))) { this.fail(parseError('HPE_INVALID_HEADER_TOKEN')); return -1; }
      const name = line.slice(0, colon), value = line.slice(colon + 1).replace(/^[ \t]+|[ \t]+$/g, '');
      raw.push(name, value);
      const key = lowerName(name);
      if (key === 'content-length') {
        if (!/^\d+$/.test(value) || (length !== null && length !== Number(value))) { this.fail(parseError('HPE_INVALID_CONTENT_LENGTH')); return -1; }
        length = Number(value);
      } else if (key === 'transfer-encoding') { encoding = true; chunked = /(?:^|,)\s*chunked\s*$/i.test(value); }
      else if (key === 'connection') connection += (connection ? ',' : '') + value;
    }
    const major = Number(status[1]), minor = Number(status[2]), code = Number(status[3]);
    const res = new IncomingMessage(this.socket);
    res.httpVersionMajor = major; res.httpVersionMinor = minor; res.httpVersion = major + '.' + minor;
    res.statusCode = code; res.statusMessage = status[4] === undefined ? '' : status[4];
    res._raw = raw;
    res.joinDuplicateHeaders = req.joinDuplicateHeaders;
    if (code >= 100 && code < 200 && code !== 101) {
      if (code === 100) req.emit('continue');
      req.emit('information', { statusCode: code, statusMessage: res.statusMessage, httpVersion: res.httpVersion, httpVersionMajor: major,
        httpVersionMinor: minor, headers: res.headers, rawHeaders: raw });
      return -2;
    }
    if (code === 101 || (req.method === 'CONNECT' && code >= 200 && code < 300)) {
      this.mode = 4;
      req.res = res; res.req = req; req.upgradeOrConnect = true;
      const socket = this.socket, event = req.method === 'CONNECT' ? 'connect' : 'upgrade';
      socket._consumer = null;
      socket.removeListener('error', onClientSocketError);
      socket.removeListener('close', onClientSocketClose);
      socket.removeListener('timeout', onClientSocketTimeout);
      socket._httpMessage = null;
      const head = Buffer.allocUnsafe(end - bodyStart);
      copyBytes(data, bodyStart, end, head, 0);
      if (hasListener(req, event)) {
        if (socket._agent) { removeFrom(socket._agent.sockets, socket._agentName, socket) && socket._agent.totalSocketCount--; socket.removeListener('close', onAgentSocketClose); socket.removeListener('timeout', onAgentSocketTimeout); }
        req.emit(event, res, socket, head);
        req.destroyed = true; req._closed = true; req.emit('close');
      } else socket.destroy();
      return -1;
    }
    const http11 = major === 1 && minor === 1;
    let keepAlive = http11 ? !closeToken.test(connection) : keepAliveToken.test(connection);
    const noBody = req.method === 'HEAD' || code === 204 || code === 304;
    if (noBody) this.mode = 4;
    else if (chunked) { this.mode = 2; this.decoder = new ChunkedDecoder(chunk => this.deliver(chunk)); }
    else if (length !== null) { this.mode = length === 0 ? 4 : 1; this.remaining = length; }
    else { this.mode = 3; keepAlive = false; }
    this.res = res;
    req.res = res;
    res.req = req;
    if (req.shouldKeepAlive && !keepAlive) req.shouldKeepAlive = false;
    const hint = res.headers['keep-alive'];
    if (typeof hint === 'string') { const match = /timeout=(\d+)/.exec(hint); if (match) this.socket._keepAliveHint = Math.max(0, Number(match[1]) * 1000 - 1000); }
    res.on('end', onResponseEnd);
    if (req.aborted || !req.emit('response', res)) res._dump();
    if (this.mode === 4) this.complete([]);
    return 0;
  }
  complete(trailers) {
    this.mode = 4;
    const res = this.res;
    res.rawTrailers = trailers;
    res.complete = true;
    res.push(null);
  }
  onEnd() {
    const req = this.req;
    if (this.mode === 3) { this.complete([]); this.socket.destroy(); return; }
    if (!req.res && !this.socket._hadError) { this.socket._hadError = true; req._error(hangUp('socket hang up')); }
    if (req.res && !req.res.complete) req.res.destroy(hangUp('aborted'));
    this.socket.destroy();
  }
  fail(error) {
    this.mode = 4;
    const socket = this.socket;
    socket._consumer = null;
    socket.destroy();
    socket._hadError = true;
    this.req._error(error);
  }
}
function onResponseEnd() {
  const req = this.req, socket = req.socket;
  req._responseEnded = true;
  if (!req.shouldKeepAlive) { if (socket && socket.writable) socket.destroySoon(); }
  else if (req._requestDone) req._release();
}

export function request(url, options, callback) { return new ClientRequest(url, options, callback); }
export function get(url, options, callback) { const req = request(url, options, callback); req.end(); return req; }
export function setMaxIdleHTTPParsers(max) {}
export default {
  METHODS, STATUS_CODES, Agent, ClientRequest, IncomingMessage, OutgoingMessage, Server, ServerResponse, createServer, validateHeaderName,
  validateHeaderValue, get, request, setMaxIdleHTTPParsers, maxHeaderSize,
  get globalAgent() { return globalAgent; }, set globalAgent(value) { globalAgent = value; }
};
`;
