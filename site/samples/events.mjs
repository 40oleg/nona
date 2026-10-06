import EventEmitter, {once} from 'node:events';

const emitter = new EventEmitter();
emitter.once('ready', value => console.log('ready:', value));
const received = once(emitter, 'ready');
emitter.emit('ready', 'Nona');
received.then(([value]) => console.log('received:', value));
