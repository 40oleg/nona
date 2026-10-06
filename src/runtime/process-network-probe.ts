/** Exercise the shared network, timer and Process loop against Node 26. */
export const processNetworkProbe=String.raw`
import http from 'node:http';
import {Writable} from 'node:stream';
import {EventEmitter} from 'node:events';
process.on('beforeExit',()=>console.log('beforeExit'));
process.on('exit',()=>console.log('exit'));
const server=http.createServer((request,response)=>setImmediate(()=>response.end('ok')));
server.listen(0,'127.0.0.1',()=>{
 http.get({host:'127.0.0.1',port:server.address().port,path:'/'},response=>{
  let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
  response.on('end',()=>{
   console.log('http',body);
   console.log('identity',process.stdout instanceof Writable,response instanceof EventEmitter,process.getBuiltinModule('http')===http);
   server.close(()=>console.log('closed'));
  });
 });
});
`;
