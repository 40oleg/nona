# Shared runtime operations audit

This records the stage-2 baseline and the required seam for Linux. It is an
audit of the present implementation, not a statement of full ES2020 behavior.

| Operation | Current implementation | Known gap before ES2020 closure |
| --- | --- | --- |
| Property get / `in` | `rt.getProperty` / `rt.hasProperty` in `src/runtime/objects.ts` | Key conversion now uses one `rt.toPropertyKey` entry point; it still only produces strings because Symbol is absent. Proxy dispatch absent |
| Property set | `rt.setProperty` in `src/runtime/objects.ts` | Ordinary object/array/arguments paths exist; Symbol keys, Proxy `[[Set]]` and receiver semantics must be added |
| Property delete | `rt.deleteProperty` in `src/runtime/objects.ts` | Symbol keys and Proxy `[[Delete]]` absent |
| Own keys and enumeration | `src/runtime/own-keys.ts`, `key-sort.ts` | Symbol ordering and Proxy ownKeys invariants absent; `for...in` absent |
| Descriptors / define | `define-property.ts`, `descriptor-conversion.ts`, `descriptor-validation.ts` | Internal dispatch is not yet general enough for Proxy or typed arrays |
| Call / construct | `functions.ts`, `function-call.ts`, `function-bound-call.ts` | Classes, Proxy functions and async/generator callables absent |
| Primitive conversion | `object-coercion.ts` | `Symbol.toPrimitive` and Date default hint absent |
| Numeric conversion | `primitives.ts`, `numeric.ts` | BigInt conversion and operations absent |
| GC roots / reentry | `root-scope.ts`, `gc.ts` | Suspended async/generator frames and weak collections absent |

## Implementation rule for the next changes

Extend these shared entry points with Symbol-aware (`ToPropertyKey`) and object
internal-method dispatch. Do not add separate property semantics in parser or
backend code generation. Keep semantic tests able to run on both native targets.
The PE writer (`src/backend/pe`), KERNEL32 imports (`src/runtime/memory.ts`) and
Windows x64 ABI (`src/runtime/abi.ts`) form the current target-specific layer.

The first semantic regression group is `tests/runtime-operations.test.ts`: it
checks property conversion, descriptors, lookup, call/construct receiver,
coercion order, and abrupt completion at the shared entry points.
