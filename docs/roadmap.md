# Roadmap

This plan comes from a review of every post on the [V8 blog](https://v8.dev/blog) (158 posts, 2008–2025). Each idea was checked against Nona's design: Nona compiles ahead of time, has no interpreter, no JIT and no run-time type feedback. What only works with speculation and deoptimization was left out, unless it has an ahead-of-time equivalent.

Status: **done** (merged), **in progress** (open issue or pull request), or nothing (planned). Effort: S (days), M (weeks), L (months).

## Target architectures

Nona emits x86-64 and AArch64 machine code. The native expansion in [#117](https://github.com/40oleg/nona/issues/117) adds the ports below; see the [native platform matrix](native-platforms.md) for execution evidence and API limits.

| Target | Format | Status / notes |
| --- | --- | --- |
| `win32-x64` | PE32+ | Existing Windows target |
| `linux-x64` | ELF64 | Existing direct-kernel target, no libc |
| `linux-arm64` | ELF64 (AArch64) | Implemented, direct kernel calls |
| `win32-arm64` | PE32+ (ARM64) | Implemented, native DLL ABI bridge |
| `darwin-x64` | Mach-O64 (x86-64) | Implemented, direct kernel startup |
| `darwin-arm64` | Mach-O64 (AArch64) | Implemented, system dyld/libSystem startup and embedded signing |
| `freebsd-x64` / `openbsd-x64` | ELF64 | Implemented, native kernel adapters |
| `wasm32-wasi` | WebAssembly + WASI | Planned; needs structured control flow and stack switching |
| `linux-riscv64` | ELF64 (RV64GC) | Planned; needs another native instruction emitter |
| `linux-x86` / `win32-x86` | ELF32 / PE32 | Planned, low priority |

Runtime register and frame names are logical roles shared by the x64 and ARM64 emitters. OS adapters supply the native services. A future builtins DSL may improve maintainability, but it is not required for these native ports.

## Quick wins (S)

| # | Idea | V8 source | Status |
| --- | --- | --- | --- |
| 1 | Number arithmetic, comparisons and branches inline instead of runtime calls | Sparkplug, Liftoff, Maglev | **done** (#41) |
| 2 | Collection check once per basic block instead of before every operation | Maglev, jank busters | **done** (#41) |
| 3 | Cache compiled regular expressions; skip to a literal prefix; try anchored patterns only at the start | Speeding up regular expressions | **done** (#41, #107) |
| 4 | Seeded string hashing and cached key hashes (hash flooding) | Hash flooding, hash codes | **done** (#66) |
| 5 | Collector: leaf blocks are not greyed, larger start threshold, poisoned cells under GC stress | Orinoco, Oilpan, temporal memory safety | **done** (#67) |
| 6 | Spread, destructuring and rest step array iterators directly and append to dense elements | Spread elements, high-performance ES2015 | **done** (#65) |
| 7 | Cheaper await steps, pooled coroutine stacks | Faster async functions and promises | **done** (#68) |
| 8 | Small post-ES2020 features: numeric separators, logical assignment, `Promise.any`, `.at()`, `Object.hasOwn`, Error `cause`, `findLast` | V8 release posts 7.5–9.7 | **done** (#69) |
| – | Integer and short decimal number-to-string fast paths | V8 release 8.6 | **done** (#41) |

## Medium (M)

| # | Idea | V8 source | Status |
| --- | --- | --- | --- |
| 9 | Map/Set ordered hash tables | Hash codes, release 6.x | **done** (#41, hash index over the entry list) |
| 10 | Dense array elements with holes and a dictionary fallback | Fast properties, elements kinds | **done** (#41) |
| 11 | RegExp: bytecode with an explicit backtrack stack (no native recursion, no step limit), fused class runs | Non-backtracking RegExp, RegExp tier-up | **done** (#14; class runs not fused yet) |
| 12 | RegExp: linear-time (Pike VM) fallback instead of the backtracking limit for eligible patterns | Non-backtracking RegExp | **done** (#98; not for the `u` flag or nullable optional loops) |
| 13 | Link only the preludes a program can reach (RegExp, Promise, Proxy, Reflect, timers, fs, process) | Lazy deserialization, V8 Lite | **done** (#62, #84; Reflect and Promise stay linked) |
| 14 | Iterative native `JSON.parse` with exact pre-sized objects; segmented `JSON.stringify` output | JSON.parse (7.6), faster JSON.stringify | **done** (#41, #88; the object model limits the rest) |
| 15 | Static type inference over the CFG (int32 / double / boolean) to drop tag checks and keep loop counters in registers | Maglev representation selection, Turboshaft typing | first step **done** (#94: Number inference, inline arithmetic, copy forwarding); registers and int32 open |
| 16 | Direct calls to known functions and an argument-adaptor-free calling convention | Adaptor frame removal (8.9) | direct calls **done** (#96, guarded by the code pointer; #47: arrows too, and callers pass no `this` to callees that never read it); prologue set up on demand, ordinary calls, `new` and method lookups inline (#47); argument copying unchanged |
| 17 | `super.x` as an ordinary lookup with a separate receiver; `defineField` for class fields; Proxy "no trap" fast paths | Fast super, faster class features, optimizing proxies | super as an ordinary lookup **done** (#91); class fields, private methods and static blocks **done** (#106: an instance initializer per class defines fields with `rt.defineField`); Proxy without traps is within 2× of V8 |
| 18 | Real-world benchmarks (acorn, marked, lodash, Web Tooling Benchmark, the compiler itself) and per-runtime-function call statistics | Real-world performance, Web Tooling Benchmark | call statistics **done** (#90, `--call-stats`); real-world corpus **started** (#104, `bench/real`: acorn and marked) |
| 19 | `--coverage` builds with V8-format output (c8/Istanbul) | JavaScript code coverage | **done** per function (#100); block coverage open |
| 20 | Persistent on-disk cache of the lowered preludes | Code caching | **done** (#86, the whole compiled runtime and prelude image) |

## Foundation (L)

| # | Idea | V8 source |
| --- | --- | --- |
| 21 | Shapes (hidden classes) with in-object slots. Shapes of object literals and of `this.x = …` in constructors are known at compile time, so a static inline cache (`cmp [obj+shape], K`) needs no feedback. | Fast properties, slack tracking |
| 22 | Startup snapshot: run the preludes at build time and write the resulting heap into the executable's data section, re-seeding hashes and `Math.random` at start. | Custom startup snapshots, static roots |
| 23 | Page-based heap with mark bitmaps, bump allocation and lazy sweeping; then parallel marking. | Orinoco, Oilpan |
| 24 | SSA mid-level IR on the control-flow graph (not Sea of Nodes) with constant folding, DCE, GVN and LICM; then linear-scan register allocation, escape analysis and inlining. | Leaving the Sea of Nodes, Maglev |
| 25 | Builtins DSL (a CodeStubAssembler/Torque analogue) over the runtime builder: typed, register-allocated, inlinable into user code and portable to new architectures. | CSA, embedded builtins |
| 26 | Compile regular-expression literals to native matchers. | RegExp tier-up |

## Not planned

Deoptimization, on-stack replacement and speculative inlining (they need a JIT); mutable heap numbers (Nona never boxes doubles); full pointer compression and a generational collector before the object model is redesigned (a write barrier would be needed in all hand-written runtime stores); JIT hardening (sandbox, CFI for generated code, Spectre mitigations for JIT code), because Nona generates no code at run time.
