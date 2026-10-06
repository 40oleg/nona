import {detectHostTarget,getTarget,supportedNativeTargets} from './target.js';
import {fileBaseImageCache} from './cache.js';
import {readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync,realpathSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {compile} from './compiler.js';
import {position} from './source.js';

const help='Nona 0.9.0 — JavaScript subset to native executables\nUsage: nona build <input.js> -o <output> [--target '+supportedNativeTargets.join('|')+'] [--module]\n       [--full-runtime] [--call-stats] [--coverage dir]\n       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]\n       [--version-info version.json]\n       (.mjs inputs are compiled as modules)\n       nona --help | --version\n';
function canonical(path:string):string {
  const absolute=resolve(path);
  if(existsSync(absolute)){const real=realpathSync(absolute);return process.platform==='win32'?real.toLowerCase():real;}
  const parent=dirname(absolute);
  const result=parent===absolute?absolute:join(canonical(parent),basename(absolute));
  return process.platform==='win32'?result.toLowerCase():result;
}
function assertDifferent(input:string,output:string):void {
  if(canonical(input)===canonical(output))throw new Error('Output must not overwrite the input source');
  if(existsSync(output)){
    const a=statSync(input,{bigint:true}),b=statSync(output,{bigint:true});
    if(a.dev===b.dev&&a.ino===b.ino)throw new Error('Output is an alias of the input source');
  }
}
export function main(args:string[]):number {
  let temporary:string|undefined;
  try {
    if(args.length===1&&args[0]==='--help'){process.stdout.write(help);return 0;}
    if(args.length===1&&args[0]==='--version'){process.stdout.write('0.9.0\n');return 0;}
    if(args[0]!=='build')throw new Error('Expected build command; use --help');
    const inputArg=args[1];if(!inputArg||inputArg.startsWith('-'))throw new Error('An input JavaScript file is required');
    let outputArg:string|undefined,coverage:string|undefined,icon:string|undefined,manifest:string|undefined,versionInfo:string|undefined,subsystem:'console'|'windows'|undefined,target:string|undefined=detectHostTarget(),module=inputArg.endsWith('.mjs'),fullRuntime=false,callStats=false;const seen=new Set<string>();
    for(let i=2;i<args.length;i+=2){
      const flag=args[i]!,value=args[i+1];
      if(flag==='--module'||flag==='--full-runtime'||flag==='--call-stats'){if(seen.has(flag))throw new Error('Duplicate option: '+flag);seen.add(flag);if(flag==='--module')module=true;else if(flag==='--call-stats')callStats=true;else fullRuntime=true;i--;continue;}
      if(!['-o','--target','--subsystem','--icon','--manifest','--version-info','--coverage'].includes(flag))throw new Error('Unknown option: '+flag);
      if(seen.has(flag))throw new Error('Duplicate option: '+flag);seen.add(flag);
      if(!value||value.startsWith('-'))throw new Error('Missing value for '+flag);
      if(flag==='-o')outputArg=value;
      else if(flag==='--coverage')coverage=value;
      else if(flag==='--icon')icon=value;
      else if(flag==='--manifest')manifest=value;
      else if(flag==='--version-info')versionInfo=value;
      else if(flag==='--subsystem'){if(value!=='console'&&value!=='windows')throw new Error('Unsupported subsystem: '+value);subsystem=value;}
      else target=value;
    }
    if(!outputArg)throw new Error('Output is required (-o <output>)');
    if(target===undefined)throw new Error('Unsupported native host; supply --target explicitly');
    const descriptor=getTarget(target);
    if(!descriptor)throw new Error('Unsupported target: '+target);
    const input=resolve(inputArg),output=resolve(outputArg),source=readFileSync(input,'utf8');
    assertDifferent(input,output);
    if(subsystem!==undefined&&target!=='win32-x64')throw new Error('--subsystem requires --target win32-x64');
    let versionFields;
    if(versionInfo!==undefined){
      try{versionFields=JSON.parse(readFileSync(resolve(versionInfo),'utf8'));}catch(error){throw new Error('Cannot read version information '+versionInfo+': '+(error instanceof Error?error.message:String(error)));}
      if(versionFields===null||typeof versionFields!=='object'||Array.isArray(versionFields))throw new Error('Version information must be a JSON object');
    }
    // NONA_CACHE=0 disables the on-disk runtime cache; NONA_CACHE_DIR moves it.
    const baseCache=process.env.NONA_CACHE==='0'?undefined:fileBaseImageCache();
    const result=compile(source,{fileName:inputArg,target:descriptor.target,module,...(fullRuntime?{fullRuntime}:{}),...(callStats?{callStats}:{}),...(coverage!==undefined?{coverage:{directory:resolve(coverage),url:pathToFileURL(input).href}}:{}),...(baseCache?{baseCache}:{}),...(subsystem?{subsystem}:{}),
      ...(icon!==undefined?{icon:readFileSync(resolve(icon))}:{}),
      ...(manifest!==undefined?{manifest:readFileSync(resolve(manifest),'utf8')}:{}),
      ...(versionFields!==undefined?{versionInfo:versionFields}:{})});
    if(!result.ok){
      // Each diagnostic is positioned in its own file (an imported module has its own text).
      const texts=new Map<string,string|undefined>([[inputArg,source]]);
      const text=(file:string)=>{if(!texts.has(file)){let read:string|undefined;try{read=readFileSync(resolve(file),'utf8');}catch{read=undefined;}texts.set(file,read);}return texts.get(file);};
      for(const d of result.diagnostics){
        const t=text(d.file);
        const where=t!==undefined&&d.span.start<=t.length?((p)=>`:${p.line}:${p.column}`)(position(t,d.span.start)):'';
        process.stderr.write(`${d.file}${where} ${d.code}: ${d.message}\n`);
      }
      return 1;
    }
    mkdirSync(dirname(output),{recursive:true});
    temporary=join(dirname(output),'.nona-'+randomUUID()+'.tmp');
    writeFileSync(temporary,result.image,{flag:'wx',mode:descriptor.fileMode});
    // Recheck aliases immediately before the atomic replacement as well.
    assertDifferent(input,output);renameSync(temporary,output);temporary=undefined;
    return 0;
  }catch(error){process.stderr.write('nona: '+(error instanceof Error?error.message:String(error))+'\n');return 1;}
  finally{if(temporary){try{unlinkSync(temporary);}catch{ /* Preserve the original error. */ }}}
}
process.exitCode=main(process.argv.slice(2));
