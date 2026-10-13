# Runtime linking

Decision record for [#182](https://github.com/40oleg/nona/issues/182).

## Context

The runtime has optional parts: the RegExp engine and its Unicode property
tables, the Unicode normalization tables, and JavaScript preludes such as
`proxy`, `timers`, `buffer` or `process` (`src/link.ts`). The compiler links a
part only when the program's sources can reach it. The lexer
(`collectSourceUsage` in `src/frontend/lexer.ts`) records every identifier,
property name and string or template literal; `preludeTriggers` maps names
to parts, a long trigger name also counts inside a longer string, and
`getOwnPropertyNames`, `getOwnPropertyDescriptors` and `ownKeys` link every
prelude because a program using them could list the built-ins.

This rule is lexical. It over-links on common words (`at`, `any`, `sort`,
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
