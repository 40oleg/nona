import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { compile, compileModuleToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { withNativeTarget } from "../src/backend/machine/context.js";
import { supportedNativeTargets, type Target } from "../src/target.js";
import { isFfiLibraryImport, parseFfiSignature } from "../src/ffi.js";
import { RuntimeBuilder, slot, failIf } from "../src/runtime/abi.js";
import { guiSystemCall } from "../src/runtime/gui-abi.js";
import { prependFunctionBuiltin } from "../src/runtime/function-builtin.js";
import { replaceImport } from "./helpers/native.js";
import {
    canRunGuiProbe,
    guiProbe,
    guiWrapper,
    probeProgram,
    runGuiProbe,
} from "./helpers/gui-native.js";
import type { Reg, Xmm } from "../src/backend/machine/context.js";
import { runNative } from "./helpers/native.js";

const wrapper = readFileSync("src/lib/modules/gui.js", "utf8");
const source = `import {Window} from 'nona:gui';
const w = new Window({title:'Nona bridge',width:320,height:240});
w.open(); w.resize(400,300); w.show(); w.dispose();`;

// This double tests only the JS wrapper. Native ownership and GTK dispatch
// have separate executable tests below; a fake display establishes neither.
function managed() {
    let poller: any,
        failure = 0,
        next = 0;
    const live = new Map<number, number>();
    const generations: number[] = [];
    const events: number[][] = [];
    const calls: number[][] = [];
    const context: any = {
        TextEncoder,
        performance: {
            now() {
                return 100;
            },
        },
        __nonaGui(buffer: Uint32Array) {
            calls.push(Array.from(buffer));
            if (failure) {
                const result = failure;
                failure = 0;
                return result;
            }
            if (buffer[0] === 1) {
                while (live.has(next)) next++;
                buffer[1] = next;
                buffer[2] = generations[next] = (generations[next] || 0) + 1;
                live.set(next, buffer[2]!);
                next = 0;
            } else if (buffer[0] === 2) {
                assert.equal(live.get(buffer[1]!), buffer[2]);
                live.delete(buffer[1]!);
            } else if (buffer[0] === 3) {
                const event = events.shift();
                if (!event) return 0;
                const [
                    slot,
                    generation,
                    code,
                    width = 640,
                    height = 480,
                    scale = 2,
                ] = event;
                buffer[1] = slot!;
                buffer[2] = generation!;
                buffer[6] = code!;
                buffer[7] = width;
                buffer[8] = height;
                buffer[9] = scale;
                if (code === 1 && live.get(slot!) === generation)
                    live.delete(slot!);
                return 1;
            }
            return 0;
        },
        __nonaIoLoop(value: unknown) {
            assert.equal(poller, undefined);
            poller = value;
        },
    };
    runInNewContext(
        wrapper.replace(
            "export class Window",
            "globalThis.Window = class Window",
        ),
        context,
    );
    return {
        Window: context.Window,
        get poller() {
            return poller;
        },
        fail(code: number) {
            failure = code;
        },
        events,
        calls,
        context,
    };
}

test("GUI validates options before creating native resources and retries failed creation", () => {
    const m = managed();
    for (const options of [
        null,
        1,
        { width: 0 },
        { height: 16385 },
        { width: 1.5 },
        { width: NaN },
        { height: Infinity },
        { title: 1 },
        { title: "a\0b" },
        { title: "é".repeat(256) },
        { onEvent: true },
    ])
        assert.throws(() => new m.Window(options));
    assert.equal(m.calls.length, 0);
    assert.equal(m.context.__nonaGui, undefined);
    const w = new m.Window({
        title: "é".repeat(255) + "x",
        width: 1,
        height: 16384,
    });
    assert.throws(() => w.show(), /not open/);
    m.fail(-4);
    assert.throws(() => w.open(), /-4/);
    assert.equal(w.isOpen, false);
    assert.equal(m.poller.active(), 0);
    assert.equal(w.open(), w);
    assert.equal(m.poller.active(), 1);
    assert.throws(() => w.open(), /already open/);
    const before = m.calls.length;
    assert.throws(() => w.resize(12, 0), /size/);
    assert.equal(m.calls.length, before);
    m.fail(-3);
    assert.throws(() => w.resize(12, 13), /-3/);
    w.close();
    w.open();
    assert.equal(
        m.calls.at(-1)![3],
        1,
        "failed resize must not update saved size",
    );
    assert.equal(m.calls.at(-1)![4], 16384);
    w.dispose();
    w.dispose();
    assert.throws(() => w.open(), /disposed/);
    assert.throws(() => w.resize(10, 10), /disposed/);
    assert.equal(m.poller.total(), 0);
});

test("GUI keeps independent windows and invalidates stale and taken notifications", () => {
    const m = managed(),
        seen: string[] = [];
    const first = new m.Window({
        onEvent(e: any) {
            assert.equal(this, first);
            seen.push(e.type);
        },
    });
    const second = new m.Window({
        onEvent(e: any) {
            seen.push("second:" + e.type);
        },
    });
    first.open();
    second.open();
    assert.equal(m.poller.active(), 2);
    m.events.push([0, 1, 2, 800, 600]);
    assert.equal(m.poller.poll(0), 1);
    first.dispose();
    m.poller.run();
    assert.deepEqual(seen, []);
    m.events.push([0, 1, 3], [1, 1, 2, 900, 700], [1, 1, 3]);
    assert.equal(m.poller.poll(0), 0);
    assert.equal(m.poller.poll(0), 1);
    m.poller.run();
    assert.equal(m.poller.poll(0), 1);
    m.poller.run();
    assert.deepEqual(seen, ["second:resize", "second:scale"]);
    second.close();
    second.open();
    m.events.push([1, 1, 1]);
    assert.equal(m.poller.poll(0), 0);
    assert.equal(second.isOpen, true);
    second.dispose();
    assert.equal(m.poller.active(), 0);
});

test("GUI detaches terminal sessions before handlers, reopen and listener exceptions", () => {
    const m = managed();
    let handled = 0;
    const w = new m.Window({
        onEvent(e: any) {
            assert.equal(e.type, "close");
            assert.equal(this, w);
            assert.equal(w.isOpen, false);
            assert.equal(m.poller.active(), 0);
            handled++;
            w.open();
            throw new Error("listener failure");
        },
    });
    w.open();
    m.events.push([0, 1, 1]);
    m.poller.poll(0);
    assert.throws(() => m.poller.run(), /listener failure/);
    m.poller.run();
    assert.equal(handled, 1);
    assert.equal(w.isOpen, true);
    m.events.push([0, 2, 1]);
    m.poller.poll(0);
    const before = m.calls.length;
    w.close();
    w.open();
    m.poller.run();
    assert.equal(
        m.calls.length,
        before + 1,
        "taken close must not destroy an already released slot",
    );
    assert.equal(handled, 1);
    w.dispose();
});

test("GUI poll clamps waits to the outer timer budget and does no work after last disposal", () => {
    const m = managed(),
        w = new m.Window();
    w.open();
    for (const [timeout, want] of [
        [-1, 10],
        [100, 10],
        [3, 3],
        [0, 0],
    ]) {
        assert.equal(m.poller.poll(timeout), 0);
        assert.equal(m.calls.at(-1)![5], want);
    }
    w.dispose();
    const before = m.calls.length;
    assert.equal(m.poller.poll(100), 0);
    m.poller.run();
    assert.equal(m.calls.length, before);
});

test("GUI poll recomputes the absolute timer deadline after earlier pollers consumed time", () => {
    const m = managed(),
        w = new m.Window();
    w.open();
    for (const [timeout, deadline, want] of [
        [100, 103, 3],
        [100, 99, 0],
        [-1, 102, 2],
        [5, Infinity, 5],
    ]) {
        m.poller.poll(timeout, deadline);
        assert.equal(m.calls.at(-1)![5], want);
    }
    w.dispose();
});

test("GUI import rejects unsupported targets and worker programs without adding public FFI callbacks", () => {
    for (const target of supportedNativeTargets.filter(
        (t) => t !== "linux-x64",
    )) {
        const result = compile(source, { fileName: "gui.mjs", target });
        assert.equal(result.ok, false, target);
        if (!result.ok)
            assert.match(
                JSON.stringify(result.diagnostics),
                /Ubuntu Linux x64/,
            );
    }
    const worker = compile("console.log('main');", {
        fileName: "main.js",
        target: "linux-x64",
        agents: ["__nonaGui(undefined);"],
    });
    assert.equal(worker.ok, false);
    if (!worker.ok)
        assert.match(
            JSON.stringify(worker.diagnostics),
            /main Linux x64 JavaScript thread/,
        );
    assert.throws(() => parseFfiSignature("void(cb)"), /reserved/);
});

test("GUI imports are opt-in across every supported native target", () => {
    for (const target of supportedNativeTargets) {
        const program = withNativeTarget(target, () => {
            const { result, usage } = collect(
                'console.log("portable");',
                target,
            );
            return generate(result, { link: usage });
        });
        assert.ok(
            !program.imports.some((i) =>
                /gui\.|gtk|gobject|glib/i.test(i.symbol + i.dll),
            ),
            target,
        );
        assert.ok(
            !program.fragments.some((f) => f.name.startsWith("gui.")),
            target,
        );
        const result = compile('console.log("portable");', {
            fileName: "portable.js",
            target,
        });
        assert.ok(result.ok, target);
        if (target.startsWith("linux-"))
            assert.deepEqual(elfNeeded(result.image), [], target);
    }
    const program = withNativeTarget("linux-x64", () => {
        const { result, usage } = collect(source);
        return generate(result, { link: usage });
    });
    assert.deepEqual(
        [
            ...new Set(
                program.imports.filter(isFfiLibraryImport).map((i) => i.dll),
            ),
        ].sort(),
        ["libglib-2.0.so.0", "libgobject-2.0.so.0", "libgtk-4.so.1"],
    );
    const result = compile(source, {
        fileName: "gui.mjs",
        target: "linux-x64",
    });
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepEqual(elfNeeded(result.image).sort(), [
        "libglib-2.0.so.0",
        "libgobject-2.0.so.0",
        "libgtk-4.so.1",
    ]);
});

function elfNeeded(image: Uint8Array): string[] {
    const v = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const headers = Array.from({ length: v.getUint16(56, true) }, (_, i) => {
        const at = Number(v.getBigUint64(32, true)) + i * v.getUint16(54, true);
        return {
            type: v.getUint32(at, true),
            offset: Number(v.getBigUint64(at + 8, true)),
            address: Number(v.getBigUint64(at + 16, true)),
            size: Number(v.getBigUint64(at + 32, true)),
        };
    });
    const dynamic = headers.find((h) => h.type === 2);
    if (!dynamic) return [];
    const needed: number[] = [];
    let strings = 0;
    for (
        let at = dynamic.offset;
        at < dynamic.offset + dynamic.size;
        at += 16
    ) {
        const tag = Number(v.getBigUint64(at, true)),
            value = Number(v.getBigUint64(at + 8, true));
        if (tag === 0) break;
        if (tag === 1) needed.push(value);
        if (tag === 5) strings = value;
    }
    const segment = headers.find(
        (h) =>
            h.type === 1 &&
            strings >= h.address &&
            strings < h.address + h.size,
    );
    assert.ok(segment);
    return needed.map((offset) => {
        const at = segment.offset + strings - segment.address + offset;
        return new TextDecoder().decode(
            image.subarray(at, image.indexOf(0, at)),
        );
    });
}

function collect(text: string, target: Target = "linux-x64") {
    return collectSourceUsage(() =>
        compileModuleToIR(text, resolve("gui-test.mjs"), undefined, "", target),
    );
}
import { collectSourceUsage } from "../src/frontend/lexer.js";

function expectProbe(
    text: string,
    expected: string,
    gcStress: boolean,
    options = {},
) {
    const run = runGuiProbe(guiProbe(text, gcStress, options));
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.replaceAll("\r", ""), expected);
}

const raw = `const raw = globalThis.guiNative;
const cmd = new Uint32Array(160);
function send(op) { cmd[0]=op; return raw(cmd); }
function open() { cmd[3]=320; cmd[4]=240; return send(1); }
function stats(...indices) { console.log(...indices.map(i => globalThis.guiStat(i))); }
`;

for (const gcStress of [false, true]) {
    test(
        `GUI native buffer validation, offset borrowing and command validation (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${raw}
let rejected=0;
const detached=new ArrayBuffer(640); const detachedView=new Uint32Array(detached); detached.transfer();
const rab=new ArrayBuffer(640,{maxByteLength:1280});
for(const bad of [undefined,null,{},[],new Uint8Array(640),new Int32Array(160),new Float64Array(160),
    new DataView(new ArrayBuffer(640)),new Uint32Array(159),new Uint32Array(new SharedArrayBuffer(640)),
    new Uint32Array(rab),detachedView]) {
    try {raw(bad);} catch(e) {if(e instanceof TypeError) rejected++;}
}
try {raw();} catch(e) {if(e instanceof TypeError) rejected++;}
console.log('rejected',rejected);
console.log('empty',send(3));
cmd[3]=0; cmd[4]=240; console.log('size',send(1));
cmd[3]=320; cmd[4]=16385; console.log('size',send(1));
cmd[4]=240; new Uint8Array(cmd.buffer)[575]=1; console.log('title',send(1));
stats(6,0);
new Uint8Array(cmd.buffer)[575]=0;
const backing=new Uint32Array(180), view=backing.subarray(10,170);
view[0]=1;view[3]=320;view[4]=240;
console.log('offset',raw(view),view[1],view[2],backing[0]);
view[0]=2; console.log('destroy',raw(view));
cmd[1]=32; console.log('slot',send(2));
cmd[1]=0;cmd[2]=1;console.log('stale',send(2));
stats(0,1,2);
`,
                "rejected 13\nempty 0\nsize -3\nsize -3\ntitle -3\n0 0\noffset 0 0 1 0\ndestroy 0\nslot -3\nstale -3\n1 1 1\n",
                gcStress,
            );
        },
    );
    for (const failure of ["failNew", "failConnect"] as const)
        test(
            `GUI native partial ${failure} cleanup permits a fresh generation (GC stress ${gcStress})`,
            { skip: !canRunGuiProbe },
            () => {
                expectProbe(
                    `${raw}
console.log('failed',open()); stats(0,1,2,7);
console.log('retry',open(),cmd[1],cmd[2]);
console.log('close',send(2)); stats(0,1,2,7);
`,
                    failure === "failNew"
                        ? "failed -4\n1 0 0 0\nretry 0 0 2\nclose 0\n2 1 1 1\n"
                        : "failed -4\n1 1 0 1\nretry 0 0 2\nclose 0\n2 2 1 2\n",
                    gcStress,
                    { [failure]: true },
                );
            },
        );
    test(
        `GUI native initialization failure is cached and wrong threads touch no GTK (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${raw} console.log(open(),open()); stats(6,0);`,
                "-1 -1\n1 0\n",
                gcStress,
                { initFails: true },
            );
            expectProbe(
                `${raw} console.log(open(),send(3)); stats(6,0,3);`,
                "-5 -5\n0 0 0\n",
                gcStress,
                { wrongThread: true },
            );
        },
    );
    test(
        `GUI native generations retire instead of wrapping (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${raw} console.log(open(),cmd[1],cmd[2]); console.log(send(2),open()); stats(0,1);`,
                "0 0 2147483647\n0 -2\n1 1\n",
                gcStress,
                { exhausted: true },
            );
        },
    );
    test(
        `GUI native capacity failure leaves existing sessions usable (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${raw}
for(let i=0;i<32;i++) {if(open()!==0 || cmd[1]!==i || cmd[2]!==1) throw new Error('slot ownership');}
console.log('full',open());
for(let i=0;i<32;i++) {cmd[1]=i;cmd[2]=1;if(send(2)!==0) throw new Error('destroy after capacity');}
stats(0,1,2);console.log('reuse',open(),cmd[1],cmd[2]);send(2);
`,
                "full -2\n32 32 32\nreuse 0 0 2\n",
                gcStress,
            );
        },
    );
    test(
        `GUI native round-robin and stale commands (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${raw}
open(); open();
for(let i=0;i<4;i++) console.log('event',send(3),cmd[1],cmd[2],cmd[6],cmd[7],cmd[8],cmd[9]);
console.log('terminal',send(3),cmd[1],cmd[6]);
console.log('stale',send(2));
console.log('reopen',open(),cmd[1],cmd[2]);send(2);
cmd[1]=1;cmd[2]=1;send(2);stats(0,1,2);
`,
                "event 1 0 1 2 640 480 2\nevent 1 1 1 2 640 480 2\nevent 1 0 1 3 640 480 2\nevent 1 1 1 3 640 480 2\nterminal 1 0 1\nstale -3\nreopen 0 0 2\n3 3 3\n",
                gcStress,
                { closeOnIteration: 5 },
            );
        },
    );
    test(
        `GUI native close dominates pending scale and sampling coalesces dispatch observations (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${raw}
open();console.log('resize',send(3),cmd[6]);
console.log('close',send(3),cmd[6]);console.log('empty',send(3));stats(1,2);
`,
                "resize 1 2\nclose 1 1\nempty 0\n1 1\n",
                gcStress,
                { closeOnIteration: 2 },
            );
            expectProbe(
                `${raw}
open();
for(let i=0;i<2;i++) console.log(send(3),cmd[6],cmd[7],cmd[8],cmd[9]);
send(2);
`,
                "1 2 648 480 2\n1 2 656 480 2\n",
                gcStress,
                { busy: true, widthFromIterations: true },
            );
        },
    );
    test(
        `GUI native polling normalizes narrow returns and subtracts dispatch from timer deadline (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            for (const [timeout, delay, busy, want] of [
                [3, 0, false, 3000],
                [3, 1000, false, 2000],
                [3, 1000, true, 0],
                [100, 0, false, 10000],
                [0, 0, false, 0],
            ] as const)
                expectProbe(
                    `${raw}open();send(3);send(3);cmd[5]=${timeout};console.log(send(3));stats(4,3);send(2);`,
                    `0\n${want} ${busy ? 24 : 3}\n`,
                    gcStress,
                    { dispatchMicros: delay, busy },
                );
            expectProbe(
                `${raw}open();console.log(send(3),cmd[6],cmd[9]);console.log(send(3));send(2);`,
                "1 3 2\n0\n",
                gcStress,
                { width: -1 },
            );
        },
    );
    test(
        `GUI native wrapper roots listeners, checkpoints Promises after exceptions and exits after disposal (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${guiWrapper}
process.on('uncaughtException',e => {if(e.message!=='expected') process.exit(92);console.log('caught');});
let ticks=0,other=0,watching=true;
globalThis.__nonaIoLoop({active(){return watching?1:0;},total(){return watching?1:0;},poll(){return 1;},run(){other++;}});
const iv=setInterval(()=>{ticks++;},1);
const w=new Window({onEvent(e){
    if(e.type!=='close') return;
    console.log('close',this===w,w.isOpen);
    w.open();w.close();w.open();w.dispose();
    clearInterval(iv);watching=false;
    Promise.resolve().then(()=>console.log('microtask'));
    setTimeout(()=>console.log('timer',!w.isOpen,other>0,ticks>0),1);
    throw new Error('expected');
}});
w.open();
`,
                "close true false\ncaught\nmicrotask\ntimer true true true\n",
                gcStress,
                { closeOnIteration: 5, iterationWait: 1 },
            );
        },
    );
    test(
        `GUI alone references the event loop and runs its last Promise (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            expectProbe(
                `${guiWrapper}
new Window({onEvent(e){if(e.type==='close'){
    console.log('close',this.isOpen);Promise.resolve().then(()=>console.log('last job'));
}}}).open();
`,
                "close false\nlast job\n",
                gcStress,
                { closeOnIteration: 1 },
            );
        },
    );
    test(
        `GUI unhandled listener exception fails normally after detaching the window (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const run = runGuiProbe(
                guiProbe(
                    `${guiWrapper}
new Window({onEvent(e){if(e.type==='close') {
    console.log('close',this.isOpen);throw new Error('unhandled GUI listener');
}}}).open();
`,
                    gcStress,
                    { closeOnIteration: 1 },
                ),
            );
            assert.equal(run.error, undefined);
            assert.notEqual(run.status, 0);
            assert.equal(run.stdout.replaceAll("\r", ""), "close false\n");
            assert.match(run.stderr, /unhandled GUI listener/);
        },
    );
}

test(
    "GUI ABI preserves all Win64 nonvolatile registers and forwards six SysV arguments with aligned stacks",
    { skip: !canRunGuiProbe },
    () => {
        const program = probeProgram("console.log(globalThis.guiAbi());", true),
            b = new RuntimeBuilder();
        b.bundle = program;
        prependFunctionBuiltin(
            b,
            "gui.test.abi",
            "guiAbi",
            0,
            "rt.globalObject",
        );
        guiSystemCall(b, "test-only", "six");
        replaceImport(program, "gui.import.six", "gui.test.six");
        const gp: Reg[] = [
            "rbx",
            "rbp",
            "rdi",
            "rsi",
            "r12",
            "r13",
            "r14",
            "r15",
        ];
        const xmms = Array.from(
            { length: 10 },
            (_, i) => ("xmm" + (i + 6)) as Xmm,
        );
        for (let i = 0; i < 10; i++) {
            const bytes = new Uint8Array(16),
                v = new DataView(bytes.buffer);
            v.setBigUint64(0, 0x1122334455667700n + BigInt(i), true);
            v.setBigUint64(8, 0x8877665544332200n + BigInt(i), true);
            b.data("gui.test.vector" + i, bytes);
        }
        b.fn("gui.test.abi.code", 328, (a) => {
            a.store(slot(48), "rcx");
            gp.forEach((r, i) => {
                a.store(slot(56 + i * 8), r);
                a.mov(r, 0x123400 + i);
            });
            xmms.forEach((r, i) => {
                a.storeXmm128(slot(128 + i * 16), r);
                a.loadXmm128(r, { rip: "gui.test.vector" + i });
            });
            for (const [i, r] of (
                ["rcx", "rdx", "r8", "r9"] as const
            ).entries())
                a.mov(r, i + 1);
            a.mov("rax", 5);
            a.store(slot(32), "rax");
            a.mov("rax", 6);
            a.store(slot(40), "rax");
            a.call("gui.abi.six");
            a.cmp("rax", 0x2345);
            failIf(a, "ne");
            gp.forEach((r, i) => {
                a.cmp(r, 0x123400 + i);
                failIf(a, "ne");
            });
            xmms.forEach((r, i) => {
                a.storeXmm128(slot(296), r);
                for (const [offset, bits] of [
                    [0, 0x1122334455667700n],
                    [8, 0x8877665544332200n],
                ] as const) {
                    a.load("rax", slot(296 + offset));
                    a.mov("r10", bits + BigInt(i));
                    a.cmp("rax", "r10");
                    failIf(a, "ne");
                }
            });
            gp.forEach((r, i) => a.load(r, slot(56 + i * 8)));
            xmms.forEach((r, i) => a.loadXmm128(r, slot(128 + i * 16)));
            a.load("rcx", slot(48));
            a.mov("rax", 2);
            a.store({ base: "rcx" }, "rax");
            a.mov("rax", 1);
            a.store({ base: "rcx", disp: 8 }, "rax");
        });
        b.fn("gui.test.six", 40, (a) => {
            // fn has already subtracted 40: its outgoing call boundary is aligned.
            a.mov("rax", "rsp");
            a.and("rax", 15);
            a.cmp("rax", 0);
            failIf(a, "ne");
            for (const [i, r] of (
                ["rdi", "rsi", "rdx", "rcx", "r8", "r9"] as const
            ).entries()) {
                a.cmp(r, i + 1);
                failIf(a, "ne");
            }
            a.mov("rdi", 0);
            a.mov("rsi", 0);
            xmms.forEach((r) => a.vectorZero(r));
            a.mov("rax", 0x2345);
        });
        const run = runGuiProbe(program);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout.replaceAll("\r", ""), "true\n");
    },
);

test(
    "GUI SysV close callback preserves its caller registers and ignores a stale native window",
    { skip: !canRunGuiProbe },
    () => {
        const program = guiProbe(
                "console.log(globalThis.guiCallbackAbi());",
                true,
            ),
            b = new RuntimeBuilder();
        b.bundle = program;
        prependFunctionBuiltin(
            b,
            "gui.test.callback",
            "guiCallbackAbi",
            0,
            "rt.globalObject",
        );
        const bytes = new Uint8Array(64);
        new DataView(bytes.buffer).setBigUint64(0, 123n, true);
        b.data("gui.test.record", bytes, ".data");
        const gp: Reg[] = ["rbx", "rbp", "r12", "r13", "r14", "r15"];
        b.fn("gui.test.callback.code", 136, (a) => {
            a.store(slot(48), "rcx");
            a.store(slot(104), "rdi");
            a.store(slot(112), "rsi");
            gp.forEach((r, i) => {
                a.store(slot(56 + i * 8), r);
                a.mov(r, 0x345600 + i);
            });
            a.mov("rdi", 123);
            a.lea("rsi", { rip: "gui.test.record" });
            a.call("gui.closeCallback");
            a.cmp("rax", 1);
            failIf(a, "ne");
            a.load("rax", { rip: "gui.test.record", addend: 24 });
            a.cmp("rax", 1);
            failIf(a, "ne");
            a.mov("rax", 0);
            a.store({ rip: "gui.test.record", addend: 24 }, "rax");
            a.mov("rdi", 124);
            a.lea("rsi", { rip: "gui.test.record" });
            a.call("gui.closeCallback");
            a.cmp("rax", 1);
            failIf(a, "ne");
            a.load("rax", { rip: "gui.test.record", addend: 24 });
            a.cmp("rax", 0);
            failIf(a, "ne");
            gp.forEach((r, i) => {
                a.cmp(r, 0x345600 + i);
                failIf(a, "ne");
                a.load(r, slot(56 + i * 8));
            });
            a.load("rdi", slot(104));
            a.load("rsi", slot(112));
            a.load("rcx", slot(48));
            a.mov("rax", 2);
            a.store({ base: "rcx" }, "rax");
            a.mov("rax", 1);
            a.store({ base: "rcx", disp: 8 }, "rax");
        });
        const run = runGuiProbe(program);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout.replaceAll("\r", ""), "true\n");
    },
);

for (const gcStress of [false, true]) {
    test(`GUI bounded real-window fixture cross-compiles to Linux ELF (GC stress ${gcStress})`, () => {
        const fileName = resolve("tests/fixtures/gui-window.mjs");
        const result = compile(readFileSync(fileName, "utf8"), {
            fileName,
            target: "linux-x64",
            gcStress,
        });
        assert.ok(result.ok, JSON.stringify(result));
        assert.ok(elfNeeded(result.image).includes("libgtk-4.so.1"));
    });
    test(
        `GUI real GTK live window, timers, stdout, close/reopen and disposal (GC stress ${gcStress})`,
        {
            skip:
                process.platform !== "linux" ||
                process.arch !== "x64" ||
                process.env.NONA_GTK_GUI_TESTS !== "1",
        },
        () => {
            const fileName = resolve("tests/fixtures/gui-window.mjs");
            const result = compile(readFileSync(fileName, "utf8"), {
                fileName,
                target: "linux-x64",
                gcStress,
            });
            assert.ok(result.ok, JSON.stringify(result));
            const run = runNative(result.image, 15_000);
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr.toString());
            assert.equal(
                run.stdout.toString(),
                "initial job\nnative close\ncaught listener\nclose job\ndisposed\nstdout ended\nprogress true true true true true true true\nnormal exit\n",
            );
        },
    );
    test(
        `GUI real GTK headless open reports a cached error; console startup remains independent (GC stress ${gcStress})`,
        {
            skip:
                process.platform !== "linux" ||
                process.arch !== "x64" ||
                process.env.NONA_GTK_GUI_TESTS !== "1",
        },
        () => {
            const result = compile(
                `import {Window} from 'nona:gui';
const w=new Window();
for(let i=0;i<2;i++) {try {w.open();} catch(e) {console.log(e.message.includes('no usable display'),w.isOpen);}}
`,
                { fileName: "headless.mjs", target: "linux-x64", gcStress },
            );
            assert.ok(result.ok, JSON.stringify(result));
            const env = {
                ...process.env,
                DISPLAY: "",
                WAYLAND_DISPLAY: "",
                GDK_BACKEND: "x11",
            };
            const run = runNative(result.image, 15_000, false, env);
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr.toString());
            assert.equal(run.stdout.toString(), "true false\ntrue false\n");
            const consoleImage = compile("console.log('headless console');", {
                fileName: "console.js",
                target: "linux-x64",
                gcStress,
            });
            assert.ok(consoleImage.ok, JSON.stringify(consoleImage));
            const consoleRun = runNative(
                consoleImage.image,
                15_000,
                false,
                env,
            );
            assert.equal(consoleRun.error, undefined);
            assert.equal(consoleRun.status, 0, consoleRun.stderr.toString());
            assert.equal(consoleRun.stdout.toString(), "headless console\n");
        },
    );
}
