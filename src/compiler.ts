import type { Diagnostic } from './diagnostics.js';
import { CompileError } from './diagnostics.js';
import { lex } from './frontend/lexer.js';
import { parse } from './frontend/parser.js';
import { bind } from './frontend/binder.js';
import { lower } from './ir/lower.js';
import type {ModuleIR} from './ir/model.js';
import { generate } from './backend/x64/codegen.js';
import { linkPe } from './backend/pe/writer.js';
import { linkLinux } from './backend/linux/index.js';
export interface CompileOptions {fileName:string;target:'win32-x64'|'linux-x64';unhandledRejections?:'throw'|'ignore'}
export type CompileResult = {ok:true;image:Uint8Array;imports:string[]}|{ok:false;diagnostics:Diagnostic[]};
/** Target-independent ECMAScript frontend and IR lowering. Native targets share this path. */
export function compileToIR(source:string):ModuleIR {
  return {...lower(bind(parse(lex(source)))),runtimePrelude:true};
}
export function compile(source:string, options:CompileOptions):CompileResult {
  try {
    if(options.target!=='win32-x64'&&options.target!=='linux-x64')throw new CompileError([{code:'E_TARGET',file:options.fileName,span:{start:0,end:0},message:'Unsupported native target'}]);
    const program=generate(compileToIR(source),{unhandledRejections:options.unhandledRejections});
    return {ok:true,image:options.target==='linux-x64'?linkLinux(program):linkPe(program),imports:options.target==='linux-x64'?[]:program.imports.map(i=>i.dll+'!'+i.name)};
  } catch(error) {
    if(error instanceof CompileError)return {ok:false,diagnostics:error.diagnostics.map(d=>({...d,file:options.fileName}))};
    throw error;
  }
}
