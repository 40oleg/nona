// Node is the development bootstrap host. The generated compiler has native
// host imports and compiles the original compiler and RegExp engine directly.
import {cpSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {compile} from '../dist/src/compiler.js';
import {regexpVmSource} from '../dist/src/runtime/regexp-vm-source.js';
import {compilerCryptoSource,compilerUrlSource} from '../dist/src/selfhost-adapters.js';
import {nonaVersion} from '../dist/src/version.js';

const target=process.argv[2]||'linux-x64';
const output=resolve(process.argv[3]||'out/selfhost/stage1');
const sources=resolve(dirname(output),'sources');
cpSync(resolve('dist/src'),sources,{recursive:true});
const entry=resolve(sources,'selfhost-entry.mjs');
const cliMode=process.argv.includes('--cli');
const source=`import {compile,compileToIR,compileModuleToIR} from './compiler.js';
${cliMode?"import {main} from './cli.js';":''}
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(process.versions.nona?1:2);
${cliMode?'':"if(args.length!==3)throw new Error('Usage: stage1 <input> <output> <target>');"}
function serialize(data){return JSON.stringify(data,(_key,value)=>typeof value==='bigint'?{bigint:String(value)}:value)}
if(process.env.NONA_SELFHOST_TRACE)globalThis.__nonaSelfhostTrace=(kind,data)=>writeFileSync(process.env.NONA_SELFHOST_TRACE+'.'+kind+'.json',serialize(data));
if(process.env.NONA_SELFHOST_DUMP_IR){
 const input=${cliMode?'args[1]':'args[0]'},target=${cliMode?"args[args.indexOf('--target')+1]":'args[2]'},text=readFileSync(input,'utf8'),module=input.endsWith('.mjs');
 const ir=module?compileModuleToIR(text,input,undefined,'',target):compileToIR(text,input,undefined,target);
 writeFileSync(process.env.NONA_SELFHOST_DUMP_IR,serialize(ir));
}else{
 ${cliMode?'process.exitCode=main(args);':`
 const text=readFileSync(args[0],'utf8'),module=args[0].endsWith('.mjs');
 const result=compile(text,{fileName:args[0],target:args[2],module});
 if(!result.ok){console.error(JSON.stringify(result.diagnostics));process.exitCode=1}
 else writeFileSync(args[1],result.image);
 `}
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
if(cliMode){
 writeFileSync(resolve(sources,'selfhost-crypto.js'),compilerCryptoSource(target));
 writeFileSync(resolve(sources,'selfhost-url.js'),compilerUrlSource);
 const cliPath=resolve(sources,'cli.js');
 const cli=readFileSync(cliPath,'utf8').replace("from 'node:crypto'","from './selfhost-crypto.js'")
  .replace("from 'node:url'","from './selfhost-url.js'").replace('process.exitCode = main(process.argv.slice(2));','');
 writeFileSync(cliPath,cli);
 const cachePath=resolve(sources,'cache.js');
 let cache=readFileSync(cachePath,'utf8').replace("from 'node:crypto'","from './selfhost-crypto.js'")
  .replace(/^import \{ fileURLToPath \} from 'node:url';\r?\n/m,'')
  .replace(/^import \{ homedir \} from 'node:os';\r?\n/m,`function homedir(){const home=process.platform==='win32'?process.env.USERPROFILE:process.env.HOME;if(home)return home;if(process.platform!=='win32'){const uid=process.getuid();for(const line of readFileSync('/etc/passwd','utf8').split('\\n')){const fields=line.split(':');if(Number(fields[2])===uid&&fields[5])return fields[5];}}throw new Error('Cannot determine compiler cache home; set NONA_CACHE_DIR');}\n`);
 // The native distribution contains compiled functions, not a JavaScript
 // source installation. Embed a fingerprint of the prepared compiler sources.
 cache=cache.replace(/function compilerFingerprint\(\) \{[\s\S]*?\r?\n\}/,'function compilerFingerprint(){return "SELFHOST_FINGERPRINT";}');
 if(!cache.includes('SELFHOST_FINGERPRINT'))throw new Error('Cannot prepare native compiler fingerprint');
 writeFileSync(cachePath,cache);
 const hash=createHash('sha256');
 function fingerprint(directory){for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  const path=resolve(directory,entry.name);if(entry.isDirectory())fingerprint(path);else if(entry.name.endsWith('.js')||entry.name.endsWith('.mjs'))hash.update(path.slice(sources.length).replaceAll('\\','/')).update('\0').update(readFileSync(path)).update('\0');
 }}
 fingerprint(sources);writeFileSync(cachePath,cache.replace('SELFHOST_FINGERPRINT',hash.digest('hex')));
}
const result=compile(source,{fileName:entry,target,module:true});
mkdirSync(dirname(output),{recursive:true});
if(!result.ok){writeFileSync(output+'.diagnostics.json',JSON.stringify(result.diagnostics,null,2));console.error(JSON.stringify(result.diagnostics,null,2));process.exitCode=1}
else{writeFileSync(output,result.image,{mode:0o755});writeFileSync(output+'.version',nonaVersion+'\n');console.log('Stage 1 image compiled:',target,result.image.length,output)}
