import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Assembler} from '../src/backend/x64/assembler.js';
import {linkElf} from '../src/backend/elf/writer.js';
import {compile} from '../src/compiler.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkLinux} from '../src/backend/linux/index.js';
import {runOracle} from './helpers/oracle.js';
import type {NativeProgram} from '../src/backend/pe/model.js';

function helloElf():Uint8Array {
 const code=new Assembler('linux.hello');
 code.mov('rax',1);code.mov('rdi',1);code.lea('rsi',{rip:'linux.message'});code.mov('rdx',6);code.emit([0x0f,0x05]);
 code.mov('rax',60);code.mov('rdi',0);code.emit([0x0f,0x05]);
 const program:NativeProgram={fragments:[
  {...code.finish(),name:'linux.hello',section:'.text'},
  {name:'linux.message',section:'.rdata',bytes:new TextEncoder().encode('hello\n'),fixups:[],symbols:{}},
 ],imports:[],entry:'linux.hello',functions:[]};
 return linkElf(program);
}

function executeLinux(image:Uint8Array,t:TestContext):string|null {
 const directory=mkdtempSync(join(tmpdir(),'nona-linux-'));
 try{
  const file=join(directory,'program');writeFileSync(file,image);
  let run;
  if(process.platform==='linux'){
   chmodSync(file,0o700);run=spawnSync(file,[],{encoding:'utf8',timeout:10000});
  }else if(process.platform==='win32'){
   const probe=spawnSync('wsl.exe',['--exec','/bin/true'],{timeout:3000});
   if(probe.error||probe.status!==0){t.skip('WSL Linux is unavailable');return null;}
   const translated=spawnSync('wsl.exe',['--exec','wslpath','-a',file],{encoding:'utf8',timeout:5000});
   assert.equal(translated.status,0,translated.stderr);
   run=spawnSync('wsl.exe',['--exec','/bin/sh','-c','target=$(mktemp /tmp/nona-linux-XXXXXX); trap \'rm -f "$target"\' EXIT; cp "$1" "$target"; chmod 700 "$target"; "$target"','sh',translated.stdout.trim()],{encoding:'utf8',timeout:10000});
  }else{t.skip('No Linux execution environment');return null;}
  assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);return run.stdout;
 }finally{rmSync(directory,{recursive:true,force:true});}
}

test('ELF64 linker resolves x64 RIP references',()=>{
 const image=helloElf(),view=new DataView(image.buffer);
 assert.equal(view.getUint32(0,true),0x464c457f);assert.equal(view.getUint16(18,true),62);
 assert.equal(view.getBigUint64(24,true),0x401000n);
 assert.equal(view.getUint32(64,true),1);assert.equal(view.getUint32(64+56+4,true),5);
 const lea=image.findIndex((byte,index)=>byte===0x48&&image[index+1]===0x8d&&image[index+2]===0x35);
 assert.ok(lea>0);const target=lea+7+view.getInt32(lea+3,true);
 assert.equal(new TextDecoder().decode(image.subarray(target,target+6)),'hello\n');
});

test('ELF64 executable runs under Linux when available',t=>{
 const output=executeLinux(helloElf(),t);if(output!==null)assert.equal(output,'hello\n');
});

test('Linux native compiler executes a JavaScript program',t=>{
 const result=compile('console.log("hello", 42);',{fileName:'hello.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,'hello 42\n');
});

test('Linux native ArrayBuffer allocation and byteLength',t=>{
 const source=`let b=new ArrayBuffer(16);console.log(b.byteLength,Object.prototype.toString.call(b));`;
 const result=compile(source,{fileName:'array-buffer.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,'16 [object ArrayBuffer]\n');
});

test('Linux native DataView range and buffer identity',t=>{
 const source=`let b=new ArrayBuffer(16),v=new DataView(b,3,8);v.setBigUint64(0,0x123456789abcdef0n,true);console.log(v.buffer===b,v.byteOffset,v.byteLength,ArrayBuffer.isView(v),v.getBigUint64(0,true).toString(16));`;
 const result=compile(source,{fileName:'data-view.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,'true 3 8 true 123456789abcdef0\n');
});

test('Linux native output encodes UTF-16 as UTF-8',t=>{
 const source=`console.log('Привет','😀','\ud800');`;
 const result=compile(source,{fileName:'unicode.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native runtime survives GC stress and class construction',t=>{
 const source=`class B extends Array{}let a=new B(1,2);for(let i=0;i<40;i++)({x:String(i)});console.log(a instanceof B,a.length,a[1]);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.forEach calls back under GC stress',t=>{
 const source=`let a=[1,,3],s='';a.forEach(function(v,i){for(let j=0;j<20;j++)({x:j});s+=v+':'+i+';';});console.log(s);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native RegExp VM captures survive GC stress',t=>{
 const source=`let re=/(?<word>ab)\\k<word>/g;let m=re.exec('xabab');console.log(m[0],m.groups.word,m.index,re.lastIndex);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native RegExp VM matches without GC stress',t=>{
 const source=`let m=/(a+)(b)/.exec('xaab');console.log(m[0],m[1],m[2],m.index);`;
 const result=compile(source,{fileName:'regexp.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native simple RegExp matches without VM',t=>{
 const source=`let m=/abc/.exec('xabc');console.log(m[0],m.index);`;
 const result=compile(source,{fileName:'regexp-simple.js',target:'linux-x64'});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 const output=executeLinux(result.image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native simple RegExp survives GC stress',t=>{
 const source=`let m=/abc/.exec('xabc');console.log(m[0],m.index);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.some and every call back under GC stress',t=>{
 const source=`let a=[1,,3];console.log(a.some(function(v){for(let j=0;j<20;j++)({x:j});return v===3}),a.every(function(v){for(let j=0;j<20;j++)({x:j});return v>0}));`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.find and findIndex visit holes under GC stress',t=>{
 const source=`let a=[,{x:2}],s='';console.log(a.find(function(v,i){for(let j=0;j<20;j++)({x:j});s+=i;return v&&v.x===2}).x,a.findIndex(function(v,i){for(let j=0;j<20;j++)({x:j});return v&&v.x===2}),s);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.reduce and reduceRight call back under GC stress',t=>{
 const source=`let a=[1,,3];console.log(a.reduce(function(x,y){for(let j=0;j<20;j++)({x:j});return x+y},0),a.reduceRight(function(x,y){for(let j=0;j<20;j++)({x:j});return x-y},0));`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.fill keeps the value under GC stress',t=>{
 const source=`let value={x:7},a=[0,,0];for(let i=0;i<20;i++)({x:i});a.fill(value,1,undefined);console.log(a[0],a[1].x,a[2].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.copyWithin copies holes and references under GC stress',t=>{
 const source=`let value={x:7},a=[value,,3];for(let i=0;i<20;i++)({x:i});a.copyWithin(1,0,2);console.log(a[0].x,a[1].x,2 in a);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.reverse preserves holes under GC stress',t=>{
 const source=`let a=[{x:1},,{x:3}];for(let i=0;i<20;i++)({x:i});a.reverse();console.log(a[0].x,1 in a,a[2].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.shift preserves holes under GC stress',t=>{
 const source=`let a=[{x:1},,{x:3}];for(let i=0;i<20;i++)({x:i});let first=a.shift();console.log(first.x,0 in a,a[1].x,a.length);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.unshift moves sparse entries under GC stress',t=>{
 const source=`let value={x:7},a=[,2];for(let i=0;i<20;i++)({x:i});console.log(a.unshift(value),a[0].x,1 in a,a[2],a.length);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});

test('Linux native Array.prototype.map honors species under GC stress',t=>{
 const source=`let a=[{x:1},,{x:3}];a.constructor={[Symbol.species]:function(n){for(let i=0;i<20;i++)({x:i});return new Array(n)}};let b=a.map(function(v){for(let i=0;i<20;i++)({x:i});return {x:v.x+1}});console.log(b.length,b[0].x,1 in b,b[2].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native Array.prototype.filter honors species under GC stress',t=>{
 const source=`let a=[{x:1},,{x:3}];a.constructor={[Symbol.species]:function(n){for(let i=0;i<20;i++)({x:i});return new Array(n)}};let b=a.filter(function(v){for(let i=0;i<20;i++)({x:i});return v.x>1});console.log(b.length,b[0].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native Array.prototype.slice honors species under GC stress',t=>{
 const source=`let a=[{x:1},,{x:3}];a.constructor={[Symbol.species]:function(n){for(let i=0;i<20;i++)({x:i});return new Array(n)}};let b=a.slice();console.log(b.length,b[0].x,1 in b,b[2].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native Array.prototype.splice moves sparse values under GC stress',t=>{
 const source=`let a=[{x:1},,{x:3},{x:4}];a.constructor={[Symbol.species]:function(n){for(let i=0;i<20;i++)({x:i});return new Array(n)}};let b=a.splice(1,2,{x:8},{x:9},{x:10});console.log(b.length,0 in b,b[1].x,a.length,a[1].x,a[2].x,a[3].x,a[4].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native Array.of constructs a subclass under GC stress',t=>{
 const source=`class A extends Array{}let x={x:1},y={x:2};let a=A.of(x,y);for(let i=0;i<20;i++)({x:i});console.log(a instanceof A,a.length,a[0].x,a[1].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native Array.from maps an iterator under GC stress',t=>{
 const source=`let a=Array.from([1,,3],function(v,i){for(let j=0;j<20;j++)({x:j});return {x:String(v)+i}});console.log(a.length,a[0].x,a[1].x,a[2].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native parseInt and parseFloat survive coercion under GC stress',t=>{
 const source=`let x={toString(){for(let i=0;i<30;i++)({x:i});return '0x2a tail'}},r={valueOf(){for(let i=0;i<30;i++)({x:i});return 16}};console.log(parseInt(x,r),parseFloat(' -1.25e2rest'),Number.parseInt===parseInt,Number.parseFloat===parseFloat);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native Array.prototype.concat honors spreadability and species under GC stress',t=>{
 const source=`let a=[{x:1}],o={0:{x:2},length:1,[Symbol.isConcatSpreadable]:true};a.constructor={[Symbol.species]:function(){for(let i=0;i<20;i++)({x:i});return []}};let b=a.concat(o,{x:3});console.log(b.length,b[0].x,b[1].x,b[2].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native flat and flatMap preserve nested values under GC stress',t=>{
 const source=`let a=[{x:1},,[{x:2},[{x:3}]]],b=a.flat(2),c=b.flatMap(function(v,i){for(let j=0;j<20;j++)({x:j});return [v,{x:v.x+i}]});console.log(b.length,b[0].x,b[1].x,b[2].x,c.length,c[5].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native toLocaleString retains values under GC stress',t=>{
 const source=`let a=[{toLocaleString(){for(let i=0;i<20;i++)({x:i});return 'one'}},{toLocaleString(){for(let i=0;i<20;i++)({x:i});return 'two'}}];console.log(a.toLocaleString());`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
test('Linux native sort comparator retains elements under GC stress',t=>{
 const source=`let a=[{x:3},{x:1},{x:2}];a.sort(function(v,w){for(let i=0;i<20;i++)({i:i});return v.x-w.x});console.log(a[0].x,a[1].x,a[2].x);`;
 const image=linkLinux(generate(compileToIR(source),{gcStress:true}));
 const output=executeLinux(image,t);if(output!==null)assert.equal(output,runOracle(source).stdout);
});
