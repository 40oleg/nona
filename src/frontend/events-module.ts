/** Node-compatible event emitters and asynchronous event helpers. */
export const eventsModuleSource=String.raw`
export const errorMonitor = Symbol('events.errorMonitor');
export const captureRejectionSymbol = Symbol.for('nodejs.rejection');
export let defaultMaxListeners = 10;
export let captureRejections = false;
const capture = Symbol('capture');
function invalid(name) { const e = new TypeError('The "' + name + '" argument is invalid'); e.code = 'ERR_INVALID_ARG_TYPE'; return e; }
function checkListener(listener) { if (typeof listener !== 'function') throw invalid('listener'); }
function checkMax(n) { if (typeof n !== 'number') throw invalid('n'); if (n < 0 || Number.isNaN(n)) { const e = new RangeError('The value of "n" is out of range'); e.code = 'ERR_OUT_OF_RANGE'; throw e; } }
function init(emitter) { if (!Object.prototype.hasOwnProperty.call(emitter, '_events')) { emitter._events = Object.create(null); emitter._eventsCount = 0; } }
export function EventEmitter(options) {
  init(this);
  this._maxListeners = undefined;
  const enabled = options && options.captureRejections;
  if (enabled !== undefined && typeof enabled !== 'boolean') throw invalid('options.captureRejections');
  this[capture] = enabled === undefined ? captureRejections : enabled;
}
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;
function add(emitter, name, listener, prepend) {
  checkListener(listener); init(emitter);
  if (emitter._events.newListener) emitter.emit('newListener', name, listener.listener || listener);
  let list = emitter._events[name];
  if (!list) { list = []; emitter._events[name] = list; emitter._eventsCount++; }
  if (prepend) list.unshift(listener); else list.push(listener);
  const max = emitter.getMaxListeners();
  if (max > 0 && list.length > max && !list.warned) {
    list.warned = true;
    const warning = new Error('Possible EventEmitter memory leak detected. ' + list.length + ' ' + String(name) + ' listeners added. MaxListeners is ' + max + '. Use emitter.setMaxListeners() to increase limit');
    warning.name = 'MaxListenersExceededWarning'; warning.emitter = emitter; warning.type = name; warning.count = list.length;
    if (typeof process.emitWarning === 'function') process.emitWarning(warning);
  }
  return emitter;
}
EventEmitter.prototype.addListener = function(name, listener) { return add(this, name, listener, false); };
EventEmitter.prototype.on = EventEmitter.prototype.addListener;
EventEmitter.prototype.prependListener = function(name, listener) { return add(this, name, listener, true); };
function onceListener(emitter, name, listener, prepend) {
  checkListener(listener);
  let fired = false;
  function wrapped(...args) {
    if (fired) return;
    fired = true; emitter.removeListener(name, wrapped);
    return listener.apply(emitter, args);
  }
  wrapped.listener = listener;
  return add(emitter, name, wrapped, prepend);
}
EventEmitter.prototype.once = function(name, listener) { return onceListener(this, name, listener, false); };
EventEmitter.prototype.prependOnceListener = function(name, listener) { return onceListener(this, name, listener, true); };
EventEmitter.prototype.removeListener = function(name, listener) {
  checkListener(listener); init(this);
  const list = this._events[name];
  if (!list) return this;
  for (let i = list.length - 1; i >= 0; i--) {
    const current = list[i];
    if (current === listener || current.listener === listener) {
      list.splice(i, 1);
      if (!list.length) { delete this._events[name]; this._eventsCount--; }
      if (this._events.removeListener) this.emit('removeListener', name, current.listener || current);
      break;
    }
  }
  return this;
};
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.removeAllListeners = function(name) {
  init(this);
  if (arguments.length === 0) {
    const names = Reflect.ownKeys(this._events);
    for (const key of names) if (key !== 'removeListener') this.removeAllListeners(key);
    this.removeAllListeners('removeListener');
    this._events = Object.create(null); this._eventsCount = 0;
  } else {
    const list = this._events[name];
    if (list) {
      if (this._events.removeListener) { const snapshot = list.slice(); for (let i = snapshot.length - 1; i >= 0; i--) this.removeListener(name, snapshot[i]); }
      else { delete this._events[name]; this._eventsCount--; }
    }
  }
  return this;
};
EventEmitter.prototype.emit = function(name, ...args) {
  init(this);
  if (name === 'error') {
    if (this._events[errorMonitor]) this.emit(errorMonitor, ...args);
    if (!this._events.error) {
      const value = args[0];
      if (value instanceof Error) throw value;
      const e = new Error('Unhandled error. (' + String(value) + ')'); e.code = 'ERR_UNHANDLED_ERROR'; e.context = value; throw e;
    }
  }
  const list = this._events[name];
  if (!list) return false;
  for (const listener of list.slice()) {
    const result = listener.apply(this, args);
    if (this[capture] && result != null) {
      try {
        const then = result.then;
        if (typeof then === 'function') then.call(result, undefined, error => queueMicrotask(() => {
          if (typeof this[captureRejectionSymbol] === 'function') this[captureRejectionSymbol](error, name, ...args);
          else { const previous = this[capture]; this[capture] = false; try { this.emit('error', error); } finally { this[capture] = previous; } }
        }));
      } catch (error) { this.emit('error', error); }
    }
  }
  return true;
};
EventEmitter.prototype.rawListeners = function(name) { init(this); const list = this._events[name]; return list ? list.slice() : []; };
EventEmitter.prototype.listeners = function(name) { return this.rawListeners(name).map(fn => fn.listener || fn); };
EventEmitter.prototype.listenerCount = function(name, listener) { const list = this.rawListeners(name); if (listener === undefined) return list.length; return list.filter(fn => fn === listener || fn.listener === listener).length; };
EventEmitter.prototype.eventNames = function() { init(this); return Reflect.ownKeys(this._events); };
EventEmitter.prototype.setMaxListeners = function(n) { checkMax(n); this._maxListeners = n; return this; };
EventEmitter.prototype.getMaxListeners = function() { return this._maxListeners === undefined ? defaultMaxListeners : this._maxListeners; };
export function listenerCount(emitter, name) { return emitter.listenerCount(name); }
export function getEventListeners(emitter, name) { if (typeof emitter.listeners === 'function') return emitter.listeners(name); throw invalid('emitter'); }
export function getMaxListeners(emitter) { if (typeof emitter.getMaxListeners === 'function') return emitter.getMaxListeners(); throw invalid('emitter'); }
export function setMaxListeners(n, ...targets) { checkMax(n); if (!targets.length) defaultMaxListeners = n; else for (const target of targets) target.setMaxListeners(n); }
function abortError(signal) { const e = new Error('The operation was aborted'); e.name = 'AbortError'; e.code = 'ABORT_ERR'; e.cause = signal.reason; return e; }
function subscribe(target, name, listener) { if (typeof target.on === 'function') target.on(name, listener); else target.addEventListener(name, listener); }
function unsubscribe(target, name, listener) { if (typeof target.removeListener === 'function') target.removeListener(name, listener); else target.removeEventListener(name, listener); }
export function once(emitter, name, options) {
  const signal = options && options.signal;
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError(signal)); return; }
    function cleanup() { unsubscribe(emitter, name, event); if (name !== 'error' && typeof emitter.on === 'function') unsubscribe(emitter, 'error', error); if (signal) signal.removeEventListener('abort', aborted); }
    function event(...args) { cleanup(); resolve(args); }
    function error(value) { cleanup(); reject(value); }
    function aborted() { cleanup(); reject(abortError(signal)); }
    subscribe(emitter, name, event);
    if (name !== 'error' && typeof emitter.on === 'function') subscribe(emitter, 'error', error);
    if (signal) signal.addEventListener('abort', aborted, {once:true});
  });
}
export function on(emitter, name, options) {
  options = options || {};
  const signal = options.signal, close = options.close || [];
  const values = [], waiting = [];
  let ended = false, failure, paused = false;
  const high = options.highWaterMark === undefined ? Number.MAX_SAFE_INTEGER : options.highWaterMark;
  const low = options.lowWaterMark === undefined ? 1 : options.lowWaterMark;
  function cleanup() { unsubscribe(emitter, name, event); if (name !== 'error' && typeof emitter.on === 'function') unsubscribe(emitter, 'error', error); for (const key of close) unsubscribe(emitter, key, finish); if (signal) signal.removeEventListener('abort', aborted); }
  function finish() { if (ended) return; ended = true; cleanup(); while (waiting.length) waiting.shift().resolve({value:undefined,done:true}); }
  function error(value) { if (ended) return; failure = value; ended = true; cleanup(); if (waiting.length) { waiting.shift().reject(value); failure = undefined; while (waiting.length) waiting.shift().resolve({value:undefined,done:true}); } }
  function aborted() { error(abortError(signal)); }
  function event(...args) { if (waiting.length) waiting.shift().resolve({value:args,done:false}); else { values.push(args); if (!paused && values.length > high) { paused = true; emitter.pause(); } } }
  const iterator = {
    next() { if (values.length) { const value = values.shift(); if (paused && values.length < low) { paused = false; emitter.resume(); } return Promise.resolve({value,done:false}); } if (failure !== undefined) { const e = failure; failure = undefined; return Promise.reject(e); } if (ended) return Promise.resolve({value:undefined,done:true}); return new Promise((resolve,reject) => waiting.push({resolve,reject})); },
    return() { finish(); return Promise.resolve({value:undefined,done:true}); },
    throw(errorValue) { if (!(errorValue instanceof Error)) throw invalid('error'); error(errorValue); return Promise.resolve({value:undefined,done:true}); },
    [Symbol.asyncIterator]() { return this; }
  };
  if (signal && signal.aborted) throw abortError(signal);
  subscribe(emitter, name, event);
  if (name !== 'error' && typeof emitter.on === 'function') subscribe(emitter, 'error', error);
  for (const key of close) subscribe(emitter, key, finish);
  if (signal) signal.addEventListener('abort', aborted, {once:true});
  return iterator;
}
export function addAbortListener(signal, listener) {
  checkListener(listener);
  let active = true;
  function aborted() { if (!active) return; active = false; signal.removeEventListener('abort', aborted); listener(); }
  if (signal.aborted) queueMicrotask(aborted); else signal.addEventListener('abort', aborted, {once:true});
  return {[Symbol.dispose || Symbol.for('nodejs.dispose')]() { active = false; signal.removeEventListener('abort', aborted); }};
}
Object.defineProperty(EventEmitter, 'defaultMaxListeners', {enumerable:true,get() { return defaultMaxListeners; },set(n) { checkMax(n); defaultMaxListeners = n; }});
Object.defineProperty(EventEmitter, 'captureRejections', {enumerable:true,get() { return captureRejections; },set(value) { if (typeof value !== 'boolean') throw invalid('captureRejections'); captureRejections = value; }});
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.errorMonitor = errorMonitor;
EventEmitter.captureRejectionSymbol = captureRejectionSymbol;
EventEmitter.once = once; EventEmitter.on = on; EventEmitter.listenerCount = listenerCount;
EventEmitter.getEventListeners = getEventListeners; EventEmitter.getMaxListeners = getMaxListeners;
EventEmitter.setMaxListeners = setMaxListeners; EventEmitter.addAbortListener = addAbortListener;
export default EventEmitter;
`;

