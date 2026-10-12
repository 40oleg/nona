import type * as A from './ast.js';
import {lex} from './lexer.js';
import {parse} from './parser.js';
import {lowerDynamicFunctions} from './dynamic-functions.js';
import {lowerLiteralEval} from './eval-aot.js';
import {CompileError} from '../diagnostics.js';
import {NodeResolver,type NodeFileSystem} from './node-resolution.js';
import type {ModuleHost} from './modules.js';

/**
 * CommonJS modules and npm packages (issue #249).
 *
 * Every module of the graph is an ES module record; a CommonJS file takes two
 * records, both built here from its text:
 *
 * - the *factory* record (`<path>?commonjs`) wraps the file in Node's module
 *   wrapper `function (exports, require, module, __filename, __dirname)`
 *   and exports what `define` of `nona:internal/commonjs` makes of it: the
 *   function, the module's file names and its `require` table. The table
 *   lists every `require('literal')` of the file, resolved now: a CommonJS
 *   dependency is the default export of its own factory record, an ES module
 *   or a builtin its namespace. Evaluating a factory record runs no code of
 *   the file, so the graph of factories (cycles included) can be linked
 *   eagerly while `require` keeps CommonJS order: a module runs when it is
 *   first required, and a cycle sees the partial `module.exports`.
 * - the *facade* record (`<path>`) is what an `import` of the file sees: it
 *   runs the module (once, through the same cache as `require`) and exports
 *   `module.exports` as the default export, plus the names a static scan of
 *   the file finds assigned to `exports` (as Node's cjs-module-lexer does).
 *
 * The wrapper function is sloppy unless the file says "use strict", and it is
 * compiled in global scope: like code from `Function`, its free names are
 * globals, never the factory record's own imports.
 *
 * A `require` with a computed argument, or of a file that is not found, throws
 * MODULE_NOT_FOUND when it runs, as in Node; `try { require('optional') }`
 * keeps working. A `.json` file is a CommonJS module whose exports are the
 * parsed JSON.
 */

export type ModuleFormat='module'|'commonjs'|'json';

/** The suffix of a CommonJS file's factory record. */
export const factorySuffix='?commonjs';

const commonJsNames=['require','module','exports','__filename','__dirname'];
const wrapperParameters='exports, require, module, __filename, __dirname, global';

function walk(node:unknown,visit:(node:A.Node,parent:A.Node|undefined)=>void,parent?:A.Node):void {
  const pending:[unknown,A.Node|undefined][]=[[node,parent]];
  while(pending.length){
    const [value,outer]=pending.pop()!;
    if(Array.isArray(value)){for(let index=value.length-1;index>=0;index--)pending.push([value[index],outer]);continue;}
    if(!value||typeof value!=='object')continue;
    const record=value as Record<string,unknown>;
    const current=typeof record.kind==='string'&&typeof record.span==='object'?record as unknown as A.Node:outer;
    if(current!==outer)visit(current!,outer);
    const entries=Object.entries(record);
    for(let index=entries.length-1;index>=0;index--){
      const [key,child]=entries[index]!;
      if(key!=='span'&&key!=='source'&&key!=='sourceSpan')pending.push([child,current]);
    }
  }
}

const stringOf=(node:A.Node|undefined):string|undefined=>{
  if(!node)return undefined;
  if(node.kind==='Literal'&&typeof (node as A.Literal).value==='string')return (node as A.Literal).value as string;
  if(node.kind==='Template'&&(node as A.Template).expressions.length===0)return (node as A.Template).quasis[0];
  return undefined;
};

/** Whether a program uses import/export declarations or import.meta: ES module syntax. */
export function hasModuleSyntax(program:A.Program):boolean {
  if(program.body.some(statement=>statement.kind==='Import'||statement.kind==='Export'))return true;
  let found=false;
  walk(program.body,node=>{if(node.kind==='ImportMeta')found=true;});
  return found;
}

/** Whether a script refers to CommonJS names (require, module, exports, ...) it does not declare at its top level. */
export function usesCommonJs(program:A.Program):boolean {
  const declared=new Set<string>();
  for(const statement of program.body){
    if(statement.kind==='Var')for(const declaration of statement.declarations)if(declaration.id.kind==='Identifier')declared.add(declaration.id.name);
    if((statement.kind==='Function'||statement.kind==='Class')&&statement.id)declared.add(statement.id.name);
  }
  let found=false;
  walk(program.body,node=>{
    if(!found&&node.kind==='Identifier'&&commonJsNames.includes((node as A.Identifier).name)&&!declared.has((node as A.Identifier).name))found=true;
  });
  return found;
}

/**
 * The format of a file: by extension (.mjs, .cjs, .json), else by the nearest
 * package.json "type", else by syntax, as Node does for files without a type:
 * ES module syntax makes an ES module, a reference to require, module or
 * exports a CommonJS module, and anything else stays an ES module (Nona's
 * behaviour for such files before CommonJS existed).
 */
export function moduleFormat(path:string,text:string,resolver:NodeResolver):ModuleFormat {
  if(path.endsWith('.json'))return 'json';
  if(path.endsWith('.mjs'))return 'module';
  if(path.endsWith('.cjs'))return 'commonjs';
  const type=resolver.packageScope(path)?.type;
  if(type==='module')return 'module';
  if(type==='commonjs')return 'commonjs';
  return detectFormat(text);
}

/** The format of source text by its syntax alone. */
export function detectFormat(text:string):'module'|'commonjs' {
  if(/\b(import|export)\b/.test(text)){
    try{if(hasModuleSyntax(parse(lex(text,{module:true}),{module:true})))return 'module';}
    catch{ /* Not valid module code: decided below. */ }
  }
  if(!/\b(require|module|exports|__filename|__dirname)\b/.test(text))return 'module';
  try{return usesCommonJs(parse(lex(text)))?'commonjs':'module';}
  catch{return 'commonjs';}
}

export interface CommonJsAnalysis {
  /** Literal `require('x')` specifiers, in source order. */
  requires:string[];
  /** Literal `require.resolve('x')` specifiers. */
  resolves:string[];
  /** Names assigned to exports / module.exports.name, or keys of a module.exports object literal. */
  exportNames:string[];
  /** `module.exports = require('x')` and `__exportStar(require('x'), exports)`: their names are exported too. */
  reexports:string[];
}

const isExports=(node:A.Node):boolean=>node.kind==='Identifier'&&(node as A.Identifier).name==='exports'
  ||node.kind==='Member'&&(node as A.Member).object.kind==='Identifier'&&((node as A.Member).object as A.Identifier).name==='module'&&stringOf((node as A.Member).property)==='exports';
const isModuleExports=(node:A.Node):boolean=>node.kind==='Member'&&(node as A.Member).object.kind==='Identifier'&&((node as A.Member).object as A.Identifier).name==='module'&&stringOf((node as A.Member).property)==='exports';
const requireCall=(node:A.Node|undefined):string|undefined=>{
  if(node?.kind!=='Call')return undefined;
  const call=node as A.Call;
  return call.callee.kind==='Identifier'&&call.callee.name==='require'&&call.arguments.length>=1?stringOf(call.arguments[0] as A.Node):undefined;
};

/** The requires and exports of a CommonJS file. */
export function analyzeCommonJs(program:A.Program):CommonJsAnalysis {
  const requires:string[]=[],resolves:string[]=[],names:string[]=[],reexports:string[]=[];
  const add=(list:string[],value:string|undefined)=>{if(value!==undefined&&!list.includes(value))list.push(value);};
  walk(program.body,node=>{
    if(node.kind==='Call'){
      const call=node as A.Call;
      add(requires,requireCall(call));
      if(call.callee.kind==='Member'&&call.callee.object.kind==='Identifier'&&call.callee.object.name==='require'&&stringOf(call.callee.property)==='resolve')add(resolves,stringOf(call.arguments[0] as A.Node));
      // Object.defineProperty(exports, 'name', ...): TypeScript's re-exports and getters.
      if(call.callee.kind==='Member'&&call.callee.object.kind==='Identifier'&&call.callee.object.name==='Object'&&stringOf(call.callee.property)==='defineProperty'&&call.arguments[0]&&isExports(call.arguments[0] as A.Node))add(names,stringOf(call.arguments[1] as A.Node));
      // __exportStar(require('x'), exports) and __export(require('x')).
      if(call.callee.kind==='Identifier'&&/^__export(Star)?$/.test(call.callee.name))add(reexports,requireCall(call.arguments[0] as A.Node));
      if(call.callee.kind==='Member'&&/^__export(Star)?$/.test(stringOf(call.callee.property)??''))add(reexports,requireCall(call.arguments[0] as A.Node));
    }
    if(node.kind==='Assignment'&&(node as A.Assignment).operator==='='){
      const assignment=node as A.Assignment,left=assignment.left as A.Node;
      if(left.kind==='Member'&&isExports((left as A.Member).object))add(names,stringOf((left as A.Member).property));
      if(isModuleExports(left)){
        const right=assignment.right;
        add(reexports,requireCall(right));
        if(right.kind==='ObjectLiteral')for(const property of right.properties){
          if('spread'in property||!('key'in property)||property.computed)continue;
          add(names,stringOf(property.key));
        }
      }
    }
  });
  return {requires,resolves,exportNames:names.filter(name=>name!=='default'),reexports};
}

const reserved=new Set(['await','break','case','catch','class','const','continue','debugger','default','delete','do','else','enum','export','extends','false','finally','for','function','if','implements','import','in','instanceof','interface','let','new','null','package','private','protected','public','return','static','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','eval','arguments']);
const exportable=(name:string):boolean=>/^[A-Za-z_$][\w$]*$/.test(name)&&!reserved.has(name)&&!name.startsWith('__nona');

/** A host path as the running program names it: `C:\x\y.js` for a drive path, `/x/y.js` otherwise. */
export function nativePath(path:string):string {
  return /^\/[A-Za-z]:\//.test(path)?path.slice(1).split('/').join('\\'):path;
}
const nativeDirname=(path:string):string=>{const at=path.lastIndexOf('/');const directory=at<=0?'/':path.slice(0,at);return nativePath(/^\/[A-Za-z]:$/.test(directory)?directory+'/':directory);};

function fail(message:string,path:string,span:{start:number;end:number}={start:0,end:0}):never {
  throw new CompileError([{code:'E_MODULE',message,file:path,span}]);
}

/** The real file system in canonical paths. */
export function hostFileSystem(fs:{readFileSync(path:string,encoding:'utf8'):string;statSync(path:string,options?:{throwIfNoEntry:boolean}):{isFile():boolean;isDirectory():boolean}|undefined;realpathSync(path:string):string}):NodeFileSystem {
  const native=(path:string)=>/^\/[A-Za-z]:\//.test(path)?path.slice(1):path;
  const canonical=(path:string)=>{const slashed=path.split('\\').join('/');return slashed.startsWith('/')?slashed:'/'+slashed;};
  const stat=(path:string)=>{try{return fs.statSync(native(path),{throwIfNoEntry:false});}catch{return undefined;}};
  return {
    read:path=>{try{return fs.readFileSync(native(path),'utf8');}catch{return undefined;}},
    isFile:path=>stat(path)?.isFile()??false,
    isDirectory:path=>stat(path)?.isDirectory()??false,
    realpath:path=>canonical(fs.realpathSync(native(path))),
  };
}

export interface NodeHostOptions {
  /** Whether a specifier names a builtin module this target provides (`fs`, `node:path`, ...). */
  isBuiltin?(specifier:string):boolean;
  /** Text of files that need not exist on disk (the entry of a compile from source). */
  overrides?:Map<string,string>;
  /** Extra `exports` conditions, tried before Nona's own. */
  conditions?:readonly string[];
}

/**
 * A module host that resolves like Node.js and compiles CommonJS files and
 * JSON (see the comment at the top of this file).
 */
export class NodeModuleHost implements ModuleHost {
  readonly resolver:NodeResolver;
  private formats=new Map<string,ModuleFormat>();
  private analyses=new Map<string,CommonJsAnalysis>();
  constructor(readonly fs:NodeFileSystem,readonly options:NodeHostOptions={}){
    this.resolver=new NodeResolver(fs,options.conditions);
  }

  private text(path:string):string|undefined {
    return this.options.overrides?.get(path)??this.fs.read(path);
  }

  format(path:string):ModuleFormat {
    let format=this.formats.get(path);
    if(format===undefined){
      const text=this.text(path);
      format=text===undefined?'module':moduleFormat(path,text,this.resolver);
      this.formats.set(path,format);
    }
    return format;
  }

  resolve(specifier:string,referrer:string):string|undefined {
    if(specifier.endsWith(factorySuffix))return specifier;
    const from=referrer.endsWith(factorySuffix)?referrer.slice(0,-factorySuffix.length):referrer;
    if(this.options.overrides?.has(specifier)&&specifier.startsWith('/'))return specifier;
    return this.resolver.resolve(specifier,from,'import');
  }

  read(path:string):string|undefined {
    if(path.endsWith(factorySuffix))return '';
    const text=this.text(path);
    if(text===undefined)return undefined;
    const format=this.format(path);
    if(format==='module')return text;
    return this.facadeSource(path);
  }

  /** The AST of a synthesized record: a factory record. Facades and ES modules are parsed from text. */
  program(path:string):A.Program|undefined {
    if(!path.endsWith(factorySuffix))return undefined;
    return this.factoryProgram(path.slice(0,-factorySuffix.length));
  }

  /** The module text a script entry stands for when it is CommonJS: run it as the main module. */
  mainSource(path:string):string {
    return `import __nona_cjs_record from ${JSON.stringify(path+factorySuffix)};\nimport {runMain as __nona_cjs_main} from 'nona:internal/commonjs';\n__nona_cjs_main(__nona_cjs_record);\n`;
  }

  /** The requires and exports of a CommonJS file (cached). */
  analysis(path:string):CommonJsAnalysis {
    let analysis=this.analyses.get(path);
    if(!analysis){
      analysis=this.format(path)==='json'?{requires:[],resolves:[],exportNames:[],reexports:[]}:analyzeCommonJs(this.wrapper(path).program);
      this.analyses.set(path,analysis);
    }
    return analysis;
  }

  private wrapperCache=new Map<string,{program:A.Program;prefix:number}>();
  /** The file inside Node's module wrapper, parsed as sloppy script code. */
  private wrapper(path:string):{program:A.Program;prefix:number} {
    let cached=this.wrapperCache.get(path);
    if(cached)return cached;
    const text=this.text(path);
    if(text===undefined)fail(`Cannot read module ${path}`,path);
    let body=text!;
    if(this.format(path)==='json'){
      try{JSON.parse(body);}catch(error){fail(`Invalid JSON in ${path}: ${(error as Error).message}`,path);}
      body=`module.exports = JSON.parse(${JSON.stringify(body)});`;
    }
    // A shebang line is allowed at the start of a CommonJS file.
    if(body.startsWith('#!'))body='//'+body.slice(2);
    const prefix=`(function (${wrapperParameters}) {`;
    const source=prefix+body+'\n})';
    let program:A.Program;
    try{program=parse(lex(source));}
    catch(error){
      if(!(error instanceof CompileError))throw error;
      throw new CompileError(error.diagnostics.map(d=>({...d,file:path,span:{start:Math.max(0,d.span.start-prefix.length),end:Math.max(0,d.span.end-prefix.length)}})));
    }
    cached={program,prefix:prefix.length};
    this.wrapperCache.set(path,cached);
    return cached;
  }

  /** Names a facade exports besides default: the file's own and those of the modules it re-exports. */
  private exportNames(path:string,seen=new Set<string>()):string[] {
    if(seen.has(path)||seen.size>16)return [];
    seen.add(path);
    const analysis=this.analysis(path),names=[...analysis.exportNames];
    for(const specifier of analysis.reexports){
      const target=this.resolver.resolve(specifier,path,'require');
      if(target===undefined)continue;
      const format=this.format(target);
      if(format==='commonjs')for(const name of this.exportNames(target,seen))if(!names.includes(name))names.push(name);
    }
    return names.filter(exportable);
  }

  private facadeSource(path:string):string {
    const lines=[`import __nona_cjs_record from ${JSON.stringify(path+factorySuffix)};`,`import {importDefault as __nona_cjs_load} from 'nona:internal/commonjs';`,
      `const __nona_cjs_exports = __nona_cjs_load(__nona_cjs_record);`,`export default __nona_cjs_exports;`];
    const names=this.format(path)==='json'?[]:this.exportNames(path);
    names.forEach((name,index)=>lines.push(`const __nona_cjs_${index} = __nona_cjs_exports == null ? undefined : __nona_cjs_exports[${JSON.stringify(name)}];`,`export {__nona_cjs_${index} as ${name}};`));
    return lines.join('\n')+'\n';
  }

  /** How a required file is reached from a factory: its own factory (0), or as an ES module namespace (1). */
  private factoryProgram(path:string):A.Program {
    const wrapper=this.wrapper(path),analysis=this.analysis(path);
    const imports:string[]=[`import {define as __nona_cjs_define} from 'nona:internal/commonjs';`];
    const entries:string[]=[];
    const target=(specifier:string):{path:string;kind:0|1|2;native:string}|undefined=>{
      if(this.options.isBuiltin?.(specifier))return {path:specifier,kind:2,native:specifier};
      let resolved:string|undefined;
      try{resolved=this.resolver.resolve(specifier,path,'require');}catch{resolved=undefined;}
      if(resolved===undefined)return undefined;
      const format=this.format(resolved);
      return format==='module'?{path:resolved,kind:1,native:nativePath(resolved)}:{path:resolved+factorySuffix,kind:0,native:nativePath(resolved)};
    };
    analysis.requires.forEach((specifier,index)=>{
      const found=target(specifier);
      if(!found)return;
      const local=`__nona_cjs_d${index}`;
      imports.push(found.kind===0?`import ${local} from ${JSON.stringify(found.path)};`:`import * as ${local} from ${JSON.stringify(found.path)};`);
      entries.push(`[${JSON.stringify(specifier)}, [${JSON.stringify(found.native)}, () => ${local}, ${found.kind}]]`);
    });
    for(const specifier of analysis.resolves){
      if(analysis.requires.includes(specifier))continue;
      const found=target(specifier);
      if(found)entries.push(`[${JSON.stringify(specifier)}, [${JSON.stringify(found.native)}, undefined, ${found.kind}]]`);
    }
    const header=imports.join('\n')+`\nexport default __nona_cjs_define(${JSON.stringify(nativePath(path))}, ${JSON.stringify(nativeDirname(path))}, null, new Map([${entries.join(', ')}]));\n`;
    const program=parse(lex(header,{module:true}),{module:true});
    // The wrapper's own Function(...) and eval(...) are compiled ahead of time
    // in its scope; their hoisted helpers move into the wrapper's body.
    const lowered=lowerLiteralEval(lowerDynamicFunctions(wrapper.program));
    const statement=lowered.body.find(s=>s.kind==='ExpressionStatement'&&(s as A.ExpressionStatement).expression.kind==='FunctionExpression') as A.ExpressionStatement|undefined;
    if(!statement)fail(`Cannot compile CommonJS module ${path}`,path);
    const fn=statement!.expression as A.FunctionExpression;
    const hoisted=lowered.body.filter(s=>s!==statement);
    if(hoisted.length)fn.body={...fn.body,body:[...hoisted,...fn.body.body]};
    fn.dynamic=true;
    const exported=program.body[program.body.length-1] as A.ExportDeclaration;
    (exported.defaultExpression as A.Call).arguments[2]=fn;
    // Function source text (toString, coverage) comes from the wrapper's text.
    return {...program,source:wrapper.program.source};
  }
}
