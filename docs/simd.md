# SIMD in the runtime

This is the measurement report of [#253](https://github.com/40oleg/nona/issues/253). It records where the runtime's time goes on benchmarks and real programs and which routines 128-bit vector instructions would speed up. It ends with the plan the implementation follows. Numbers are executed instructions unless a line says otherwise.

## Method

`scripts/profile-runtime.mjs` builds a program for `linux-x64` with a symbol map (`NONA_ELF_MAP`) and runs it under QEMU's execution trace (`qemu-x86_64 -d in_asm,exec,nochain`). Every executed instruction is attributed to the runtime routine or compiled function that contains it.

```sh
node scripts/profile-runtime.mjs bench/16_string_scan.js --scale 0.2 --group
```

- **Why instruction counts.** They are exact and repeatable, so before/after comparisons need no repeated runs. They are not time: a cache miss or a `rep movsb` costs differently. QEMU counts every iteration of a `rep` instruction as one instruction, which overstates `rt.copyBytes`.
- **Why QEMU, not Valgrind.** Valgrind grows its emulated stack only for accesses near the stack pointer. Nona's frames of 4 KiB or more touch their pages below the stack pointer first, as Windows guard pages require, so programs that call such a routine die under Valgrind.
- **Trace size.** The trace is about 20 bytes per instruction. The workloads below are therefore scaled to tens or hundreds of millions of instructions; the real programs use smaller inputs than `bench/real`.
- **Entries per call.** For a routine, "entries" counts how often a translation block starting at its first instruction ran: its calls, plus any jump back to its start. Instructions per entry tell a fixed cost apart from a loop over data.

**Workloads:**

- `bench/` micro-benchmarks, at SCALE 0.02:
    - `05_array`, `06_objects`, `07_strings`, `09_gc`;
    - `11_json`.
- `bench/16_string_scan.js`, at SCALE 0.2. It is new and covers long-string equality and ordering, `indexOf`/`includes`/`lastIndexOf`, `split`/`replaceAll` and long `Map` keys.
- acorn 8.18.0 parsing `src/lib/modules/util.js` (26 KB) once.
- marked 12.0.2 rendering 8 generated sections.
- Six npm packages from the #249 corpus, running their test programs: js-yaml, semver, validator, zod, diff and mustache.

Profiles were taken on Linux x64. ARM64 runs the same runtime routines: the ARM64 assembler re-encodes the logical x64 operations one to one. Its instruction mix is the same up to the encoding.

## Where the instructions go

The table gives the share of all executed instructions per family of routines:

- **compare:** `rt.compareStrings`, the ordering and equality of two string records.
- **strict equality:** `rt.strictEquals` and `rt.strictEq`, the dispatch in front of it.
- **search:** `indexOf`, `lastIndexOf`, `includes`, `startsWith`, `endsWith`, `split` and `rt.splitSubstring`.
- **slice/substring:** the copying string builtins.
- **hash:** `rt.propKeyHash`, the property and `Map` key hash.
- **sweep:** `rt.sweepChunk` and `rt.sweepClass`.
- **mark:** the collector's marking and tracing.
- **alloc:** `rt.alloc`, `rt.allocRaw` and `rt.zeroBytes`.
- **RegExp VM:** the RegExp engine, which is JavaScript compiled into the runtime (`src/lib/runtime/regexp-vm.js`).

| Workload                            | Instructions | compare | strict equality | search | slice/substring | hash | sweep | mark | alloc | RegExp VM |
| ----------------------------------- | ------------ | ------- | --------------- | ------ | --------------- | ---- | ----- | ---- | ----- | --------- |
| bench/16_string_scan.js (SCALE 0.2) | 379M         | 51.7%   | 0.1%            | 9.2%   | 3.4%            | 3.4% | 0.3%  | 0.2% | 1.1%  | 1.5%      |
| bench/07_strings.js                 | 85M          | 2.3%    | 3.5%            | 3.1%   | 0.3%            | 0.5% | 0.4%  | 0.0% | 1.9%  | 23.8%     |
| bench/11_json.mjs                   | 103M         | 3.2%    | 0.0%            | 0.1%   | 0.2%            | 0.6% | 1.3%  | 5.1% | 4.9%  | 1.3%      |
| bench/09_gc.js                      | 132M         | 0.5%    | 0.0%            | 0.1%   | 0.1%            | 0.3% | 6.7%  | 3.2% | 8.2%  | 1.0%      |
| bench/06_objects.js                 | 84M          | 0.7%    | 1.9%            | 0.1%   | 0.2%            | 0.5% | 1.2%  | 9.5% | 4.2%  | 1.6%      |
| bench/05_array.js                   | 256M         | 0.2%    | 0.0%            | 0.0%   | 0.1%            | 0.2% | 0.2%  | 0.0% | 1.1%  | 20.9%     |
| acorn                               | 798M         | 3.6%    | 5.0%            | 0.3%   | 0.2%            | 1.1% | 0.3%  | 2.4% | 0.9%  | 20.8%     |
| marked                              | 349M         | 3.4%    | 4.8%            | 0.3%   | 0.3%            | 1.7% | 0.5%  | 0.8% | 1.7%  | 21.0%     |
| js-yaml                             | 30M          | 6.6%    | 10.4%           | 0.2%   | 0.2%            | 2.3% | 1.0%  | 0.0% | 4.5%  | 11.3%     |
| semver                              | 78M          | 5.5%    | 10.3%           | 1.9%   | 0.3%            | 1.5% | 1.0%  | 4.9% | 4.0%  | 12.5%     |
| validator                           | 135M         | 6.2%    | 12.8%           | 0.3%   | 0.1%            | 1.1% | 2.6%  | 8.3% | 7.3%  | 11.8%     |
| zod                                 | 124M         | 2.3%    | 2.6%            | 0.1%   | 0.0%            | 1.7% | 1.6%  | 7.6% | 4.8%  | 3.3%      |
| diff                                | 13M          | 5.7%    | 1.6%            | 0.2%   | 0.1%            | 4.8% | 1.3%  | 0.0% | 5.6%  | 4.0%      |
| mustache                            | 12M          | 4.2%    | 1.2%            | 0.2%   | 0.1%            | 4.8% | 1.1%  | 0.0% | 5.1%  | 4.0%      |

Cost per call shows whether a routine loops over long data:

| Routine                           | Real programs (acorn, marked, npm) | bench/16_string_scan |
| --------------------------------- | ---------------------------------- | -------------------- |
| `rt.compareStrings`               | 26–45 instructions per call        | 3,214 per call       |
| `rt.strictEq` / `rt.strictEquals` | 37 / 23–25                         | 35 / 25              |
| `rt.stringIndexOf`                | 45                                 | 18,323               |
| `rt.stringSlice`                  | —                                  | 2,841                |
| `rt.propKeyHash`                  | 32–75                              | 75                   |
| `rt.sweepChunk`                   | 5,500–7,700 per chunk              | 7,579                |

## Findings

1. **`rt.compareStrings` is the largest scan, but only on long strings.**
    - It compares one 16-bit code unit per 11 instructions after a fixed cost of about 20. In `16_string_scan` it is half of all instructions, at 3,214 per call.
    - In acorn, marked and the npm packages it is 3–7% of all instructions, but at 26–45 instructions per call: the strings compared there are short, or differ in their first units.
    - A vector loop compares eight units per iteration. A prototype (16-bit lane compare plus byte mask on SSE2 and NEON) runs the long-string part of `16_string_scan` in 6 ms instead of 30 ms. Its `Map` lookups with 300-unit keys take 58 ms instead of 100 ms (Linux x64, wall time).
2. **Strict equality of strings costs more in dispatch than in comparing.**
    - `===` on two different string records goes through `rt.strictEquals` (23–25 instructions), then `rt.strictEq` (37), then `rt.compareStrings`. That is about 100 instructions for an equality that usually fails at the length or the first unit. Since [#257](https://github.com/40oleg/nona/issues/257), `rt.strictEquals` compares two strings itself (same record, lengths, then units 16 bytes per step), about 40 instructions per comparison; js-yaml, semver and validator run 8–10% fewer instructions.
    - Together these are 10–17% of js-yaml, semver and validator, and about 9% of acorn and marked.
    - The fix is not SIMD. An equality path that compares lengths and the first unit before any call would remove most of it. It is proposed as a separate issue, because it would gain more on real programs than vectorizing the loop.
3. **Substring search is a naive double loop.**
    - `indexOf`, `lastIndexOf`, `includes`, and the scans of `split` and `replaceAll` compare the pattern at every position, one unit at a time. That is 18,323 instructions per `indexOf` call in `16_string_scan`.
    - A vector scan for the pattern's first unit (and last unit, to filter candidates) skips eight positions per iteration where the first unit does not occur.
    - In real programs the searched strings are short (45 instructions per call), so the gain is in programs that search large texts: parsers of big inputs, templating and log processing.
4. **Slicing copies one unit at a time.**
    - `slice`, `substring` and `substr` copy code units in a 7-instruction loop: 2,841 instructions for 2,000 units.
    - Copying with vector loads and stores, or with `rt.copyBytes`, which already uses `rep movsb`, takes a few instructions per 16 bytes.
5. **The property hash is serial, not vectorizable.**
    - `rt.propKeyHash` is FNV-1a over code units, a dependency chain of `xor` and `imul` per unit, 1–5% of real programs.
    - Hashing four units (8 bytes) per step would make it shorter, but that is a word-at-a-time change of the hash function, not SIMD. It is out of scope here.
6. **The GC sweep is not a SIMD candidate in the current heap layout.**
    - `rt.sweepChunk` costs 5,500–7,700 instructions per chunk: 6.7% of `09_gc` and up to 2.6% of the npm programs.
    - Each cell's mark is an epoch word in its own header, cells of a chunk are as far apart as its cell size, and every dead cell is pushed on the free list one by one. Vectors would need gathers to read the marks, and the free list is serial.
    - What would make sweeping vectorizable is a per-chunk mark bitmap, which can be scanned 128 bits at a time. That is a change of the collector's design, recorded below as a follow-up, not part of this issue.
    - Allocation zeroes small blocks with 8-byte stores (`rt.alloc`, `rt.allocRaw`, `alloc` above: up to 8% of `09_gc`). 16-byte stores halve that loop, a small and safe gain next to the collector.
7. **The RegExp engine is a fifth of every regex-heavy program.**
    - The RegExp VM, which is JavaScript, is 11–24% of `07_strings`, acorn, marked and the npm packages.
    - Its time goes to the matching loops (for example `js.regexpVm.fn.30`, 1,574–11,016 instructions per entry). A native, vectorized scan for the first character a pattern can start with would let the VM skip positions where no match can begin.
    - The VM is not runtime assembly, so this is a separate design (native helpers called from the prelude). It is recorded as a follow-up.
    - Done in #258: compile computes the code units a match can start with (up to eight; none for nullable, anchored or sticky searches) and the search calls the native `__nonaRegexpScan` before each attempt; a leading literal run goes to `indexOf` whole. The hot patterns of acorn and marked are mostly anchored (`^…`), sticky or nullable, so the gain there is small (acorn about 4%, marked about 13% of the engine's instructions); unanchored searches of long texts gain the most.

## Instruction level

Every kernel above works on 16 bytes at a time with SSE2 on x86-64 and NEON on ARM64, which every CPU of these architectures has. AVX2 would double the width. The measured loops are short at the string lengths programs use, though, and gain little from 32-byte vectors once they leave the scalar code. The option `--cpu x86-64-v2|x86-64-v3` (with a CPUID check at startup) is therefore added only when a kernel shows a measured gain from AVX2 over SSE2. Until then, executables keep running on any x86-64 and ARM64 CPU.

## Plan

The candidates of this issue, in order:

1. **Vector operations in the machine model.** The x64 `Assembler` and `Arm64Assembler` get:
    - `vectorEqual16`/`vectorEqual8` (lane compare);
    - `vectorOr`/`vectorAnd`;
    - `vectorBroadcast16`;
    - `vectorMask` (byte mask; one bit per byte on x64, four on ARM64, see `vectorMaskBitsPerByte` and `vectorMaskAll`);
    - `bitScanForward`.

    They are defined by their effect, so that runtime code uses them on both machines without a branch. The existing `loadXmm128`/`storeXmm128` are the unaligned 128-bit loads and stores.

2. **`rt.compareStrings`:** eight units per iteration while both strings have eight left.
3. **Search:** `indexOf`, `lastIndexOf`, `includes`, and the scans of `split` and `replaceAll` skip with a vector scan for the pattern's first unit.
4. **Copies:** `slice`, `substring` and `substr`, and the zeroing of small blocks in `rt.alloc`.
5. **Typed arrays:** block kernels for `fill`, `copyWithin`, `set` and `slice`, and an in-place element search for `indexOf`, `lastIndexOf` and `includes` (`bench/17_typed_arrays.js`).

Follow-ups, proposed as separate issues:

- an equality fast path for strings in `rt.strictEquals`;
- native vectorized scans for the RegExp VM;
- a per-chunk mark bitmap that would make sweeping vectorizable;
- a word-at-a-time key hash;
- `--cpu` levels, once an AVX2 kernel shows a gain.

Each implementation PR re-runs the profiles of this page and `bench/16_string_scan.js` before and after, on x64. On ARM64 it runs the native and portable suites.

## Results

Steps 1–4 of the plan are implemented: the vector operations of the machine model, the eight-unit loop of `rt.compareStrings`, the first-unit scan of `indexOf`, `includes`, `lastIndexOf`, `split` and `replaceAll`, the 16-byte copy routine `rt.copyUnits` used by `slice`, `substring`, `substr`, `split` and RegExp captures, and 16-byte zeroing in `rt.alloc`.

Instructions counted with `scripts/profile-runtime.mjs` on x64:

| Program                             |      Before |       After |                                          Change |
| ----------------------------------- | ----------: | ----------: | ----------------------------------------------: |
| `16_string_scan.js` (`--scale 0.2`) | 378,843,478 | 178,322,090 |                                            −53% |
| `07_strings.js` (`--scale 0.02`)    |  85,209,818 |  83,742,461 |                                           −1.7% |
| `09_gc.js` (`--scale 0.02`)         | 132,339,485 | 134,026,286 | +1.3% (noise: the program is not deterministic) |

`rt.compareStrings` in `16_string_scan.js` went from 3,214 to 439 instructions per call. Wall time of `16_string_scan.js` (`SCALE=1`, native x64): equals 30 → 6 ms, search 52 → 31 ms, split 80 → 62 ms, keys 100 → 55 ms.

The programs of `tests/simd.test.ts` print what Node.js prints on x64 and on ARM64 (under QEMU), including under `gcStress`.

### Typed arrays

Step 5 adds `src/runtime/typed-array-kernels.ts`:

- `rt.fillBytes` stores the element, repeated over 16 bytes, along the range; `fill` converts its value once and calls it.
- `rt.moveBytes` is an overlapping copy (backward, 16 bytes per step, when the target lies inside the source); `copyWithin` makes one call instead of copying byte by byte.
- `rt.findElements` compares elements in place. Integer types searched forward compare 16 bytes per step (`vectorEqual8`, `vectorEqual16` and the new `vectorEqual32`); float types compare one number per step, so that `+0` finds `-0` and only `includes` finds NaN. `indexOf`, `lastIndexOf` and `includes` used to read each element as a value and call `rt.strictEq`; they still do for BigInt arrays and for searched values that are not Numbers.
- `arrayBufferCopy` (behind `slice`) copies with `rt.copyBytes` instead of a byte loop, keeping the byte order the specification gives overlapping ranges, and `set` from a typed array of the same type in another buffer is one such copy.
- On ARM64, `rep movsb` (and so every `rt.copyBytes`) copies 16 bytes per step through `v31` unless the target lies less than 16 bytes after the source.

`17_typed_arrays.js` (`--scale 0.01`) went from 354,145,899 to 66,478,685 instructions (−81%); most of what is left is the program filling its arrays. Wall time (`SCALE=1`, native x64, Node.js 22 in brackets): fill 68 → 5–9 ms (9), copies 850–1070 → 17–26 ms (22), searches 1290–1430 → 33–48 ms (66). The element-wise loops of the benchmark are compiled code and unchanged; vectorizing such loops is a compiler change (only element-wise operations, no reordered floating-point sums) left for later.

The test262 directories `built-ins/TypedArray/prototype/{copyWithin,fill,includes,indexOf,lastIndexOf,set,slice}` pass on Linux x64.

### Garbage collection

The vector work on the collector is the 16-byte zeroing of `rt.alloc` (step 4). Sweeping stays scalar. Its share, from the profiles of this page:

| Workload                                                       |    Sweep | Mark and trace |
| -------------------------------------------------------------- | -------: | -------------: |
| `09_gc.js`                                                     |     6.8% |           3.2% |
| `06_objects.js`, `11_json.js`, `14_calls.js`                   | 1.2–1.3% |       5.1–9.5% |
| npm packages (diff, js-yaml, mustache, semver, validator, zod) | 1.0–2.7% |     up to 8.2% |
| acorn, marked, strings and typed array benchmarks              | 0.1–0.5% |     up to 2.4% |

A per-chunk mark bitmap would let the sweep skip live cells 128 at a time, but every dead cell still needs its own work (side tables, the free list), and the bitmap changes marking, allocation and the write barrier. Even a sweep twice as fast would save at most about 3% of `09_gc.js`, a collector stress test, and under 1% of the other workloads. Marking, the larger part, follows pointers and does not vectorize. The bitmap is therefore not part of this issue.
