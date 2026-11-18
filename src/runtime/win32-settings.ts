import { RuntimeBuilder, slot, failIf } from "./abi.js";
import type { Assembler } from "../backend/machine/context.js";
import { ObjectLayout as O } from "./object-layout.js";
import { TypedArrayKind, TypedArrayLayout as T } from "./typed-array.js";
import { ArrayBufferKind, ArrayBufferLayout as AB } from "./array-buffer.js";
import { emitViewCheck } from "./view-bounds.js";

const prefix = "win32.settings.";
const s = (name: string) => prefix + name;
const memory = (name: string) => ({ rip: s(name) });

/** Standard, immutable DLGTEMPLATE: Windows owns each instantiated dialog. */
function dialogTemplate(): Uint8Array {
    const bytes: number[] = [];
    const word = (n: number) => bytes.push(n & 255, (n >>> 8) & 255);
    const dword = (n: number) => {
        word(n);
        word(n >>> 16);
    };
    const string = (value: string) => {
        for (const c of value) word(c.charCodeAt(0));
        word(0);
    };
    dword(0x80c80040); // WS_POPUP | WS_CAPTION | WS_SYSMENU | DS_SETFONT
    dword(0x10000); // WS_EX_CONTROLPARENT
    word(5);
    for (const n of [10, 10, 250, 140]) word(n);
    word(0);
    word(0);
    string("Settings");
    word(9);
    string("Segoe UI");
    function control(
        style: number,
        rect: number[],
        id: number,
        cls: number,
        title: string,
    ) {
        while (bytes.length % 4) bytes.push(0);
        dword(style);
        dword(0);
        for (const n of rect) word(n);
        word(id);
        word(0xffff);
        word(cls);
        string(title);
        word(0);
    }
    control(0x50010003, [10, 10, 230, 16], 100, 0x80, "Enabled");
    control(0x50210003, [10, 35, 230, 100], 101, 0x85, "");
    control(0x50000000, [10, 65, 230, 18], 102, 0x82, "Background ticks: 0");
    control(0x50010001, [130, 105, 50, 18], 1, 0x80, "Save");
    control(0x50010000, [190, 105, 50, 18], 2, 0x80, "Cancel");
    return Uint8Array.from(bytes);
}

/**
 * Only linked for a program referencing __nonaWin32Settings on Windows x64.
 * Win64 throughout: frames are 8 mod 16, shadow space precedes locals; only
 * volatile registers are modified. No managed allocation, JS calls or retained
 * managed pointers. Error paths throw before entering user32. Thus no managed
 * Values cross allocating calls and no rootedFn scope is needed here.
 */
export function win32SettingsHelpers(): RuntimeBuilder {
    const b = new RuntimeBuilder();
    for (const name of [
        "CreateDialogIndirectParamW",
        "DestroyWindow",
        "GetDlgItem",
        "SetWindowTextW",
        "SendMessageW",
        "ShowWindow",
        "PeekMessageW",
        "TranslateMessage",
        "DispatchMessageW",
        "IsDialogMessageW",
        "MsgWaitForMultipleObjectsEx",
    ])
        b.bundle.imports.push({ dll: "USER32.dll", name, symbol: s(name) });
    b.data(s("template"), dialogTemplate());
    for (const name of ["hwnd", "check", "combo", "status", "event"])
        b.data(s(name), new Uint8Array(8), ".data");
    const api = (a: Assembler, name: string) => {
        a.callImport(s(name));
        // Win64 leaves the upper bits of a 32-bit return unspecified. Test
        // only the BOOL, rather than treating garbage above it as success.
        if (
            ["SetWindowTextW", "PeekMessageW", "IsDialogMessageW"].includes(
                name,
            )
        ) {
            a.shl("rax", 32);
            a.shr("rax", 32);
        }
    };
    const zero = (a: Assembler, name: string) => {
        a.mov("rax", 0);
        a.store(memory(name), "rax");
    };
    const send = (
        a: Assembler,
        name: string,
        message: number,
        value: number,
    ) => {
        a.load("rcx", memory(name));
        a.mov("rdx", message);
        a.mov("r8", value);
        a.mov("r9", 0);
        api(a, "SendMessageW");
    };
    // Clear ownership before destruction: nested synchronous messages cannot
    // enqueue another terminal event. Never call EndDialog or PostQuitMessage.
    b.fn(s("destroy"), 40, (a) => {
        const done = a.unique("done");
        a.load("rcx", memory("hwnd"));
        zero(a, "hwnd");
        a.test("rcx", "rcx");
        a.jcc("e", done);
        api(a, "DestroyWindow");
        a.label(done);
        for (const name of ["check", "combo", "status"]) zero(a, name);
    });
    b.fn(s("dialogProc"), 72, (a) => {
        const done = a.unique("done"),
            terminal = a.unique("terminal"),
            close = a.unique("close"),
            destroyed = a.unique("destroyed");
        // UINT message uses only the low 32 bits of its argument register.
        a.shl("rdx", 32);
        a.shr("rdx", 32);
        a.cmp("rdx", 0x110); // WM_INITDIALOG: let dialog manager set focus
        const ordinary = a.unique("ordinary");
        a.jcc("ne", ordinary);
        a.mov("rax", 1);
        a.jmp(done);
        a.label(ordinary);
        a.load("rax", memory("hwnd"));
        a.cmp("rcx", "rax");
        const ignored = a.unique("ignored");
        a.jcc("ne", ignored);
        a.load("rax", memory("event"));
        a.test("rax", "rax");
        a.jcc("ne", ignored);
        a.cmp("rdx", 0x10);
        a.jcc("e", close); // WM_CLOSE
        a.cmp("rdx", 2);
        a.jcc("e", destroyed); // external WM_DESTROY
        a.cmp("rdx", 0x111);
        a.jcc("ne", ignored); // WM_COMMAND
        a.shl("r8", 32);
        a.shr("r8", 32);
        // BN_CLICKED only (HIWORD == 0); IDs 1/2 also carry Enter/Escape.
        a.cmp("r8", 2);
        a.jcc("e", terminal);
        a.cmp("r8", 1);
        a.jcc("ne", ignored);
        // Claim the first terminal action before making synchronous control
        // calls: nested native notifications cannot overwrite the result.
        a.mov("rax", 1);
        a.store(memory("event"), "rax");
        send(a, "check", 0xf0, 0); // BM_GETCHECK
        a.and("rax", 1);
        a.shl("rax", 3);
        a.or("rax", 1);
        a.store(slot(40), "rax");
        send(a, "combo", 0x147, 0); // CB_GETCURSEL
        a.cmp("rax", 6);
        const valid = a.unique("valid");
        a.jcc("be", valid);
        a.mov("rax", 0);
        a.label(valid);
        a.shl("rax", 4);
        a.load("r8", slot(40));
        a.or("r8", "rax");
        a.jmp(terminal);
        a.label(close);
        a.mov("r8", 3);
        a.label(terminal);
        a.store(memory("event"), "r8");
        a.call(s("destroy"));
        a.mov("rax", 1);
        a.jmp(done);
        a.label(destroyed);
        a.mov("rax", 3);
        a.store(memory("event"), "rax");
        for (const name of ["hwnd", "check", "combo", "status"]) zero(a, name);
        a.label(ignored);
        a.mov("rax", 0);
        a.label(done);
    });
    // Builtin ABI: out Value*, argc, argv. One private Uint16Array(1536).
    // Words 0..3: operation (open/close/poll/status), checked, choice, wait ms.
    // Nine NUL-terminated 128-word text fields start at word 16 (title,
    // checkbox, seven choices). Status reuses the title field. Return 0 for
    // success/no event, -1 for failure, or type | checked<<3 | choice<<4;
    // terminal types are Save=1, Cancel=2, Close=3.
    // Frame: outgoing arguments at 32, MSG at 64..111, out at 128, borrowed
    // buffer at 136, message quota at 144. No pointers survive this call.
    b.fn(s("code"), 168, (a) => {
        a.store(slot(128), "rcx");
        a.cmp("rdx", 1);
        failIf(a, "b", "rt.throwTypeError");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", TypedArrayKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rax", { base: "r10", disp: T.elementType });
        a.cmp("rax", 4);
        failIf(a, "ne", "rt.throwTypeError");
        emitViewCheck(a, "r10");
        a.test("r11", "r11");
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rax", { base: "r10", disp: T.length });
        a.cmp("rax", 1536);
        failIf(a, "b", "rt.throwTypeError");
        a.load("rax", { base: "r10", disp: T.byteOffset });
        a.load("r10", { base: "r10", disp: T.buffer });
        // The private protocol requires fixed, nonshared storage. No other
        // thread can change text terminators while user32 is reading it.
        a.load("r11", { base: "r10", disp: O.kind });
        a.cmp("r11", ArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r11", { base: "r10", disp: AB.maxByteLength });
        a.test("r11", "r11");
        failIf(a, "ns", "rt.throwTypeError");
        a.load("r10", { base: "r10", disp: AB.bytes });
        a.add("r10", "rax");
        a.store(slot(136), "r10");
        const open = a.unique("open"),
            close = a.unique("close"),
            poll = a.unique("poll"),
            status = a.unique("status"),
            done = a.unique("done"),
            error = a.unique("error"),
            success = a.unique("success");
        a.load("rax", { base: "r10" }, 16);
        for (const [op, label] of [
            [1, open],
            [2, close],
            [3, poll],
            [4, status],
        ] as const) {
            a.cmp("rax", op);
            a.jcc("e", label);
        }
        a.jmp(error);
        a.label(close);
        a.call(s("destroy"));
        zero(a, "event");
        a.jmp(success);
        a.label(status);
        a.load("rax", { base: "r10", disp: 286 }, 16);
        a.test("rax", "rax");
        a.jcc("ne", error);
        a.load("rcx", memory("status"));
        a.test("rcx", "rcx");
        a.jcc("e", success);
        a.lea("rdx", { base: "r10", disp: 32 });
        api(a, "SetWindowTextW");
        a.test("rax", "rax");
        a.jcc("e", error);
        a.jmp(success);
        a.label(open);
        a.load("rax", memory("hwnd"));
        a.test("rax", "rax");
        a.jcc("ne", error);
        for (let i = 0; i < 9; i++) {
            a.load("rax", { base: "r10", disp: 32 + 256 * i + 254 }, 16);
            a.test("rax", "rax");
            a.jcc("ne", error);
        }
        a.load("rax", { base: "r10", disp: 2 }, 16);
        a.cmp("rax", 1);
        a.jcc("a", error);
        a.load("rax", { base: "r10", disp: 4 }, 16);
        a.cmp("rax", 6);
        a.jcc("a", error);
        zero(a, "event");
        a.mov("rcx", 0);
        a.lea("rdx", memory("template"));
        a.mov("r8", 0);
        a.lea("r9", memory("dialogProc"));
        a.mov("rax", 0);
        a.store(slot(32), "rax");
        api(a, "CreateDialogIndirectParamW");
        a.test("rax", "rax");
        a.jcc("e", error);
        a.store(memory("hwnd"), "rax");
        const failed = a.unique("creationFailed");
        for (const [id, name] of [
            [100, "check"],
            [101, "combo"],
            [102, "status"],
        ] as const) {
            a.load("rcx", memory("hwnd"));
            a.mov("rdx", id);
            api(a, "GetDlgItem");
            a.test("rax", "rax");
            a.jcc("e", failed);
            a.store(memory(name), "rax");
        }
        for (const [name, offset] of [
            ["hwnd", 32],
            ["check", 288],
        ] as const) {
            a.load("rcx", memory(name));
            a.load("rdx", slot(136));
            a.add("rdx", offset);
            api(a, "SetWindowTextW");
            a.test("rax", "rax");
            a.jcc("e", failed);
        }
        for (let i = 0; i < 7; i++) {
            a.load("rcx", memory("combo"));
            a.mov("rdx", 0x143);
            a.mov("r8", 0);
            a.load("r9", slot(136));
            a.add("r9", 544 + 256 * i);
            api(a, "SendMessageW");
            a.cmp("rax", 0);
            a.jcc("l", failed);
        }
        a.load("rcx", memory("check"));
        a.mov("rdx", 0xf1);
        a.load("r10", slot(136));
        a.load("r8", { base: "r10", disp: 2 }, 16);
        a.mov("r9", 0);
        api(a, "SendMessageW");
        a.load("rcx", memory("combo"));
        a.mov("rdx", 0x14e);
        a.load("r10", slot(136));
        a.load("r8", { base: "r10", disp: 4 }, 16);
        a.mov("r9", 0);
        api(a, "SendMessageW");
        a.cmp("rax", 0);
        a.jcc("l", failed);
        a.load("rcx", memory("hwnd"));
        a.mov("rdx", 5);
        api(a, "ShowWindow");
        a.jmp(success);
        a.label(failed);
        a.call(s("destroy"));
        zero(a, "event");
        a.jmp(error);
        a.label(poll);
        const take = a.unique("take"),
            pump = a.unique("pump"),
            loop = a.unique("loop"),
            dispatch = a.unique("dispatch"),
            next = a.unique("next");
        a.load("rax", memory("event"));
        a.test("rax", "rax");
        a.jcc("ne", take);
        a.load("rax", memory("hwnd"));
        a.test("rax", "rax");
        a.jcc("e", success);
        a.load("r8", { base: "r10", disp: 6 }, 16);
        a.cmp("r8", 10);
        a.jcc("be", pump);
        a.mov("r8", 10);
        a.label(pump);
        a.mov("rcx", 0);
        a.mov("rdx", 0);
        a.mov("r9", 0x4ff);
        a.mov("rax", 4);
        a.store(slot(32), "rax");
        api(a, "MsgWaitForMultipleObjectsEx");
        a.mov("rax", 64);
        a.store(slot(144), "rax");
        a.label(loop);
        a.lea("rcx", slot(64));
        a.mov("rdx", 0);
        a.mov("r8", 0);
        a.mov("r9", 0);
        a.mov("rax", 1);
        a.store(slot(32), "rax");
        api(a, "PeekMessageW");
        a.test("rax", "rax");
        a.jcc("e", take);
        a.load("rcx", memory("hwnd"));
        a.test("rcx", "rcx");
        a.jcc("e", take);
        a.lea("rdx", slot(64));
        api(a, "IsDialogMessageW");
        a.test("rax", "rax");
        a.jcc("e", dispatch);
        a.jmp(next);
        a.label(dispatch);
        a.lea("rcx", slot(64));
        api(a, "TranslateMessage");
        a.lea("rcx", slot(64));
        api(a, "DispatchMessageW");
        a.label(next);
        a.load("rax", memory("event"));
        a.test("rax", "rax");
        a.jcc("ne", take);
        a.load("rax", slot(144));
        a.sub("rax", 1);
        a.store(slot(144), "rax");
        a.jcc("ne", loop);
        a.label(take);
        a.load("rax", memory("event"));
        a.mov("r10", 0);
        a.store(memory("event"), "r10");
        a.jmp(done);
        a.label(error);
        a.mov("rax", -1);
        a.jmp(done);
        a.label(success);
        a.mov("rax", 0);
        a.label(done);
        a.cvtsi2sd("xmm0", "rax");
        a.load("rcx", slot(128));
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    });
    return b;
}
