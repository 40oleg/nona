import { skipToFirstUnit } from "./string-scan.js";
import { RuntimeBuilder, slot, failIf } from "./abi.js";
import { rootedFn } from "./root-scope.js";

/**
 * __nonaReplaceAllInternal(input, search, replacement) (#387): `input` with
 * every non-overlapping occurrence of `search` replaced by `replacement`,
 * taken literally. The String.prototype.replaceAll prelude
 * (regexp-protocol.js) calls it for a string search that is not empty and a
 * replacement string without `$`; other arguments return undefined.
 *
 * Two scans with the vector first-unit search of split (#253): the first
 * counts the matches, then the result is allocated once with its final
 * length, and the second copies the gaps and the replacement into it. With
 * no match the input itself is returned.
 *
 * Builtin ABI (RCX out Value*, RDX argc, R8 argv). Frame: 40 output, 64..127
 * the rooted input, search, replacement and result Values, then the input,
 * search and replacement lengths, the position, the match count, the end of
 * the last match and the result's unit cursor.
 */
export function emitStringReplaceAll(b: RuntimeBuilder): void {
    const input = 64,
        search = 80,
        replacement = 96,
        result = 112,
        inputLength = 128,
        searchLength = 136,
        replacementLength = 144,
        position = 152,
        count = 160,
        last = 168,
        cursor = 176;
    rootedFn(
        b,
        "rt.replaceAllUnits.code",
        200,
        [
            { kind: "range", register: "r8", count: "rdx" },
            { kind: "locals", offset: 64, count: 4 },
        ],
        (a) => {
            const bad = a.unique("bad"),
                same = a.unique("same"),
                done = a.unique("done");
            a.store(slot(40), "rcx");
            a.cmp("rdx", 3);
            a.jcc("b", bad);
            for (const [index, local] of [input, search, replacement].entries())
                for (const n of [0, 8]) {
                    a.load("rax", { base: "r8", disp: 16 * index + n });
                    a.store(slot(local + n), "rax");
                }
            for (const [local, length] of [
                [input, inputLength],
                [search, searchLength],
                [replacement, replacementLength],
            ] as const) {
                a.load("rax", slot(local));
                a.cmp("rax", 4);
                a.jcc("ne", bad);
                a.load("rax", slot(local + 8));
                a.load("rax", { base: "rax" });
                a.store(slot(length), "rax");
            }
            a.load("rax", slot(searchLength));
            a.test("rax", "rax");
            a.jcc("e", bad);
            // Moves the position slot to the next match at or after it, or
            // jumps to notFound.
            const findNext = (notFound: string): void => {
                const outer = a.unique("outer"),
                    compare = a.unique("compare"),
                    mismatch = a.unique("mismatch"),
                    match = a.unique("match");
                a.label(outer);
                skipToFirstUnit(
                    a,
                    [
                        position,
                        input + 8,
                        inputLength,
                        search + 8,
                        searchLength,
                    ],
                    notFound,
                );
                a.load("rax", slot(position));
                a.load("r10", slot(searchLength));
                a.add("rax", "r10");
                a.load("r10", slot(inputLength));
                a.cmp("rax", "r10");
                a.jcc("a", notFound);
                a.load("rax", slot(position));
                a.shl("rax", 1);
                a.load("rdx", slot(input + 8));
                a.add("rdx", 8);
                a.add("rdx", "rax");
                a.load("r8", slot(search + 8));
                a.add("r8", 8);
                a.load("r9", slot(searchLength));
                a.label(compare);
                a.test("r9", "r9");
                a.jcc("e", match);
                a.load("r10", { base: "rdx" }, 16);
                a.load("r11", { base: "r8" }, 16);
                a.cmp("r10", "r11");
                a.jcc("ne", mismatch);
                a.add("rdx", 2);
                a.add("r8", 2);
                a.sub("r9", 1);
                a.jmp(compare);
                a.label(mismatch);
                a.load("rax", slot(position));
                a.add("rax", 1);
                a.store(slot(position), "rax");
                a.jmp(outer);
                a.label(match);
            };
            // Pass 1: count the matches.
            const counting = a.unique("counting"),
                counted = a.unique("counted");
            a.mov("rax", 0);
            a.store(slot(position), "rax");
            a.store(slot(count), "rax");
            a.label(counting);
            findNext(counted);
            a.load("rax", slot(count));
            a.add("rax", 1);
            a.store(slot(count), "rax");
            a.load("rax", slot(position));
            a.load("r10", slot(searchLength));
            a.add("rax", "r10");
            a.store(slot(position), "rax");
            a.jmp(counting);
            a.label(counted);
            a.load("rax", slot(count));
            a.test("rax", "rax");
            a.jcc("e", same);
            // The result's length: each match trades the search for the
            // replacement (both at most 2^62 units, so no product overflows).
            a.load("r10", slot(replacementLength));
            a.load("r11", slot(searchLength));
            a.sub("r10", "r11");
            a.imul("rax", "r10");
            a.load("r10", slot(inputLength));
            a.add("rax", "r10");
            a.mov("r10", 0x3fffffffn);
            a.cmp("rax", "r10");
            failIf(a, "a", "rt.throwRangeError");
            a.store(slot(cursor), "rax");
            a.shl("rax", 1);
            a.add("rax", 8);
            a.mov("rcx", "rax");
            // Every unit is written below before the next safepoint.
            a.call("rt.allocRaw");
            a.load("r10", slot(cursor));
            a.store({ base: "rax" }, "r10");
            a.store(slot(result + 8), "rax");
            a.mov("rax", 4);
            a.store(slot(result), "rax");
            // Pass 2: copy the gaps and the replacements. The collection may
            // have moved the records: they are read from the rooted slots.
            const copying = a.unique("copying"),
                tail = a.unique("tail");
            a.mov("rax", 0);
            a.store(slot(position), "rax");
            a.store(slot(last), "rax");
            a.store(slot(cursor), "rax");
            // Copies R8 units from RDX to the result's cursor and advances it.
            const append = (): void => {
                a.load("rcx", slot(cursor));
                a.mov("rax", "rcx");
                a.add("rax", "r8");
                a.store(slot(cursor), "rax");
                a.shl("rcx", 1);
                a.load("rax", slot(result + 8));
                a.add("rcx", "rax");
                a.add("rcx", 8);
                a.call("rt.copyUnits");
            };
            const appendGap = (end: number): void => {
                a.load("r8", slot(end));
                a.load("rax", slot(last));
                a.sub("r8", "rax");
                a.shl("rax", 1);
                a.load("rdx", slot(input + 8));
                a.add("rdx", 8);
                a.add("rdx", "rax");
                append();
            };
            a.label(copying);
            findNext(tail);
            appendGap(position);
            a.load("rdx", slot(replacement + 8));
            a.add("rdx", 8);
            a.load("r8", slot(replacementLength));
            append();
            a.load("rax", slot(position));
            a.load("r10", slot(searchLength));
            a.add("rax", "r10");
            a.store(slot(position), "rax");
            a.store(slot(last), "rax");
            a.jmp(copying);
            a.label(tail);
            appendGap(inputLength);
            a.load("rcx", slot(40));
            for (const n of [0, 8]) {
                a.load("rax", slot(result + n));
                a.store({ base: "rcx", disp: n }, "rax");
            }
            a.jmp(done);
            a.label(same);
            a.load("rcx", slot(40));
            for (const n of [0, 8]) {
                a.load("rax", slot(input + n));
                a.store({ base: "rcx", disp: n }, "rax");
            }
            a.jmp(done);
            a.label(bad);
            a.load("rcx", slot(40));
            a.mov("rax", 0);
            a.store({ base: "rcx" }, "rax");
            a.store({ base: "rcx", disp: 8 }, "rax");
            a.label(done);
        },
    );
}
