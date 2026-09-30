import {readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync,realpathSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname,basename,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {compile} from './compiler.js';
import {position} from './source.js';

const help='Nona 0.6.0 — JavaScript subset to native Windows/Linux x64\nUsage: nona build <input.js> -o <output> [--target win32-x64|linux-x64] [--module]\n       (.mjs inputs are compiled as modules)\n       nona --help | --version\n';
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
    if(args.length===1&&args[0]==='--version'){process.stdout.write('0.6.0\n');return 0;}
    if(args[0]!=='build')throw new Error('Expected build command; use --help');
    const inputArg=args[1];if(!inputArg||inputArg.startsWith('-'))throw new Error('An input JavaScript file is required');
    let outputArg:string|undefined,target='win32-x64',module=inputArg.endsWith('.mjs');const seen=new Set<string>();
    for(let i=2;i<args.length;i+=2){
      const flag=args[i]!,value=args[i+1];
      if(flag==='--module'){if(seen.has(flag))throw new Error('Duplicate option: '+flag);seen.add(flag);module=true;i--;continue;}
      if(flag!=='-o'&&flag!=='--target')throw new Error('Unknown option: '+flag);
      if(seen.has(flag))throw new Error('Duplicate option: '+flag);seen.add(flag);
      if(!value||value.startsWith('-'))throw new Error('Missing value for '+flag);
      if(flag==='-o')outputArg=value;else target=value;
    }
    if(!outputArg)throw new Error('Output is required (-o <output>)');
    if(target!=='win32-x64'&&target!=='linux-x64')throw new Error('Unsupported target: '+target);
    const input=resolve(inputArg),output=resolve(outputArg),source=readFileSync(input,'utf8');
    assertDifferent(input,output);
    const result=compile(source,{fileName:inputArg,target,module});
    if(!result.ok){for(const d of result.diagnostics){const p=position(source,d.span.start);process.stderr.write(`${d.file}:${p.line}:${p.column} ${d.code}: ${d.message}\n`);}return 1;}
    mkdirSync(dirname(output),{recursive:true});
    temporary=join(dirname(output),'.nona-'+randomUUID()+'.tmp');
    writeFileSync(temporary,result.image,{flag:'wx',mode:target==='linux-x64'?0o755:0o666});
    // Recheck aliases immediately before the atomic replacement as well.
    assertDifferent(input,output);renameSync(temporary,output);temporary=undefined;
    return 0;
  }catch(error){process.stderr.write('nona: '+(error instanceof Error?error.message:String(error))+'\n');return 1;}
  finally{if(temporary){try{unlinkSync(temporary);}catch{ /* Preserve the original error. */ }}}
}
process.exitCode=main(process.argv.slice(2));
