/**
 * Source of the built-in `node:net` (alias `nona:net`) module: non-blocking
 * TCP sockets and servers. As in node:fs, a small platform layer (Linux system
 * calls, Winsock through nona:ffi) sits under a shared JavaScript
 * implementation. Socket readiness is waited for by the host event loop: the
 * module registers a poller with it (poll on Linux, WSAPoll on Windows).
 *
 * Platform layer contract (`sys`): every call returns a non-negative result or
 * a negative Linux errno (Windows errors are translated), so the shared code
 * has one error table.
 */
const common=String.raw`
import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { Readable, defaults } from 'nona:internal/stream';
import { copy as copyBytes } from 'nona:internal/native';
const READ = 1, WRITE = 2, ERROR = 4, HANGUP = 8;
const EAGAIN = -11, EINTR = -4, EINPROGRESS = -115;
const codes = { 1: 'EPERM', 4: 'EINTR', 9: 'EBADF', 11: 'EAGAIN', 12: 'ENOMEM', 13: 'EACCES', 22: 'EINVAL', 24: 'EMFILE', 32: 'EPIPE',
  97: 'EAFNOSUPPORT', 98: 'EADDRINUSE', 99: 'EADDRNOTAVAIL', 100: 'ENETDOWN', 101: 'ENETUNREACH', 103: 'ECONNABORTED', 104: 'ECONNRESET',
  105: 'ENOBUFS', 106: 'EISCONN', 107: 'ENOTCONN', 110: 'ETIMEDOUT', 111: 'ECONNREFUSED', 113: 'EHOSTUNREACH', 114: 'EALREADY', 115: 'EINPROGRESS' };
const descriptions = { EACCES: 'permission denied', EADDRINUSE: 'address already in use', EADDRNOTAVAIL: 'address not available',
  EAFNOSUPPORT: 'address family not supported', EINVAL: 'invalid argument', EMFILE: 'too many open files', ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection reset by peer', EPIPE: 'broken pipe', ETIMEDOUT: 'connection timed out', ENOTCONN: 'socket is not connected' };
function errnoException(result, syscall, address, port, withDescription) {
  const code = codes[-result] || 'UNKNOWN';
  let message = syscall + ' ' + code;
  if (withDescription) message += ': ' + (descriptions[code] || 'unknown error');
  if (address !== undefined) message += ' ' + address + (port !== undefined ? ':' + port : '');
  const error = new Error(message);
  error.errno = sys.errno(-result, code);
  error.code = code;
  error.syscall = syscall;
  if (address !== undefined) error.address = address;
  if (port !== undefined) error.port = port;
  return error;
}
function codedError(code, message, Type) {
  const error = new (Type || Error)(message);
  error.code = code;
  return error;
}

// ---- IP addresses ----------------------------------------------------------
const v4 = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$/;
export function isIPv4(input) { return typeof input === 'string' && v4.test(input); }
function parseIPv6(input) {
  if (typeof input !== 'string' || input.length < 2 || input.indexOf('%') >= 0) return null;
  let text = input;
  const lastColon = text.lastIndexOf(':');
  if (lastColon < 0) return null;
  if (text.indexOf('.') > lastColon) {
    // A trailing dotted quad stands for the last two groups.
    const four = text.slice(lastColon + 1);
    if (!isIPv4(four)) return null;
    const parts = four.split('.').map(Number);
    text = text.slice(0, lastColon + 1) + ((parts[0] << 8) | parts[1]).toString(16) + ':' + ((parts[2] << 8) | parts[3]).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const group = /^[0-9a-fA-F]{1,4}$/;
  const parse = part => part === '' ? [] : part.split(':').map(g => group.test(g) ? parseInt(g, 16) : NaN);
  const head = parse(halves[0]), rest = halves.length === 2 ? parse(halves[1]) : [];
  if (head.some(n => n !== n) || rest.some(n => n !== n)) return null;
  const total = head.length + rest.length;
  if (halves.length === 1 ? total !== 8 : total > 7) return null;
  const words = head.concat(new Array(8 - total).fill(0), rest);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) { bytes[2 * i] = words[i] >> 8; bytes[2 * i + 1] = words[i] & 255; }
  return bytes;
}
export function isIPv6(input) { return parseIPv6(input) !== null; }
export function isIP(input) { return isIPv4(input) ? 4 : isIPv6(input) ? 6 : 0; }
function formatIPv6(bytes, offset) {
  const words = [];
  for (let i = 0; i < 8; i++) words.push((bytes[offset + 2 * i] << 8) | bytes[offset + 2 * i + 1]);
  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0xffff)
    return '::ffff:' + [bytes[offset + 12], bytes[offset + 13], bytes[offset + 14], bytes[offset + 15]].join('.');
  let bestStart = -1, bestLength = 0;
  for (let i = 0; i < 8;) {
    if (words[i] !== 0) { i++; continue; }
    let j = i; while (j < 8 && words[j] === 0) j++;
    if (j - i > bestLength && j - i > 1) { bestStart = i; bestLength = j - i; }
    i = j;
  }
  if (bestStart < 0) return words.map(w => w.toString(16)).join(':');
  return words.slice(0, bestStart).map(w => w.toString(16)).join(':') + '::' + words.slice(bestStart + bestLength).map(w => w.toString(16)).join(':');
}
/** sockaddr_in / sockaddr_in6 for an IP literal. */
function socketAddress(address, port) {
  if (isIPv4(address)) {
    const out = new Uint8Array(16);
    out[0] = sys.AF_INET & 255; out[1] = sys.AF_INET >> 8; out[2] = port >> 8; out[3] = port & 255;
    address.split('.').forEach((part, i) => { out[4 + i] = Number(part); });
    return out;
  }
  const bytes = parseIPv6(address), out = new Uint8Array(28);
  out[0] = sys.AF_INET6 & 255; out[1] = sys.AF_INET6 >> 8; out[2] = port >> 8; out[3] = port & 255;
  out.set(bytes, 8);
  return out;
}
function decodeAddress(raw) {
  if (raw === null) return {};
  const family = raw[0] | (raw[1] << 8), port = (raw[2] << 8) | raw[3];
  if (family === sys.AF_INET) return { address: raw[4] + '.' + raw[5] + '.' + raw[6] + '.' + raw[7], family: 'IPv4', port };
  if (family === sys.AF_INET6) return { address: formatIPv6(raw, 8), family: 'IPv6', port };
  return {};
}
/** Host name to [{address, family}], synchronously; throws ENOTFOUND. */
function lookup(host) {
  if (isIP(host)) return [{ address: host, family: isIP(host) }];
  const name = String(host).toLowerCase();
  if (name === 'localhost' || name.endsWith('.localhost')) return [{ address: '127.0.0.1', family: 4 }];
  const found = sys.lookup(name);
  if (found.length === 0) {
    const error = new Error('getaddrinfo ENOTFOUND ' + host);
    error.errno = -3008; error.code = 'ENOTFOUND'; error.syscall = 'getaddrinfo'; error.hostname = host;
    throw error;
  }
  return found;
}

// ---- Handle lists ----------------------------------------------------------------
/**
 * An unordered list of handles with O(1) add and remove: each handle keeps
 * its position in a field. Sets and Maps are not used for sets that change on
 * every request: a deleted entry stays in their entry list (for iterators),
 * so constant churn makes them grow and their small-size lookups linear.
 */
class HandleList {
  constructor(field) { this.items = []; this.field = field; }
  get size() { return this.items.length; }
  has(handle) { const i = handle[this.field]; return i !== undefined && i >= 0 && this.items[i] === handle; }
  add(handle) { if (this.has(handle)) return; handle[this.field] = this.items.length; this.items.push(handle); }
  delete(handle) {
    if (!this.has(handle)) return false;
    const i = handle[this.field], last = this.items.pop();
    if (last !== handle) { this.items[i] = last; last[this.field] = i; }
    handle[this.field] = -1;
    return true;
  }
  values() { return this.items.slice(); }
}

// ---- Event loop integration ------------------------------------------------
// Handles (sockets and servers) are registered while they are open. The loop
// asks the poller how many referenced handles keep the program alive, then
// calls poll(timeout), which returns the number of ready entries, and run(i)
// for each of them, draining the job queue in between. Readiness comes from
// the platform layer (epoll on Linux, WSAPoll on Windows); a handle's
// interest is only recomputed after markDirty(), so a poll costs work in
// proportion to the handles that changed or became ready, not to all of them.
let registered = false, handleCount = 0, refedCount = 0;
let immediates = [], dirty = [];
const byFd = [];
const readyHandles = [], readyEvents = [];
// Inactivity timeouts: deadlines in loop time; scanned only when the earliest one is due.
const timed = new HandleList('_timedIndex');
let earliestDeadline = Infinity;
/** Loop time in milliseconds, updated after every wait (like libuv's uv_now). */
let loopNow = performance.now();
function ensureLoop() {
  if (registered) return;
  registered = true;
  const hook = globalThis.__nonaIoLoop;
  if (typeof hook === 'function') { delete globalThis.__nonaIoLoop; hook(poller); }
  sys.init();
}
function register(handle) {
  ensureLoop();
  if (handle._registered) return;
  handle._registered = true;
  handleCount++;
  if (handle._refed) refedCount++;
}
function unregister(handle) {
  if (!handle._registered) return;
  handle._registered = false;
  handleCount--;
  if (handle._refed) refedCount--;
  timed.delete(handle);
}
function setRef(handle, refed) {
  if (handle._refed === refed) return;
  handle._refed = refed;
  if (handle._registered) refedCount += refed ? 1 : -1;
}
/** Starts watching the handle's file descriptor (its interest is computed at the next poll). */
function watch(handle) { byFd[handle._fd] = handle; handle._watched = 0; markDirty(handle); }
/** Stops watching before the descriptor is closed. */
function unwatch(handle) {
  const fd = handle._fd;
  if (fd < 0) return;
  if (byFd[fd] === handle) byFd[fd] = undefined;
  if (handle._watched !== 0) { sys.watch(fd, 0, handle._watched, handle); handle._watched = 0; }
}
function markDirty(handle) { if (!handle._dirty) { handle._dirty = true; dirty.push(handle); } }
function setDeadline(handle, deadline) {
  handle._deadline = deadline;
  if (deadline > 0) { timed.add(handle); if (deadline < earliestDeadline) earliestDeadline = deadline; }
  else timed.delete(handle);
}
/** Run a callback in a later turn of the event loop (after I/O, like setImmediate). */
function defer(callback) { ensureLoop(); immediates.push(callback); }
const IMMEDIATE = -1, TIMEOUT = -2;
const poller = {
  active() { return refedCount + immediates.length; },
  total() { return handleCount + immediates.length; },
  poll(timeout) {
    if (immediates.length > 0) timeout = 0;
    if (dirty.length > 0) {
      const list = dirty;
      dirty = [];
      for (let i = 0; i < list.length; i++) {
        const handle = list[i];
        handle._dirty = false;
        if (handle._fd < 0 || byFd[handle._fd] !== handle) continue;
        const want = handle._interest();
        if (want !== handle._watched) { sys.watch(handle._fd, want, handle._watched, handle); handle._watched = want; }
      }
    }
    if (earliestDeadline !== Infinity) {
      const wait = Math.max(0, Math.ceil(earliestDeadline - loopNow));
      if (timeout < 0 || wait < timeout) timeout = wait;
    }
    const n = sys.wait(timeout);
    loopNow = performance.now();
    let count = 0;
    for (let i = 0; i < n; i++) {
      const handle = byFd[sys.readyFd(i)];
      if (handle === undefined) continue;
      readyHandles[count] = handle; readyEvents[count] = sys.readyEvents(i); count++;
    }
    if (earliestDeadline <= loopNow) {
      let next = Infinity;
      for (const handle of timed.values()) {
        if (handle._deadline <= loopNow) { handle._deadline = 0; timed.delete(handle); readyHandles[count] = handle; readyEvents[count] = TIMEOUT; count++; }
        else if (handle._deadline < next) next = handle._deadline;
      }
      earliestDeadline = next;
    }
    if (immediates.length > 0) {
      const due = immediates;
      immediates = [];
      for (let i = 0; i < due.length; i++) { readyHandles[count] = due[i]; readyEvents[count] = IMMEDIATE; count++; }
    }
    return count;
  },
  run(i) {
    const handle = readyHandles[i], events = readyEvents[i];
    readyHandles[i] = undefined;
    if (events === IMMEDIATE) handle();
    else if (events === TIMEOUT) { if (!handle.destroyed) handle.emit('timeout'); }
    else handle._ready(events);
  }
};

/** Write callbacks are functions, or (from node:http) objects with a _sent method. */
function invoke(callback, error) { if (typeof callback === 'function') callback(error); else callback._sent(error); }

// ---- Socket ----------------------------------------------------------------
const readBuffer = new Uint8Array(65536);
export class Socket extends Readable {
  // Field defaults live on the prototype (see defaults() below).
  constructor(options) {
    super(options);
    if (options && options.allowHalfOpen) this.allowHalfOpen = true;
  }
  get bytesWritten() { return this._bytesWritten; }
  get pending() { return this._fd < 0 || this.connecting; }
  get readyState() {
    if (this.connecting) return 'opening';
    if (this._fd < 0) return 'closed';
    const readable = !this._eof, writable = !this._writeEnded;
    return readable && writable ? 'open' : readable ? 'readOnly' : writable ? 'writeOnly' : 'closed';
  }
  get writable() { return !this._destroyed && !this._writeEnded; }
  get writableLength() { return this._writeLength; }
  get bufferSize() { return this._writeLength; }
  get writableEnded() { return this._writeEnded; }
  get writableFinished() { return this._finished; }
  get writableNeedDrain() { return this._needDrain; }
  get remoteAddress() { return this._peer().address; }
  get remotePort() { return this._peer().port; }
  get remoteFamily() { return this._peer().family; }
  get localAddress() { return this._local().address; }
  get localPort() { return this._local().port; }
  get localFamily() { return this._local().family; }
  _peer() { if (this._peername === null && this._fd >= 0 && !this.connecting) this._peername = sys.peername(this._fd); return decodeAddress(this._peername); }
  _local() { if (this._sockname === null && this._fd >= 0) this._sockname = sys.sockname(this._fd); return decodeAddress(this._sockname); }
  address() { const a = this._local(); return a.address === undefined ? {} : { address: a.address, family: a.family, port: a.port }; }
  _attach(fd) { this._fd = fd; register(this); watch(this); }
  connect(...args) {
    let options, callback;
    if (args[0] !== null && typeof args[0] === 'object') { options = args[0]; callback = args[1]; }
    else { options = { port: args[0] }; if (typeof args[1] === 'string') { options.host = args[1]; callback = args[2]; } else callback = args[1]; }
    if (typeof callback === 'function') this.once('connect', callback);
    if (options.path !== undefined && options.path !== null) throw codedError('ERR_INVALID_ARG_VALUE', 'IPC paths are not supported by nona:net');
    const port = Number(options.port);
    if (options.port === undefined || options.port === null || options.port === '' || !(port >= 0 && port < 65536 && port === Math.floor(port))) {
      throw codedError('ERR_SOCKET_BAD_PORT', 'Port should be >= 0 and < 65536. Received ' + (typeof options.port === 'string' ? "type string ('" + options.port + "')" : 'type ' + typeof options.port + ' (' + String(options.port) + ')') + '.', RangeError);
    }
    const host = options.host || 'localhost';
    if (typeof options.timeout === 'number') this.setTimeout(options.timeout);
    if (options.noDelay) this._noDelay = true;
    this.connecting = true;
    this._host = host;
    this._refed = true;
    register(this);
    // Like Node.js, the lookup and the connect call happen on a later tick, so
    // errors reach listeners attached after connect() returns.
    queueMicrotask(() => { if (this.connecting && !this._destroyed) this._startConnect(host, port); });
    return this;
  }
  _startConnect(host, port) {
    let addresses;
    try { addresses = lookup(host); }
    catch (error) { this.connecting = false; this.destroy(error); return; }
    const target = addresses[0].address;
    this.emit('lookup', null, target, addresses[0].family, host);
    if (this._destroyed) return;
    const fd = sys.socket(isIPv4(target) ? sys.AF_INET : sys.AF_INET6);
    if (fd < 0) { this.destroy(errnoException(fd, 'connect', target, port)); return; }
    this._fd = fd;
    watch(this);
    if (this._noDelay) sys.setNoDelay(fd, true);
    const result = sys.connect(fd, socketAddress(target, port));
    this._target = { address: target, port };
    if (result < 0 && result !== EINPROGRESS && result !== EAGAIN) this.destroy(errnoException(result, 'connect', target, port));
    else if (result >= 0) queueMicrotask(() => this._connected());
  }
  _connected() {
    if (this._destroyed || !this.connecting) return;
    this.connecting = false;
    markDirty(this);
    this._touch();
    this.emit('connect');
    this.emit('ready');
    this._flushWrites();
  }
  _interest() {
    if (this._fd < 0 || this._destroyed) return 0;
    if (this.connecting) return WRITE;
    let interest = 0;
    if (!this._eof && this._flowing !== false && this._queued < this._hwm) interest |= READ;
    if (this._writeQueue !== null && this._writeQueue.length > 0) interest |= WRITE;
    return interest;
  }
  _ready(revents) {
    if (this._destroyed || this._fd < 0) return;
    if (this.connecting) {
      const error = sys.socketError(this._fd);
      if (error < 0) { this.destroy(errnoException(error, 'connect', this._target.address, this._target.port)); return; }
      if ((revents & (WRITE | ERROR | HANGUP)) === 0) return;
      this._connected();
      return;
    }
    if (revents & (READ | ERROR | HANGUP)) this._readNow();
    if (!this._destroyed && (revents & (WRITE | ERROR | HANGUP)) && this._writeQueue !== null && this._writeQueue.length > 0) this._flushWrites();
  }
  _readNow() {
    if (this._eof || this._destroyed) return;
    const n = sys.recv(this._fd, readBuffer);
    if (n === EAGAIN || n === EINTR) return;
    if (n < 0) { this.destroy(errnoException(n, 'read')); return; }
    this._touch();
    if (n === 0) {
      this._eof = true;
      markDirty(this);
      if (this._consumer !== null) { this._consumer.onEnd(); this._maybeClose(); return; }
      this.push(null);
      if (!this.allowHalfOpen && !this._writeEnded) this.end();
      this._maybeClose();
      return;
    }
    this.bytesRead += n;
    if (this._consumer !== null) { this._consumer.onData(readBuffer, n); return; }
    const chunk = Buffer.allocUnsafe(n);
    copyBytes(readBuffer, 0, n, chunk, 0);
    this.push(chunk);
  }
  _ended_() { this._maybeClose(); }
  write(data, encoding, callback) {
    if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
    if (this._writeEnded) {
      const error = codedError('ERR_STREAM_WRITE_AFTER_END', 'write after end');
      queueMicrotask(() => { if (callback) callback(error); this.emit('error', error); });
      return false;
    }
    if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
      const error = new TypeError('The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received ' + (data === null ? 'null' : typeof data));
      error.code = 'ERR_INVALID_ARG_TYPE';
      throw error;
    }
    const bytes = typeof data === 'string' ? Buffer.from(data, encoding) : data;
    if (this._destroyed) {
      const error = codedError('ERR_STREAM_DESTROYED', 'Cannot call write after a stream was destroyed');
      if (callback) queueMicrotask(() => callback(error));
      return false;
    }
    (this._writeQueue || (this._writeQueue = [])).push({ bytes, offset: 0, length: bytes.length, callback });
    this._writeLength += bytes.length;
    if (!this.connecting && this._fd >= 0) this._flushWrites();
    const ok = this._writeLength < 16384;
    if (!ok) this._needDrain = true;
    return ok;
  }
  _flushWrites() {
    while (this._writeQueue !== null && this._writeQueue.length > 0 && !this._destroyed) {
      const item = this._writeQueue[0];
      if (item.length > item.offset) {
        if (item.offset > 0) { const rest = new Uint8Array(item.length - item.offset); copyBytes(item.bytes, item.offset, item.length, rest, 0); item.bytes = rest; item.length = rest.length; item.offset = 0; }
        const n = sys.send(this._fd, item.bytes, item.length);
        if (n === EAGAIN || n === EINTR) { markDirty(this); return; }
        if (n < 0) { this.destroy(errnoException(n, 'write')); return; }
        this._touch();
        item.offset += n; this._writeLength -= n; this._bytesWritten += n;
        if (item.offset < item.length) { markDirty(this); return; }
      }
      this._writeQueue.shift();
      if (item.callback) { const callback = item.callback; queueMicrotask(() => invoke(callback, null)); }
    }
    if (this._writeQueue === null || this._writeQueue.length === 0) {
      if (this._watched & WRITE) markDirty(this);
      if (this._needDrain) { this._needDrain = false; queueMicrotask(() => { if (!this._destroyed) this.emit('drain'); }); }
      if (this._writeEnded && !this._shutdown) this._finishWrites();
    }
  }
  _finishWrites() {
    this._shutdown = true;
    if (this._fd >= 0) sys.shutdown(this._fd);
    queueMicrotask(() => {
      if (this._destroyed) return;
      this._finished = true;
      this.emit('finish');
      this._maybeClose();
    });
  }
  end(data, encoding, callback) {
    if (typeof data === 'function') { callback = data; data = undefined; }
    else if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
    if (data !== undefined && data !== null) this.write(data, encoding);
    if (typeof callback === 'function') this.once('finish', callback);
    if (this._writeEnded) return this;
    this._writeEnded = true;
    if (!this.connecting && this._fd >= 0 && (this._writeQueue === null || this._writeQueue.length === 0)) this._finishWrites();
    else if (this._fd < 0 && !this.connecting) queueMicrotask(() => this.destroy());
    return this;
  }
  destroySoon() {
    if (!this._writeEnded) this.end();
    if (this._finished) this.destroy(); else this.once('finish', () => this.destroy());
  }
  _maybeClose() {
    if (this._destroyed) return;
    if ((this._endEmitted || (this._eof && this._flowing !== true)) && this._finished) this.destroy();
  }
  _destroy(error, callback) {
    if (error) this._hadError = true;
    this.connecting = false;
    this._deadline = 0;
    if (this._fd >= 0) {
      unwatch(this);
      sys.close(this._fd);
      this._fd = -1;
    }
    unregister(this);
    if (this._writeQueue !== null) for (const item of this._writeQueue) if (item.callback) { const cb = item.callback; queueMicrotask(() => invoke(cb, error || codedError('ERR_STREAM_DESTROYED', 'Cannot call write after a stream was destroyed'))); }
    this._writeQueue = null; this._writeLength = 0;
    if (this.server !== null) this.server._removeConnection(this);
    callback(error);
  }
  destroy(error) {
    if (this._destroyed) return this;
    super.destroy(error);
    return this;
  }
  resetAndDestroy() { return this.destroy(); }
  emit(type, ...args) {
    if (type === 'close') return super.emit('close', this._hadError);
    return super.emit(type, ...args);
  }
  setNoDelay(noDelay) { if (this._fd >= 0 && !this.connecting) sys.setNoDelay(this._fd, noDelay !== false); else this._noDelay = noDelay !== false; return this; }
  setKeepAlive(enable) { if (this._fd >= 0) sys.setKeepAlive(this._fd, !!enable); return this; }
  setTimeout(timeout, callback) {
    this._timeout = timeout;
    if (typeof callback === 'function') { if (timeout === 0) this.removeListener('timeout', callback); else this.once('timeout', callback); }
    this._touch();
    return this;
  }
  _touch() { if (this._timeout > 0 && !this._destroyed) setDeadline(this, loopNow + this._timeout); else if (this._deadline !== 0) setDeadline(this, 0); }
  pause() { super.pause(); markDirty(this); return this; }
  resume() { super.resume(); markDirty(this); return this; }
  /**
   * Sends bytes[0, length) at once when nothing is queued; the rest is queued
   * (copied) for when the socket is writable. Internal fast path of node:http.
   */
  _sendNow(bytes, length, callback) {
    if ((this._writeQueue !== null && this._writeQueue.length > 0) || this.connecting || this._fd < 0 || this._destroyed) {
      const copy = new Uint8Array(length); copyBytes(bytes, 0, length, copy, 0);
      return this.write(copy, callback);
    }
    let n = sys.send(this._fd, bytes, length);
    if (n === EINTR) n = EAGAIN;
    if (n < 0 && n !== EAGAIN) { this.destroy(errnoException(n, 'write')); return false; }
    if (n === EAGAIN) n = 0;
    this._bytesWritten += n;
    if (n < length) {
      const rest = new Uint8Array(length - n); copyBytes(bytes, n, length, rest, 0);
      (this._writeQueue || (this._writeQueue = [])).push({ bytes: rest, offset: 0, length: rest.length, callback });
      this._writeLength += rest.length;
      markDirty(this);
      return this._writeLength < 16384;
    }
    if (callback) invoke(callback, null);
    return true;
  }
  ref() { setRef(this, true); return this; }
  unref() { setRef(this, false); return this; }
}
defaults(Socket.prototype, {
  _fd: -1, connecting: false, _refed: true, _writeQueue: null, _writeLength: 0, _needDrain: false, _writeEnded: false, _shutdown: false,
  _finished: false, _eof: false, _timeout: 0, _deadline: 0, _registered: false, _dirty: false, _watched: 0, _consumer: null, allowHalfOpen: false,
  bytesRead: 0, _bytesWritten: 0, _hadError: false, server: null, _sockname: null, _peername: null, _noDelay: false, _target: null, _host: undefined,
  _httpMessage: null, _httpConnection: null
});
export const Stream = Socket;

// ---- Server ----------------------------------------------------------------
export class Server extends EventEmitter {
  constructor(options, listener) {
    super();
    if (typeof options === 'function') { listener = options; options = {}; }
    if (options) this._options = options;
    if (typeof listener === 'function') this.on('connection', listener);
    this._connections = new HandleList('_connectionIndex');
  }
  get connections() { return this._connections.size; }
  listen(...args) {
    let options = {}, callback;
    if (typeof args[args.length - 1] === 'function') callback = args.pop();
    if (args[0] !== null && typeof args[0] === 'object') options = args[0];
    else { options.port = args[0]; if (typeof args[1] === 'string') { options.host = args[1]; options.backlog = args[2]; } else options.backlog = args[1]; }
    if (this.listening) throw codedError('ERR_SERVER_ALREADY_LISTEN', 'Listen method has been called more than once without closing.');
    if (options.path !== undefined && options.path !== null) throw codedError('ERR_INVALID_ARG_VALUE', 'IPC paths are not supported by nona:net');
    const port = options.port === undefined || options.port === null ? 0 : Number(options.port);
    if (!(port >= 0 && port < 65536 && port === Math.floor(port))) throw codedError('ERR_SOCKET_BAD_PORT', 'options.port should be >= 0 and < 65536. Received type ' + typeof options.port + ' (' + String(options.port) + ').', RangeError);
    if (typeof callback === 'function') this.once('listening', callback);
    let host = options.host, fd = -1, address;
    register(this);
    if (host === undefined || host === null || host === '') {
      // Like Node.js: the IPv6 any address in dual-stack mode, else IPv4.
      fd = sys.socket(sys.AF_INET6);
      if (fd >= 0) { address = '::'; if (options.ipv6Only !== true) sys.setV6Only(fd, false); }
      else { fd = sys.socket(sys.AF_INET); address = '0.0.0.0'; }
    } else {
      try { address = lookup(host)[0].address; }
      catch (error) { unregister(this); queueMicrotask(() => this.emit('error', error)); return this; }
      fd = sys.socket(isIPv4(address) ? sys.AF_INET : sys.AF_INET6);
      if (fd >= 0 && options.ipv6Only === true) sys.setV6Only(fd, true);
    }
    const fail = (result, syscall) => {
      if (fd >= 0) sys.close(fd);
      unregister(this);
      const error = errnoException(result, syscall, address, port, true);
      defer(() => this.emit('error', error));
      return this;
    };
    if (fd < 0) return fail(fd, 'listen');
    sys.setReuseAddress(fd);
    let result = sys.bind(fd, socketAddress(address, port));
    if (result < 0) return fail(result, 'listen');
    result = sys.listen(fd, options.backlog === undefined ? 511 : Number(options.backlog) || 511);
    if (result < 0) return fail(result, 'listen');
    this._fd = fd;
    watch(this);
    this._sockname = sys.sockname(fd);
    this.listening = true;
    queueMicrotask(() => { if (this.listening) this.emit('listening'); });
    return this;
  }
  address() {
    if (!this.listening) return null;
    const a = decodeAddress(this._sockname);
    return { address: a.address, family: a.family, port: a.port };
  }
  _interest() { return this._fd >= 0 ? READ : 0; }
  _ready() {
    for (let i = 0; i < 64 && this._fd >= 0; i++) {
      const fd = sys.accept(this._fd);
      if (fd === EAGAIN || fd === EINTR) return;
      if (fd < 0) { this.emit('error', errnoException(fd, 'accept')); return; }
      if (this.maxConnections !== undefined && this._connections.size >= this.maxConnections) { sys.close(fd); continue; }
      const socket = new Socket({ allowHalfOpen: !!this._options.allowHalfOpen });
      socket._attach(fd);
      socket.server = this;
      if (this._options.noDelay) sys.setNoDelay(fd, true);
      this._connections.add(socket);
      this._onConnection(socket);
    }
  }
  /** Internal hook: node:http handles its connections without the 'connection' listener chain. */
  _onConnection(socket) { this.emit('connection', socket); }
  _removeConnection(socket) {
    this._connections.delete(socket);
    this._maybeClosed();
  }
  _maybeClosed() {
    if (this._closing && this._fd < 0 && this._connections.size === 0 && !this._closeEmitted) {
      this._closeEmitted = true;
      queueMicrotask(() => this.emit('close'));
    }
  }
  close(callback) {
    if (typeof callback === 'function') {
      if (!this.listening) this.once('close', () => callback(codedError('ERR_SERVER_NOT_RUNNING', 'Server is not running.')));
      else this.once('close', callback);
    }
    if (this._fd >= 0) { unwatch(this); sys.close(this._fd); this._fd = -1; }
    unregister(this);
    this.listening = false;
    this._closing = true;
    this._closeEmitted = false;
    this._maybeClosed();
    return this;
  }
  getConnections(callback) { const n = this._connections.size; queueMicrotask(() => callback(null, n)); return this; }
  ref() { setRef(this, true); return this; }
  unref() { setRef(this, false); return this; }
  [Symbol.asyncDispose]() { return new Promise(resolve => this.close(resolve)); }
}
defaults(Server.prototype, {
  _options: Object.freeze({}), _fd: -1, _refed: true, _registered: false, _dirty: false, _watched: 0, _deadline: 0, _sockname: null,
  listening: false, maxConnections: undefined, _closing: false, _closeEmitted: false
});
export function createServer(options, listener) { return new Server(options, listener); }
export function connect(...args) {
  const socket = new Socket(args[0] !== null && typeof args[0] === 'object' ? args[0] : undefined);
  if (args[0] !== null && typeof args[0] === 'object' && typeof args[0].timeout === 'number') socket.setTimeout(args[0].timeout);
  return socket.connect(...args);
}
export const createConnection = connect;
export function getDefaultAutoSelectFamily() { return false; }
export function setDefaultAutoSelectFamily() {}
/** Internal hooks for node:http. */
export const _internal = { defer, lookup };
export default { Socket, Stream, Server, createServer, connect, createConnection, isIP, isIPv4, isIPv6, getDefaultAutoSelectFamily, setDefaultAutoSelectFamily };
`;

const win32=String.raw`
import { define, lastError } from 'nona:ffi';
const WSAStartup = define('ws2_32.dll', 'WSAStartup', 'i32(u16,buf)');
const wsSocket = define('ws2_32.dll', 'socket', 'ptr(i32,i32,i32)');
const ioctlsocket = define('ws2_32.dll', 'ioctlsocket', 'i32(ptr,i32,buf)');
const wsBind = define('ws2_32.dll', 'bind', 'i32(ptr,buf,i32)');
const wsListen = define('ws2_32.dll', 'listen', 'i32(ptr,i32)');
const wsAccept = define('ws2_32.dll', 'accept', 'ptr(ptr,ptr,ptr)');
const wsConnect = define('ws2_32.dll', 'connect', 'i32(ptr,buf,i32)');
const wsSend = define('ws2_32.dll', 'send', 'i32(ptr,buf,i32,i32)');
const wsRecv = define('ws2_32.dll', 'recv', 'i32(ptr,buf,i32,i32)');
const wsShutdown = define('ws2_32.dll', 'shutdown', 'i32(ptr,i32)');
const closesocket = define('ws2_32.dll', 'closesocket', 'i32(ptr)');
const wsSetsockopt = define('ws2_32.dll', 'setsockopt', 'i32(ptr,i32,i32,buf,i32)');
const wsGetsockopt = define('ws2_32.dll', 'getsockopt', 'i32(ptr,i32,i32,buf,buf)');
const wsGetsockname = define('ws2_32.dll', 'getsockname', 'i32(ptr,buf,buf)');
const wsGetpeername = define('ws2_32.dll', 'getpeername', 'i32(ptr,buf,buf)');
const WSAPoll = define('ws2_32.dll', 'WSAPoll', 'i32(buf,u32,i32)');
const getaddrinfo = define('ws2_32.dll', 'getaddrinfo', 'i32(str,ptr,buf,buf)');
const freeaddrinfo = define('ws2_32.dll', 'freeaddrinfo', 'void(ptr)');
const RtlMoveMemory = define('kernel32.dll', 'RtlMoveMemory', 'void(buf,ptr,u64)');
const Sleep = define('kernel32.dll', 'Sleep', 'void(u32)');
const wsaErrors = { 10004: 4, 10009: 9, 10013: 13, 10014: 22, 10022: 22, 10024: 24, 10035: 11, 10036: 115, 10037: 114, 10047: 97, 10048: 98, 10049: 99,
  10050: 100, 10051: 101, 10053: 103, 10054: 104, 10055: 105, 10056: 106, 10057: 107, 10058: 32, 10060: 110, 10061: 111, 10065: 113 };
const uvErrors = { EACCES: -4092, EADDRINUSE: -4091, EADDRNOTAVAIL: -4090, EAFNOSUPPORT: -4089, EAGAIN: -4088, EALREADY: -4084, EBADF: -4083,
  ECONNABORTED: -4079, ECONNREFUSED: -4078, ECONNRESET: -4077, EHOSTUNREACH: -4065, EINTR: -4080, EINVAL: -4071, EISCONN: -4069, EMFILE: -4066,
  ENETDOWN: -4064, ENETUNREACH: -4062, ENOBUFS: -4060, ENOTCONN: -4053, EPIPE: -4047, ETIMEDOUT: -4039 };
function failure() { const error = lastError(); return -(wsaErrors[error] || 22); }
const one = new Uint32Array([1]), zero = new Uint32Array([0]), optionValue = new Uint32Array(1), optionLength = new Int32Array(1);
const nameBuffer = new Uint8Array(28), nameLength = new Int32Array(1);
let pollBuffer = new Uint8Array(16 * 64), pollView = new DataView(pollBuffer.buffer);
function setHandle(view, offset, handle) { view.setUint32(offset, handle % 4294967296, true); view.setUint32(offset + 4, Math.floor(handle / 4294967296), true); }
// Watched handles; WSAPoll gets the whole set on every wait.
const watched = [];
let readyList = [], readyMask = [];
const sys = {
  AF_INET: 2, AF_INET6: 23,
  watch(fd, want, had, handle) {
    handle._want = want;
    if (want !== 0 && had === 0) { handle._watchIndex = watched.length; watched.push(handle); }
    else if (want === 0 && had !== 0) {
      const i = handle._watchIndex, last = watched.pop();
      if (last !== handle) { watched[i] = last; last._watchIndex = i; }
    }
  },
  wait(timeout) {
    const count = watched.length;
    if (count === 0) { if (timeout !== 0) Sleep(timeout < 0 ? 0xffffffff : timeout); return 0; }
    if (pollBuffer.length < 16 * count) { pollBuffer = new Uint8Array(16 * count * 2); pollView = new DataView(pollBuffer.buffer); }
    const fds = [];
    let i = 0;
    for (const handle of watched) {
      const fd = handle._fd, want = handle._want;
      fds.push(fd);
      setHandle(pollView, 16 * i, fd);
      pollView.setInt16(16 * i + 8, (want & 1 ? 0x100 : 0) | (want & 2 ? 0x10 : 0), true);
      pollView.setInt16(16 * i + 10, 0, true);
      i++;
    }
    const n = WSAPoll(pollBuffer, count, timeout);
    readyList = []; readyMask = [];
    if (n <= 0) return 0;
    for (let k = 0; k < count; k++) {
      const r = pollView.getUint16(16 * k + 10, true);
      if (r === 0) continue;
      readyList.push(fds[k]);
      readyMask.push((r & 0x300 ? 1 : 0) | (r & 0x10 ? 2 : 0) | (r & 1 ? 4 : 0) | (r & 2 ? 8 : 0) | (r & 4 ? 4 : 0));
    }
    return readyList.length;
  },
  readyFd(i) { return readyList[i]; },
  readyEvents(i) { return readyMask[i]; },
  init() { const data = new Uint8Array(512); WSAStartup(0x202, data); },
  errno(errno, code) { return uvErrors[code] || -errno; },
  socket(family) {
    const fd = wsSocket(family, 1, 6);
    if (fd === -1) return failure();
    if (ioctlsocket(fd, -2147195266, one) !== 0) { const result = failure(); closesocket(fd); return result; }
    return fd;
  },
  setV6Only(fd, on) { wsSetsockopt(fd, 41, 27, on ? one : zero, 4); },
  // Windows SO_REUSEADDR lets another socket steal the port; libuv does not set it either.
  setReuseAddress(fd) {},
  setNoDelay(fd, on) { wsSetsockopt(fd, 6, 1, on ? one : zero, 4); },
  setKeepAlive(fd, on) { wsSetsockopt(fd, 0xffff, 8, on ? one : zero, 4); },
  bind(fd, address) { return wsBind(fd, address, address.length) === 0 ? 0 : failure(); },
  listen(fd, backlog) { return wsListen(fd, backlog) === 0 ? 0 : failure(); },
  accept(fd) { const result = wsAccept(fd, null, null); return result === -1 ? failure() : result; },
  connect(fd, address) { return wsConnect(fd, address, address.length) === 0 ? 0 : failure(); },
  socketError(fd) {
    optionLength[0] = 4;
    if (wsGetsockopt(fd, 0xffff, 0x1007, optionValue, optionLength) !== 0) return failure();
    return optionValue[0] === 0 ? 0 : -(wsaErrors[optionValue[0]] || 22);
  },
  send(fd, bytes, length) { const n = wsSend(fd, bytes, Math.min(length, 0x40000000), 0); return n < 0 ? failure() : n; },
  recv(fd, buffer) { const n = wsRecv(fd, buffer, buffer.length, 0); return n < 0 ? failure() : n; },
  shutdown(fd) { wsShutdown(fd, 1); },
  close(fd) { closesocket(fd); },
  sockname(fd) { nameLength[0] = 28; return wsGetsockname(fd, nameBuffer, nameLength) === 0 ? nameBuffer.slice(0, nameLength[0]) : null; },
  peername(fd) { nameLength[0] = 28; return wsGetpeername(fd, nameBuffer, nameLength) === 0 ? nameBuffer.slice(0, nameLength[0]) : null; },
  sleep(timeout) { Sleep(timeout < 0 ? 0xffffffff : timeout); },
  lookup(name) {
    const hints = new Uint8Array(48), hintsView = new DataView(hints.buffer), result = new Uint8Array(8), resultView = new DataView(result.buffer);
    hintsView.setInt32(4, 2, true); hintsView.setInt32(8, 1, true);
    if (getaddrinfo(name, null, hints, result) !== 0) return [];
    const head = resultView.getUint32(0, true) + resultView.getUint32(4, true) * 4294967296, out = [];
    const node = new Uint8Array(48), nodeView = new DataView(node.buffer), address = new Uint8Array(16);
    for (let pointer = head; pointer !== 0 && out.length < 16;) {
      RtlMoveMemory(node, pointer, 48);
      const family = nodeView.getInt32(4, true), addressPointer = nodeView.getUint32(32, true) + nodeView.getUint32(36, true) * 4294967296;
      if (family === 2 && addressPointer !== 0) { RtlMoveMemory(address, addressPointer, 16); out.push({ address: address[4] + '.' + address[5] + '.' + address[6] + '.' + address[7], family: 4 }); }
      pointer = nodeView.getUint32(40, true) + nodeView.getUint32(44, true) * 4294967296;
    }
    freeaddrinfo(head);
    return out;
  }
};
`;

const linux=String.raw`
import { define } from 'nona:ffi';
const sysRead = define('syscall', '0', 'i64(i64,buf,i64)');
const sysWrite = define('syscall', '1', 'i64(i64,buf,i64)');
const sysOpen = define('syscall', '2', 'i64(buf,i64,i64)');
const sysClose = define('syscall', '3', 'i64(i64)');
const sysPoll = define('syscall', '7', 'i64(buf,i64,i64)');
const sysSocket = define('syscall', '41', 'i64(i64,i64,i64)');
const sysConnect = define('syscall', '42', 'i64(i64,buf,i64)');
const sysSendto = define('syscall', '44', 'i64(i64,buf,i64,i64,ptr,i64)');
const sysShutdown = define('syscall', '48', 'i64(i64,i64)');
const sysBind = define('syscall', '49', 'i64(i64,buf,i64)');
const sysListen = define('syscall', '50', 'i64(i64,i64)');
const sysGetsockname = define('syscall', '51', 'i64(i64,buf,buf)');
const sysGetpeername = define('syscall', '52', 'i64(i64,buf,buf)');
const sysSetsockopt = define('syscall', '54', 'i64(i64,i64,i64,buf,i64)');
const sysGetsockopt = define('syscall', '55', 'i64(i64,i64,i64,buf,buf)');
const sysAccept4 = define('syscall', '288', 'i64(i64,ptr,ptr,i64)');
const sysEpollWait = define('syscall', '232', 'i64(i64,buf,i64,i64)');
const sysEpollCtl = define('syscall', '233', 'i64(i64,i64,i64,buf)');
const sysEpollCreate1 = define('syscall', '291', 'i64(i64)');
// struct epoll_event is packed on x86-64: u32 events, u64 data (the descriptor).
const EPOLL_MAX = 256, epollEvents = new Int32Array(3 * EPOLL_MAX), epollEvent = new Int32Array(3);
let epollFd = -1;
const NONBLOCK_CLOEXEC = 0x800 | 0x80000, MSG_NOSIGNAL = 0x4000;
const one = new Int32Array([1]), zero = new Int32Array([0]), optionValue = new Int32Array(1), optionLength = new Int32Array(1);
const nameBuffer = new Uint8Array(28), nameLength = new Int32Array(1);
let pollBuffer = new Uint8Array(8 * 64), pollView = new DataView(pollBuffer.buffer);
const textDecoder = new TextDecoder(), textEncoder = new TextEncoder();
function readText(path) {
  const bytes = textEncoder.encode(path), name = new Uint8Array(bytes.length + 1);
  name.set(bytes);
  const fd = sysOpen(name, 0x80000, 0);
  if (fd < 0) return null;
  const chunks = [], buffer = new Uint8Array(65536);
  try {
    for (;;) { const n = sysRead(fd, buffer, buffer.length); if (n <= 0) break; chunks.push(textDecoder.decode(buffer.subarray(0, n))); }
  } finally { sysClose(fd); }
  return chunks.join('');
}
function hostsLookup(name) {
  const text = readText('/etc/hosts');
  if (text === null) return [];
  const out = [];
  for (const line of text.split('\n')) {
    const fields = line.replace(/#.*/, '').trim().split(/\s+/);
    if (fields.length < 2) continue;
    for (let i = 1; i < fields.length; i++) if (fields[i].toLowerCase() === name && /^\d+\.\d+\.\d+\.\d+$/.test(fields[0])) out.push({ address: fields[0], family: 4 });
  }
  return out;
}
/** One A query over UDP to the first nameserver in /etc/resolv.conf. */
function dnsLookup(name) {
  const conf = readText('/etc/resolv.conf') || '';
  const match = /^\s*nameserver\s+(\d+\.\d+\.\d+\.\d+)/m.exec(conf);
  const server = match ? match[1] : '127.0.0.1';
  const id = (Date.now() * 7919) & 0xffff;
  const labels = name.split('.').filter(label => label !== '');
  const query = [id >> 8, id & 255, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
  for (const label of labels) { const bytes = textEncoder.encode(label); query.push(bytes.length); for (const b of bytes) query.push(b); }
  query.push(0, 0, 1, 0, 1);
  const fd = sysSocket(2, 2 | NONBLOCK_CLOEXEC, 0);
  if (fd < 0) return [];
  const out = [];
  try {
    const address = new Uint8Array(16);
    address[0] = 2; address[3] = 53;
    server.split('.').forEach((part, i) => { address[4 + i] = Number(part); });
    if (sysConnect(fd, address, 16) < 0) return [];
    const packet = new Uint8Array(query), reply = new Uint8Array(1500), pollfd = new Uint8Array(8), pv = new DataView(pollfd.buffer);
    for (let attempt = 0; attempt < 2 && out.length === 0; attempt++) {
      if (sysWrite(fd, packet, packet.length) < 0) return [];
      pv.setInt32(0, fd, true); pv.setInt16(4, 1, true); pv.setInt16(6, 0, true);
      if (sysPoll(pollfd, 1, 2500) <= 0) continue;
      const n = sysRead(fd, reply, reply.length);
      if (n < 12 || reply[0] !== packet[0] || reply[1] !== packet[1]) continue;
      if ((reply[3] & 15) !== 0) return [];
      const answers = (reply[6] << 8) | reply[7], view = new DataView(reply.buffer);
      let offset = packet.length;
      const skipName = () => { while (offset < n) { const length = reply[offset]; if (length === 0) { offset++; return; } if ((length & 0xc0) === 0xc0) { offset += 2; return; } offset += length + 1; } };
      for (let i = 0; i < answers && offset < n; i++) {
        skipName();
        const type = view.getUint16(offset), length = view.getUint16(offset + 8);
        offset += 10;
        if (type === 1 && length === 4) out.push({ address: reply[offset] + '.' + reply[offset + 1] + '.' + reply[offset + 2] + '.' + reply[offset + 3], family: 4 });
        offset += length;
      }
    }
  } finally { sysClose(fd); }
  return out;
}
const sys = {
  AF_INET: 2, AF_INET6: 10,
  init() { epollFd = sysEpollCreate1(0x80000); },
  /** Changes the readiness interest of fd from had to want (READ 1, WRITE 2; 0 removes it). */
  watch(fd, want, had) {
    epollEvent[0] = (want & 1 ? 1 : 0) | (want & 2 ? 4 : 0); epollEvent[1] = fd; epollEvent[2] = 0;
    sysEpollCtl(epollFd, had === 0 ? 1 : want === 0 ? 2 : 3, fd, epollEvent);
  },
  /** Waits up to timeout ms (-1: no limit); returns the number of ready descriptors. */
  wait(timeout) {
    const n = sysEpollWait(epollFd, epollEvents, EPOLL_MAX, timeout);
    return n > 0 ? n : 0;
  },
  readyFd(i) { return epollEvents[3 * i + 1]; },
  readyEvents(i) {
    const r = epollEvents[3 * i];
    return (r & 1 ? 1 : 0) | (r & 4 ? 2 : 0) | (r & 8 ? 4 : 0) | (r & 16 ? 8 : 0);
  },
  errno(errno) { return -errno; },
  socket(family) { return sysSocket(family, 1 | NONBLOCK_CLOEXEC, 0); },
  setV6Only(fd, on) { sysSetsockopt(fd, 41, 26, on ? one : zero, 4); },
  setReuseAddress(fd) { sysSetsockopt(fd, 1, 2, one, 4); },
  setNoDelay(fd, on) { sysSetsockopt(fd, 6, 1, on ? one : zero, 4); },
  setKeepAlive(fd, on) { sysSetsockopt(fd, 1, 9, on ? one : zero, 4); },
  bind(fd, address) { return sysBind(fd, address, address.length); },
  listen(fd, backlog) { return sysListen(fd, backlog); },
  accept(fd) { return sysAccept4(fd, null, null, NONBLOCK_CLOEXEC); },
  connect(fd, address) { return sysConnect(fd, address, address.length); },
  socketError(fd) {
    optionLength[0] = 4;
    const result = sysGetsockopt(fd, 1, 4, optionValue, optionLength);
    return result < 0 ? result : -optionValue[0];
  },
  send(fd, bytes, length) { return sysSendto(fd, bytes, length, MSG_NOSIGNAL, null, 0); },
  recv(fd, buffer) { return sysRead(fd, buffer, buffer.length); },
  shutdown(fd) { sysShutdown(fd, 1); },
  close(fd) { sysClose(fd); },
  sockname(fd) { nameLength[0] = 28; return sysGetsockname(fd, nameBuffer, nameLength) === 0 ? nameBuffer.slice(0, nameLength[0]) : null; },
  peername(fd) { nameLength[0] = 28; return sysGetpeername(fd, nameBuffer, nameLength) === 0 ? nameBuffer.slice(0, nameLength[0]) : null; },
  sleep(timeout) { sysPoll(pollBuffer, 0, timeout); },
  lookup(name) { const hosts = hostsLookup(name); return hosts.length > 0 ? hosts : dnsLookup(name); }
};
`;

export function netModuleSource(target:'win32-x64'|'linux-x64'):string {
  return (target==='linux-x64'?linux:win32)+common;
}
