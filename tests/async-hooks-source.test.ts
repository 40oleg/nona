import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {asyncHooksPreludeSource} from '../src/runtime/async-hooks-source.js';

function run(body:string,MapConstructor:MapConstructor=Map){return runInNewContext('var __nonaRegexpVm={};'+asyncHooksPreludeSource+'var api=__nonaRegexpVm.asyncContext;'+body,{Map:MapConstructor,EventTarget:class {}})}
test('automatic context capture does not allocate a Map for every reaction',()=>{
 let count=0;class CountingMap extends Map<unknown,unknown>{constructor(entries?:Iterable<readonly [unknown,unknown]>|null){super(entries);count++}}
 run('for(var i=0;i<100;i++)api.capture(function(){});',CountingMap);assert.equal(count,1);
});
test('root capture invoked under a different context restores empty storage and caller context',()=>{
 const actual=run(`var local=new api.AsyncLocalStorage(),root=api.capture(function(){return local.getStore()}),resource=new api.AsyncResource('resource'),captured;local.run('captured',function(){captured=api.capture(function(){return local.getStore()})});var values=[];local.run('caller',function(){values.push(root(),local.getStore(),captured(),local.getStore());resource.runInAsyncScope(function(){values.push(root(),local.getStore(),api.executionAsyncId()===resource.asyncId())})});JSON.stringify(values)`);
 assert.deepEqual(JSON.parse(actual),[null,'caller','captured','caller',null,null,true]);
});
test('captured storage remains a snapshot across enterWith',()=>{
 const body=`var local=new AsyncLocalStorage(),bound;local.run('original',function(){bound=AsyncLocalStorage.bind(function(change){var before=local.getStore();if(change)local.enterWith('changed');return before})});var values=[bound(true),bound(false)];local.run('outside',function(){values.push(bound(false),local.getStore())});console.log(JSON.stringify(values));`;
 const oracle=spawnSync(process.execPath,['-e',`var {AsyncLocalStorage}=require('node:async_hooks');`+body],{encoding:'utf8',windowsHide:true});assert.equal(oracle.status,0,oracle.stderr);
 const actual=run('var AsyncLocalStorage=api.AsyncLocalStorage;'+body.replace('console.log(JSON.stringify(values));','JSON.stringify(values)'));
 assert.deepEqual(JSON.parse(actual),JSON.parse(oracle.stdout));
});
test('disable clears only the current scope and preserves captured bind snapshot and resource stores',()=>{
 const body=`var local=new AsyncLocalStorage(),bound,snapshot,resource;local.enterWith('root');local.run('original',function(){resource=new AsyncResource('saved');bound=AsyncLocalStorage.bind(function(){return local.getStore()});snapshot=AsyncLocalStorage.snapshot()});var values=[];local.run('inner',function(){local.disable();values.push(local.getStore())});values.push(local.getStore());local.disable();values.push(local.getStore(),bound(),snapshot(function(){return local.getStore()}),resource.runInAsyncScope(function(){return local.getStore()}),local.getStore());console.log(JSON.stringify(values));`;
 const oracle=spawnSync(process.execPath,['-e',`var {AsyncLocalStorage,AsyncResource}=require('node:async_hooks');`+body],{encoding:'utf8',windowsHide:true});assert.equal(oracle.status,0,oracle.stderr);
 const actual=run('var AsyncLocalStorage=api.AsyncLocalStorage,AsyncResource=api.AsyncResource;'+body.replace('console.log(JSON.stringify(values));','JSON.stringify(values)'));assert.deepEqual(JSON.parse(actual),JSON.parse(oracle.stdout));
});
test('bind validates before registration and exit rejects invalid receivers',()=>{
 const body=`var values=[];for(var input of [undefined,null,1,{},'x'])try{AsyncLocalStorage.bind(input);values.push('accepted')}catch(error){values.push([error.name,error.code])};for(var receiver of [{},null,undefined])try{values.push(AsyncLocalStorage.prototype.exit.call(receiver,function(){return 'accepted'}))}catch(error){values.push([error.name,error.code])};console.log(JSON.stringify(values));`;
 const oracle=spawnSync(process.execPath,['-e',`var {AsyncLocalStorage}=require('node:async_hooks');`+body],{encoding:'utf8',windowsHide:true});assert.equal(oracle.status,0,oracle.stderr);
 const actual=run('var AsyncLocalStorage=api.AsyncLocalStorage;'+body.replace('console.log(JSON.stringify(values));','JSON.stringify(values)'));assert.deepEqual(JSON.parse(actual),JSON.parse(oracle.stdout));
});
