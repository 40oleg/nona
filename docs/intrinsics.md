# Machine model and intrinsic namespace

Decision record for [#183](https://github.com/40oleg/nona/issues/183). The
architecture is described in [architecture.md](architecture.md); this file
records two implicit contracts and what to do about them.

## The logical-x64 machine model

The runtime and the code generator emit code through one assembler API with
x86-64 mnemonics and register names. On ARM64 targets
`createAssembler` returns `Arm64Assembler`, a subclass that re-encodes each
operation as A64 and maps `rax`…`r15` and `rsp` onto `x0`…`x22` and `x28`.
A few bridges (`backend/arm64/windows.ts`, `backend/darwin/arm64.ts`) write
A64 words by hand. Machine-specific steps that do not translate one to one
go behind an interface chosen in `backend/machine/context.ts` (for example
`machineMath()`: x87 on x86-64, software routines on ARM64).

**Decision.** Keep the model for x86-64 and ARM64: it runs eight targets
from one runtime, and both architectures have the registers and addressing
modes the x64 names assume. A third architecture (RISC-V, WebAssembly) does
not get another override subclass. It starts with a machine-independent
layer for the built-ins: the runtime's routines expressed as operations of
`backend/machine/` (loads, stores, calls, compares, vector steps) that each
architecture lowers, so that a port implements that layer rather than
hundreds of x86-64 mnemonics. Until such a port is planned, new runtime code
follows the existing rule: no raw x86-64 bytes outside an x64-only branch,
and a machine-specific step goes behind a `backend/machine/` interface.

## The intrinsic namespace

JavaScript preludes (`src/lib/runtime/*.js`, wrapped by
`src/runtime/*-source.ts`) and native code share helpers through members of
one prelude global, `__nonaRegexpVm`. Preludes may add no other top-level
bindings: the runtime has exactly two prelude globals. Members are defined
by preludes (`vm.name = …` through a local alias, or `defineProperty`), read
by other preludes, and called from native code through the `rt.prelude.NAME`
stubs (`preludeHelpers` in `src/runtime/async.ts`) or by name.

**Decision.** Keep the name. It dates from the RegExp engine, but renaming
it to a neutral `__nonaIntrinsics` touches over five hundred references and
every open branch without changing behaviour; the documentation calls it the
intrinsic namespace. Make the contract checked instead:
`tests/intrinsics.test.ts` builds a manifest of the members the sources
define and read, and fails when a prelude or the runtime reads a member that
nothing defines, or when an `rt.prelude` stub names a helper no prelude
installs.

## Consequences

- A new helper shared between preludes, or between a prelude and native
  code, is a member of `__nonaRegexpVm`, defined through `vm.name =` or
  `defineProperty(vm, "name", …)` so the manifest sees it.
- The manifest is lexical: a member read through a computed name, or through
  an alias the scan does not recognize, is not checked.
