/**
 * Source of the built-in `node:events` (alias `nona:events`) module: the
 * Node.js EventEmitter. It is plain JavaScript compiled into the programs that
 * import it (directly or through node:net and node:http).
 */
export const eventsModuleSource=String.raw`
const kCapture = Symbol('kCapture');
let defaultMaxListeners = 10;
function checkListener(listener) {
  if (typeof listener !== 'function') {
    const error = new TypeError('The "listener" argument must be of type function. Received ' + (listener === null ? 'null' : typeof listener === 'object' ? 'an instance of ' + ((listener.constructor && listener.constructor.name) || 'Object') : 'type ' + typeof listener + ' (' + String(listener) + ')'));
    error.code = 'ERR_INVALID_ARG_TYPE';
    throw error;
  }
}
// The listener table is created on the first listener: most emitters made by
// node:http (requests, responses) never get one.
function eventsOf(emitter) {
  if (emitter._events === undefined) {
    emitter._events = Object.create(null);
    emitter._eventsCount = 0;
  }
  return emitter._events;
}
function addListener(emitter, type, listener, prepend) {
  checkListener(listener);
  let events = eventsOf(emitter);
  if (events.newListener !== undefined) {
    emitter.emit('newListener', type, listener.listener ? listener.listener : listener);
    events = emitter._events;
  }
  const existing = events[type];
  if (existing === undefined) { events[type] = listener; emitter._eventsCount++; }
  else if (typeof existing === 'function') events[type] = prepend ? [listener, existing] : [existing, listener];
  else if (prepend) existing.unshift(listener);
  else existing.push(listener);
  const max = emitter.getMaxListeners();
  const count = typeof events[type] === 'function' ? 1 : events[type].length;
  if (max > 0 && count > max && !events[type].warned) {
    if (typeof events[type] !== 'function') events[type].warned = true;
    console.error('(node) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ' + count + ' ' + String(type) + ' listeners added. Use emitter.setMaxListeners() to increase limit');
  }
  return emitter;
}
function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    return this.listener.apply(this.target, arguments);
  }
}
function onceWrap(target, type, listener) {
  const state = { fired: false, wrapFn: undefined, target, type, listener };
  const wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}
export class EventEmitter {
  // The listener table and counters default to the prototype's values and
  // become own properties on the first listener: objects in Nona are
  // property lists, and node:http creates two emitters per request.
  constructor(options) {
    if (options && options.captureRejections) this[kCapture] = true;
  }
  static get defaultMaxListeners() { return defaultMaxListeners; }
  static set defaultMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || n !== n) throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + String(n));
    defaultMaxListeners = n;
  }
  setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || n !== n) throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + String(n));
    this._maxListeners = n;
    return this;
  }
  getMaxListeners() { return this._maxListeners === undefined ? defaultMaxListeners : this._maxListeners; }
  emit(type, ...args) {
    const events = this._events;
    if (type === 'error' && (events === undefined || events.error === undefined)) {
      const er = args[0];
      if (er instanceof Error) throw er;
      const error = new Error('Unhandled error.' + (er === undefined ? '' : ' (' + String(er) + ')'));
      error.code = 'ERR_UNHANDLED_ERROR';
      error.context = er;
      throw error;
    }
    if (events === undefined) return false;
    const handler = events[type];
    if (handler === undefined) return false;
    if (typeof handler === 'function') handler.apply(this, args);
    else {
      const listeners = handler.slice();
      for (let i = 0; i < listeners.length; i++) listeners[i].apply(this, args);
    }
    return true;
  }
  addListener(type, listener) { return addListener(this, type, listener, false); }
  on(type, listener) { return addListener(this, type, listener, false); }
  prependListener(type, listener) { return addListener(this, type, listener, true); }
  once(type, listener) { checkListener(listener); return this.on(type, onceWrap(this, type, listener)); }
  prependOnceListener(type, listener) { checkListener(listener); return this.prependListener(type, onceWrap(this, type, listener)); }
  removeListener(type, listener) {
    checkListener(listener);
    const events = this._events;
    if (events === undefined) return this;
    const list = events[type];
    if (list === undefined) return this;
    if (list === listener || list.listener === listener) {
      if (--this._eventsCount === 0) this._events = Object.create(null);
      else delete events[type];
      if (events.removeListener) this.emit('removeListener', type, list.listener || listener);
    } else if (typeof list !== 'function') {
      let position = -1;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] === listener || list[i].listener === listener) { position = i; break; }
      }
      if (position < 0) return this;
      const removed = list[position];
      list.splice(position, 1);
      if (list.length === 1) events[type] = list[0];
      if (events.removeListener !== undefined) this.emit('removeListener', type, removed.listener || listener);
    }
    return this;
  }
  off(type, listener) { return this.removeListener(type, listener); }
  removeAllListeners(type) {
    const events = this._events;
    if (events === undefined) return this;
    if (events.removeListener === undefined) {
      if (arguments.length === 0) { this._events = Object.create(null); this._eventsCount = 0; }
      else if (events[type] !== undefined) {
        if (--this._eventsCount === 0) this._events = Object.create(null);
        else delete events[type];
      }
      return this;
    }
    if (arguments.length === 0) {
      for (const key of Reflect.ownKeys(events)) {
        if (key === 'removeListener') continue;
        this.removeAllListeners(key);
      }
      this.removeAllListeners('removeListener');
      this._events = Object.create(null);
      this._eventsCount = 0;
      return this;
    }
    const listeners = events[type];
    if (typeof listeners === 'function') this.removeListener(type, listeners);
    else if (listeners !== undefined) for (let i = listeners.length - 1; i >= 0; i--) this.removeListener(type, listeners[i]);
    return this;
  }
  listeners(type) {
    const list = this._events === undefined ? undefined : this._events[type];
    if (list === undefined) return [];
    if (typeof list === 'function') return [list.listener || list];
    return list.map(l => l.listener || l);
  }
  rawListeners(type) {
    const list = this._events === undefined ? undefined : this._events[type];
    if (list === undefined) return [];
    return typeof list === 'function' ? [list] : list.slice();
  }
  listenerCount(type, listener) {
    const list = this._events === undefined ? undefined : this._events[type];
    if (list === undefined) return 0;
    if (typeof list === 'function') return listener === undefined || list === listener || list.listener === listener ? 1 : 0;
    if (listener === undefined) return list.length;
    let count = 0;
    for (let i = 0; i < list.length; i++) if (list[i] === listener || list[i].listener === listener) count++;
    return count;
  }
  eventNames() { return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : []; }
}
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.captureRejectionSymbol = Symbol.for('nodejs.rejection');
EventEmitter.errorMonitor = Symbol('events.errorMonitor');
export const errorMonitor = EventEmitter.errorMonitor;
export const captureRejectionSymbol = EventEmitter.captureRejectionSymbol;
export function once(emitter, name) {
  return new Promise((resolve, reject) => {
    const errorListener = error => { emitter.removeListener(name, resolver); reject(error); };
    const resolver = (...args) => { if (name !== 'error') emitter.removeListener('error', errorListener); resolve(args); };
    emitter.once(name, resolver);
    if (name !== 'error') emitter.once('error', errorListener);
  });
}
export function listenerCount(emitter, type) { return emitter.listenerCount(type); }
export function getEventListeners(emitter, type) { return emitter.listeners(type); }
export function setMaxListeners(n, ...targets) {
  if (targets.length === 0) EventEmitter.defaultMaxListeners = n;
  else for (const target of targets) target.setMaxListeners(n);
}
EventEmitter.once = once;
EventEmitter.listenerCount = listenerCount;
EventEmitter.getEventListeners = getEventListeners;
EventEmitter.setMaxListeners = setMaxListeners;
export default EventEmitter;
`;
