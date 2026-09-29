import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModulesOnHost} from './helpers/host.js';
import {compile} from '../src/compiler.js';

const cases:[string,Record<string,string>][]=[
 [
  "live bindings, defaults, namespaces and dynamic import",
  {
   "main.mjs": "import def, {counter, inc, Cls as C} from './lib.mjs';\nimport * as ns from './lib.mjs';\nexport {counter as reexported} from './lib.mjs';\nconsole.log(def(), counter); inc(); console.log(counter, ns.counter, Object.keys(ns).join(), Object.prototype.toString.call(ns));\nconsole.log(typeof this, new C().x, import.meta !== null && typeof import.meta);\nimport('./lazy.mjs').then(m => console.log('lazy', m.value, m.default));\nconsole.log('main end');\ntry { counter = 5 } catch (e) { console.log(e instanceof TypeError); }\n",
   "lib.mjs": "export let counter = 1;\nexport function inc(){ counter++; }\nexport default function(){ return 'default fn ' + typeof inc; }\nexport class Cls { constructor(){ this.x = 'cls'; } }\nconsole.log('lib evaluated');\n",
   "lazy.mjs": "console.log('lazy evaluated');\nexport const value = 42;\nexport default 'lazy default';\n"
  }
 ],
 [
  "cycles, hoisted functions and TDZ",
  {
   "main.mjs": "import {a, callB} from './a.mjs';\nconsole.log(a, callB());\n",
   "a.mjs": "import {b, hoisted} from './b.mjs';\nexport const a = 'a';\nexport function callB(){ return b + hoisted(); }\nconsole.log('a runs', hoisted());\n",
   "b.mjs": "import {a} from './a.mjs';\nexport let b = 'b';\nexport function hoisted(){ return '!'; }\ntry { a; } catch (e) { console.log('tdz', e instanceof ReferenceError); }\n"
  }
 ],
 [
  "star exports, renaming and export * as",
  {
   "main.mjs": "import {x, renamed, ns2} from './re.mjs';\nimport * as all from './re.mjs';\nconsole.log(x, renamed, ns2.y, Object.keys(all).join(), 'default' in all);\n",
   "re.mjs": "export * from './one.mjs';\nexport {y as renamed} from './two.mjs';\nexport * as ns2 from './two.mjs';\n",
   "one.mjs": "export const x = 1; export default 'd1';\n",
   "two.mjs": "export var y = 2;\n"
  }
 ],
 [
  "namespace object semantics",
  {
   "main.mjs": "import * as ns from './m.mjs';\nconst r=[];\nr.push(Object.isExtensible(ns), Object.getPrototypeOf(ns), ns[Symbol.toStringTag], Reflect.set(ns,'v',1), Reflect.deleteProperty(ns,'v'), Reflect.deleteProperty(ns,'nope'));\nconst d=Object.getOwnPropertyDescriptor(ns,'v');r.push(d.writable,d.enumerable,d.configurable,Reflect.ownKeys(ns).map(String).join('|'));\ntry{ns.v=2}catch(e){r.push(e instanceof TypeError)}\nconsole.log(r.join());\n",
   "m.mjs": "export let v = 1; export const b = 2, a = 3;\n"
  }
 ],
 [
  "module code is strict with undefined this",
  {
   "main.mjs": "console.log(this, (function(){ return this; })());\ntry { undeclared = 1; } catch (e) { console.log(e instanceof ReferenceError); }\nvar local = 1; console.log(globalThis.local);\n"
  }
 ],
 [
  "dynamic import errors and caching",
  {
   "main.mjs": "import('./missing.mjs').catch(e => console.log('missing', e instanceof Error));\nimport('./boom.mjs').catch(e => console.log('boom', e.message));\nimport('./boom.mjs').catch(e => console.log('boom again', e.message));\nPromise.all([import('./once.mjs'), import('./once.mjs')]).then(([a,b]) => console.log(a === b));\n",
   "boom.mjs": "throw new Error('eval failed');\n",
   "once.mjs": "console.log('once');\n"
  }
 ]
];
for(const [name,files] of cases)test('modules: '+name,()=>{
 const {native,oracle}=runModulesOnHost(files,'main.mjs');
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,oracle);
});
const host=(files:Record<string,string>)=>({resolve:(s:string)=>'/'+s.replace('./',''),read:(p:string)=>files[p.slice(1)]});
for(const [name,files] of [
 ['unresolvable import',{'main.mjs':"import {nope} from './m.mjs';",'m.mjs':'export const yes=1;'}],
 ['ambiguous star export',{'main.mjs':"import {x} from './r.mjs';",'r.mjs':"export * from './a.mjs';export * from './b.mjs';",'a.mjs':'export const x=1;','b.mjs':'export const x=2;'}],
 ['duplicate export binding',{'main.mjs':"import {x} from './m.mjs';var x;"}],
 ['assignment to import is a runtime error but import in declaration conflicts',{'main.mjs':"import {x} from './m.mjs';let x;",'m.mjs':'export const x=1;'}],
 ['missing module',{'main.mjs':"import './nope.mjs';"}],
 ['await identifier in module',{'main.mjs':'var await;'}],
] as [string,Record<string,string>][])test('module link error: '+name,()=>{
 assert.equal(compile(files['main.mjs']!,{fileName:'/main.mjs',target:'linux-x64',module:true,moduleHost:host(files)}).ok,false);
});
