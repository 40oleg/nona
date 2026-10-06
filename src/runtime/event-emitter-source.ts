import {eventsModuleSource} from '../frontend/events-module.js';

/** Reuse Nona's original Events algorithms for canonical process/stream ancestry. */
export const eventEmitterPreludeSource=(()=>{
 const implementation=eventsModuleSource.replace(/^import .*$/gm,'').replace('export default EventEmitter;','').replace(/\bexport /g,'')
  .replaceAll('list.push(listener)','emitterApply(emitterPush,list,[listener])')
  .replaceAll('list.unshift(listener)','emitterApply(emitterUnshift,list,[listener])')
  .replaceAll('list.splice(i, 1)','emitterApply(emitterSplice,list,[i,1])')
  .replaceAll('Object.create(null)','emitterCreate(null)')
  .replaceAll('defaultMaxListeners = n;','defaultMaxListeners = n;updateExports();')
  .replace('captureRejections = value;','captureRejections = value;updateExports();')
  .replace('  let list = emitter._events[name];','  if(emitter===vm.processSignalEmitter)vm.processSignalListenerChanged(name,true);\n  let list = emitter._events[name];')
  .replace("      if (this._events.removeListener) this.emit('removeListener', name, current.listener || current);","      if(this===vm.processSignalEmitter)vm.processSignalListenerChanged(name,false);\n      if (this._events.removeListener) this.emit('removeListener', name, current.listener || current);")
  .replace('else { delete this._events[name]; this._eventsCount--; }','else { delete this._events[name]; this._eventsCount--;if(this===vm.processSignalEmitter)vm.processSignalListenerChanged(name,false); }');
 return `;(function(){
 var vm=__nonaRegexpVm,subscribers=[];
 function AsyncResource(type,options){var constructor=EventTarget[Symbol.for('nona.async_hooks.internal')].AsyncResource;return new constructor(type,options)}
 var emitterApply=Reflect.apply,emitterPush=Array.prototype.push,emitterUnshift=Array.prototype.unshift,emitterSplice=Array.prototype.splice,emitterCreate=Object.create;
 function updateExports(){for(var subscriber of subscribers)subscriber(defaultMaxListeners,captureRejections)}
 ${implementation}
 vm.eventEmitterModule=EventEmitter;
 Object.defineProperty(EventTarget,Symbol.for('nona.events.emitter'),{value:{EventEmitter:EventEmitter,subscribe:function(callback){subscribers.push(callback);callback(defaultMaxListeners,captureRejections)}}});
 })();`;
})();
