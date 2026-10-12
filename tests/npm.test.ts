import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {compile} from '../src/compiler.js';
import {requireHostTarget} from '../src/target.js';
import {NodeResolver,parsePackageSpecifier,type NodeFileSystem} from '../src/frontend/node-resolution.js';
import {analyzeCommonJs,detectFormat} from '../src/frontend/commonjs.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

// npm packages (#249): node_modules resolution, package.json exports and
// imports, CommonJS modules and their interplay with ES modules. Every
// program runs natively and on Node.js, which must print the same.

function writeTree(directory:string,files:Record<string,string>):void {
 for(const [name,text] of Object.entries(files)){
  const path=join(directory,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);
 }
}

function runProject(files:Record<string,string>,entry:string,setup?:(directory:string)=>void):{native:string;oracle:string} {
 const directory=mkdtempSync(join(tmpdir(),'nona-npm-'));
 try{
  writeTree(directory,files);setup?.(directory);
  const entryPath=join(directory,entry);
  const result=compile(readFileSync(entryPath,'utf8'),{fileName:entryPath,target:requireHostTarget(),module:entry.endsWith('.mjs')});
  if(!result.ok)assert.fail(result.diagnostics.map(d=>`${d.file}: ${d.code} ${d.message}`).join('\n'));
  const executable=join(directory,process.platform==='win32'?'program.exe':'program');
  writeFileSync(executable,result.image);chmodSync(executable,0o755);
  const native=spawnSync(executable,[],{cwd:directory,encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(native.error,undefined);assert.equal(native.status,0,native.stderr);
  const oracle=spawnSync(process.execPath,[entryPath],{cwd:directory,encoding:'utf8',timeout:20_000,windowsHide:true});
  assert.equal(oracle.status,0,oracle.stderr);
  return {native:native.stdout.replaceAll(directory,'<dir>'),oracle:oracle.stdout.replaceAll(directory,'<dir>')};
 }finally{removeTemporaryDirectory(directory);}
}

const agree=(files:Record<string,string>,entry:string,setup?:(directory:string)=>void)=>{
 const {native,oracle}=runProject(files,entry,setup);
 assert.ok(oracle.length>0);
 assert.equal(native,oracle);
};

/** A virtual file tree for the resolver (canonical paths). */
function virtualFs(files:Record<string,string>,links:Record<string,string>={}):NodeFileSystem {
 const real=(path:string)=>{for(const [from,to] of Object.entries(links))if(path===from||path.startsWith(from+'/'))return to+path.slice(from.length);return path;};
 const directories=new Set<string>();
 for(const name of Object.keys(files)){let at=name;while((at=at.slice(0,at.lastIndexOf('/')))!=='')directories.add(at);}
 return {
  read:path=>files[real(path)],
  isFile:path=>Object.hasOwn(files,real(path)),
  isDirectory:path=>directories.has(real(path)),
  realpath:path=>real(path),
 };
}

test('package specifiers split into a name and a subpath',()=>{
 assert.deepEqual(parsePackageSpecifier('lodash'),{name:'lodash',subpath:'.'});
 assert.deepEqual(parsePackageSpecifier('lodash/fp/map'),{name:'lodash',subpath:'./fp/map'});
 assert.deepEqual(parsePackageSpecifier('@babel/core'),{name:'@babel/core',subpath:'.'});
 assert.deepEqual(parsePackageSpecifier('@babel/core/lib/x.js'),{name:'@babel/core',subpath:'./lib/x.js'});
 for(const invalid of ['./x','/x','#x','@scope','a/../b','a\\b'])assert.equal(parsePackageSpecifier(invalid),undefined,invalid);
});

test('the resolver follows Node: files, directories, node_modules, exports, imports, self-reference and links',()=>{
 const fs=virtualFs({
  '/app/package.json':JSON.stringify({name:'app',imports:{'#util':'./src/util.js','#dep':'dep','#internal/*':'./src/internal/*.js'},exports:{'.':'./src/index.js','./feature':'./src/feature.js'}}),
  '/app/src/index.js':'','/app/src/util.js':'','/app/src/feature.js':'','/app/src/internal/a.js':'','/app/src/dir/index.js':'','/app/src/data.json':'',
  '/app/node_modules/plain/package.json':JSON.stringify({main:'lib/main'}),'/app/node_modules/plain/lib/main.js':'','/app/node_modules/plain/extra.js':'',
  '/app/node_modules/noindex/index.js':'',
  '/app/node_modules/dep/package.json':JSON.stringify({exports:{node:{import:'./esm.mjs',require:'./cjs.cjs'},default:'./browser.js'}}),'/app/node_modules/dep/esm.mjs':'','/app/node_modules/dep/cjs.cjs':'','/app/node_modules/dep/browser.js':'',
  '/app/node_modules/patterns/package.json':JSON.stringify({exports:{'./*':'./lib/*.js','./sub/*':'./sub/*.js','./sub/private/*':null,'./list':['./missing.js','./present.js']}}),
  '/app/node_modules/patterns/lib/a.js':'','/app/node_modules/patterns/sub/b.js':'','/app/node_modules/patterns/sub/private/c.js':'','/app/node_modules/patterns/present.js':'',
  '/app/node_modules/@scope/pkg/package.json':JSON.stringify({exports:'./entry.js'}),'/app/node_modules/@scope/pkg/entry.js':'','/app/node_modules/@scope/pkg/hidden.js':'',
  '/store/linked@1/node_modules/linked/package.json':JSON.stringify({main:'index.js'}),'/store/linked@1/node_modules/linked/index.js':'',
  '/node_modules/hoisted/index.js':'',
 },{'/app/node_modules/linked':'/store/linked@1/node_modules/linked'});
 const resolver=new NodeResolver(fs),from='/app/src/index.js';
 const r=(specifier:string,kind:'import'|'require'='require')=>resolver.resolve(specifier,from,kind);
 assert.equal(r('./util'),'/app/src/util.js');
 assert.equal(r('./util.js'),'/app/src/util.js');
 assert.equal(r('./dir'),'/app/src/dir/index.js');
 assert.equal(r('./data'),'/app/src/data.json');
 assert.equal(r('../package.json'),'/app/package.json');
 assert.equal(r('./missing'),undefined);
 assert.equal(r('plain'),'/app/node_modules/plain/lib/main.js');
 assert.equal(r('plain/extra'),'/app/node_modules/plain/extra.js');
 assert.equal(r('noindex'),'/app/node_modules/noindex/index.js');
 assert.equal(r('dep','require'),'/app/node_modules/dep/cjs.cjs');
 assert.equal(r('dep','import'),'/app/node_modules/dep/esm.mjs');
 assert.equal(r('dep/esm.mjs'),undefined,'not exported');
 assert.equal(r('patterns/a'),'/app/node_modules/patterns/lib/a.js');
 assert.equal(r('patterns/sub/b'),'/app/node_modules/patterns/sub/b.js','the longest pattern wins');
 assert.equal(r('patterns/sub/private/c'),undefined,'a null target excludes');
 assert.equal(r('patterns/list'),'/app/node_modules/patterns/present.js','an array falls back');
 assert.equal(r('@scope/pkg'),'/app/node_modules/@scope/pkg/entry.js');
 assert.equal(r('@scope/pkg/hidden.js'),undefined);
 assert.equal(r('linked'),'/store/linked@1/node_modules/linked/index.js','symbolic links resolve to the real path');
 assert.equal(r('hoisted'),'/node_modules/hoisted/index.js','node_modules of every ancestor');
 assert.equal(r('#util'),'/app/src/util.js');
 assert.equal(r('#internal/a'),'/app/src/internal/a.js');
 assert.equal(r('#dep','import'),'/app/node_modules/dep/esm.mjs','imports may name packages');
 assert.equal(r('#missing'),undefined);
 assert.equal(r('app'),'/app/src/index.js','self-reference');
 assert.equal(r('app/feature'),'/app/src/feature.js');
 assert.equal(r('app/src/util.js'),undefined,'self-reference goes through exports');
 assert.equal(new NodeResolver(fs,['browser']).resolve('dep','/app/x.js','require'),'/app/node_modules/dep/cjs.cjs','node comes first in the package');
});

test('files are CommonJS or ES modules by their syntax when no type says',()=>{
 assert.equal(detectFormat('import x from "y"; x();'),'module');
 assert.equal(detectFormat('export const a = 1;'),'module');
 assert.equal(detectFormat('console.log(import.meta.url)'),'module');
 assert.equal(detectFormat('const fs = require("fs"); module.exports = fs;'),'commonjs');
 assert.equal(detectFormat('exports.a = 1;'),'commonjs');
 assert.equal(detectFormat('console.log(1)'),'module');
 assert.equal(detectFormat('var module = {}; module.x = 1;'),'module','a declared name is not CommonJS');
 assert.equal(detectFormat('with (a) { exports.b = 1 }'),'commonjs','sloppy code');
 assert.equal(detectFormat('const s = "import x from y"; require("z")'),'commonjs');
});

test('the static scan finds requires and exported names as cjs-module-lexer does',()=>{
 const program=(text:string)=>parse(lex(`(function (exports, require, module) {${text}\n})`));
 const analysis=analyzeCommonJs(program(`
  'use strict';
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.b = exports.a = void 0;
  const x = require('./x'), y = require(\`./y\`);
  if (z) require('optional');
  require(name);
  exports.a = 1; exports.b = 2; module.exports.c = 3;
  Object.defineProperty(exports, 'd', { enumerable: true, get: function () { return x.d; } });
  __exportStar(require("./star"), exports);
  tslib.__exportStar(require("./star2"), exports);
  require.resolve('./resolved');
 `));
 assert.deepEqual(analysis.requires,['./x','./y','optional','./star','./star2']);
 assert.deepEqual(analysis.resolves,['./resolved']);
 assert.deepEqual(analysis.exportNames,['__esModule','b','a','c','d']);
 assert.deepEqual(analysis.reexports,['./star','./star2']);
 const literal=analyzeCommonJs(program(`module.exports = { one, two: 2, 'three': 3, four() {}, ...rest, [computed]: 5 };`));
 assert.deepEqual(literal.exportNames,['one','two','three','four']);
 assert.deepEqual(analyzeCommonJs(program(`module.exports = require('./other');`)).reexports,['./other']);
});

test('a CommonJS program requires packages, JSON and builtins as Node does',()=>agree({
 'package.json':JSON.stringify({name:'app',version:'1.0.0'}),
 'index.js':String.raw`
'use strict';
const lib = require('lib');
const {name, version} = require('./package.json');
const path = require('node:path'), events = require('events'), fs = require('fs');
console.log(lib.greet('npm'), lib.count(), lib.count(), name, version);
console.log(path.basename('/a/b/c.txt'), typeof events, typeof events.EventEmitter, fs === require('node:fs'));
console.log(require('lib') === lib, require.main === module, module.id, typeof module.exports, this === module.exports);
console.log(typeof __filename, __filename.endsWith('index.js'), __dirname.length > 0, typeof require.resolve('lib'));
console.log(require.resolve('node:path'), require.resolve('lib').endsWith('main.js'));
for (const bad of ['missing-package', './missing', ['computed'][0]]) {
  try { require(bad); console.log('loaded', bad); } catch (error) { console.log(error.code, error.message.split('\n')[0]); }
}
try { require(42); } catch (error) { console.log(error.name, error.code); }
`,
 'node_modules/lib/package.json':JSON.stringify({name:'lib',main:'./src/main'}),
 'node_modules/lib/src/main.js':String.raw`
let counter = 0;
const helper = require('./helper');
module.exports = { greet: name => helper.prefix + name, count: () => ++counter };
`,
 'node_modules/lib/src/helper.js':`exports.prefix = 'hello, ';`,
},'index.js'));

test('CommonJS cycles see partial exports; require.cache controls reloading; a module that throws is loaded again',()=>agree({
 'main.js':String.raw`
const a = require('./a');
console.log('main', a.done, a.fromB);
const first = require('./counted');
delete require.cache[require.resolve('./counted')];
const second = require('./counted');
console.log(first === second, first.id, second.id, Object.keys(require.cache).length > 0);
for (let attempt = 0; attempt < 2; attempt++) {
  try { console.log('flaky', require('./flaky').ok); } catch (error) { console.log('flaky threw', error.message); }
}
console.log(module.children.length, module.children[0].exports === a, a.parentIsMain);
`,
 'a.js':String.raw`
exports.done = false;
const b = require('./b');
exports.fromB = b.sawPartial;
exports.done = true;
exports.parentIsMain = module.parent === require.main;
`,
 'b.js':String.raw`
const a = require('./a');
exports.sawPartial = 'a.done=' + a.done;
`,
 'counted.js':`globalThis.loads = (globalThis.loads || 0) + 1; exports.id = globalThis.loads;`,
 'flaky.js':`globalThis.flakyRuns = (globalThis.flakyRuns || 0) + 1; if (globalThis.flakyRuns === 1) throw new Error('first time'); exports.ok = 'second time';`,
},'main.js'));

test('CommonJS code is sloppy unless it says use strict, and its free names are globals',()=>agree({
 'main.js':String.raw`
const sloppy = require('./sloppy'), strict = require('./strict');
console.log(sloppy.thisInFunction, sloppy.withValue, typeof leaked, leaked, sloppy.octal);
console.log(strict.thisInFunction, strict.assignError);
console.log(typeof global, global === globalThis, typeof process, typeof setTimeout);
`,
 'sloppy.js':String.raw`
function f() { return this === globalThis; }
var o = { v: 'with' };
with (o) { exports.withValue = v; }
leaked = 'implicit global';
exports.thisInFunction = f();
exports.octal = 010;
`,
 'strict.js':String.raw`
'use strict';
function f() { return this; }
exports.thisInFunction = String(f());
try { undeclaredInStrict = 1; } catch (error) { exports.assignError = error.name; }
`,
},'main.js'));

test('ES modules import CommonJS packages with named exports, and CommonJS requires ES modules',()=>agree({
 'main.mjs':String.raw`
import lib, {alpha, beta, gamma, fromStar, fromReexport} from 'cjs-lib';
import * as namespace from 'cjs-lib';
import json from './data.json' with { type: 'json' };
import plain from 'plain-object';
import dual from 'dual';
import {createRequire} from './loader.cjs';
console.log(alpha, beta, gamma, fromStar, fromReexport, typeof lib, lib.alpha === alpha);
console.log(Object.keys(namespace).sort().join(), namespace.default === lib);
console.log(json.items.length, plain.x, plain.y, dual);
console.log(createRequire().kind, createRequire().value);
`,
 'data.json':JSON.stringify({items:[1,2,3]}),
 'loader.cjs':String.raw`
const esm = require('./esm-dep.mjs');
exports.createRequire = () => ({ kind: typeof esm, value: esm.value });
`,
 'esm-dep.mjs':`export const value = 'from esm';`,
 'node_modules/cjs-lib/package.json':JSON.stringify({name:'cjs-lib'}),
 'node_modules/cjs-lib/index.js':String.raw`
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.alpha = 'a';
module.exports.beta = 'b';
Object.defineProperty(exports, 'gamma', { enumerable: true, value: 'g' });
function __exportStar(m, e) { for (const k in m) if (k !== 'default' && !(k in e)) e[k] = m[k]; }
__exportStar(require('./star'), exports);
`,
 'node_modules/cjs-lib/star.js':String.raw`
exports.fromStar = 'star';
exports.fromReexport = require('./again').fromReexport;
`,
 'node_modules/cjs-lib/again.js':`module.exports = { fromReexport: 'again' };`,
 'node_modules/plain-object/package.json':JSON.stringify({name:'plain-object',main:'lib.js'}),
 'node_modules/plain-object/lib.js':`module.exports = { x: 1, y: 2 };`,
 'node_modules/dual/package.json':JSON.stringify({name:'dual',exports:{import:'./index.mjs',require:'./index.cjs'}}),
 'node_modules/dual/index.mjs':`export default 'dual esm';`,
 'node_modules/dual/index.cjs':`module.exports = 'dual cjs';`,
},'main.mjs'));

test('packages use exports patterns, imports, self-reference and type module',()=>agree({
 'package.json':JSON.stringify({name:'app',type:'module',imports:{'#config':'./config.js','#lib/*':'./lib/*.js'},exports:{'.':'./main.js','./tools':'./lib/tools.js'}}),
 'main.js':String.raw`
import config from '#config';
import {tool} from '#lib/tools';
import {tool as again} from 'app/tools';
import feature from 'patterns/features/one';
import {required} from 'patterns/cjs';
console.log(config.mode, tool(), again === tool, feature, required);
`,
 'config.js':`export default { mode: 'module' };`,
 'lib/tools.js':`export function tool() { return 'tool'; }`,
 'node_modules/patterns/package.json':JSON.stringify({name:'patterns',exports:{'./features/*':'./src/features/*.mjs','./cjs':{require:'./src/c.cjs',import:'./src/c.mjs'}}}),
 'node_modules/patterns/src/features/one.mjs':`export default 'feature one';`,
 'node_modules/patterns/src/c.mjs':`export const required = 'import condition';`,
 'node_modules/patterns/src/c.cjs':`exports.required = 'require condition';`,
},'main.js'));

test('pnpm-style linked packages are one module',()=>agree({
 'index.js':String.raw`
const direct = require('linked');
const viaOther = require('other');
console.log(direct === viaOther.linked, direct.instance);
`,
 '.pnpm/linked@1.0.0/node_modules/linked/package.json':JSON.stringify({name:'linked'}),
 '.pnpm/linked@1.0.0/node_modules/linked/index.js':`globalThis.instances = (globalThis.instances || 0) + 1; exports.instance = globalThis.instances;`,
 '.pnpm/other@1.0.0/node_modules/other/package.json':JSON.stringify({name:'other'}),
 '.pnpm/other@1.0.0/node_modules/other/index.js':`exports.linked = require('linked');`,
},'index.js',directory=>{
 const link=(target:string,path:string)=>{mkdirSync(dirname(path),{recursive:true});symlinkSync(target,path,'junction');};
 link(join(directory,'.pnpm/linked@1.0.0/node_modules/linked'),join(directory,'node_modules/linked'));
 link(join(directory,'.pnpm/other@1.0.0/node_modules/other'),join(directory,'node_modules/other'));
 link(join(directory,'.pnpm/linked@1.0.0/node_modules/linked'),join(directory,'.pnpm/other@1.0.0/node_modules/linked'));
}));

test('compile errors in packages name the file and the line',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-npm-'));
 try{
  writeTree(directory,{'index.js':`require('broken');`,'node_modules/broken/index.js':`exports.a = 1;\nexports.b = ;\n`});
  const entry=join(directory,'index.js');
  const result=compile(readFileSync(entry,'utf8'),{fileName:entry,target:requireHostTarget()});
  assert.equal(result.ok,false);if(result.ok)return;
  const diagnostic=result.diagnostics[0]!;
  assert.match(diagnostic.file.replaceAll('\\','/'),/node_modules\/broken\/index\.js$/);
  const text=readFileSync(join(directory,'node_modules/broken/index.js'),'utf8');
  assert.equal(text.slice(0,diagnostic.span.start).split('\n').length,2,'the error is on line 2');
 }finally{removeTemporaryDirectory(directory);}
});

test('a RegExp literal may follow export default (uuid), a division may follow a property named default',()=>{
 const program=parse(lex('export default /^[0-9a-f]{8}$/i;',{module:true}),{module:true});
 assert.equal(program.body[0]!.kind,'Export');
 const division=parse(lex('var x = a.default / 2 / 1, y = a?.extends / 3;'));
 assert.equal(division.body.length,1);
});
