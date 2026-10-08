# Exponentiation and Optional Chaining Implementation Plan

Status: implemented and independently reviewed.

Execution note: Task 2 followed the approved spec's allowance for
implementation-approximated Number exponentiation but departed from the planned
fdlibm port. The implemented standalone x87 log2/exp2 core adds no import and is
bounded to 1 ULP from Node on the deterministic corpus. The exact rulings and
their cost are recorded in
`.superpowers/sdd/2026-09-23-exponentiation-optional-chaining/progress.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ES2020 Number exponentiation (`**`, `**=`) and optional chaining, including optional calls and `delete`, to Nona's standalone Windows x64 AOT output.

**Architecture:** Exponentiation gets a right-associative parser level and reuses the existing binary IR through a new rooted `rt.pow` primitive backed by a standalone binary64 `rt.numberPow` emitter. Optional chaining is one flat AST node whose links are lowered as reference-aware control flow, so nullish branches skip keys and arguments while property calls keep their receiver.

**Tech Stack:** TypeScript 7, Node test runner, Nona IR, custom Windows x64/SSE2 assembler and PE linker.

**Spec:** `docs/history/superpowers/specs/2026-09-23-exponentiation-optional-chaining-design.md`

## Global Constraints

- Keep generated executables standalone Windows x64 PE files; do not add Node, CRT, libm, LLVM, an interpreter, or a new runtime DLL.
- Implement Number exponentiation only; BigInt remains outside this point.
- Preserve left-to-right evaluation, existing Reference semantics, strict/sloppy writes, native exception unwinding, and precise GC roots.
- Represent one optional chain as one `OptionalChain` AST node with ordered property/call links.
- Parentheses end a chain; an OptionalChain is never an assignment or update target.
- `delete` of a nullish optional chain returns `true`.
- The numeric kernel must carry the permissive fdlibm/OpenLibm copyright notice and store constants as exact binary64 bit patterns.
- Item 3 legacy syntax remains deferred; completing this plan does not claim complete ES2020 support.
- This workspace has no `.git` metadata, so task boundaries are recorded with tests and logs instead of commits.

## Review Focus

- `a?.3:0` must tokenize as a conditional with `.3`, while `a?.b` must tokenize `?.` as one punctuator; Task 3 pins both paths.
- `obj.m?.()` and `obj?.m()` must each call with `this === obj`, while `(obj?.m)()` must use the completed expression under the project's ordinary call rules; Task 4 tests all three.
- `obj?.missing()` must throw after a non-nullish base, but `null?.missing()` must skip the whole remaining chain; Task 4 distinguishes these cases.
- `base()[key()] **= rhs()` must evaluate base and key once, read the old value before `rhs`, then perform one write; Task 1 tests the complete effect trace.
- Signed zero, huge integral exponents, negative fractional bases, subnormal results, and near-one bases must not fall through a generic approximation incorrectly; Task 2 tests special cases plus a deterministic Node differential corpus.

---

### Task 1: Exponentiation grammar, IR dispatch, and compound assignment

**Files:**
- Create: `tests/exponentiation-grammar.test.ts`
- Modify: `src/frontend/lexer.ts`
- Modify: `src/frontend/parser.ts`
- Modify: `src/backend/x64/codegen.ts`

**Interfaces:**
- Consumes: existing `Binary`, `Assignment`, Reference lowering, `Operation.kind === 'binary'`, and runtime binary-call ABI `(dest, left, right)`.
- Produces: `Binary.operator === '**'`, `Assignment.operator === '**='`, and codegen mapping `'**': 'pow'`.

- [ ] **Step 1: Add RED grammar and ordering tests**

Create `tests/exponentiation-grammar.test.ts`:

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {expectProgram} from './helpers/program.js';

const syntax=(source:string)=>parse(lex(source));

test('lexer uses longest match for exponentiation assignment',()=>{
 assert.deepEqual(lex('a**=b**c').slice(0,-1).map(t=>t.text),['a','**=','b','**','c']);
});

test('exponentiation is right associative and binds above multiplication',()=>{
 const body=(syntax('2*3**2**2;').body[0] as any).expression;
 assert.equal(body.operator,'*');
 assert.equal(body.right.operator,'**');
 assert.equal(body.right.right.operator,'**');
});

test('exponentiation unary grammar accepts only the permitted sides',()=>{
 for(const source of ['-2**2;','+2**2;','!2**2;','~2**2;','typeof x**2;','void 0**2;'])
  assert.equal(compile(source,{fileName:'power.js',target:'win32-x64'}).ok,false,source);
 for(const source of ['(-2)**2;','2**-2;','2**+2;','2**(-2);'])
  assert.equal(compile(source,{fileName:'power.js',target:'win32-x64'}).ok,true,source);
});

test('compound exponentiation evaluates one reference in specification order',()=>{
 expectProgram('let log="";let o={x:2};function base(){log+="b";return o;}function key(){log+="k";return "x";}function rhs(){log+="r";o.x=3;return 2;}base()[key()]**=rhs();console.log(log,o.x);',
  'bkr 4\n');
});

test('compound exponentiation is right associative',()=>{
 expectProgram('let a=2,b=3;a**=b**=2;console.log(a,b);','512 9\n');
});
```

- [ ] **Step 2: Run the suite and record RED**

Run:

```powershell
npm run build
node --test dist/tests/exponentiation-grammar.test.js *> work/exponentiation-grammar-red.log
```

Expected: lexer/parser tests fail because `**=` is split and `**` has no grammar or runtime mapping.

- [ ] **Step 3: Implement the right-associative parser level**

In `lexer.ts`, place `**=` before `**` and `*` in longest-match order:

```ts
const op = ['>>>=','===','!==','**=','<<=','>>=','>>>','==','!=','<=','>=',
 '&&','||','??','++','--','+=','-=','*=','/=','%=','&=','|=','^=','<<','>>','=>','**']
  .find(op => source.startsWith(op, i));
```

In `parser.ts`, add `**=` to the assignment operator list and make binary parsing begin at `exponentiation()` rather than `unary()`:

```ts
private exponentiation():A.Expression {
 const left=this.unary();
 if(!this.at('**'))return left;
 const token=this.take();
 if(left.kind==='Unary'&&!this.parenthesized.has(left))
  this.error('Unary expression cannot be the left operand of exponentiation',token);
 const right=this.exponentiation();
 return {kind:'Binary',operator:'**',left,right,span:{start:left.span.start,end:right.span.end}};
}
```

Change only the initial operand of `binary(min)` to `this.exponentiation()`. Recursive precedence parsing remains left-associative for the existing operators. The recursive exponentiation RHS accepts `2 ** -2` because `exponentiation()` begins with `unary()`.

- [ ] **Step 4: Wire the existing binary pipeline to `rt.pow`**

In `src/backend/x64/codegen.ts`, extend the table:

```ts
const binary:Record<string,string>={
 '+':'add','-':'sub','*':'mul','/':'div','%':'rem','**':'pow',
 // existing comparison and bitwise entries
};
```

No new IR operation is added. Existing assignment lowering already snapshots the Reference and old value before evaluating the RHS, then uses `e.operator.slice(0,-1)`; this turns `**=` into the binary operator `**` and preserves one LHS evaluation.

- [ ] **Step 5: Verify grammar independently of the unfinished numeric kernel**

Run:

```powershell
npm run build
node --test --test-name-pattern="lexer|right associative and binds|unary grammar" dist/tests/exponentiation-grammar.test.js *> work/exponentiation-grammar-green.log
```

Expected: the three frontend tests pass. Runtime cases remain for Task 2.

---

### Task 2: Standalone binary64 exponentiation runtime

**Files:**
- Create: `src/runtime/numeric/power.ts`
- Create: `tests/exponentiation-runtime.test.ts`
- Modify: `src/backend/x64/assembler.ts`
- Modify: `src/runtime/numeric.ts`
- Modify: `src/runtime/primitives.ts`
- Modify: `tests/standalone.test.ts`
- Modify: `tests/x64.test.ts`

**Interfaces:**
- Consumes: `RuntimeBundle`, `Native`, rooted binary primitive ABI, `rt.toNumber`, and XMM input convention used by `rt.remainder`.
- Produces: `emitPower(bundle:RuntimeBundle):void`, native helper `rt.numberPow(xmm0 base, xmm1 exponent) -> xmm0`, and rooted value helper `rt.pow(dest, left, right):void`.

- [ ] **Step 1: Add RED semantic and differential tests**

Create `tests/exponentiation-runtime.test.ts`:

```ts
import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

test('power follows ES Number special cases',()=>{
 const source='console.log(2**3,2**-2,(-2)**3,(-2)**2,(-2)**.5,NaN**0,1**Infinity,(-1)**Infinity,0**-2,1/((-0)**3),1/((-0)**2),Infinity**-1,(-Infinity)**3);';
 expectProgram(source,runOracle(source).stdout);
});

test('power covers overflow underflow subnormal and near-one values',()=>{
 const source='console.log(2**1023,2**1024,2**-1074,2**-1075,(1+2.220446049250313e-16)**4503599627370496,.5**1074,(-2)**2147483647);';
 expectProgram(source,runOracle(source).stdout);
});

test('power performs both ToNumber conversions left to right',()=>{
 const source='let s="";let r={valueOf:function(){s+="r";return 3;}};let l={valueOf:function(){s+="l";r.valueOf=function(){s+="R";return 2;};return 2;}};console.log(l**r,s);';
 expectProgram(source,'4 lR\n');
});

test('seeded finite power corpus agrees with Node rendering',()=>{
 let seed=0x6a09e667f3bcc909n;
 const rows:string[]=[];
 for(let i=0;i<96;i++){
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const base=((Number(seed>>11n)/2**53)*4)-2;
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const exponent=((Number(seed>>11n)/2**53)*40)-20;
  rows.push(`console.log((${base})**(${exponent}));`);
 }
 const source=rows.join('');
 expectProgram(source,runOracle(source).stdout);
});
```

- [ ] **Step 2: Run runtime tests and record RED**

Run:

```powershell
npm run build
node --test dist/tests/exponentiation-runtime.test.js *> work/exponentiation-runtime-red.log
```

Expected: linking fails with missing `rt.pow` or execution reaches no runtime fragment.

- [ ] **Step 3: Add the rooted JavaScript-value wrapper**

In `primitives.ts`, extend the arithmetic loop with `pow` while keeping the same 120-byte frame and `binaryRoots`. After left then right `rt.toNumber`, dispatch as follows:

```ts
if(op==='rem')a.call('rt.remainder');
else if(op==='pow')a.call('rt.numberPow');
else if(op==='add')a.addsd('xmm0','xmm1');
else if(op==='sub')a.subsd('xmm0','xmm1');
else if(op==='mul')a.mulsd('xmm0','xmm1');
else a.divsd('xmm0','xmm1');
```

The loop becomes `['add','sub','mul','div','rem','pow']`. Do not move either `rt.toNumber` call: both original tagged operands must stay rooted until both conversions finish.

- [ ] **Step 4: Add the one required SSE2 instruction**

Add scalar double square root to `Assembler` using the existing private SSE
encoder:

```ts
sqrtsd(d:Xmm,s:Xmm|Mem):void {
 this.sse(d,s,0x51);
}
```

In the `SSE scalar double and conversion encodings` test in `tests/x64.test.ts`,
emit `a.sqrtsd("xmm3","xmm4")` and append its exact bytes
`0xf2,0x0f,0x51,0xdc` to the assertion. This is the fdlibm `y == 0.5`
positive-base fast path and uses no imported math function.

- [ ] **Step 5: Port the binary64 kernel with exact branches and constants**

Create `numeric/power.ts` with this public shape:

```ts
/* fdlibm/OpenLibm permissive copyright notice copied verbatim from the source file. */
import type {RuntimeBundle} from '../abi.js';
import {Native} from './native.js';

export function emitPower(bundle:RuntimeBundle):void {
 const f=new Native('rt.numberPow'),a=f.a;
 // xmm0=x, xmm1=y, xmm0=result; integer registers hold exact bit fields.
 // Emit special-case classifier, log2 kernel, y*log2(x), and exp2 reconstruction.
 f.end(bundle);
}
```

Port the implementation instruction-for-instruction from OpenLibm
`src/e_pow.c` at commit `5fe399749f9276eaa0b8403e507470da05cbbb3f`
(`https://github.com/JuliaMath/openlibm/blob/5fe399749f9276eaa0b8403e507470da05cbbb3f/src/e_pow.c`).
Copy its lines 1–8 notice verbatim. Translate its decision tree in this exact
order before the approximation path:

1. `y == ±0` returns `1`, including `NaN ** 0`.
2. NaN in either remaining operand returns quiet NaN. This deliberately occurs
   before OpenLibm's `x == 1` shortcut because ECMAScript requires `1 ** NaN`
   to be NaN.
3. Classify finite integral `y` and odd/even parity directly from exponent/significand bits; never convert large `y` to int64.
4. Handle `y == ±Infinity` by `abs(x)` relative to `1`; equality returns NaN,
   including `(-1) ** ±Infinity`, as ECMAScript requires. Handle `y == ±1`,
   `y == 2`, and positive-base `y == 0.5` with `sqrtsd` fast paths.
5. Handle `x == ±0`, `x == ±Infinity`, and `abs(x) == 1` with sign determined only by odd integral `y`.
6. A finite negative base with nonintegral `y` returns quiet NaN; otherwise run the positive kernel and apply a negative sign for odd `y`.
7. Compute split `log2(abs(x))` using normalized exponent/significand, the fdlibm interval selection, and high/low products; multiply by split `y`, reject above the overflow threshold, and reject below the underflow threshold.
8. Reconstruct `2**z` with the fdlibm polynomial and exponent-bit scaling, including gradual subnormal output and round-to-nearest behavior; apply the saved result sign last.

Represent every fdlibm double constant through a helper that moves an explicit `bigint` bit pattern into an XMM register, for example:

```ts
const loadBits=(register:'xmm2'|'xmm3'|'xmm4'|'xmm5',bits:bigint)=>{
 a.mov('rax',bits);a.movqToXmm(register,'rax');
};
```

Use unique labels prefixed `pow.` and only instructions already supported by `Assembler`. Where the source uses high/low word mutation, use `movqFromXmm`, masks/shifts, and `movqToXmm`; do not round-trip through decimal TypeScript constants. Add `emitPower(bundle)` after `emitRemainder(bundle)` in `emitNumericRuntime()`.

- [ ] **Step 6: Verify special cases, corpus, and standalone imports**

Extend `tests/standalone.test.ts` with:

```ts
test('power adds no non-system import',()=>{
 const result=compile('console.log(2**10);',{fileName:'power.js',target:'win32-x64'});
 assert.ok(result.ok);
 assert.ok(result.imports.every(i=>i.startsWith('KERNEL32.dll!')));
});
```

Run:

```powershell
npm run build
node --test dist/tests/exponentiation-grammar.test.js dist/tests/exponentiation-runtime.test.js dist/tests/numeric.test.js dist/tests/standalone.test.js *> work/exponentiation-runtime-green.log
```

Expected: all tests pass, the deterministic corpus matches Node's printed results, and imports remain KERNEL32-only.

---

### Task 3: Optional-chain AST, lexer, parser, and binder

**Files:**
- Create: `tests/optional-chaining-frontend.test.ts`
- Modify: `src/frontend/lexer.ts`
- Modify: `src/frontend/ast.ts`
- Modify: `src/frontend/parser.ts`
- Modify: `src/frontend/binder.ts`

**Interfaces:**
- Consumes: existing `Expression`, `Member`, `Call`, `parenthesized` tracking, `arguments()`, and binder expression walk.
- Produces:

```ts
export type OptionalLink=
 | {kind:'property';property:Expression;computed:boolean;optional:boolean;span:Span}
 | {kind:'call';arguments:Expression[];optional:boolean;span:Span};
export interface OptionalChain extends Node {
 kind:'OptionalChain';base:Expression;links:OptionalLink[];
}
```

- [ ] **Step 1: Add RED token, AST-shape, and early-error tests**

Create `tests/optional-chaining-frontend.test.ts`:

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';

const syntax=(source:string)=>parse(lex(source));
const check=(source:string)=>bind(syntax(source));

test('question-dot token excludes a following decimal digit',()=>{
 assert.deepEqual(lex('a?.b').slice(0,-1).map(t=>t.text),['a','?.','b']);
 assert.deepEqual(lex('a?.3:0').slice(0,-1).map(t=>t.text),['a','?','.3',':','0']);
});

test('parser flattens one continuous optional chain',()=>{
 const e=(syntax('obj.m?.(x)?.[key].z;').body[0] as any).expression;
 assert.equal(e.kind,'OptionalChain');
 assert.equal(e.base.kind,'Identifier');
 assert.deepEqual(e.links.map((x:any)=>[x.kind,x.optional,x.computed??null]),[
  ['property',false,false],['call',true,null],['property',true,true],['property',false,false]
 ]);
});

test('parentheses end a chain instead of extending its links',()=>{
 const e=(syntax('(a?.b).c;').body[0] as any).expression;
 assert.equal(e.kind,'Member');
 assert.equal(e.object.kind,'OptionalChain');
});

for(const source of ['a?.b=1;','a?.b++;','++a?.b;','new a?.b();','super?.x;','a?.;','a?.[x;'])
 test('invalid optional-chain syntax: '+source,()=>assert.equal(compile(source,{fileName:'optional.js',target:'win32-x64'}).ok,false));

test('grouped constructor and optional super method call bind',()=>{
 assert.doesNotThrow(()=>check('function f(){return new (a?.b)();}'));
 assert.doesNotThrow(()=>check('let o={m(){return super.x?.();}};'));
});
```

- [ ] **Step 2: Run frontend tests and record RED**

Run:

```powershell
npm run build
node --test dist/tests/optional-chaining-frontend.test.js *> work/optional-chaining-frontend-red.log
```

Expected: `?.` is split into `?` and `.`, and no OptionalChain AST exists.

- [ ] **Step 3: Add the AST and context-sensitive punctuator**

Add `OptionalLink` and `OptionalChain` from the Interfaces block to `ast.ts`, import `Span`, and add `OptionalChain` to `Expression` but not to `Assignable`.

In `lexer.ts`, before the generic operator lookup, recognize `?.` only when the next code unit is not a decimal digit:

```ts
if(source.startsWith('?.',i)&&!/[0-9]/.test(source[i+2]??'')){
 i+=2;push('punct',start);continue;
}
```

This preserves conditional expressions such as `a?.3:0` as `a ? .3 : 0`.

- [ ] **Step 4: Flatten left-hand-side links without crossing parentheses**

Add `private computedMembers=new WeakSet<A.Member>();` beside `parenthesized`.
Whenever the `[` branch creates an ordinary `Member`, add that exact node to
`computedMembers`; dot members are left out. Then add a parser helper:

```ts
private chainParts(expression:A.Expression):{base:A.Expression;links:A.OptionalLink[]} {
 if(this.parenthesized.has(expression))return {base:expression,links:[]};
 if(expression.kind==='Member'&&expression.object.kind!=='Super'){
  const prior=this.chainParts(expression.object);
  return {base:prior.base,links:[...prior.links,{kind:'property',property:expression.property,computed:this.computedMembers.has(expression),optional:false,span:expression.span}]};
 }
 if(expression.kind==='Call'){
  const prior=this.chainParts(expression.callee);
  return {base:prior.base,links:[...prior.links,{kind:'call',arguments:expression.arguments,optional:false,span:expression.span}]};
 }
 return {base:expression,links:[]};
}
```

When `leftHandSide` first sees `?.`, convert the accumulated expression with `chainParts`, append the optional property or call link, then keep every following `.`, `[]`, and `()` as links on the same `OptionalChain`. A dot-name link uses `computed:false` even though its property is stored as a Literal; bracket links use `computed:true`. Do not flatten a parenthesized expression. Do not flatten a `Member` whose object is `Super`; leaving `super.x` as the base lets lowering create the existing super Reference before an optional call.

Reject `super?.` immediately. When parsing `new`, reject an unparenthesized `OptionalChain` constructor target, but allow a target recorded in `parenthesized`. Existing lvalue checks reject assignment and update because `OptionalChain` is absent from `Assignable`.

- [ ] **Step 5: Traverse every chain expression in the binder**

Add this binder case:

```ts
case 'OptionalChain':
 expression(e.base);
 for(const link of e.links){
  if(link.kind==='property')expression(link.property);
  else link.arguments.forEach(expression);
 }
 break;
```

The traversal is intentionally unconditional because binding is static; runtime skipping belongs only in lowering. Identifier bases still resolve normally, so an unresolved `missing?.x` becomes a dynamic global read that can throw ReferenceError before the nullish test.

- [ ] **Step 6: Verify frontend GREEN**

Run:

```powershell
npm run build
node --test dist/tests/optional-chaining-frontend.test.js dist/tests/frontend.test.js dist/tests/constructors.test.js dist/tests/super-properties.test.js *> work/optional-chaining-frontend-green.log
```

Expected: all suites pass and no existing call/member/new precedence changes.

---

### Task 4: Reference-aware optional-chain lowering, delete, and GC

**Files:**
- Create: `tests/optional-chaining.test.ts`
- Create: `tests/optional-chaining-gc.test.ts`
- Modify: `src/ir/lower.ts`
- Modify: `tests/lowering.test.ts`

**Interfaces:**
- Consumes: existing `Reference`, `getReference`, property/invoke operations, `isNullish`, CFG block/jump/branch, strict property delete, and normal liveness analysis.
- Produces: `optionalChain(e:A.OptionalChain, mode:'value'|'delete'):number` and `optionalChainCallee(e:A.OptionalChain):{callee:number;receiver?:number}`, with one shared short-circuit result and receiver-preserving calls.

- [ ] **Step 1: Add RED property, call, grouping, and delete tests**

Create `tests/optional-chaining.test.ts`:

```ts
import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

const cases:[string,string][]=[
 ['property and mixed chains','let a=null,b={x:{y:4}};console.log(a?.x.y,b?.x.y,b?.missing?.y);'],
 ['computed key is skipped','let n=0,a=null,b={x:3};console.log(a?.[++n],b?.[(n++,"x")],n);'],
 ['base identifier still resolves','try{console.log(missing?.x);}catch(e){console.log(e.name);}'],
 ['getter errors are not swallowed','let o={get x(){throw 7;}};try{o?.x;}catch(e){console.log(e);}'],
 ['property receivers survive optional and grouped calls','let o={x:6,m(){return this.x;}};console.log(o?.m(),o.m?.(),(o?.m)());'],
 ['arguments are skipped','let n=0,f=null,g=function(x){return x;};console.log(f?.(++n),g?.(++n),n);'],
 ['noncallable and missing method errors remain','let o={x:1};try{o?.x();}catch(e){console.log(e.name);}try{o?.missing();}catch(e){console.log(e.name);}'],
 ['delete nullish and live properties','let a=null,o={x:1};console.log(delete a?.x,delete o?.x,"x" in o);'],
 ['delete computed key is skipped','let n=0,a=null;console.log(delete a?.[++n],n);'],
 ['parentheses terminate short circuit','let a=null;console.log(a?.b.c);try{console.log((a?.b).c);}catch(e){console.log(e.name);}'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));

test('strict delete preserves descriptor failure',()=>{
 expectProgram('"use strict";let o={};Object.defineProperty(o,"x",{value:1,configurable:false});try{delete o?.x;}catch(e){console.log(e.name);}',
  'TypeError\n');
});
```

- [ ] **Step 2: Add RED CFG and GC-root tests**

Append to `tests/lowering.test.ts`:

```ts
test('optional chain lowers to nullish branches and one join',()=>{
 const ir=lower(bind(parse(lex('let o=null;console.log(o?.x?.());'))));
 const blocks=ir.functions[0]!.blocks;
 assert.ok(blocks.filter(b=>b.terminator.kind==='branch').length>=2);
 assert.ok(blocks.flatMap(b=>b.operations).some(o=>o.kind==='invoke'));
});
```

Create `tests/optional-chaining-gc.test.ts` using `compile` plus `runNative`, matching the helper pattern in `tests/gc.test.ts`, and run each source with `{gcStress:true}`:

```ts
const cases=[
 'let o={x:8,m(){for(let i=0;i<20;i++)({v:""+i});return this.x;}};console.log(o?.m());',
 'let key={toString(){for(let i=0;i<20;i++)({v:""+i});return "x";}};let o={x:{y:9}};console.log(o?.[key].y);',
 'let o={m:function(a){return this.x+a;},x:2};function arg(){for(let i=0;i<20;i++)({v:""+i});return 5;}console.log(o.m?.(arg()));',
];
```

Expected stdout must match `runOracle(source).stdout` for every case.

- [ ] **Step 3: Implement a reference/value chain state machine**

In `lower.ts`, introduce:

```ts
type ChainState={kind:'value';slot:number}|{kind:'reference';reference:Reference};
```

Implement `optionalChain(e,mode)` with one result slot and one join block:

```ts
private optionalChain(e:A.OptionalChain,mode:'value'|'delete'):number {
 const result=this.slot(),join=this.block();
 let state:ChainState=e.base.kind==='Member'
  ?{kind:'reference',reference:this.reference(e.base)}
  :{kind:'value',slot:this.expression(e.base)};
 const value=()=>state.kind==='value'?state.slot:this.getReference(state.reference);
 // For each link: materialize/check only the operand required by that link,
 // branch nullish to a short block that writes undefined/true and jumps join,
 // then emit the non-nullish property reference or invocation in the other block.
 // After all links, GetValue or delete the final reference, copy into result,
 // jump join, select join, return result.
 return result;
}
```

For every optional link, first materialize its checked operand exactly once, emit `isNullish`, and branch to separate `short` and `continue` blocks. In `short`, copy `undefined` for value mode or `true` for delete mode to `result`, then jump to the shared `join`. Select `continue` before evaluating a computed key or any call argument.

Property links convert the current state to a value before evaluating the key, then create `{kind:'reference',reference:{object,key}}`. Preserve a super receiver when the preceding flattened reference originated from `super.x`. Call links get the callee once; when state is a property/super reference, set `receiver` to `ref.receiver ?? ref.object`, otherwise omit it. After invoke, state becomes its result value.

At chain end, value mode uses `getReference` if necessary. Delete mode emits ordinary strict-aware `property/delete` for a property reference and returns `true` for a value/call result. A super-property delete follows the existing ReferenceError path.

Factor the same walk so an OptionalChain used as the callee of an outer ordinary
`Call` can also return a receiver slot. Initialize that receiver slot to
`undefined`; when the successful final state is a property Reference, copy
`ref.receiver ?? ref.object` into it before the join. This makes `(o?.m)()` keep
`this === o`, while `(null?.m)()` leaves an undefined callee and the outer
ordinary invocation throws TypeError. The short circuit of `o?.m()` remains
inside the chain because its call is an internal link.

- [ ] **Step 4: Route ordinary evaluation and unary delete through the helper**

Add to `expression`:

```ts
case 'OptionalChain':return this.optionalChain(e,'value');
```

In the ordinary `Call` case, handle an OptionalChain callee before the existing
Member/reference branch:

```ts
const optional=e.callee.kind==='OptionalChain'?this.optionalChainCallee(e.callee):undefined;
const ref=!optional&&e.callee.kind==='Member'?this.reference(e.callee):undefined;
const receiver=optional?.receiver??(ref&&'object'in ref?(ref.receiver??ref.object):undefined);
const callee=optional?.callee??(ref?this.getReference(ref):this.expression(e.callee));
```

At the start of unary `delete` handling add:

```ts
if(e.argument.kind==='OptionalChain')return this.optionalChain(e.argument,'delete');
```

Do not add an IR operation or liveness special case: all values cross callbacks through existing `property`, `invoke`, `copy`, and CFG successor liveness.

- [ ] **Step 5: Verify semantics and stress collection GREEN**

Run:

```powershell
npm run build
node --test dist/tests/optional-chaining-frontend.test.js dist/tests/optional-chaining.test.js dist/tests/optional-chaining-gc.test.js dist/tests/lowering.test.js dist/tests/liveness.test.js *> work/optional-chaining-green.log
```

Expected: all suites pass under normal and stress collection, including skipped key/argument effects and preserved receivers.

---

### Task 5: Compatibility example, complete verification, review, and documentation

**Files:**
- Create: `examples/compat/modern-expressions.cjs`
- Modify: `README.md`
- Modify: `docs/language-support.md`
- Modify: `docs/history/development-log.md`
- Modify: `docs/history/continuation-checkpoint.md`
- Modify: `docs/history/superpowers/specs/2026-09-23-exponentiation-optional-chaining-design.md`
- Modify: `docs/history/superpowers/plans/2026-09-23-exponentiation-optional-chaining.md`

**Interfaces:**
- Consumes: Tasks 1–4, `npm run check`, `scripts/compare-examples.mjs`, and the independent review workflow.
- Produces: a Node/Nona compatibility program, reproducible logs, updated support boundaries, and final implementation evidence.

- [ ] **Step 1: Add the standalone compatibility program**

Create `examples/compat/modern-expressions.cjs`:

```js
console.log(2 ** 3 ** 2, 2 ** -2, (-2) ** 3);
let box = { value: 3, read() { return this.value; } };
console.log(box?.value, box?.read(), box.read?.());
let absent = null;
let effects = 0;
console.log(absent?.[++effects], absent?.read(++effects), effects);
console.log(delete absent?.value, delete box?.value, "value" in box);
try { console.log((absent?.value).x); } catch (error) { console.log(error.name); }
let target = { x: 2 };
target.x **= 3;
console.log(target.x);
```

- [ ] **Step 2: Run every targeted suite**

Run:

```powershell
npm run build
node --test dist/tests/exponentiation-grammar.test.js dist/tests/exponentiation-runtime.test.js dist/tests/optional-chaining-frontend.test.js dist/tests/optional-chaining.test.js dist/tests/optional-chaining-gc.test.js *> work/modern-expressions-targeted.log
```

Expected: 0 failures and 0 unexpected skips.

- [ ] **Step 3: Run the complete regression suite**

Run:

```powershell
npm run check *> work/modern-expressions-check.log
```

Expected: exit code 0 and 0 failures; only the established Windows symlink skip is allowed.

- [ ] **Step 4: Compare all standalone examples with Node**

Run:

```powershell
npm run compare *> work/modern-expressions-compare.log
```

Expected: every compatibility entry prints `PASS`, and `work/compat-report.json` contains matching stdout, stderr, and status for `modern-expressions.cjs`.

- [ ] **Step 5: Request one independent whole-change review**

Give the reviewer the approved spec, this plan, all Task 1–4 changes, the five Review Focus items, and the targeted/full/compare logs. Require severity-ranked findings covering parser precedence and early errors, optional-chain boundaries and receiver state, evaluation order, delete strictness, numeric special cases and approximation thresholds, GC roots, unwind behavior, and PE imports.

Expected: reproduce each Critical/Important finding with a failing test, apply the smallest correction, and rerun the affected targeted suite plus `npm run check`. Record Minor findings without broadening this point.

- [ ] **Step 6: Update documentation from verified behavior**

Set the spec and plan status to implemented only after Steps 2–5 pass. Update the README and language-support matrix with `**`, `**=`, property/call optional chaining, chain restrictions, and optional delete. Record exact test/example counts and the three log paths in the development log and continuation checkpoint. Keep item 3 marked deferred and identify the next unimplemented agreed item without claiming full ES2020.

- [ ] **Step 7: Perform the final evidence check**

Run:

```powershell
npm run build
rg -n "\*\*|optional chaining|modern-expressions|пункт 3|item 3" README.md docs examples/compat/modern-expressions.cjs
```

Expected: build exits 0; documentation names the new syntax and evidence, the compatibility file is discoverable, and the deferred legacy point is still explicit.
