# Scope and Name Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершить динамическое глобальное разрешение, декларативные early errors, допустимое затенение встроенных имён и lexical block functions для текущего синтаксического поднабора ES2020.

**Architecture:** Binder сначала строит объявления для каждой статически известной области, затем разрешает ссылки в slots/cells; неизвестные имена становятся runtime global-object references. Block functions используют существующие lexical cells и инициализируются при входе в область. Наблюдаемые встроенные globals, включая минимальный `console`, представлены обычными свойствами глобального объекта.

**Tech Stack:** TypeScript 7, Node test runner, собственные x64 emitter/PE32+ linker/runtime, Windows x64.

**Spec:** `docs/history/superpowers/specs/2026-09-23-scope-name-resolution-design.md`

## Global Constraints

- JavaScript до ES2020 включительно; `eval` и динамические конструкторы функций исключены.
- Собственный AOT и Windows x64 runtime без Node/CRT/LLVM внутри сгенерированного EXE.
- `with`, legacy octal и var-подобные правила block functions из Annex B не входят в этот этап.
- Не добавлять новые npm-зависимости и не менять 16-байтовый Value ABI без отдельного архитектурного решения.
- Положительные общие случаи сравнивать с Node 26.9; исторические/core отличия закреплять явным ожидаемым результатом.
- Каталог не является Git-репозиторием, поэтому commit-шаги заменены сохранением журналов RED/GREEN в `work/`.

## File Structure

- `src/frontend/declarations.ts` — чистый сбор VarDeclaredNames, lexical declarations и body functions.
- `src/frontend/binder.ts` — создание scope records/bindings, early errors и разрешение ссылок.
- `src/frontend/bound.ts` — публичные типы bindings и карта block-function initializers.
- `src/frontend/parser.ts` — function declarations в StatementList и обычный Member AST для `console.log`.
- `src/ir/lower.ts` — runtime global references и инициализация block functions при входе в scope.
- `src/ir/model.ts`, `src/ir/liveness.ts`, `src/backend/x64/codegen.ts` — только новые операции, нужные для global reference semantics.
- `src/runtime/globals.ts` — intrinsic global descriptors и global-object lookup/write helpers.
- `src/runtime/console.ts` — минимальные ordinary `console` и callable `console.log`.
- `src/runtime/index.ts`, `src/runtime/gc.ts`, `src/runtime/own-keys.ts`, `src/runtime/intrinsic-order.ts` — подключение и трассировка новых intrinsic objects/properties.
- `tests/name-resolution.test.ts`, `tests/declaration-instantiation.test.ts`, `tests/block-functions.test.ts` — отдельные acceptance suites.
- `examples/compat/scope-resolution.cjs` — end-to-end Node/native программа.

## Review Focus

- Имя отсутствовало при вычислении LHS, но появилось в RHS: strict всё равно бросает, sloppy выполняет PutValue для исходной unresolvable reference — тест Task 1.
- Global lexical declaration поверх non-configurable `undefined` должна быть ранней ошибкой, а локальное затенение допустимо — тест Task 2.
- Замена `console.log`, detached call и локальный объект `console` должны использовать обычные property/call rules — тест Task 2.
- Function declarations в разных clauses одного `switch` находятся в одной lexical scope и конфликтуют — тест Task 4.
- Захваченная block function при повторном входе получает свежую binding/cell и переживает GC — тест Task 4.

---

### Task 1: Dynamic global references

**Files:**
- Create: `tests/name-resolution.test.ts`
- Modify: `src/frontend/bound.ts`
- Modify: `src/frontend/binder.ts`
- Modify: `src/ir/lower.ts`
- Modify: `src/ir/model.ts`
- Modify: `src/ir/liveness.ts`
- Modify: `src/backend/x64/codegen.ts`
- Modify: `src/runtime/globals.ts`

**Interfaces:**
- Consumes: existing `Binding`, `readGlobalProperty`, ordinary `Get/Set/Has`, `checkResolvable`.
- Produces: `{kind:'globalProperty'; name:string}` for every unresolved identifier; `readGlobalProperty` with `allowMissing`; explicit global-reference resolution snapshot used by assignment lowering.

- [x] **Step 1: Add failing runtime-resolution tests**

Create `tests/name-resolution.test.ts` with the following frontend→native helper and cases:

```ts
function native(source:string,gcStress=false){
 const image=linkPe(generate(lower(bind(parse(lex(source)))),{gcStress}));
 return runNative(image);
}
function expectNativeOracle(source:string,options:{gcStress?:boolean}={}){
 const result=native(source,options.gcStress);
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr.toString());
 assert.equal(result.stdout.toString(),runOracle(source).stdout);
}
const cases:[string,string][]=[
 ['sloppy assignment creates global property',
  'missing=7;let d=Object.getOwnPropertyDescriptor(globalThis,"missing");console.log(missing,globalThis.missing,d.writable,d.enumerable,d.configurable);'],
 ['missing read is catchable ReferenceError',
  'try{console.log(missing);}catch(e){console.log(e.name);}console.log(typeof missing);'],
 ['missing call and update fail before later effects',
  'try{missing(console.log("bad"));}catch(e){console.log(e.name);}try{missing++;}catch(e){console.log(e.name);}'],
 ['inherited global binding uses ordinary receiver',
  'globalThis.__proto__={x:3};console.log(x);x=4;console.log(x,globalThis.hasOwnProperty("x"),globalThis.__proto__.x);'],
 ['sloppy unresolved reference survives RHS creation',
  'missing=(globalThis.missing=1,2);console.log(missing,globalThis.missing);'],
];
```

Add a historical strict assertion independent of the Node oracle:

```ts
test('strict missing reference is preserved across RHS creation',()=>{
 expectProgram('"use strict";try{missing=(globalThis.missing=1,2);}catch(e){console.log(e.name);}console.log(globalThis.missing);',
   'ReferenceError\n1\n');
});
```

- [x] **Step 2: Run the new suite and record RED**

Run:

```powershell
npm run build
node --test dist/tests/name-resolution.test.js *> work/name-resolution-red.log
```

Expected: unknown sloppy identifiers fail in bind with `Undeclared identifier`; strict historical test may already pass.

- [x] **Step 3: Make unresolved identifiers dynamic global references**

In `bound.ts`, keep one observable global reference shape and remove `unknownTypeof`:

```ts
export type Binding = StorageBinding |
  {kind:'builtin';name:string} |
  {kind:'globalProperty';name:string};
```

In `binder.ts`, make the final resolution fallback:

```ts
if(!b)b={kind:'globalProperty',name:id.name};
```

Pass the `typeof` mode to lowering so `readGlobalProperty` uses
`allowMissing:true`; all other reads use `false`. Preserve the pre-RHS
resolution slot for simple strict assignment and the post-RHS existence check.
For sloppy assignment, emit ordinary `setProperty` with `strict:false`; an absent
property must be created with writable/enumerable/configurable attributes.

- [x] **Step 4: Verify the targeted behavior GREEN**

Run:

```powershell
npm run build
node --test dist/tests/name-resolution.test.js dist/tests/strict.test.js dist/tests/global-properties.test.js *> work/name-resolution-green.log
```

Expected: all three suites pass; no bind-time rejection remains for runtime global reads/writes.

- [x] **Step 5: Verify liveness and GC stress**

Add and run:

```ts
test('dynamic global values survive callbacks and stress GC',()=>{
 const source='missing={text:""+42};function read(){return missing;}for(let i=0;i<30;i++){({x:""+i});}console.log(read().text);delete globalThis.missing;try{read();}catch(e){console.log(e.name);}';
 expectNativeOracle(source,{gcStress:true});
});
```

Run the Task 1 command from Step 4 again. Expected: PASS and stdout matches Node.

---

### Task 2: Ordinary intrinsic globals and shadowable console

**Files:**
- Create: `src/runtime/console.ts`
- Create: `tests/builtin-shadowing.test.ts`
- Modify: `src/frontend/parser.ts`
- Modify: `src/frontend/binder.ts`
- Modify: `src/frontend/bound.ts`
- Modify: `src/global-builtins.ts`
- Modify: `src/ir/lower.ts`
- Modify: `src/backend/x64/codegen.ts`
- Modify: `src/runtime/globals.ts`
- Modify: `src/runtime/index.ts`
- Modify: `src/runtime/gc.ts`
- Modify: `src/runtime/own-keys.ts`
- Modify: `src/runtime/intrinsic-order.ts`

**Interfaces:**
- Consumes: Task 1 global-property fallback and `emitNativeFunction`.
- Produces: `emitConsole(b:RuntimeBuilder):void`, `consoleRoots:string[]`, `consolePropertyRoots:string[]`; ordinary global properties `undefined`, `NaN`, `Infinity`, `console`; no parser-level `console.log` identifier and no `Binding.kind === 'builtin'`.

- [x] **Step 1: Add failing builtin-shadowing and descriptor tests**

Create `tests/builtin-shadowing.test.ts` with:

```ts
const cases:[string,string][]=[
 ['function locals shadow immutable globals',
  'function f(undefined,NaN,Infinity){console.log(undefined,NaN,Infinity);}f(1,2,3);console.log(globalThis.undefined,globalThis.NaN,globalThis.Infinity);'],
 ['nested lexical shadows constructors and console',
  'let Object=7;{let console={log:function(v){globalThis.saved=v;}};console.log(Object+1);}globalThis.console.log(saved,typeof globalThis.Object);'],
 ['ordinary console method replacement',
  'let old=console.log;console.log=function(v){globalThis.saved=v;};console.log(9);old(saved);console.log=old;'],
 ['console can be passed and detached',
  'function use(c){let log=c.log;log("ok");}use(console);'],
];
```

Add descriptor assertions against a fresh Node-compatible context for
`undefined`, `NaN`, `Infinity`, `console`, and `console.log` using this exact
Nona source and expected output:

```ts
const descriptors='function show(o,k){let d=Object.getOwnPropertyDescriptor(o,k);console.log(d.writable,d.enumerable,d.configurable);}show(globalThis,"undefined");show(globalThis,"NaN");show(globalThis,"Infinity");show(globalThis,"console");show(console,"log");console.log(console.log.name,console.log.length);';
expectProgram(descriptors,
 'false false false\nfalse false false\nfalse false false\ntrue false true\ntrue false true\nlog 0\n');
```

Add compile tests:

```ts
assert.equal(compile('let undefined=1;',options).ok,false);
assert.equal(compile('function f(){let undefined=1;return undefined;}',options).ok,true);
```

- [x] **Step 2: Run Task 2 tests and record RED**

Run:

```powershell
npm run build
node --test dist/tests/builtin-shadowing.test.js *> work/builtin-shadowing-red.log
```

Expected: parser still collapses `console.log`, local builtin names are rejected, and intrinsic descriptors are missing.

- [x] **Step 3: Materialize immutable globals**

In `globals.ts`, add static property nodes with exact attributes:

```ts
const immutableGlobals = [
  {name:'undefined',tag:0,payload:0n},
  {name:'NaN',tag:3,payload:0x7ff8000000000000n},
  {name:'Infinity',tag:3,payload:0x7ff0000000000000n},
] as const;
```

Each property is non-writable, non-enumerable and non-configurable. Include the
nodes in the global property chain, own-key handling and GC/property root lists.
Global `var` declarations for these names bind to the existing property; global
lexical declarations fail during declaration validation. Local/parameter/catch
bindings may use these names.

- [x] **Step 4: Implement ordinary console object and call path**

Create `runtime/console.ts`:

```ts
export const consoleRoots=['rt.console','rt.console.log'];
export const consolePropertyRoots=[
  'rt.console.log.property','rt.console.log.name','rt.console.log.length',
  'rt.globalObject.console',
];
export function emitConsole(b:RuntimeBuilder):void;
```

`rt.console` is an ordinary object whose `log` property contains a native,
nonconstructable function. Its code uses the normal native-call ABI and calls
`rt.log`; metadata is `name: "log"`, `length: 0`. The global `console` property
and `console.log` are writable, non-enumerable and configurable.

In `parser.ts`, remove the rewrite from Member `console.log` to an Identifier.
In binder/lowering/codegen, remove special builtin call handling and route the
AST through ordinary identifier read, property get and `invoke`.

- [x] **Step 5: Remove the observable compile-time builtin path**

Delete `Binding.kind === 'builtin'`, the `builtins`/`checkBaseName` rejection,
and special constant/write branches for `undefined`, `NaN`, `Infinity`,
`console`, and `console.log`. Extend known global property metadata so top-level
`var`/function declarations interact with intrinsic descriptors instead of
creating duplicate alias nodes.

- [x] **Step 6: Verify Task 2 GREEN and regress console callers**

Run:

```powershell
npm run build
node --test dist/tests/builtin-shadowing.test.js dist/tests/runtime-io.test.js dist/tests/global-properties.test.js dist/tests/frontend.test.js *> work/builtin-shadowing-green.log
```

Expected: all suites pass, including console metadata/shadowing and existing IO behavior.

---

### Task 3: Declaration collection and early errors

**Files:**
- Create: `src/frontend/declarations.ts`
- Create: `tests/declaration-instantiation.test.ts`
- Modify: `src/frontend/binder.ts`
- Modify: `src/frontend/bound.ts`
- Modify: `tests/lexical-bindings.test.ts`
- Modify: `tests/duplicate-parameters.test.ts`

**Interfaces:**
- Consumes: Task 2 intrinsic global descriptor metadata.
- Produces:

```ts
export type LexicalDeclaration={
 name:string; id:A.Identifier; kind:'let'|'const'|'function';
 statement:A.Var|A.Function;
};
export interface DeclarationInfo {
 lexicals:LexicalDeclaration[];
 vars:A.Identifier[];
 bodyFunctions:A.Function[];
}
export function collectDeclarations(
 statements:readonly A.Statement[],
 functionDeclarationKind:'var'|'lexical',
):DeclarationInfo;
```

- [x] **Step 1: Add a complete declaration-conflict table**

Create `tests/declaration-instantiation.test.ts` with compile-failure cases:

```ts
const earlyErrors=[
 'let x;let x;', 'const x=1;let x;', 'let x;var x;',
 '{let x;{var x;}}', '{function x(){}let x;}',
 'function f(x){let x;}', 'function f(){let x;var x;}',
 'try{}catch(e){let e;}', 'try{}catch(e){const e=1;}',
 'switch(0){case 0:let x;case 1:const x=1;}',
 'for(let i=0;i<1;i++){var i;}',
];
```

Add accepted cases and compare with Node:

```ts
const accepted=[
 'var x;var x;console.log(x);',
 'function f(){var x;function x(){return 3;}var x;console.log(x());}f();',
 'try{throw 1;}catch(e){var e;console.log(e);}',
 'function f(a,a){var a;return a;}console.log(f(1,2));',
 'let x=1;{let x=2;{var y=3;}console.log(x,y);}console.log(x,y);',
];
```

- [x] **Step 2: Run declaration tests and record RED**

Run:

```powershell
npm run build
node --test dist/tests/declaration-instantiation.test.js *> work/declarations-red.log
```

Expected: at least the nested declaration and catch/var cases expose incorrect current collection behavior.

- [x] **Step 3: Implement pure declaration collection**

Create `declarations.ts` with `collectDeclarations`. Its var walk recurses through
blocks, if/loops/switch/try/catch/finally but never into a nested function.
Its lexical collection reads only the direct StatementList; `switch` passes the
concatenated clause bodies. Script/function-body functions go to `bodyFunctions`;
block/switch functions go to `lexicals` when Task 4 enables their syntax.

- [x] **Step 4: Refactor binder into declare then resolve phases**

Replace `visitVars` and opportunistic conflict checks with:

```ts
const info=collectDeclarations(body,functionDeclarationKind);
declareVarBindings(info.vars,info.bodyFunctions);
declareLexicalBindings(owner,info.lexicals);
validateConflicts(scopeRecord,info,parameters,catchParameter);
resolveStatements(body,scopeChain);
```

Use explicit helpers with those responsibilities; do not duplicate recursive
declaration walks inside expression resolution. The `analyzeScope` caller passes
`'var'` for a Program or function body and `'lexical'` for an ordinary Block or
the concatenated clauses of a Switch. Preserve duplicate sloppy simple
parameters and last-function-wins initialization. Permit `catch(e){var e;}` but
reject direct lexical declarations named `e`.

- [x] **Step 5: Verify declaration suites GREEN**

Run:

```powershell
npm run build
node --test dist/tests/declaration-instantiation.test.js dist/tests/lexical-bindings.test.js dist/tests/duplicate-parameters.test.js dist/tests/closures.test.js *> work/declarations-green.log
```

Expected: all suites pass with the same Node stdout for accepted cases.

---

### Task 4: Lexical block function declarations

**Files:**
- Create: `tests/block-functions.test.ts`
- Modify: `src/frontend/parser.ts`
- Modify: `src/frontend/declarations.ts`
- Modify: `src/frontend/binder.ts`
- Modify: `src/frontend/bound.ts`
- Modify: `src/ir/lower.ts`

**Interfaces:**
- Consumes: Task 3 `collectDeclarations` and existing lexical slot/cell initialization.
- Produces: `BoundProgram.scopeFunctions:Map<A.Node,BoundFunction[]>`; parser accepts declarations only in StatementList; lowering initializes scope functions immediately after TDZ cell creation.

- [x] **Step 1: Add block-function grammar and semantics tests**

Create `tests/block-functions.test.ts`:

```ts
const nodeCases:[string,string][]=[
 ['strict block hoisting and visibility',
  '"use strict";{console.log(f());function f(){return 3;}}console.log(typeof f);'],
 ['nested block shadow',
  '"use strict";function f(){return 1;}{console.log(f());function f(){return 2;}console.log(f());}console.log(f());'],
 ['closure captures current block binding',
  '"use strict";let out;{function f(){return 7;}out=function(){return f();};}console.log(out());'],
 ['switch shares one lexical scope',
  '"use strict";switch(1){case 1:console.log(f());function f(){return 9;}break;}'],
];
```

Add compile failures:

```ts
const errors=[
 '"use strict";if(true)function f(){}',
 '"use strict";label:function f(){}',
 '"use strict";{function f(){}function f(){}}',
 '"use strict";switch(0){case 0:function f(){}case 1:function f(){}}',
 '"use strict";{function f(){}let f;}',
];
```

Add a core sloppy test with an explicit expected result rather than Node's Annex B behavior:

```ts
expectProgram('{console.log(f());function f(){return 4;}}console.log(typeof f);',
  '4\nundefined\n');
```

- [x] **Step 2: Run block-function tests and record RED**

Run:

```powershell
npm run build
node --test dist/tests/block-functions.test.js *> work/block-functions-red.log
```

Expected: parser rejects function declarations in blocks and switch clauses.

- [x] **Step 3: Accept function declarations only in StatementList positions**

Rename parser `statement(top)` to `statement(allowDeclaration)`. Script,
function-body, block StatementList and switch clause loops pass `true`; direct
if/loop/label bodies pass `false`. Keep the AST `A.Function` shape unchanged.

- [x] **Step 4: Bind block functions as lexical declarations**

During scope declaration, allocate a mutable lexical `StorageBinding`, register
the `BoundFunction`, analyze its body with the current scope chain, and append it
to:

```ts
scopeFunctions.get(owner) ?? []
```

Script/function-body functions remain in the existing var-scoped declaration
list. Duplicate block functions and collisions with `let`/`const` are early
errors. No outer var alias is created in sloppy mode.

- [x] **Step 5: Initialize block function objects at scope entry**

Replace `initializeScope(owner)` with:

```ts
private enterScope(owner:A.Node):void {
  this.initializeLexicalCells(owner);
  for(const fn of this.bound.scopeFunctions.get(owner)??[])
    this.store(this.binding(fn.declaration.id!),this.closure(fn));
}
```

Use `enterScope` for blocks, switch scopes, for scopes and the initial
script/function body. Captured lexical bindings allocate a fresh cell on every
runtime entry before the function object closes over it.

- [x] **Step 6: Add repeated-entry GC test and verify GREEN**

Add:

```ts
test('each block entry gives captured functions a fresh cell under GC stress',()=>{
 const source='"use strict";let a=[];for(let i=0;i<3;i++){{function f(){return i;}a[i]=f;}}for(let i=0;i<30;i++){({x:""+i});}console.log(a[0](),a[1](),a[2]());';
 expectNativeOracle(source,{gcStress:true});
});
```

Run:

```powershell
npm run build
node --test dist/tests/block-functions.test.js dist/tests/environments.test.js dist/tests/closures.test.js dist/tests/lexical-bindings.test.js *> work/block-functions-green.log
```

Expected: all suites pass; core sloppy outside visibility is `undefined`.

---

### Task 5: End-to-end compatibility, documentation and completion evidence

**Files:**
- Create: `examples/compat/scope-resolution.cjs`
- Modify: `docs/language-support.md`
- Modify: `README.md`
- Modify: `docs/history/development-log.md`
- Modify: `docs/history/continuation-checkpoint.md`
- Modify: `docs/history/superpowers/specs/2026-09-23-scope-name-resolution-design.md`
- Modify: `docs/history/superpowers/plans/2026-09-23-scope-name-resolution.md`

**Interfaces:**
- Consumes: completed Tasks 1–4 and `scripts/compare-examples.mjs`.
- Produces: standalone compatibility report, final support boundaries and reproducible verification logs.

- [x] **Step 1: Add the standalone compatibility program**

Create `examples/compat/scope-resolution.cjs` with Node-common behavior only:

```js
missing = 3;
console.log(missing, globalThis.missing);
delete globalThis.missing;
try { console.log(missing); } catch (error) { console.log(error.name); }

function outer(console, undefined) {
  "use strict";
  console.log(undefined);
  { console.log(block()); function block() { return 7; } }
  console.log(typeof block);
}
outer({log: globalThis.console.log}, 5);

try { throw 1; } catch (value) { var value; console.log(value); }
```

- [x] **Step 2: Run all targeted suites**

Run:

```powershell
npm run build
node --test dist/tests/name-resolution.test.js dist/tests/builtin-shadowing.test.js dist/tests/declaration-instantiation.test.js dist/tests/block-functions.test.js *> work/scope-resolution-targeted.log
```

Expected: 0 failures and 0 unexpected skips.

- [x] **Step 3: Run the complete regression suite**

Run:

```powershell
npm run check *> work/scope-resolution-check.log
```

Expected: exit code 0, 0 failures; only the established Windows symlink skip is allowed.

- [x] **Step 4: Compare every standalone program with Node**

Run:

```powershell
npm run compare *> work/scope-resolution-compare.log
```

Expected: every `examples/compat` entry prints `PASS`; `work/compat-report.json`
records matching stdout/stderr/status for `scope-resolution.cjs`.

- [x] **Step 5: Request independent review**

Provide the reviewer with the spec, this plan, all files changed in Tasks 1–4,
the five Review Focus cases verbatim, and the targeted/full/compare logs. Require
severity-ranked findings for scope resolution, declaration phases, runtime
descriptor correctness, GC rooting and accidental Annex B behavior.

Expected: Critical/Important findings are reproduced by a failing test and fixed
in one pass; Minor findings are recorded without expanding this stage.

- [x] **Step 6: Update product documentation from verified evidence**

Set the spec status to implemented only after Steps 2–5. Update the matrix rows
for globals, var/hoisting, let/const/TDZ and functions; state explicitly that
Annex B aliases and `with` remain unsupported. Add exact test/program counts and
log paths to the development log and continuation checkpoint. Remove stale
claims from README without claiming completion of ES2020.

- [x] **Step 7: Re-run documentation-sensitive build check**

Run:

```powershell
npm run build
```

Expected: exit code 0. Verify with `rg` that the matrix names all three new test
files plus `scope-resolution.cjs`, and that the next unfinished item is item 3.
