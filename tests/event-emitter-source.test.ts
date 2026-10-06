import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {eventsPreludeSource} from '../src/runtime/events-source.js';
import {eventEmitterPreludeSource} from '../src/runtime/event-emitter-source.js';

test('shared EventEmitter construction stays lazy and retains startup intrinsics',()=>{
 const context=createContext({__nonaRegexpVm:{}});
 runInContext(eventsPreludeSource+`
 var emitterDefinitions=0,startupDefine=Object.defineProperty;
 Object.defineProperty=function(target,key,descriptor){if(typeof target==='function'&&target.name==='EventEmitter')emitterDefinitions++;return startupDefine(target,key,descriptor)};
 `+eventEmitterPreludeSource,context);
 assert.equal(runInContext('emitterDefinitions',context),0);
 assert.equal(runInContext('typeof Object.getOwnPropertyDescriptor(__nonaRegexpVm,"eventEmitterModule").get',context),'function');
 assert.equal(runInContext(`
 var target=EventTarget,key=Symbol.for('nona.events.emitter'),define=Object.defineProperty;
 Object.defineProperty=function(){throw Error('replaced defineProperty')};globalThis.EventTarget=function(){};
 var E=__nonaRegexpVm.eventEmitterModule,bridge=target[key],instance=new E(),seen=0;
 instance.once('value',function(value){seen+=value});instance.emit('value',3);instance.emit('value',4);
 Object.defineProperty=define;
 E===bridge.EventEmitter&&E===__nonaRegexpVm.eventEmitterModule&&seen===3&&instance instanceof E&&emitterDefinitions>0
 `,context),true);
});
