// Node is the development bootstrap host. The generated compiler has native
// host imports and compiles the original compiler and RegExp engine directly.
import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {compile} from '../dist/src/compiler.js';
import {regexpVmSource} from '../dist/src/runtime/regexp-vm-source.js';

const target=process.argv[2]||'linux-x64';
const output=resolve(process.argv[3]||'out/selfhost/stage1');
const sources=resolve(dirname(output),'sources');
cpSync(resolve('dist/src'),sources,{recursive:true});
const entry=resolve(sources,'selfhost-entry.mjs');
const source=`import {compile,compileToIR,compileModuleToIR} from './compiler.js';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(process.versions.nona?1:2);
if(args.length!==3)throw new Error('Usage: stage1 <input> <output> <target>');
const text=readFileSync(args[0],'utf8'),module=args[0].endsWith('.mjs');
function serialize(data){return JSON.stringify(data,(_key,value)=>typeof value==='bigint'?{bigint:String(value)}:value)}
if(process.env.NONA_SELFHOST_TRACE)globalThis.__nonaSelfhostTrace=(kind,data)=>writeFileSync(process.env.NONA_SELFHOST_TRACE+'.'+kind+'.json',serialize(data));
if(process.env.NONA_SELFHOST_DUMP_IR){
 const ir=module?compileModuleToIR(text,args[0],undefined,'',args[2]):compileToIR(text,args[0],undefined,args[2]);
 writeFileSync(process.env.NONA_SELFHOST_DUMP_IR,serialize(ir));
}else{
 const result=compile(text,{fileName:args[0],target:args[2],module});
 if(!result.ok){console.error(JSON.stringify(result.diagnostics));process.exitCode=1}
 else writeFileSync(args[1],result.image);
}
`;
const lexer=resolve(sources,'frontend/lexer.js');
let text=readFileSync(lexer,'utf8');
  text=text.replace(/import \{ runInNewContext \} from 'node:vm';\r?\n/,'');
  text=text.replace(/import \{ regexpVmSource \} from '..\/runtime\/regexp-vm-source.js';/,"import {compileRegExpPattern} from '../selfhost-regexp.js';");
  text=text.replace(/let compileRegExpPattern;\r?\n/,'');
  text=text.replace(/\s*compileRegExpPattern \?\?= runInNewContext\(regexpVmSource\).compile;/,'');
writeFileSync(lexer,text);
writeFileSync(resolve(sources,'selfhost-regexp.js'),'export const compileRegExpPattern=('+regexpVmSource+').compile;');
writeFileSync(entry,source);
const codegen=resolve(sources,'backend/x64/codegen.js');
let generator=readFileSync(codegen,'utf8');
generator=generator.replace('export function generate(', 'function generateOriginal(');
generator=generator.replace('cachedRuntimePreludes.set(preludeKey, prelude);',"if(globalThis.__nonaSelfhostTrace)globalThis.__nonaSelfhostTrace('prelude',prelude);cachedRuntimePreludes.set(preludeKey, prelude);");
generator+=`\nexport function generate(module,options={}){const program=generateOriginal(module,options);if(globalThis.__nonaSelfhostTrace)globalThis.__nonaSelfhostTrace('program',{...program,fragments:program.fragments.map(fragment=>({...fragment,bytes:Buffer.from(fragment.bytes).toString('base64')}))});return program}\n`;
writeFileSync(codegen,generator);
// Preserve the failed compiler phase in native diagnostics, where a source
// stack may be unavailable. These wrappers also help distinguish graph loading
// from binding/lowering while bringing up the bootstrap.
for(const [file,names] of [
 ['frontend/parser.js',['parse']],['frontend/binder.js',['bind']],
 ['frontend/dynamic-functions.js',['lowerDynamicFunctions']],
 ['frontend/eval-aot.js',['lowerLiteralEval']],['ir/lower.js',['lower']],
 ['frontend/modules.js',['loadModuleGraph','moduleRequests']],
]){
 const path=resolve(sources,file);let prepared=readFileSync(path,'utf8');
 for(const name of names){
  prepared=prepared.replace('export function '+name+'(', 'function '+name+'Original(');
  prepared+='\nexport function '+name+'(...args){try{return '+name+'Original(...args)}catch(error){process.stderr.write('+JSON.stringify('Compiler phase '+file+' '+name+': ')+'+String(error)+"\\n");throw error}}\n';
 }
 writeFileSync(path,prepared);
}
const result=compile(source,{fileName:entry,target,module:true});
mkdirSync(dirname(output),{recursive:true});
if(!result.ok){writeFileSync(output+'.diagnostics.json',JSON.stringify(result.diagnostics,null,2));console.error(JSON.stringify(result.diagnostics,null,2));process.exitCode=1}
else{writeFileSync(output,result.image,{mode:0o755});console.log('Stage 1 image compiled:',target,result.image.length,output)}
