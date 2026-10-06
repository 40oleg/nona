import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {compileModuleToIR} from '../src/compiler.js';
import {collectSourceUsage} from '../src/frontend/lexer.js';
import {generate} from '../src/backend/x64/codegen.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {processReportNetworkSource,processReportNetworkIntrinsicsSource,processReportNetworkHosts} from '../src/runtime/process-report-network-source.js';

function snapshot(platform:string,host:Record<string,unknown>){
 const api:Record<string,unknown>={};
 runInNewContext(processReportNetworkIntrinsicsSource+processReportNetworkSource,{platform,windows:platform==='win32',host,__nonaRegexpVm:api,TextDecoder,Uint8Array,Uint32Array,Int32Array,DataView,decoder:new TextDecoder(),hostError:(name:string,code:number)=>Object.assign(new Error(name),{code})});
 return JSON.parse(JSON.stringify((api.processReportNetworkInterfaces as ()=>unknown)()));
}
function number(bytes:Uint8Array,at:number,value:number,size=4){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(size===2)view.setUint16(at,value,true);else view.setUint32(at,value,true)}
function attr(kind:number,payload:Uint8Array){const out=new Uint8Array((payload.length+7)&~3);number(out,0,payload.length+4,2);number(out,2,kind,2);out.set(payload,4);return out}
function netMessage(kind:number,body:Uint8Array,attributes:Uint8Array[]){const out=new Uint8Array(16+body.length+attributes.reduce((n,a)=>n+a.length,0));number(out,0,out.length);number(out,4,kind,2);number(out,8,kind===16?1:2);out.set(body,16);let at=16+body.length;for(const a of attributes){out.set(a,at);at+=a.length}return out}
const linkBody=new Uint8Array(16);number(linkBody,4,1);number(linkBody,8,9);
const link=netMessage(16,linkBody,[attr(3,new TextEncoder().encode('lo\0')),attr(1,new Uint8Array(6))]);
const inetBody=new Uint8Array([2,8,0,254,1,0,0,0]);
const inet=netMessage(20,inetBody,[attr(1,new Uint8Array([127,0,0,1]))]);
const sixBody=new Uint8Array([10,128,0,254,1,0,0,0]),sixBytes=new Uint8Array(16);sixBytes[15]=1;
const six=netMessage(20,sixBody,[attr(1,sixBytes)]);
function done(sequence:number){const out=new Uint8Array(16);number(out,0,16);number(out,4,3,2);number(out,8,sequence);return out}

test('Linux report snapshots decode actual link/address dump layouts and close the descriptor',()=>{
 let closed=false,queue:Uint8Array[]=[];
 const result=snapshot('linux',{networkSocket:()=>7,networkSend:(_fd:number,request:Uint8Array)=>{queue=new DataView(request.buffer).getUint16(4,true)===18?[link,done(1)]:[inet,six,done(2)];return request.length},networkReceive:(_fd:number,out:Uint8Array)=>{const data=queue.shift()!;out.set(data);return data.length},sys_close:(fd:number)=>{assert.equal(fd,7);closed=true;return 0}});
 assert.equal(closed,true);
 assert.deepEqual(result,[{name:'lo',internal:true,mac:'00:00:00:00:00:00',address:'127.0.0.1',netmask:'255.0.0.0',family:'IPv4'},{name:'lo',internal:true,mac:'00:00:00:00:00:00',address:'::1',netmask:'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',family:'IPv6',scopeid:0}]);
});
test('Linux interrupted reads retry and malformed dumps release their descriptor',()=>{
 let reads=0,closed=0;
 assert.throws(()=>snapshot('linux',{networkSocket:()=>7,networkSend:()=>32,networkReceive:()=>++reads===1?-4:0,sys_close:()=>++closed}),/network/);
 assert.equal(reads,2);assert.equal(closed,1);
});

function nativeMemory(){
 const blocks=new Map<number,Uint8Array>();let cursor=4096;
 return {add(bytes:Uint8Array){const pointer=cursor;cursor+=Math.max(256,bytes.length);blocks.set(pointer,bytes);return pointer},copy(out:Uint8Array,pointer:number,length:number){for(const [base,bytes] of blocks)if(pointer>=base&&pointer+length<=base+bytes.length){out.set(bytes.subarray(pointer-base,pointer-base+length));return}throw new Error('Invalid native read '+pointer)},length(pointer:number){for(const [base,bytes] of blocks)if(pointer>=base&&pointer<base+bytes.length){let i=pointer-base;while(i<bytes.length&&bytes[i])i++;return i-(pointer-base)}throw new Error('Invalid native string')}};
}
test('Windows follows 64-bit adapter/unicast pointers, masks and friendly UTF-16 names',()=>{
 const memory=nativeMemory(),socket=new Uint8Array(16);number(socket,0,2,2);socket.set([192,0,2,3],4);const socketPointer=memory.add(socket);
 const unicast=new Uint8Array(64);number(unicast,0,64);number(unicast,16,socketPointer);number(unicast,24,16);unicast[56]=24;const unicastPointer=memory.add(unicast);
 const friendly=memory.add(new Uint8Array(new Uint16Array([69,116,104,101,114,110,101,116,0]).buffer));
 let calls=0;
 const result=snapshot('win32',{...memory,GetAdaptersAddresses:(_family:number,_flags:number,_reserved:unknown,out:Uint8Array|null,size:Uint32Array)=>{calls++;if(!out){size[0]=128;return 111}number(out,0,128);number(out,24,unicastPointer);number(out,72,friendly);out.set([2,3,4,5,6,7],80);number(out,88,6);number(out,100,6);return 0}});
 assert.equal(calls,2);assert.deepEqual(result,[{name:'Ethernet',internal:false,mac:'02:03:04:05:06:07',address:'192.0.2.3',netmask:'255.255.255.0',family:'IPv4'}]);
});
test('Darwin getifaddrs storage is released even when snapshot decoding fails',()=>{
 const memory=nativeMemory(),entry=new Uint8Array(56);number(entry,8,123);const pointer=memory.add(entry);let freed=0;
 assert.throws(()=>snapshot('darwin',{...memory,getifaddrs:(out:Uint32Array)=>{out[0]=pointer;return 0},freeifaddrs:(value:number)=>{assert.equal(value,pointer);freed++}}),/native/);
 assert.equal(freed,1);
});

test('Darwin snapshots preserve IPv6 scope and associate addresses with link-layer names',()=>{
 const memory=nativeMemory(),name=memory.add(new TextEncoder().encode('en0\0'));
 const linkSocket=new Uint8Array(17);linkSocket[0]=17;linkSocket[1]=18;linkSocket[5]=3;linkSocket[6]=6;linkSocket.set(new TextEncoder().encode('en0'),8);linkSocket.set([1,2,3,4,5,6],11);const linkPointer=memory.add(linkSocket);
 const address=new Uint8Array(28);address[0]=28;address[1]=30;address[8]=254;address[9]=128;address[23]=1;number(address,24,4);const addressPointer=memory.add(address);
 const mask=new Uint8Array(24);mask[0]=24;mask.fill(255,8,16);const maskPointer=memory.add(mask);
 const inetRecord=new Uint8Array(56);number(inetRecord,8,name);number(inetRecord,16,1);number(inetRecord,24,addressPointer);number(inetRecord,32,maskPointer);const inetPointer=memory.add(inetRecord);
 const linkRecord=new Uint8Array(56);number(linkRecord,0,inetPointer);number(linkRecord,8,name);number(linkRecord,16,1);number(linkRecord,24,linkPointer);const first=memory.add(linkRecord);let freed=0;
 const result=snapshot('darwin',{...memory,getifaddrs:(out:Uint32Array)=>{out[0]=first;return 0},freeifaddrs:()=>freed++});
 assert.equal(freed,1);assert.deepEqual(result,[{name:'en0',internal:false,mac:'01:02:03:04:05:06',address:'fe80::1',netmask:'ffff:ffff:ffff:ffff::',family:'IPv6',scopeid:4}]);
});
function routeMessage(open:boolean,type:number,addresses:Map<number,Uint8Array>){
 const header=24;let total=header;for(const a of addresses.values())total+=(a.length+7)&~7;
 const out=new Uint8Array(total);number(out,0,total,2);out[2]=5;out[3]=type;number(out,open?4:16,header,2);number(out,open?6:12,4,2);number(out,open?16:8,9);let bits=0,at=header;
 for(let bit=0;bit<8;bit++){const a=addresses.get(bit);if(a){bits|=1<<bit;out.set(a,at);at+=(a.length+7)&~7}}number(out,open?12:4,bits);return out;
}
for(const platform of ['freebsd','openbsd'])test(`${platform} extensible route snapshots decode compact masks and KAME scope IDs`,()=>{
 const open=platform==='openbsd',link=new Uint8Array(11);link[0]=11;link[1]=18;link[5]=3;link.set(new TextEncoder().encode('lo0'),8);
 const address=new Uint8Array(28);address[0]=28;address[1]=open?24:28;address[8]=254;address[9]=128;address[11]=4;address[23]=1;
 const mask=new Uint8Array(16);mask[0]=16;mask.fill(255,8);
 const info=routeMessage(open,14,new Map([[4,link]])),inet=routeMessage(open,12,new Map([[2,mask],[5,address]])),bytes=new Uint8Array(info.length+inet.length+4);bytes.set(info);bytes.set(inet,info.length);number(bytes,info.length+inet.length,4,2);bytes[info.length+inet.length+3]=99;
 let calls=0;const result=snapshot(platform,{sys_sysctl:(mib:Int32Array,_count:number,out:Uint8Array|null,size:Uint32Array)=>{assert.deepEqual(Array.from(mib),[4,17,0,0,open?3:5,0]);calls++;size[0]=bytes.length;if(out)out.set(bytes);return 0}});
 assert.equal(calls,2);assert.deepEqual(result,[{name:'lo0',internal:true,mac:'00:00:00:00:00:00',address:'fe80::1',netmask:'ffff:ffff:ffff:ffff::',family:'IPv6',scopeid:4}]);
});
test('BSD size races retry without returning a truncated interface inventory',()=>{
 let calls=0;assert.deepEqual(snapshot('freebsd',{sys_sysctl:(_mib:Int32Array,_count:number,out:Uint8Array|null,size:Uint32Array)=>{calls++;size[0]=0;return out&&calls===2?-12:0}}),[]);assert.equal(calls,4);
});
test('network host declarations use the selected native OS services',()=>{
 for(const target of ['win32-x64','win32-arm64'])assert.equal(processReportNetworkHosts(target)[0]![1],'IPHLPAPI.dll');
 for(const target of ['darwin-x64','darwin-arm64'])assert.ok(processReportNetworkHosts(target).every(h=>h[1]==='/usr/lib/libSystem.B.dylib'));
 assert.deepEqual(processReportNetworkHosts('linux-x64').map(h=>h[2]),['41','44','45']);assert.deepEqual(processReportNetworkHosts('linux-arm64').map(h=>h[2]),['198','206','207']);assert.deepEqual(processReportNetworkHosts('freebsd-x64'),[]);assert.deepEqual(processReportNetworkHosts('openbsd-x64'),[]);
});
for(const target of ['win32-x64','win32-arm64','linux-x64','linux-arm64','darwin-x64','darwin-arm64','freebsd-x64','openbsd-x64'] as const)test(`original network snapshot source lowers for ${target} without extra prelude globals`,()=>{
 const source=';(function(){var __nonaRegexpVm={},host={},platform="'+target.split('-')[0]+'",windows=false,decoder=new TextDecoder();function hostError(name,code){return new Error(name)}'+processReportNetworkIntrinsicsSource+processReportNetworkSource+'})();';
 assert.equal(lower(bind(parse(lex(source)))).globalCount,0);
 const emptyHost={resolve:()=>undefined,read:()=>undefined};
 const ir=compileModuleToIR('console.log(1)','network-syntax.mjs',emptyHost,source,target);assert.ok(ir.functions.length>10);
 const {usage}=collectSourceUsage(()=>compileModuleToIR('console.log(1)','bare.mjs',emptyHost,'',target));
 const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage}));assert.ok(program.fragments.filter(f=>f.section==='.text'&&f.name.startsWith('js.')).length>10);
});
