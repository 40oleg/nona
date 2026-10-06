/** Manual asynchronous resources and context capture, implemented by Nona. */
export const asyncHooksPreludeSource=String.raw`;(function(){
 var resources=new WeakMap(),locals=new WeakMap(),hooks=[],nextId=2,current={id:1,trigger:0,resource:{},stores:new Map()};
 function replaceContext(context){current=context;api.activeRecord=context}
 function notify(name,args){for(var hook of hooks.slice())if(hook.enabled&&typeof hook.callbacks[name]==='function')Reflect.apply(hook.callbacks[name],undefined,args)}
 function resourceState(resource){var s=resources.get(resource);if(!s)throw new TypeError('Invalid AsyncResource receiver');return s}
 function enter(context,fn,receiver,args){var previous=current;replaceContext(context);notify('before',[context.id]);try{return Reflect.apply(fn,receiver,args)}finally{notify('after',[context.id]);replaceContext(previous)}}
 function AsyncResource(type,options){if(!new.target)throw new TypeError('AsyncResource requires new');if(typeof type!=='string')throw new TypeError('type must be a string');if(type.length===0)throw new TypeError('type must not be empty');options=typeof options==='number'?{triggerAsyncId:options}:options||{};var trigger=options.triggerAsyncId===undefined?current.id:options.triggerAsyncId;if(!Number.isInteger(trigger)||trigger< -1)throw new RangeError('triggerAsyncId out of range');var s={id:nextId++,trigger:trigger,resource:this,stores:new Map(current.stores),destroyed:false};resources.set(this,s);notify('init',[s.id,type,s.trigger,this])}
 AsyncResource.prototype.asyncId=function(){return resourceState(this).id};AsyncResource.prototype.triggerAsyncId=function(){return resourceState(this).trigger};
 AsyncResource.prototype.runInAsyncScope=function(fn,receiver,...args){if(typeof fn!=='function')throw new TypeError('fn must be a function');return enter(resourceState(this),fn,receiver,args)};
 AsyncResource.prototype.emitDestroy=function(){var s=resourceState(this);if(!s.destroyed){s.destroyed=true;queueMicrotask(function(){notify('destroy',[s.id])})}return this};
 AsyncResource.prototype.bind=function(fn,receiver){if(typeof fn!=='function')throw new TypeError('fn must be a function');var resource=this,hasReceiver=arguments.length>1;function bound(...args){return resource.runInAsyncScope(fn,hasReceiver?receiver:this,...args)}Object.defineProperty(bound,'length',{value:fn.length});bound.asyncResource=resource;return bound};
 AsyncResource.bind=function(fn,type,receiver){var resource=new AsyncResource(type||fn.name||'bound-anonymous-fn');return arguments.length>2?resource.bind(fn,receiver):resource.bind(fn)};
 function localState(local){var s=locals.get(local);if(!s)throw new TypeError('Invalid AsyncLocalStorage receiver');return s}
 function AsyncLocalStorage(options){if(!new.target)throw new TypeError('AsyncLocalStorage requires new');options=options||{};locals.set(this,{defaultValue:options.defaultValue});Object.defineProperty(this,'name',{value:options.name===undefined?'':String(options.name),enumerable:true})}
 AsyncLocalStorage.prototype.getStore=function(){var s=localState(this),entry=current.stores.get(this);return entry?entry.value:s.defaultValue};
 function contextWithStores(stores){return {id:current.id,trigger:current.trigger,resource:current.resource,stores:stores}}
 AsyncLocalStorage.prototype.run=function(store,fn,...args){if(typeof fn!=='function')throw new TypeError('callback must be a function');localState(this);var previous=current,next=new Map(previous.stores);next.set(this,{value:store});replaceContext(contextWithStores(next));try{return Reflect.apply(fn,undefined,args)}finally{replaceContext(previous)}};
 AsyncLocalStorage.prototype.enterWith=function(store){localState(this);var next=new Map(current.stores);next.set(this,{value:store});replaceContext(contextWithStores(next))};
 AsyncLocalStorage.prototype.exit=function(fn,...args){localState(this);var previous=current,next=new Map(previous.stores);next.delete(this);replaceContext(contextWithStores(next));try{return Reflect.apply(fn,undefined,args)}finally{replaceContext(previous)}};
 AsyncLocalStorage.prototype.disable=function(){localState(this);var next=new Map(current.stores);next.delete(this);replaceContext(contextWithStores(next))};
 // Context changes replace their record. Reactions can retain the existing
 // record without copying a Map, including the shared empty root context.
 // The wrapper still restores that context when invoked from another scope.
 function capture(fn){var context=current;return function(...args){var previous=current;replaceContext(context);try{return Reflect.apply(fn,this,args)}finally{replaceContext(previous)}}}
 function runCaptured(context,fn,receiver,args){var previous=current;replaceContext(context);try{return Reflect.apply(fn,receiver,args)}finally{replaceContext(previous)}}
 function runCapturedUnary(context,fn,value){var previous=current;replaceContext(context);try{return fn(value)}finally{replaceContext(previous)}}
 function runCapturedNullary(context,fn){var previous=current;replaceContext(context);try{return fn()}finally{replaceContext(previous)}}
 AsyncLocalStorage.bind=function(fn){if(typeof fn!=='function'){var error=new TypeError('fn must be a function');if(fn!==undefined&&fn!==null)error.code='ERR_INVALID_ARG_TYPE';throw error}return capture(fn)};AsyncLocalStorage.snapshot=function(){var context=capture(function(fn,...args){return fn(...args)});return context};
 var api={AsyncResource:AsyncResource,AsyncLocalStorage:AsyncLocalStorage,executionAsyncId:function(){return current.id},triggerAsyncId:function(){return current.trigger},executionAsyncResource:function(){return current.resource},createHook:function(callbacks){if(!callbacks||typeof callbacks!=='object')throw new TypeError('callbacks must be an object');for(var name of ['init','before','after','destroy','promiseResolve'])if(callbacks[name]!==undefined&&typeof callbacks[name]!=='function')throw new TypeError(name+' must be a function');var hook={callbacks:callbacks,enabled:false,enable:function(){if(!this.enabled){this.enabled=true;hooks.push(this)}return this},disable:function(){this.enabled=false;var i=hooks.indexOf(this);if(i>=0)hooks.splice(i,1);return this}};return hook},capture:capture};
 api.activeRecord=current;api.restoreRecord=replaceContext;api.captureRecord=function(){return current};api.runCaptured=runCaptured;api.runCapturedUnary=runCapturedUnary;api.runCapturedNullary=runCapturedNullary;
 __nonaRegexpVm.asyncContext=api;Object.defineProperty(EventTarget,Symbol.for('nona.async_hooks.internal'),{value:api});
})();`;


