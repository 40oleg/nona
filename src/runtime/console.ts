import {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';

/** Console methods in Node.js own-key order; error and warn write to stderr. */
const consoleMethods:readonly {name:string;log:string}[]=[
  {name:'log',log:'rt.log'},{name:'info',log:'rt.log'},{name:'debug',log:'rt.log'},
  {name:'warn',log:'rt.logErr'},{name:'error',log:'rt.logErr'},
];
export const consoleMethodNames=consoleMethods.map(m=>m.name);
export const consoleRoots=['rt.console',...consoleMethods.map(m=>'rt.console.'+m.name)];
export const consolePropertyRoots=[...consoleMethods.flatMap(m=>['property','name','length'].map(p=>'rt.console.'+m.name+'.'+p)),'rt.globalObject.console'];

export function emitConsole(b:RuntimeBuilder):void {
  const global=b.bundle.fragments.find(f=>f.name==='rt.globalObject');
  if(!global)throw new Error('Missing global object');
  const head=global.fixups.find(f=>f.offset===O.properties);

  b.bundle.fragments.push({name:'rt.console',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
    {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
    {offset:O.properties,kind:'va64',target:'rt.console.log.property',addend:0},
  ]});
  consoleMethods.forEach((method,index)=>{
    const symbol='rt.console.'+method.name,next=consoleMethods[index+1];
    emitNativeFunction(b,symbol,method.name,0);
    const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.ordinary;
    b.bundle.fragments.push({name:symbol+'.property',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
      ...(next?[{offset:P.next,kind:'va64' as const,target:'rt.console.'+next.name+'.property',addend:0}]:[]),
      {offset:P.key,kind:'va64',target:symbol+'.key',addend:0},
      {offset:P.value+8,kind:'va64',target:symbol,addend:0},
    ]});
    b.fn(symbol+'.code',40,a=>{a.call(method.log);});
  });

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
