import assert from "node:assert/strict";
import {
    readFileSync,
    mkdirSync,
    mkdtempSync,
    writeFileSync,
    chmodSync,
    rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { compileModuleToIR } from "../../src/compiler.js";
import { generate } from "../../src/backend/x64/codegen.js";
import {
    withNativeTarget,
    type Assembler,
} from "../../src/backend/machine/context.js";
import { collectSourceUsage } from "../../src/frontend/lexer.js";
import { RuntimeBuilder, slot, failIf } from "../../src/runtime/abi.js";
import { prependFunctionBuiltin } from "../../src/runtime/function-builtin.js";
import {
    guiHelpers,
    GuiRecord as R,
    guiSlots,
} from "../../src/runtime/gui-bridge.js";
import { replaceImport } from "./native.js";
import { hostTarget, linkHost } from "./program.js";
import type { NativeProgram } from "../../src/backend/machine/model.js";

export const canRunGuiProbe =
    (process.platform === "win32" || process.platform === "linux") &&
    process.arch === "x64";
export const guiWrapper = readFileSync("src/lib/modules/gui.js", "utf8")
    .replace(
        "const native = __nonaGui;",
        "const native = globalThis.guiNative;",
    )
    .replace("export class Window", "class Window");

export function probeProgram(source: string, gcStress: boolean): NativeProgram {
    return withNativeTarget(hostTarget, () => {
        const { result, usage } = collectSourceUsage(() =>
            compileModuleToIR(
                source,
                resolve("gui-probe.mjs"),
                undefined,
                "",
                hostTarget,
            ),
        );
        return generate(result, { link: usage, gcStress });
    });
}

/** All executables and output stay in this checkout; no visible local windows. */
export function runGuiProbe(program: NativeProgram) {
    mkdirSync("work", { recursive: true });
    const directory = mkdtempSync(resolve("work/gui-probe-"));
    try {
        const file = join(
            directory,
            process.platform === "win32" ? "probe.exe" : "probe",
        );
        writeFileSync(file, linkHost(program));
        if (process.platform !== "win32") chmodSync(file, 0o755);
        return spawnSync(file, [], {
            timeout: 15_000,
            encoding: "utf8",
            windowsHide: true,
        });
    } finally {
        // mkdtemp's literal prefix resolves inside the current checkout.
        assert.equal(resolve(directory, ".."), resolve("work"));
        rmSync(directory, { recursive: true, force: true });
    }
}

type Options = {
    failNew?: boolean;
    failConnect?: boolean;
    initFails?: boolean;
    wrongThread?: boolean;
    exhausted?: boolean;
    width?: number;
    height?: number;
    scale?: number;
    busy?: boolean;
    dispatchMicros?: number;
    closeOnIteration?: number;
    widthFromIterations?: boolean;
    iterationWait?: number;
};
// Executable native doubles isolate Nona's machine code from GTK. Stats are
// test-only builtins, never production exports. The real GTK fixture is separate.
export function guiProbe(
    source: string,
    gcStress: boolean,
    options: Options = {},
) {
    const program = probeProgram(source, gcStress),
        b = new RuntimeBuilder();
    b.bundle = program;
    const helpers = withNativeTarget("linux-x64", () => guiHelpers().bundle);
    if (process.platform === "win32" || options.wrongThread) {
        const code = helpers.fragments.find((f) => f.name === "gui.code")!;
        for (const [i, call] of code.syscalls!.entries()) {
            // Fake only Linux thread identity on a Windows CPU probe. Never
            // execute a Linux syscall number on Windows. Linux uses real IDs.
            assert.deepEqual(
                Array.from(code.bytes.slice(call.offset, call.offset + 2)),
                [15, 5],
            );
            code.bytes.set(
                options.wrongThread && i === 1 ? [0xb0, 1] : [0x31, 0xc0],
                call.offset,
            );
        }
        code.syscalls = [];
    }
    if (options.exhausted) {
        const data = helpers.fragments.find((f) => f.name === "gui.records")!;
        const view = new DataView(data.bytes.buffer);
        for (let i = 0; i < guiSlots; i++)
            view.setBigUint64(
                i * R.size + R.generation,
                i === 0 ? 2147483646n : 2147483647n,
                true,
            );
    }
    program.fragments.push(...helpers.fragments);
    program.functions.push(...helpers.functions);
    program.imports.push(...helpers.imports);
    prependFunctionBuiltin(b, "gui", "guiNative", 1, "rt.globalObject");
    // Counts: creations, destructions, disconnects, iterations, sleep us,
    // clock us, initialization calls, signal connection attempts.
    b.data("gui.test.stats", new Uint8Array(64), ".data");
    b.data("gui.test.windows", new Uint8Array(1024), ".data");
    const stat = (index: number) => ({
        rip: "gui.test.stats",
        addend: index * 8,
    });
    const bump = (a: Assembler, index: number) => {
        a.load("rax", stat(index));
        a.add("rax", 1);
        a.store(stat(index), "rax");
    };
    prependFunctionBuiltin(b, "gui.test.stat", "guiStat", 1, "rt.globalObject");
    b.fn("gui.test.stat.code", 8, (a) => {
        a.movsd("xmm0", { base: "r8", disp: 8 });
        a.cvttsd2si("rax", "xmm0");
        a.shl("rax", 3);
        a.lea("r10", { rip: "gui.test.stats" });
        a.add("r10", "rax");
        a.load("rax", { base: "r10" });
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    });
    function stub(name: string, body: (a: Assembler) => void, frame = 8) {
        b.fn("gui.test." + name, frame, body);
        replaceImport(program, "gui.import." + name, "gui.test." + name);
    }
    stub("gtk_init_check", (a) => {
        bump(a, 6);
        a.mov(
            "rax",
            options.initFails ? 0xfeedbeef00000000n : 0xfeedbeef00000001n,
        );
    });
    stub("gtk_window_new", (a) => {
        bump(a, 0);
        const done = a.unique("new");
        if (options.failNew) {
            a.cmp("rax", 1);
            a.jcc("ne", done);
            a.mov("rax", 0);
            const end = a.unique("end");
            a.jmp(end);
            a.label(done);
            a.lea("rax", { rip: "gui.test.windows" });
            a.label(end);
        } else {
            a.shl("rax", 3);
            a.lea("r10", { rip: "gui.test.windows" });
            a.add("rax", "r10");
        }
    });
    stub("gtk_window_set_title", (a) => {
        a.mov("rax", 0);
    });
    stub("gtk_window_set_default_size", (a) => {
        a.mov("rax", 0);
    });
    stub("gtk_window_present", (a) => {
        a.mov("rax", 0);
    });
    stub(
        "g_signal_connect_data",
        (a) => {
            // These are actual SysV arguments after the production Win64 adapter.
            a.load("rax", { base: "rcx", disp: R.window });
            a.cmp("rdi", "rax");
            failIf(a, "ne");
            a.lea("rax", { rip: "gui.closeSignal" });
            a.cmp("rsi", "rax");
            failIf(a, "ne");
            a.lea("rax", { rip: "gui.closeCallback" });
            a.cmp("rdx", "rax");
            failIf(a, "ne");
            a.cmp("r8", 0);
            failIf(a, "ne");
            a.cmp("r9", 0);
            failIf(a, "ne");
            bump(a, 7);
            const done = a.unique("connected");
            if (options.failConnect) {
                a.cmp("rax", 1);
                a.jcc("ne", done);
                a.mov("rax", 0);
                const end = a.unique("end");
                a.jmp(end);
                a.label(done);
                a.mov("rax", 11);
                a.label(end);
            } else a.mov("rax", 11);
        },
        40,
    );
    stub(
        "g_signal_handler_disconnect",
        (a) => {
            a.cmp("rsi", 11);
            failIf(a, "ne");
            bump(a, 2);
        },
        40,
    );
    stub(
        "gtk_window_destroy",
        (a) => {
            // Invalidation precedes GTK destruction, including nested signals.
            a.lea("rsi", { rip: "gui.records" });
            a.mov("r10", guiSlots);
            const loop = a.unique("invalidated");
            a.label(loop);
            a.load("rax", { base: "rsi", disp: R.window });
            a.cmp("rax", "rdi");
            failIf(a, "e");
            a.add("rsi", R.size);
            a.sub("r10", 1);
            a.jcc("ne", loop);
            bump(a, 1);
            // A synchronously arriving old signal must not revive slot zero.
            a.lea("rsi", { rip: "gui.records" });
            a.call("gui.closeCallback");
            a.load("rax", { rip: "gui.records", addend: R.close });
            a.cmp("rax", 0);
            failIf(a, "ne");
        },
        40,
    );
    for (const [name, value] of [
        ["gtk_widget_get_width", options.width ?? 640],
        ["gtk_widget_get_height", options.height ?? 480],
        ["gtk_widget_get_scale_factor", options.scale ?? 2],
    ] as const)
        stub(name, (a) => {
            if (
                name === "gtk_widget_get_width" &&
                options.widthFromIterations
            ) {
                a.load("rax", stat(3));
                a.add("rax", value);
                a.mov("r10", 0xfeedbeef00000000n);
                a.or("rax", "r10");
            } else a.mov("rax", 0xfeedbeef00000000n | BigInt(value >>> 0));
        });
    stub("g_get_monotonic_time", (a) => a.load("rax", stat(5)));
    stub("g_usleep", (a) => a.store(stat(4), "rdi"));
    stub(
        "g_main_context_iteration",
        (a) => {
            if (options.iterationWait) {
                // The real Nona wait primitive makes timer progress during an
                // open synthetic session deterministic without a busy loop.
                a.mov("rcx", options.iterationWait);
                a.callImport("Sleep");
            }
            a.cmp("rdi", 0);
            failIf(a, "ne");
            a.cmp("rsi", 0);
            failIf(a, "ne");
            bump(a, 3);
            if (options.closeOnIteration !== undefined) {
                const done = a.unique("noClose");
                a.cmp("rax", options.closeOnIteration);
                a.jcc("ne", done);
                a.lea("rsi", { rip: "gui.records" });
                a.load("rdi", { base: "rsi", disp: R.window });
                a.call("gui.closeCallback");
                a.cmp("rax", 1);
                failIf(a, "ne");
                a.label(done);
            }
            a.load("rax", stat(5));
            a.add("rax", options.dispatchMicros ?? 0);
            a.store(stat(5), "rax");
            a.mov(
                "rax",
                options.busy ? 0xfeedbeef00000001n : 0xfeedbeef00000000n,
            );
        },
        40,
    );
    return program;
}
