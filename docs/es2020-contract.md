# ES2020 completion contract

Target: the normative ECMA-262 11th edition (June 2020) language and built-ins,
compiled ahead of time to a standalone executable. Windows x64 and Linux x64
targets exist for the supported subset; semantic tests must not depend on PE,
KERNEL32, or the Windows calling convention.

This is **not** a claim that Nona currently conforms. The current implementation
is documented in [language-support.md](language-support.md). This contract is the
completion checklist and must be reviewed whenever a feature is added.

## Scope decisions

* `eval` and the dynamic `Function` constructors are explicit project exceptions.
  A release with these exceptions must say “ES2020 with documented exceptions”,
  not “fully conformant ES2020”. Their syntax and reflective properties still
  need a specified behavior and tests.
* `with` is part of the language target in sloppy script code. Its implementation
  is outstanding. Strict-mode rejection is also required.
* Annex B web-compatibility features are tracked separately. Implement the
  portions applicable to a script host, or publish each deviation explicitly.
* ECMA-402 internationalization, browser APIs, and Node.js APIs are separate
  specifications/hosts. They are not part of this ECMA-262 target.
* Both script and module source types are in scope. Module resolution is a host
  decision and must be specified before module work begins.

## Completion inventory

Status is sourced from [language-support.md](language-support.md). “Partial”
means the currently documented subset works, not that the entire standard
chapter works. A row closes only with runnable conformance evidence.

| Area | Current status | Required closure evidence |
| --- | --- | --- |
| Lexical grammar, ASI, literals, identifiers, early errors | Partial | Test262 lexical and grammar groups; legacy and Unicode cases |
| Scripts, declarations, lexical environments, `with`, Annex B | Partial | Scope/name-resolution groups, strict/sloppy variants |
| Expressions, operators, references, coercions | Partial | Operator groups, side-effect order, abrupt completion |
| Statements, `for...in`, `for...of` | Partial | Control-flow groups, enumeration and iterator closing |
| Functions, arrows, parameters, destructuring, templates | Partial | Call/construct/`this`/arguments and syntax groups |
| Proper tail calls in strict code | Missing | Tail-position Test262 groups, bounded native stack use |
| Objects, descriptors, classes, `super`, symbols | Partial | Internal-method invariants and class groups |
| Iterators and generators | Partial | Iterator protocol and generator state groups, including delegated `yield*` and abrupt completion |
| Promises, jobs, async functions/generators | Missing | Job ordering, assimilation, async completion groups |
| Script and module linking, dynamic import, `import.meta` | Missing | Multi-file graph, cycles, live bindings, errors |
| BigInt and all numeric semantics | Partial | Numeric and BigInt groups, boundary values |
| RegExp and Unicode matching | Missing | RegExp syntax, execution and String integration |
| Collections and weak collections | Missing | Key equality, order, GC and weak reachability |
| ArrayBuffer, DataView, typed arrays, SharedArrayBuffer, Atomics | Missing | Buffer/view bounds, shared memory and atomic groups |
| Proxy and Reflect | Missing | Every trap and invariant, abrupt completion |
| All ECMA-262 built-in constructors, methods and properties | Partial | Per-object Test262 groups and property descriptors |
| Native memory safety and portability | Partial | GC stress, callback roots, Windows and Linux native suites |

## Exit rule for every area

1. Grammar and early errors match the applicable standard clauses.
2. Compiled native programs match normative behavior, including property
   descriptors, order of side effects, exceptions, and strict/sloppy variants.
3. Applicable Test262 cases are recorded with a pinned revision, pass/fail/skip
   counts, and an explanation for every exclusion. A passing hand-picked subset
   does not establish full conformance.
4. GC stress and callback/reentrancy tests cover new heap references.
5. The support matrix, development log, and user-facing README are updated.

## Target boundary

The frontend (lex/parse/bind), IR, and ECMAScript runtime semantics should remain
target-independent. Machine calling convention, OS memory and IO, object-file
format, linker, and native execution harness are target-specific. The existing
`compile()` API currently hard-codes `win32-x64`; adding Linux must introduce a
target boundary there rather than fork semantic behavior.

Reference: [ECMA-262 11th edition](https://262.ecma-international.org/11.0/).

The built-in inventory includes at least the global value/function properties;
Object, Function, Boolean, Symbol, Error family, Number, BigInt, Math, Date,
String, RegExp, Array, typed arrays, Map, Set, WeakMap, WeakSet, ArrayBuffer,
SharedArrayBuffer, DataView, JSON, Promise, Generator/AsyncFunction families,
Proxy, Reflect, and Atomics. Each constructor and prototype needs its own
method/property/descriptor checklist when work on that family begins.
