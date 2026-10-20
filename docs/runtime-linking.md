# Runtime linking

Decision record for [#182](https://github.com/40oleg/nona/issues/182).

## Context

The runtime has optional parts: the RegExp engine and its Unicode property
tables, the emoji data of the properties of strings (`\p{RGI_Emoji}` and the
other six of the `v` flag, part `unicodeStringProperties`), the Unicode
normalization tables, and JavaScript preludes such as `proxy`, `timers`,
`buffer` or `process` (`src/link.ts`). The compiler links a part only when the
program's sources can reach it. The lexer
(`collectSourceUsage` in `src/frontend/lexer.ts`) records every identifier,
property name and string or template literal; `preludeTriggers` maps names
to parts, a long trigger name also counts inside a longer string, and
`getOwnPropertyNames`, `getOwnPropertyDescriptors` and `ownKeys` link every
prelude because a program using them could list the built-ins.

The emoji data is
linked only when a regular expression literal or a string names one of the
properties of strings (`Basic_Emoji`, `Emoji_Keycap_Sequence`, `RGI_Emoji…`)
and the RegExp engine is linked: unlike the Unicode property tables, the
`RegExp` name alone does not bring it, so programs that use only `\p{L}` do
not grow. A pattern that names the property only through a computed string
throws an error that asks for `--link unicodeStringProperties` or
`--full-runtime`.

This rule is lexical (superseded by
[Resolved selection](#resolved-selection-438)). It over-links on common words (`at`, `any`, `sort`,
`compile`, `globalThis`), it cannot see a name built at run time
(`globalThis["Pro" + "xy"]`), and it couples the lexer to the runtime's
part list.

## Options

1. Keep the lexical rule and make it explicit: an option to link single
   parts and a report of what was linked and why.
2. Link everything and remove what the lowered program cannot reach
   (reachability over the IR and the runtime's fragments).
3. Materialize preludes lazily at run time.

## Decision

Option 1 now; option 2 as the direction for the size of executables.

- `--link part,...` (compile option `link`) adds single parts. A program
  that reaches `Proxy` only through a computed name links `proxy` instead of
  the whole runtime with `--full-runtime`. An unknown name is an `E_OPTION`
  diagnostic that lists the valid ones (`runtimePartNames`).
- `--print-link` (compile option `reportLink`, result field `linked`) lists
  the linked parts with the reason for each: the first name that selected it
  and whether it was found in the source or inside a string, `--link`,
  `--full-runtime`, or the part that needs it (`preludeDependencies`). This
  makes over-linking visible: a program that mentions `globalThis` links
  `timers`.
- Option 2 is how [#265](https://github.com/40oleg/nona/issues/265)
  continues: the built-ins form a static object graph (the global object's
  property chain, GC root arrays, realm tables), so function-level dead-code
  elimination over the linked image finds almost everything reachable.
  Smaller executables come first from splitting large preludes into parts
  the lexical rule can select (`binaryData`, `regexpProtocol`), and later
  from making the built-in graph itself prunable.
- Option 3 is rejected. Nona compiles ahead of time and its executables
  carry no compiler or interpreter; materializing a prelude at run time
  would need one, or would keep every prelude in the image anyway.

## Consequences

- The lexical rule stays the default, and `docs/` and the site's
  compatibility guide describe it. A new optional part needs trigger names
  in `preludeTriggers`, its dependencies in `preludeDependencies`, and a
  test that a program using it links it.
- `linkReport` in `src/link.ts` mirrors the dependency resolution of
  `linkedPreludes` and `runtimeRegExpLink`; a change to either must keep
  the report in step (`tests/runtime-link-source.test.ts`).

## Native part `float16`

`float16` ([#321](https://github.com/40oleg/nona/issues/321)) holds the
half-precision built-ins: the conversion helpers `rt.float16FromDouble` and
`rt.float16ToDouble` (`src/runtime/float16.ts`), `Math.f16round`,
`DataView.prototype.getFloat16`/`setFloat16` and the `Float16Array` typed-array
constructor (element type 12, with its prototype and per-realm intrinsics). The names `Float16Array`,
`f16round`, `getFloat16` and `setFloat16` select it, as identifiers or inside
strings, and so do the enumerating names (`getOwnPropertyNames`, …), because
listing `Math` would observe the method. Without the part the helpers, the
methods and their GC roots are not emitted (`RuntimeRequest.float16`), so a
program that does not name them has the same size as before the feature.
`--link float16` adds it to a program that reaches the methods only through
computed names.

## Resolved selection (#438)

[#438](https://github.com/40oleg/nona/issues/438) replaces the lexical rule of
the context above. The lexer no longer records anything: `parse()` hands each
program it builds to `recordProgramUsage` (`src/frontend/link-usage.ts`), which
walks the AST with its scopes while `collectSourceUsage` is active. Every
source that the compiler parses inside a collection counts as before: the
program, its modules (built-in ones included), CommonJS files, agents, the
compile-time `eval`/`Function` sources and the script prelude.

- **Identifiers.** A free identifier, one that no enclosing declaration
  binds, selects by every trigger list (`preludeTriggers`, the RegExp,
  normalization and float16 names, and the enumerating names, which link
  every prelude). A name bound by a parameter, `var`, `let`, `const`,
  `class`, `function`, `catch`, an import or a named function or class
  expression selects nothing. A script's top-level `var` and function
  declarations stay global, since they may still hold the built-in. A local in
  one function does not hide the global elsewhere. Inside a `with` body and in
  functions with a sloppy direct `eval`, every identifier counts as a possible
  property name and selects. The `with` keyword is syntax and does not select
  `es2021`.
- **Property names.** `a.x`, `a?.x`, `super.x`, destructuring keys
  (`const { normalize: n } = String.prototype`) and import or export
  specifier names select like free identifiers. Keys that object literals and
  class members define select nothing.
- **Strings in key positions** select by exact whole-string match: computed
  member keys (`s["normalize"]`, `globalThis["Proxy"]`), computed
  destructuring keys, the left operand of `in`, the key arguments of
  property reflection (`Reflect.get`/`has`/`getOwnPropertyDescriptor`/
  `defineProperty`, `Object.getOwnPropertyDescriptor`/`hasOwn`/
  `defineProperty`, `hasOwnProperty`, `propertyIsEnumerable`,
  `__lookupGetter__`/`__lookupSetter__`), module specifiers of `import`,
  `export … from`, `import()` and `require()` (`node:stream`), and
  `Symbol.for` keys (the `nona.*` internal triggers of the `node:*`
  modules).
- **Regular-expression data.** A string with a `\p{…}` or `\P{…}` escape
  selects `unicodeProperties`, a name of a property of strings selects
  `unicodeStringProperties`, and a `v` flags string selects `unicodeSets`.
  Because `runtimeRegExpLink` links all three only with the engine, a
  `\p{L}` string that is printed links nothing. `new RegExp("\\p{L}", "u")`
  and `s.match("\\p{L}")` link the engine through `RegExp` and `match`.
- **Every other string is data.** The substring rule, where a long trigger
  matched inside a longer string, is gone. Data strings select only through
  a program-wide fallback. If any source of the collection accesses a
  property with a computed key that is neither a literal nor obviously
  numeric (a numeric literal, arithmetic, an update expression, or a `for`
  counter that starts at a number), or does so through `in` or a reflection
  call, then every string of every source that exactly matches a trigger is
  linked, with the reason `"x" in a string (dynamic property access)`. Nested
  collections pass their strings and the flag to the outermost collection,
  which decides.

`requireRuntimePrelude`, `requiredSyntaxParts`, `--link`, `--full-runtime`,
`--print-link` and the "not linked" run-time diagnostics are unchanged. A name
built at run time (`globalThis["Pro" + "xy"]`) without any matching string
still needs `--link` or `--full-runtime`.

## Measurements (#438)

Windows x64, `nona build probe.mjs -o probe.exe --target win32-x64
--print-link`, no `--link` and no `--full-runtime`, Node.js 22.23.2. _Before_
is `main` at `16371594` (v0.21.0). _After_ is the `issue-438` branch on top of
it. Every probe also links `moduleRecords`, which `.mjs` entry points need.

| Program                                                 | Before (bytes) | Parts linked before                                                                | After (bytes) | Parts linked after |
| ------------------------------------------------------- | -------------: | ---------------------------------------------------------------------------------- | ------------: | ------------------ |
| `console.log("hello");`                                 |      1,296,384 | —                                                                                  |     1,296,384 | —                  |
| `console.log("normalize");`                             |      1,954,816 | `unicodeNormalization` (`"normalize" inside a string`)                             |     1,296,384 | —                  |
| `console.log("\\p{L}");`                                |      2,985,984 | `regexp`, `unicodeProperties` (`a \p{…} escape inside a string`), `regexpProtocol` |     1,296,384 | —                  |
| `console.log("link");`                                  |      1,357,824 | `annexB` (`"link" in a string`)                                                    |     1,296,384 | —                  |
| `const bold = 1, small = 2; console.log(bold + small);` |      1,357,824 | `annexB` (`"bold" in the source`)                                                  |     1,296,896 | —                  |
