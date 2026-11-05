import { test } from "node:test";
import assert from "node:assert/strict";
import { createAssembler } from "../src/backend/machine/context.js";
import { Assembler } from "../src/backend/x64/assembler.js";
import { linkHost } from "./helpers/program.js";
import { emitRuntime } from "../src/runtime/index.js";
import { runNative } from "./helpers/native.js";
import { lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import { bind } from "../src/frontend/binder.js";
import { lower } from "../src/ir/lower.js";
import { generate } from "../src/backend/x64/codegen.js";
import { runOracle } from "./helpers/oracle.js";
import { expectProgram } from "./helpers/program.js";
import { RuntimeBuilder } from "../src/runtime/abi.js";
import { emitProcessMemory } from "../src/runtime/process-memory.js";
import { HeapLayout as H, HeapKind } from "../src/runtime/heap-layout.js";
import {
    ArrayBufferKind,
    ArrayBufferLayout as B,
} from "../src/runtime/array-buffer-layout.js";

function native(body: (a: Assembler) => void): void {
    const r = emitRuntime(),
        a = createAssembler("entry");
    const memory = new RuntimeBuilder();
    emitProcessMemory(memory);
    r.fragments.push(...memory.bundle.fragments);
    r.functions.push(...memory.bundle.functions);
    a.initializeStack();
    a.sub("rsp", 104);
    const prologSize = a.offset;
    a.call("rt.init");
    a.lea("rax", { rip: "test.roots" });
    a.store({ rip: "rt.gcGlobals" }, "rax");
    a.mov("rax", 2);
    a.store({ rip: "rt.gcGlobalCount" }, "rax");
    body(a);
    a.call("rt.dispose");
    a.mov("rcx", 0);
    a.callImport("ExitProcess");
    a.label("test.fail");
    a.mov("rcx", 42);
    a.callImport("ExitProcess");
    a.label("entry.end");
    r.fragments.push(
        {
            name: "test.roots",
            section: ".data",
            alignment: 16,
            bytes: new Uint8Array(32),
            fixups: [],
            symbols: {},
        },
        { ...a.finish(), name: "entry", section: ".text" },
    );
    r.functions.push({
        begin: "entry",
        end: "entry.end",
        prologSize,
        stackAllocation: 104,
        savedRegisters: [],
    });
    const run = runNative(linkHost({ ...r, entry: "entry" }));
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr.toString());
}
function equal(a: Assembler, symbol: string, value: number): void {
    a.load("rax", { rip: symbol });
    a.cmp("rax", value);
    a.jcc("ne", "test.fail");
}

// Query a saved payload pointer (possibly interior), checking the actual header
// or a miss. The expected header comes from the allocator's returned payload.
function blockAt(
    a: Assembler,
    pointerSlot: number,
    offset: number,
    found = true,
): void {
    a.load("rcx", { base: "rsp", disp: pointerSlot });
    a.add("rcx", offset);
    a.call("rt.blockOf");
    if (found) {
        a.load("r10", { base: "rsp", disp: pointerSlot });
        a.sub("r10", H.size);
        a.cmp("rax", "r10");
    } else a.cmp("rax", 0);
    a.jcc("ne", "test.fail");
}

test("block lookup accepts only requested payload bytes across cell and mapping sizes (#646)", () =>
    native((a) => {
        // The table is initially absent; static and null pointers must miss.
        a.mov("rcx", 0);
        a.call("rt.blockOf");
        a.cmp("rax", 0);
        a.jcc("ne", "test.fail");
        a.lea("rcx", { rip: "test.roots" });
        a.call("rt.blockOf");
        a.cmp("rax", 0);
        a.jcc("ne", "test.fail");
        // Includes cell padding, non-power-of-two classes and a large mapping.
        for (const bytes of [1, 63, 985, 4096, 65400, 150000])
            for (let cell = 0; cell < 3; cell++) {
                // Successive cells exercise nonzero cell indices as well.
                a.mov("rcx", bytes);
                a.call("rt.alloc");
                a.store({ base: "rsp", disp: 40 }, "rax");
                blockAt(a, 40, -H.size, false);
                blockAt(a, 40, -1, false);
                blockAt(a, 40, 0);
                blockAt(a, 40, bytes - 1);
                blockAt(a, 40, bytes, false);
                // A mapping header is never a payload, even with a valid page key.
                a.load("rcx", { base: "rsp", disp: 40 });
                a.and("rcx", -65536);
                a.call("rt.blockOf");
                a.cmp("rax", 0);
                a.jcc("ne", "test.fail");
            }
    }));

test("interior lookup and weak mark queries track collection epochs and cell reuse (#646)", () =>
    native((a) => {
        a.mov("rcx", 64);
        a.call("rt.alloc");
        a.store({ base: "rsp", disp: 40 }, "rax");
        a.add("rax", 17);
        a.store({ rip: "test.roots", addend: 8 }, "rax");
        a.mov("rax", 4);
        a.store({ rip: "test.roots" }, "rax");
        const marked = (expected: number) => {
            a.load("rcx", { base: "rsp", disp: 40 });
            a.add("rcx", 17);
            a.call("rt.gcIsMarkedPointer");
            a.cmp("rax", expected);
            a.jcc("ne", "test.fail");
        };
        for (let epoch = 0; epoch < 3; epoch++) {
            a.call("rt.collect");
            equal(a, "rt.blocks", 1);
            blockAt(a, 40, 17);
            marked(1);
        }
        // Lazy sweep leaves the dead header present, but its mark is stale.
        a.mov("rax", 0);
        a.store({ rip: "test.roots" }, "rax");
        a.call("rt.collect");
        marked(0);
        // Force sweeping so lookup must now reject the free cell itself.
        a.mov("rax", 1);
        a.store({ rip: "rt.gcPoison" }, "rax");
        a.call("rt.collect");
        blockAt(a, 40, 17, false);
        equal(a, "rt.blocks", 0);
        a.mov("rcx", 64);
        a.call("rt.alloc");
        a.load("r10", { base: "rsp", disp: 40 });
        a.cmp("rax", "r10");
        a.jcc("ne", "test.fail");
        blockAt(a, 40, 17);
        marked(1);
        a.call("rt.collect");
        blockAt(a, 40, 17, false);
        equal(a, "rt.blocks", 0);
        // Preserve weak-key treatment of null and permanently live statics.
        a.mov("rcx", 0);
        a.call("rt.gcIsMarkedPointer");
        a.cmp("rax", 0);
        a.jcc("ne", "test.fail");
        a.lea("rcx", { rip: "rt.objectPrototype" });
        a.call("rt.gcIsMarkedPointer");
        a.cmp("rax", 1);
        a.jcc("ne", "test.fail");
    }));

test("large interior lookup survives page-map growth, tombstones and shorter cached reuse (#646)", () =>
    native((a) => {
        // Each mapping spans 49 granules, forcing growth of the initial table.
        for (const pointerSlot of [40, 48]) {
            a.mov("rcx", 3 << 20);
            a.call("rt.alloc");
            a.store({ base: "rsp", disp: pointerSlot }, "rax");
            blockAt(a, pointerSlot, 0);
            blockAt(a, pointerSlot, 65536);
            blockAt(a, pointerSlot, (3 << 20) - 1);
        }
        // Keep only the second mapping via an interior root. Removing all page
        // keys of the first must not break probes that pass through tombstones.
        a.load("rax", { base: "rsp", disp: 48 });
        a.add("rax", 65536);
        a.store({ rip: "test.roots", addend: 8 }, "rax");
        a.mov("rax", 4);
        a.store({ rip: "test.roots" }, "rax");
        a.call("rt.collect");
        for (const offset of [0, 65536, (3 << 20) - 1]) {
            blockAt(a, 40, offset, false);
            blockAt(a, 48, offset);
        }
        // The cached 3 MiB mapping fits a 2 MiB payload; its old tail remains
        // mapped and registered, but must not be accepted as the new payload.
        a.mov("rcx", 2 << 20);
        a.call("rt.alloc");
        a.load("r10", { base: "rsp", disp: 40 });
        a.cmp("rax", "r10");
        a.jcc("ne", "test.fail");
        blockAt(a, 40, 65536);
        blockAt(a, 40, (2 << 20) - 1);
        blockAt(a, 40, 2 << 20, false);
        blockAt(a, 40, (3 << 20) - 1, false);
        blockAt(a, 48, (3 << 20) - 1);
        a.mov("rax", 0);
        a.store({ rip: "test.roots" }, "rax");
        a.call("rt.collect");
        blockAt(a, 40, 65536, false);
        blockAt(a, 48, 65536, false);
        equal(a, "rt.blocks", 0);
    }));

for (const bytes of [64, 9 << 20])
    test(`heap snapshot excludes unswept dead ArrayBuffers with ${bytes}-byte backing stores (#601)`, () =>
        native((a) => {
            // Allocate a real backing store and its owning ArrayBuffer cell.
            a.mov("rcx", bytes);
            a.call("rt.alloc");
            a.store({ base: "rsp", disp: 40 }, "rax");
            a.mov("rcx", B.size);
            a.call("rt.alloc");
            a.mov("r10", HeapKind.object);
            a.store({ base: "rax", disp: H.kind - H.size }, "r10");
            a.mov("r10", ArrayBufferKind);
            a.store({ base: "rax" }, "r10");
            a.load("r10", { base: "rsp", disp: 40 });
            a.store({ base: "rax", disp: B.bytes }, "r10");
            a.mov("r10", bytes);
            a.store({ base: "rax", disp: B.byteLength }, "r10");
            a.store({ rip: "test.roots", addend: 8 }, "rax");
            a.mov("r10", 5);
            a.store({ rip: "test.roots" }, "r10");
            const snapshot = (expected: number) => {
                a.lea("rcx", { base: "rsp", disp: 56 });
                a.call("process.heapSnapshot.code");
                a.load("rax", { base: "rsp", disp: 72 });
                a.cmp("rax", expected);
                a.jcc("ne", "test.fail");
            };
            snapshot(bytes); // Newly allocated buffers count before any GC.
            a.call("rt.collect");
            snapshot(bytes); // Rooted buffers still count after marking.
            a.mov("rax", 0);
            a.store({ rip: "test.roots" }, "rax");
            a.call("rt.collect");
            // Large backing stores are already unmapped; the dead owner cell
            // still has its old kind and pointer until its class is swept.
            snapshot(0);
        }));
test("large linked graphs are traced without recursive collector stack growth", () => {
    const source =
        "let a=null;for(let i=0;i<40000;i++){a={next:a};}let count=0;while(a){count++;a=a.next;}console.log(count);";
    expectProgram(source, runOracle(source).stdout);
});
test("collector frees unrooted raw blocks and tolerates repeated empty collections", () =>
    native((a) => {
        a.mov("rcx", 256);
        a.call("rt.alloc");
        a.call("rt.collect");
        equal(a, "rt.blocks", 0);
        equal(a, "rt.liveBytes", 0);
        a.call("rt.collect");
        equal(a, "rt.gcCount", 2);
    }));
test("interior string roots retain the containing allocation then release it", () =>
    native((a) => {
        a.mov("rcx", 4096);
        a.call("rt.alloc");
        a.add("rax", 2400);
        a.store({ rip: "test.roots", addend: 8 }, "rax");
        a.mov("rax", 4);
        a.store({ rip: "test.roots" }, "rax");
        a.call("rt.collect");
        a.load("rax", { rip: "rt.blocks" });
        a.test("rax", "rax");
        a.jcc("e", "test.fail");
        a.mov("rax", 0);
        a.store({ rip: "test.roots" }, "rax");
        a.call("rt.collect");
        equal(a, "rt.liveBytes", 0);
    }));
test("numeric bits that resemble heap pointers are not roots", () =>
    native((a) => {
        a.mov("rcx", 64);
        a.call("rt.alloc");
        a.store({ rip: "test.roots", addend: 8 }, "rax");
        a.mov("rax", 3);
        a.store({ rip: "test.roots" }, "rax");
        a.call("rt.collect");
        equal(a, "rt.blocks", 0);
    }));
test("rooted object-property cycle survives and unrooted cycle is reclaimed", () =>
    native((a) => {
        a.lea("rcx", { rip: "test.roots" });
        a.mov("rdx", 0);
        a.mov("r8", 0);
        a.call("rt.newObject");
        // Static string key Value on the stack, self-referential property.
        a.mov("rax", 4);
        a.store({ base: "rsp", disp: 48 }, "rax");
        a.lea("rax", { rip: "rt.str.length" });
        a.store({ base: "rsp", disp: 56 }, "rax");
        a.lea("rcx", { rip: "test.roots" });
        a.lea("rdx", { base: "rsp", disp: 48 });
        a.lea("r8", { rip: "test.roots" });
        a.mov("r9", 1);
        a.call("rt.setProperty");
        a.call("rt.collect");
        a.lea("rcx", { rip: "test.roots", addend: 16 });
        a.lea("rdx", { rip: "test.roots" });
        a.lea("r8", { base: "rsp", disp: 48 });
        a.call("rt.getProperty");
        a.load("rax", { rip: "test.roots", addend: 8 });
        a.load("r10", { rip: "test.roots", addend: 24 });
        a.cmp("rax", "r10");
        a.jcc("ne", "test.fail");
        a.mov("rax", 0);
        a.store({ rip: "test.roots" }, "rax");
        a.store({ rip: "test.roots", addend: 16 }, "rax");
        a.call("rt.collect");
        equal(a, "rt.blocks", 0);
    }));

test("static prototypes retain dynamic properties after all Value roots disappear", () =>
    native((a) => {
        a.lea("rcx", { rip: "test.roots" });
        a.mov("rdx", 0);
        a.mov("r8", 0);
        a.call("rt.newObject");
        a.mov("rax", 5);
        a.store({ rip: "test.roots", addend: 16 }, "rax");
        a.lea("rax", { rip: "rt.objectPrototype" });
        a.store({ rip: "test.roots", addend: 24 }, "rax");
        a.mov("rax", 4);
        a.store({ base: "rsp", disp: 48 }, "rax");
        a.lea("rax", { rip: "rt.str.length" });
        a.store({ base: "rsp", disp: 56 }, "rax");
        a.lea("rcx", { rip: "test.roots", addend: 16 });
        a.lea("rdx", { base: "rsp", disp: 48 });
        a.lea("r8", { rip: "test.roots" });
        a.mov("r9", 1);
        a.call("rt.setProperty");
        a.mov("rax", 0);
        a.store({ rip: "test.roots" }, "rax");
        a.call("rt.collect");
        a.load("rax", { rip: "rt.blocks" });
        a.test("rax", "rax");
        a.jcc("e", "test.fail");
        a.lea("rcx", { rip: "test.roots" });
        a.lea("rdx", { rip: "test.roots", addend: 16 });
        a.lea("r8", { base: "rsp", disp: 48 });
        a.call("rt.deleteProperty");
        a.call("rt.collect");
        equal(a, "rt.blocks", 0);
    }));

for (const source of [
    'function build(n){let a={x:""+n};if(n){a.next=build(n-1);}return a;}let a=build(20);let sum=0;while(a){sum+=+a.x;a=a.next;}console.log(sum);',
    'let a=[1,,3];let k=[1];for(let i=0;i<20;i++){a[k]=(k[0]=2);a[0]={value:""+i};}console.log(a.length,a[0].value,a[2],1 in a);',
    'function f(n){let o={text:""+n};let a=[o,o];return a;}let sum=0;for(let i=0;i<100;i++){let a=f(i);sum+=+a[0].text;console.log(a[0]===a[1] && i===99 ? sum : 0);}',
])
    test(`compiler roots survive collection at every operation: ${source}`, () => {
        const module = lower(bind(parse(lex(source))));
        const program = generate(module, { gcStress: true });
        const run = runNative(linkHost(program));
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr.toString());
        assert.equal(run.stdout.toString(), runOracle(source).stdout);
    });

for (const [name, source, requireCollection] of [
    [
        "allocation pressure",
        'function work(){let total=0;for(let i=0;i<40000;i++){let o={text:""+i};o.self=o;let a=[o,o];total+=+a[0].text;}return total;}console.log(work());',
        true,
    ],
    [
        "expired top-level blocks",
        '{let a={x:1};}for(let a={x:2};false;){}outer:{const a={x:3};break outer;}console.log("released");',
        false,
    ],
] as const)
    test(`exited scopes retain no heap roots: ${name}`, () => {
        const program = generate(lower(bind(parse(lex(source)))));
        // Observe native counters after js.main, before the ordinary shutdown path.
        // This test-only wrapper does not add a JavaScript-visible GC builtin.
        const a = createAssembler("test.afterMain");
        a.sub("rsp", 40);
        const prologSize = a.offset;
        if (requireCollection) {
            a.load("rax", { rip: "rt.gcCount" });
            a.test("rax", "rax");
            a.jcc("e", "test.afterMain.fail");
        }
        a.load("rax", { rip: "rt.gcRoots" });
        a.test("rax", "rax");
        a.jcc("ne", "test.afterMain.fail");
        // The pressure program now legitimately retains its declared function in the
        // global environment. Tear down that environment, not the expired-scope test's
        // roots: the latter must still catch accidentally persistent block bindings.
        if (requireCollection) {
            a.mov("rax", 0);
            a.store({ rip: "rt.gcGlobalCount" }, "rax");
        }
        a.call("rt.collect");
        a.load("rax", { rip: "rt.liveBytes" });
        a.test("rax", "rax");
        a.jcc("ne", "test.afterMain.fail");
        a.call("rt.dispose");
        a.add("rsp", 40);
        a.ret();
        a.label("test.afterMain.fail");
        a.mov("rcx", 42);
        a.callImport("ExitProcess");
        a.label("test.afterMain.end");
        const entry = program.fragments.find(
            (fragment) => fragment.name === "entry",
        )!;
        const dispose = entry.fixups.find(
            (fixup) => fixup.target === "rt.dispose",
        )!;
        dispose.target = "test.afterMain";
        program.fragments.push({
            ...a.finish(),
            name: "test.afterMain",
            section: ".text",
        });
        program.functions.push({
            begin: "test.afterMain",
            end: "test.afterMain.end",
            prologSize,
            stackAllocation: 40,
            savedRegisters: [],
        });
        const run = runNative(linkHost(program));
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr.toString());
        assert.equal(run.stdout.toString(), runOracle(source).stdout);
    });
