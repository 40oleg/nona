import {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const consoleRoots=['rt.console','rt.console.log'];
export const consolePropertyRoots=['rt.console.log.property','rt.console.log.name','rt.console.log.length','rt.globalObject.console'];

export function emitConsole(b:RuntimeBuilder):void {
  const global=b.bundle.fragments.find(f=>f.name==='rt.globalObject');
  if(!global)throw new Error('Missing global object');
  const head=global.fixups.find(f=>f.offset===O.properties);

  b.bundle.fragments.push({name:'rt.console',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
    {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
    {offset:O.properties,kind:'va64',target:'rt.console.log.property',addend:0},
  ]});
  emitNativeFunction(b,'rt.console.log','log',0);
  const logProperty=new Uint8Array(P.size);logProperty[P.value]=5;logProperty[P.attributes]=A.writable|A.configurable;
  b.bundle.fragments.push({name:'rt.console.log.property',section:'.data',alignment:8,bytes:logProperty,symbols:{},fixups:[
    {offset:P.key,kind:'va64',target:'rt.console.log.key',addend:0},
    {offset:P.value+8,kind:'va64',target:'rt.console.log',addend:0},
  ]});
  b.fn('rt.console.log.code',40,a=>{a.call('rt.log');});

  b.bundle.fragments.push(stringLiteral('rt.str.console','console'));
  const globalProperty=new Uint8Array(P.size);globalProperty[P.value]=5;globalProperty[P.attributes]=A.writable|A.configurable;
  b.bundle.fragments.push({name:'rt.globalObject.console',section:'.data',alignment:8,bytes:globalProperty,symbols:{},fixups:[
    ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
    {offset:P.key,kind:'va64',target:'rt.str.console',addend:0},
    {offset:P.value+8,kind:'va64',target:'rt.console',addend:0},
  ]});
  if(head)head.target='rt.globalObject.console';
  else global.fixups.push({offset:O.properties,kind:'va64',target:'rt.globalObject.console',addend:0});
}
