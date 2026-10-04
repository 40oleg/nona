/**
 * Source of `nona:internal/stream`: the readable side shared by net.Socket
 * and http.IncomingMessage. It follows the observable behaviour of Node.js
 * Readable streams in flowing mode (`data`/`end`/`close`, pause/resume,
 * setEncoding, pipe, async iteration) without the full node:stream API.
 *
 * Every HTTP request is one of these, so the state lives in a few fields of
 * the object itself (no state record, no queue until a chunk has to wait),
 * and deferred work is only scheduled when there is something to deliver.
 * Deferred events use queueMicrotask where Node.js uses process.nextTick.
 */
export const streamModuleSource=String.raw`
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { Buffer } from 'node:buffer';
export class Readable extends EventEmitter {
  constructor(options) {
    super();
    if (options && options.highWaterMark) this._hwm = options.highWaterMark;
  }
  get readable() { return !this._destroyed && !this._endEmitted && !this._errored; }
  get readableEnded() { return this._endEmitted; }
  get readableFlowing() { return this._flowing; }
  get readableLength() { return this._queued; }
  get readableEncoding() { return this._decoder === null ? null : this._decoder.encoding; }
  get readableHighWaterMark() { return this._hwm; }
  get destroyed() { return this._destroyed; }
  get errored() { return this._errored; }
  get closed() { return this._closed; }
  /** Producer side: a chunk (Buffer), or null at the end of the data. */
  push(chunk) {
    if (this._destroyed || this._ended) return false;
    if (chunk === null) { this._ended = true; this._scheduleFlush(); return false; }
    let value = chunk;
    if (this._decoder !== null) { value = this._decoder.write(chunk); if (value === '') return this._queued < this._hwm; }
    if (this._flowing === true && this._queued === 0 && !this._flushScheduled) { this.emit('data', value); return true; }
    if (this._queue === null) this._queue = [];
    this._queue.push(value);
    this._queued += value.length;
    if (this._flowing === true) this._scheduleFlush();
    return this._queued < this._hwm;
  }
  /** Consumer wants data again (after a pause): producers resume reading. */
  _read() {}
  _scheduleFlush() {
    // Without a consumer nothing is delivered; resume() or read() schedules again.
    if (this._flushScheduled || (this._flowing !== true && !this._readCalled)) return;
    this._flushScheduled = true;
    queueMicrotask(() => { this._flushScheduled = false; this._flush(); });
  }
  _flush() {
    const queue = this._queue;
    while (this._flowing === true && queue !== null && queue.length > 0 && !this._destroyed) {
      const chunk = queue.shift();
      this._queued -= chunk.length;
      this.emit('data', chunk);
    }
    // A drained buffer asks the producer for more (a paused socket resumes).
    if (this._flowing === true && !this._ended && !this._destroyed && this._queued < this._hwm) this._read();
    if (this._ended && this._queued === 0 && !this._endEmitted && !this._destroyed && (this._flowing === true || this._readCalled)) {
      if (this._decoder !== null) { const rest = this._decoder.end(); this._decoder = new StringDecoder(this._decoder.encoding); if (rest !== '') this.emit('data', rest); }
      this._endEmitted = true;
      this.emit('end');
      this._ended_();
    }
  }
  /** Called once 'end' has been emitted. */
  _ended_() {}
  on(type, listener) {
    super.on(type, listener);
    if (type === 'data' && this._flowing !== false) this.resume();
    else if (type === 'readable' && !this._endEmitted) {
      this._flowing = false;
      queueMicrotask(() => { if (this._queued > 0 || this._ended) this.emit('readable'); });
    }
    return this;
  }
  addListener(type, listener) { return this.on(type, listener); }
  resume() {
    if (this._flowing !== true) {
      this._flowing = true;
      if (this._events !== undefined && this._events.resume !== undefined) queueMicrotask(() => { if (this._flowing === true) this.emit('resume'); });
      this._read();
      if (this._queued > 0 || this._ended) this._scheduleFlush();
    }
    return this;
  }
  pause() {
    if (this._flowing !== false) { this._flowing = false; this.emit('pause'); }
    return this;
  }
  isPaused() { return this._flowing === false; }
  setEncoding(encoding) {
    this._decoder = new StringDecoder(encoding);
    const queue = this._queue;
    if (queue !== null && queue.length > 0) {
      let text = '';
      for (const chunk of queue) text += typeof chunk === 'string' ? chunk : this._decoder.write(chunk);
      this._queue = text === '' ? [] : [text];
      this._queued = text.length;
    }
    return this;
  }
  read() {
    this._readCalled = true;
    const queue = this._queue;
    if (queue === null || queue.length === 0) { if (this._ended) this._scheduleFlush(); else this._read(); return null; }
    const out = this._decoder !== null || typeof queue[0] === 'string' ? queue.join('') : Buffer.concat(queue, this._queued);
    this._queue = []; this._queued = 0;
    if (this._ended) this._scheduleFlush(); else this._read();
    return out;
  }
  unshift(chunk) { if (this._queue === null) this._queue = []; this._queue.unshift(chunk); this._queued += chunk.length; }
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
    if (this._destroyed) return this;
    this._destroyed = true;
    if (error) this._errored = error;
    this._destroy(error || null, finalError => {
      queueMicrotask(() => {
        if (finalError) this.emit('error', finalError);
        this._closed = true;
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
/**
 * Defines the initial values of instance fields on a prototype (writable,
 * not enumerable): an instance only gets its own property when a field is
 * first written, so short-lived objects stay small.
 */
export function defaults(proto, values) {
  for (const key of Object.keys(values)) Object.defineProperty(proto, key, { value: values[key], writable: true, configurable: true });
}
defaults(Readable.prototype, {
  _queue: null,          // chunks waiting for a consumer
  _queued: 0,            // their total length
  _flowing: null,        // null: no consumer yet; true; false: paused
  _ended: false,         // push(null) seen
  _endEmitted: false, _decoder: null, _destroyed: false, _closed: false, _errored: null,
  _flushScheduled: false, _readCalled: false, _hwm: 16384, _pipes: null
});
`;
