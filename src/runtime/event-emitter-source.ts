import { patchSource } from "../source-patch.js";
import { eventsModuleSource } from "./events-module-source.js";

/** Reuse Nona's original Events algorithms for canonical process/stream ancestry. */
export const eventEmitterPreludeSource = (() => {
    let implementation = eventsModuleSource.replace(/^import .*$/gm, "");
    implementation = patchSource(
        implementation,
        "export default EventEmitter;",
        "",
    );
    implementation = patchSource(implementation, /\bexport /g, "");
    // An element store, not a method call: it cannot be redirected by a
    // changed Array.prototype.push, and Reflect.apply (a prelude function)
    // costs about two thousand instructions per listener.
    implementation = patchSource(
        implementation,
        "list.push(listener)",
        "list[list.length]=listener",
        { all: true },
    );
    implementation = patchSource(
        implementation,
        "list.unshift(listener)",
        "emitterApply(emitterUnshift,list,[listener])",
        { all: true },
    );
    implementation = patchSource(
        implementation,
        "list.splice(i, 1)",
        "emitterApply(emitterSplice,list,[i,1])",
        { all: true },
    );
    implementation = patchSource(
        implementation,
        "Symbol.for(",
        "emitterSymbolFor(",
        { all: true },
    );
    implementation = patchSource(
        implementation,
        /(?<!\.)defaultMaxListeners = n;/g,
        "defaultMaxListeners = n;updateExports();",
    );
    implementation = patchSource(
        implementation,
        "captureRejections = value;",
        "captureRejections = value;updateExports();",
    );
    implementation = patchSource(
        implementation,
        "let list = events[name];",
        "if(emitter===processSignalEmitter)vm.processSignalListenerChanged(name,true);\nlet list = events[name];",
    );
    implementation = patchSource(
        implementation,
        /if \(this\._events\.removeListener\)\s*this\.emit\("removeListener", name, current\.listener \|\| current\);/,
        (match) =>
            "if(this===processSignalEmitter)vm.processSignalListenerChanged(name,false);\n" +
            match,
    );
    implementation = patchSource(
        implementation,
        /\} else \{\s*delete this\._events\[name\];\s*this\._eventsCount--;/,
        (match) =>
            match +
            "if(this===processSignalEmitter)vm.processSignalListenerChanged(name,false);",
    );
    return `;(function(){
 var vm=__nonaRegexpVm,subscribers=[],initialized=null;
 var EventTarget=globalThis.EventTarget,Event=globalThis.Event,Promise=globalThis.Promise,Symbol=globalThis.Symbol;
 var Error=globalThis.Error,TypeError=globalThis.TypeError,RangeError=globalThis.RangeError;
 var Object={create:globalThis.Object.create,defineProperty:globalThis.Object.defineProperty,prototype:globalThis.Object.prototype};
 var Number={isNaN:globalThis.Number.isNaN,isSafeInteger:globalThis.Number.isSafeInteger,MAX_SAFE_INTEGER:globalThis.Number.MAX_SAFE_INTEGER};
 var Reflect={apply:globalThis.Reflect.apply,ownKeys:globalThis.Reflect.ownKeys};
 var emitterSymbolFor=Symbol.for;
 function AsyncResource(type,options){var constructor=EventTarget[Symbol.for('nona.async_hooks.internal')].AsyncResource;return new constructor(type,options)}
 var emitterApply=Reflect.apply,emitterUnshift=Array.prototype.unshift,emitterSplice=Array.prototype.splice;
 // The process object (process-signals.js sets it): every addListener compares
 // against it, and a read of an absent property of the prelude object scans
 // its whole property list, so it lives in a variable behind an accessor.
 var processSignalEmitter=vm.processSignalEmitter;
 Object.defineProperty(vm,'processSignalEmitter',{get:function(){return processSignalEmitter},set:function(value){processSignalEmitter=value},enumerable:true,configurable:true});
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
