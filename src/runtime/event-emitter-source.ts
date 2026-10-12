import {patchSource} from '../source-patch.js';
import {eventsModuleSource} from './events-module-source.js';

/** Reuse Nona's original Events algorithms for canonical process/stream ancestry. */
export const eventEmitterPreludeSource=(()=>{
 let implementation=eventsModuleSource.replace(/^import .*$/gm,'');
 implementation=patchSource(implementation,'export default EventEmitter;','');
 implementation=patchSource(implementation,/\bexport /g,'');
 implementation=patchSource(implementation,'list.push(listener)','emitterApply(emitterPush,list,[listener])',{all:true});
 implementation=patchSource(implementation,'list.unshift(listener)','emitterApply(emitterUnshift,list,[listener])',{all:true});
 implementation=patchSource(implementation,'list.splice(i, 1)','emitterApply(emitterSplice,list,[i,1])',{all:true});
 implementation=patchSource(implementation,'Object.create(null)','emitterCreate(null)',{all:true});
 implementation=patchSource(implementation,'Symbol.for(','emitterSymbolFor(',{all:true});
 implementation=patchSource(implementation,'defaultMaxListeners = n;','defaultMaxListeners = n;updateExports();',{all:true});
 implementation=patchSource(implementation,'captureRejections = value;','captureRejections = value;updateExports();');
 implementation=patchSource(implementation,'  let list = emitter._events[name];','  if(emitter===vm.processSignalEmitter)vm.processSignalListenerChanged(name,true);\n  let list = emitter._events[name];');
 implementation=patchSource(implementation,"      if (this._events.removeListener) this.emit('removeListener', name, current.listener || current);","      if(this===vm.processSignalEmitter)vm.processSignalListenerChanged(name,false);\n      if (this._events.removeListener) this.emit('removeListener', name, current.listener || current);");
 implementation=patchSource(implementation,'else { delete this._events[name]; this._eventsCount--; }','else { delete this._events[name]; this._eventsCount--;if(this===vm.processSignalEmitter)vm.processSignalListenerChanged(name,false); }');
 return `;(function(){
 var vm=__nonaRegexpVm,subscribers=[],initialized=null;
 var EventTarget=globalThis.EventTarget,Event=globalThis.Event,Promise=globalThis.Promise,Symbol=globalThis.Symbol;
 var Error=globalThis.Error,TypeError=globalThis.TypeError,RangeError=globalThis.RangeError;
 var Object={create:globalThis.Object.create,defineProperty:globalThis.Object.defineProperty,prototype:globalThis.Object.prototype};
 var Number={isNaN:globalThis.Number.isNaN,isSafeInteger:globalThis.Number.isSafeInteger,MAX_SAFE_INTEGER:globalThis.Number.MAX_SAFE_INTEGER};
 var Reflect={apply:globalThis.Reflect.apply,ownKeys:globalThis.Reflect.ownKeys};
 var emitterSymbolFor=Symbol.for;
 function AsyncResource(type,options){var constructor=EventTarget[Symbol.for('nona.async_hooks.internal')].AsyncResource;return new constructor(type,options)}
 var emitterApply=Reflect.apply,emitterPush=Array.prototype.push,emitterUnshift=Array.prototype.unshift,emitterSplice=Array.prototype.splice,emitterCreate=Object.create;
 function initialize(){if(initialized)return initialized;
 function updateExports(){for(var subscriber of subscribers)subscriber(defaultMaxListeners,captureRejections)}
 ${implementation}
 var bridge={EventEmitter:EventEmitter,subscribe:function(callback){subscribers.push(callback);callback(defaultMaxListeners,captureRejections)}};
 initialized=bridge;return bridge;
 }
 Object.defineProperty(vm,'eventEmitterModule',{get:function(){return initialize().EventEmitter}});
 Object.defineProperty(EventTarget,emitterSymbolFor('nona.events.emitter'),{get:initialize});
 })();`;
})();
