import type {Target} from '../target.js';

/** Thin providers expose the same original constructor as process and streams. */
export function eventsModuleForTarget(_target:Target):string {return String.raw`
const bridge=EventTarget[Symbol.for('nona.events.emitter')];
export const EventEmitter=bridge.EventEmitter;
export default EventEmitter;
export let defaultMaxListeners=EventEmitter.defaultMaxListeners,captureRejections=EventEmitter.captureRejections;
export const errorMonitor=EventEmitter.errorMonitor,captureRejectionSymbol=EventEmitter.captureRejectionSymbol;
export const once=EventEmitter.once,on=EventEmitter.on,listenerCount=EventEmitter.listenerCount,getEventListeners=EventEmitter.getEventListeners,getMaxListeners=EventEmitter.getMaxListeners,setMaxListeners=EventEmitter.setMaxListeners,addAbortListener=EventEmitter.addAbortListener,NodeEventTarget=EventEmitter.NodeEventTarget,EventEmitterAsyncResource=EventEmitter.EventEmitterAsyncResource;
bridge.subscribe(function(maximum,capture){defaultMaxListeners=maximum;captureRejections=capture});
`}
