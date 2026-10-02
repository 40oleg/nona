/**
 * Source of `nona:internal/stream`: the readable side shared by net.Socket
 * and http.IncomingMessage. It follows the observable behaviour of Node.js
 * Readable streams in flowing mode (`data`/`end`/`close`, pause/resume,
 * setEncoding, pipe, async iteration) without the full node:stream API.
 * Deferred events use queueMicrotask where Node.js uses process.nextTick.
 */
export const streamModuleSource=String.raw`
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { Buffer } from 'node:buffer';
function chunkLength(chunk) { return typeof chunk === 'string' ? chunk.length : chunk.length; }
export class Readable extends EventEmitter {
  constructor(options) {
    super();
    this._readableState = { buffer: [], length: 0, flowing: null, ended: false, endEmitted: false, decoder: null, encoding: null,
      destroyed: false, closed: false, errored: null, flushScheduled: false, highWaterMark: (options && options.highWaterMark) || 16384, readCalled: false };
  }
  get readable() { const s = this._readableState; return !s.destroyed && !s.endEmitted && !s.errored; }
  get readableEnded() { return this._readableState.endEmitted; }
  get readableFlowing() { return this._readableState.flowing; }
  get readableLength() { return this._readableState.length; }
  get readableEncoding() { return this._readableState.encoding; }
  get readableHighWaterMark() { return this._readableState.highWaterMark; }
  get destroyed() { return this._readableState.destroyed; }
  get errored() { return this._readableState.errored; }
  get closed() { return this._readableState.closed; }
  /** Producer side: a chunk (Buffer), or null at the end of the data. */
  push(chunk) {
    const s = this._readableState;
    if (s.destroyed || s.ended) return false;
    if (chunk === null) { s.ended = true; this._scheduleFlush(); return false; }
    let value = chunk;
    if (s.decoder !== null) { value = s.decoder.write(chunk); if (value === '') return s.length < s.highWaterMark; }
    if (s.flowing === true && s.length === 0 && !s.flushScheduled) this.emit('data', value);
    else { s.buffer.push(value); s.length += chunkLength(value); if (s.flowing === true) this._scheduleFlush(); }
    return s.length < s.highWaterMark;
  }
  /** Consumer wants data again (after a pause): producers resume reading. */
  _read() {}
  _scheduleFlush() {
    const s = this._readableState;
    if (s.flushScheduled) return;
    s.flushScheduled = true;
    queueMicrotask(() => { s.flushScheduled = false; this._flush(); });
  }
  _flush() {
    const s = this._readableState;
    while (s.flowing === true && s.buffer.length > 0 && !s.destroyed) {
      const chunk = s.buffer.shift();
      s.length -= chunkLength(chunk);
      this.emit('data', chunk);
    }
    // A drained buffer asks the producer for more (a paused socket resumes).
    if (s.flowing === true && !s.ended && !s.destroyed && s.length < s.highWaterMark) this._read();
    if (s.ended && s.buffer.length === 0 && !s.endEmitted && !s.destroyed && (s.flowing === true || s.readCalled)) {
      if (s.decoder !== null) { const rest = s.decoder.end(); s.decoder = new StringDecoder(s.encoding); if (rest !== '') this.emit('data', rest); }
      s.endEmitted = true;
      this.emit('end');
      this._ended();
    }
  }
  /** Called once 'end' has been emitted. */
  _ended() {}
  on(type, listener) {
    super.on(type, listener);
    const s = this._readableState;
    if (type === 'data' && s.flowing !== false) this.resume();
    else if (type === 'readable' && !s.endEmitted) { s.flowing = false; queueMicrotask(() => { if (s.length > 0 || s.ended) this.emit('readable'); }); }
    return this;
  }
  addListener(type, listener) { return this.on(type, listener); }
  resume() {
    const s = this._readableState;
    if (s.flowing !== true) {
      s.flowing = true;
      queueMicrotask(() => { if (s.flowing === true) this.emit('resume'); });
      this._read();
      this._scheduleFlush();
    }
    return this;
  }
  pause() {
    const s = this._readableState;
    if (s.flowing !== false) { s.flowing = false; this.emit('pause'); }
    return this;
  }
  isPaused() { return this._readableState.flowing === false; }
  setEncoding(encoding) {
    const s = this._readableState;
    s.decoder = new StringDecoder(encoding);
    s.encoding = s.decoder.encoding;
    const buffered = s.buffer;
    s.buffer = []; s.length = 0;
    let text = '';
    for (const chunk of buffered) text += typeof chunk === 'string' ? chunk : s.decoder.write(chunk);
    if (text !== '') { s.buffer.push(text); s.length = text.length; }
    return this;
  }
  read() {
    const s = this._readableState;
    s.readCalled = true;
    if (s.buffer.length === 0) { if (s.ended) this._scheduleFlush(); else this._read(); return null; }
    let out;
    if (s.decoder !== null || typeof s.buffer[0] === 'string') out = s.buffer.join('');
    else out = Buffer.concat(s.buffer, s.length);
    s.buffer = []; s.length = 0;
    if (s.ended) this._scheduleFlush(); else this._read();
    return out;
  }
  unshift(chunk) { const s = this._readableState; s.buffer.unshift(chunk); s.length += chunkLength(chunk); }
  pipe(destination, options) {
    const end = !options || options.end !== false;
    const ondata = chunk => { if (destination.write(chunk) === false) { this.pause(); destination.once('drain', () => this.resume()); } };
    this.on('data', ondata);
    if (end) this.once('end', () => destination.end());
    destination.emit('pipe', this);
    this._pipes = (this._pipes || []).concat([{ destination, ondata }]);
    return destination;
  }
  unpipe(destination) {
    for (const pipe of this._pipes || []) if (destination === undefined || pipe.destination === destination) { this.removeListener('data', pipe.ondata); pipe.destination.emit('unpipe', this); }
    this._pipes = (this._pipes || []).filter(pipe => destination !== undefined && pipe.destination !== destination);
    return this;
  }
  destroy(error) {
    const s = this._readableState;
    if (s.destroyed) return this;
    s.destroyed = true;
    if (error) s.errored = error;
    this._destroy(error || null, finalError => {
      queueMicrotask(() => {
        if (finalError) this.emit('error', finalError);
        s.closed = true;
        this.emit('close');
      });
    });
    return this;
  }
  _destroy(error, callback) { callback(error); }
  [Symbol.asyncIterator]() {
    const stream = this, queue = [];
    let done = false, failure = null, waiting = null;
    const settle = () => {
      if (waiting === null) return;
      const w = waiting;
      if (queue.length > 0) { waiting = null; w.resolve({ value: queue.shift(), done: false }); if (queue.length === 0) stream.resume(); }
      else if (failure !== null) { waiting = null; w.reject(failure); }
      else if (done) { waiting = null; w.resolve({ value: undefined, done: true }); }
    };
    stream.on('data', chunk => { queue.push(chunk); if (queue.length >= 16) stream.pause(); settle(); });
    stream.once('end', () => { done = true; settle(); });
    stream.once('error', error => { failure = error; settle(); });
    stream.once('close', () => { if (!done && failure === null) { const e = new Error('Premature close'); e.code = 'ERR_STREAM_PREMATURE_CLOSE'; failure = e; } settle(); });
    return {
      next() { return new Promise((resolve, reject) => { waiting = { resolve, reject }; settle(); }); },
      return() { if (!done) stream.destroy(); done = true; return Promise.resolve({ value: undefined, done: true }); },
      [Symbol.asyncIterator]() { return this; }
    };
  }
}
`;
