import { RuntimeBuilder, slot } from "./abi.js";
import { ObjectLayout as O } from "./object-layout.js";
import { TypedArrayKind, TypedArrayLayout as T } from "./typed-array.js";
import { ArrayBufferKind, ArrayBufferLayout as AB } from "./array-buffer.js";
import { HeapKind, HeapLayout as H } from "./heap-layout.js";
import { ElementsLayout as EL } from "./array-elements.js";
import type { Assembler, Reg } from "../backend/machine/context.js";
import { emitViewCheck } from "./view-bounds.js";

/**
 * Native helpers of the node:http and node:net modules.
 *
 * An HTTP server spends its time on bytes: finding the end of a request head,
 * splitting it into the request line and header fields, turning a few of them
 * into strings, and writing the response head and body into an output
 * buffer. In Nona's JavaScript each of those steps costs a call and an
 * allocation per character; here they are tight loops over the typed array's
 * bytes. All three are leaf functions with the builtin ABI (RCX out Value*,
 * RDX argc, R8 argv) that never call JavaScript; the only allocation is the
 * result string of __nonaNetLatin1, published before any safepoint.
 *
 * __nonaNetParse(bytes, start, end, out): parses one HTTP/1.x request head in
 * bytes[start, end). Returns the index just after the blank line that ends
 * it, 0 when more input is needed, or a negative error:
 *   -1 invalid method, -2 invalid request target, -3 invalid version,
 *   -4 invalid header field, -5 invalid Content-Length, -7 too many headers.
 * `out` is an Int32Array: [0..1] method start/end, [2..3] target start/end,
 * [4] major, [5] minor, [6] header count, [7] flags, [8] Content-Length (-1
 * none, -2 too large for 31 bits), [9] a hash of the method bytes, [10] the
 * index where the request line starts (after skipped empty lines), then four
 * entries per header: name start/end and trimmed value start/end. Flags:
 *   1 Transfer-Encoding is exactly "chunked", 2 Transfer-Encoding present,
 *   4 Content-Length present, 8 Connection is "close", 16 "keep-alive",
 *   32 "upgrade", 64 Upgrade present, 128 Expect present, 256 Host present,
 *   1024 repeated Content-Length, 2048 other Transfer-Encoding value,
 *   4096 other Connection value or several Connection fields.
 * Header names and values are matched case-insensitively; anything the flags
 * do not decide is left to the JavaScript side.
 *
 * __nonaNetLatin1(bytes, start, end): bytes[start, end) as a string, one code
 * unit per byte.
 *
 * __nonaNetWrite(string, bytes, offset, latin1): writes the string into bytes
 * at offset as UTF-8 (lone surrogates as U+FFFD) or, with latin1 true, one
 * byte per code unit (the low 8 bits). Returns the byte count, or -1 when it
 * does not fit. With bytes undefined it only returns the byte count. *
 * __nonaNetCopy(source, start, end, target, offset): copies the bytes
 * source[start, end) of one-byte typed arrays to target at offset (clamped
 * to both arrays) and returns the number of bytes copied. TypedArray slice,
 * subarray and set go through the species protocol and cost microseconds;
 * the server copies request heads and body chunks on every request. *
 * __nonaNetSlice(source, start, end, prototype, mode): a new Uint8Array holding a
 * copy of source[start, end), with the given prototype object (Buffer's) or
 * Uint8Array's. The request head, body chunks and raw socket reads are
 * copied into fresh buffers on every read; the constructor path costs
 * thousands of instructions for each. Mode 1 makes a view of source's own
 * buffer instead of a copy (node:net's read arena hands large request body
 * chunks out without copying them); mode 2 allocates a buffer of that length
 * whose bytes are not initialized (a new read arena, which only ever exposes
 * bytes a read has written). *
 * __nonaNetCheck(string, kind): the index of the first character that is not
 * allowed, or -1. Kind 0: an HTTP token (RFC 9110 tchar); kind 1: a header
 * field value (HTAB, visible ASCII, space and 0x80-0xff); kind 2: a request
 * target (0x21-0xff). Header names and
 * values are validated on every setHeader; the RegExp engine took tens of
 * microseconds for each.
 */
export const NetFlags = {
    chunked: 1,
    transferEncoding: 2,
    contentLength: 4,
    close: 8,
    keepAlive: 16,
    upgradeToken: 32,
    upgrade: 64,
    expect: 128,
    host: 256,
    repeatedLength: 1024,
    otherEncoding: 2048,
    otherConnection: 4096,
    connectionSeen: 8192,
} as const;

/** A 256-byte table: 1 for the token characters of RFC 9110. */
function tokenTable(): Uint8Array {
    const t = new Uint8Array(256);
    for (let c = 0; c < 128; c++)
        t[c] = /[!#$%&'*+\-.^_`|~0-9A-Za-z]/.test(String.fromCharCode(c))
            ? 1
            : 0;
    return t;
}

export function emitHttpNative(b: RuntimeBuilder): void {
    b.data("rt.net.tchar", tokenTable());
    // Loads R10 = bytes, R11 = element count of the one-byte typed array in the
    // Value at RDX, or jumps to `bad`. Clobbers RAX.
    const bytesOf = (
        a: Assembler,
        bad: string,
        base: Reg = "r10",
        count: Reg = "r11",
        elementTypes: "bytes" | "int32" = "bytes",
    ) => {
        a.load("rax", { base: "rdx" });
        a.cmp("rax", 5);
        a.jcc("ne", bad);
        a.load(count, { base: "rdx", disp: 8 });
        a.load("rax", { base: count, disp: O.kind });
        a.cmp("rax", TypedArrayKind);
        a.jcc("ne", bad);
        a.load("rax", { base: count, disp: T.elementType });
        if (elementTypes === "bytes") {
            a.cmp("rax", 4);
            a.jcc("ae", bad);
        } else {
            a.cmp("rax", 7);
            a.jcc("ne", bad);
        }
        // Detached or out of bounds of a resizable buffer: not usable.
        a.mov(base, count);
        emitViewCheck(a, base);
        a.mov("rax", "r11");
        a.mov(count, base);
        a.test("rax", "rax");
        a.jcc("ne", bad);
        a.load(base, { base: count, disp: T.buffer });
        a.load(base, { base, disp: AB.bytes });
        a.load("rax", { base: count, disp: T.byteOffset });
        a.add(base, "rax");
        a.load(count, { base: count, disp: T.length });
    };
    // RAX = the integer value of the Number argument at R8 + 16*index (truncated), or jump to bad.
    const intArg = (a: Assembler, index: number, bad: string) => {
        a.load("rax", { base: "r8", disp: 16 * index });
        a.cmp("rax", 3);
        a.jcc("ne", bad);
        a.movsd("xmm0", { base: "r8", disp: 16 * index + 8 });
        a.cvttsd2si("rax", "xmm0");
    };
    const numberResult = (a: Assembler, reg: Reg) => {
        a.cvtsi2sd("xmm0", reg);
        a.load("rcx", slot(40));
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    };
    const undefinedResult = (a: Assembler) => {
        a.load("rcx", slot(40));
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
    };

    b.fn("rt.netParse.code", 136, (a) => {
        // Frame: 48 bytes, 56 out (int32*), 64 header capacity, 72 name start,
        // 80 value start, 88 value end, 96 header count, 104 flags, 112 length,
        // 120 name end (while a value is scanned).
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done"),
            more = a.unique("more"),
            fail = a.unique("fail");
        a.cmp("rdx", 4);
        a.jcc("b", bad);
        a.lea("rdx", { base: "r8", disp: 48 });
        bytesOf(a, bad, "r10", "r11", "int32");
        a.sub("r11", 11);
        a.test("r11", "r11");
        a.jcc("l", bad);
        a.shr("r11", 2);
        a.store(slot(64), "r11");
        a.store(slot(56), "r10");
        a.mov("rdx", "r8");
        bytesOf(a, bad);
        a.store(slot(48), "r10");
        // RCX cursor, R11 end (clamped to the array), R9 out.
        a.mov("r9", "r11");
        intArg(a, 2, bad);
        a.cmp("rax", "r9");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r9");
            a.label(ok);
        }
        a.mov("r11", "rax");
        intArg(a, 1, bad);
        a.test("rax", "rax");
        a.jcc("l", bad);
        a.mov("rcx", "rax");
        a.load("r9", slot(56));
        a.mov("rax", 0);
        a.store(slot(96), "rax");
        a.store(slot(104), "rax");
        a.mov("rax", -1);
        a.store(slot(112), "rax");
        const outStore = (index: number, reg: Reg) =>
            a.store({ base: "r9", disp: 4 * index }, reg, 32);
        // RAX = the byte at the cursor, or `more` at the end of the input.
        const peek = () => {
            a.cmp("rcx", "r11");
            a.jcc("ge", more);
            a.mov("rax", "r10");
            a.add("rax", "rcx");
            a.load("rax", { base: "rax" }, 8);
        };
        // Error exits are emitted after the main path.
        const errors: [string, number][] = [];
        const error = (code: number) => {
            const l = a.unique("error");
            errors.push([l, code]);
            return l;
        };
        const badMethod = error(-1),
            badTarget = error(-2),
            badVersion = error(-3),
            badHeader = error(-4),
            badLength = error(-5),
            tooMany = error(-7);
        const isToken = (reg: Reg, notToken: string) => {
            a.lea("rdx", { rip: "rt.net.tchar" });
            a.add("rdx", reg);
            a.load("rdx", { base: "rdx" }, 8);
            a.test("rdx", "rdx");
            a.jcc("e", notToken);
        };
        // Empty lines before the request line are skipped.
        {
            const skip = a.unique("skipEmpty"),
                start = a.unique("lineStart");
            a.label(skip);
            peek();
            a.cmp("rax", 13);
            {
                const cr = a.unique("cr");
                a.jcc("ne", cr);
                a.add("rcx", 1);
                a.jmp(skip);
                a.label(cr);
            }
            a.cmp("rax", 10);
            a.jcc("ne", start);
            a.add("rcx", 1);
            a.jmp(skip);
            a.label(start);
            outStore(10, "rcx");
        }
        // Method: token characters up to a space; R8 accumulates a hash of the bytes.
        {
            const loop = a.unique("method"),
                end = a.unique("methodEnd");
            outStore(0, "rcx");
            a.mov("r8", 0);
            a.label(loop);
            peek();
            a.cmp("rax", 32);
            a.jcc("e", end);
            isToken("rax", badMethod);
            a.mov("rdx", "r8");
            a.shl("r8", 5);
            a.sub("r8", "rdx");
            a.add("r8", "rax");
            a.add("rcx", 1);
            a.jmp(loop);
            a.label(end);
            a.load("rax", { base: "r9" }, 32);
            a.cmp("rax", "rcx");
            a.jcc("e", badMethod);
            outStore(1, "rcx");
            outStore(9, "r8");
            a.add("rcx", 1);
        }
        // Request target: visible characters (and bytes above 0x7f) up to a space.
        {
            const loop = a.unique("target"),
                end = a.unique("targetEnd");
            outStore(2, "rcx");
            a.label(loop);
            peek();
            a.cmp("rax", 32);
            a.jcc("e", end);
            a.jcc("b", badTarget);
            a.cmp("rax", 127);
            a.jcc("e", badTarget);
            a.add("rcx", 1);
            a.jmp(loop);
            a.label(end);
            a.load("rax", { base: "r9", disp: 8 }, 32);
            a.cmp("rax", "rcx");
            a.jcc("e", badTarget);
            outStore(3, "rcx");
            a.add("rcx", 1);
        }
        // HTTP/d.d CR LF
        for (const ch of "HTTP/") {
            peek();
            a.cmp("rax", ch.charCodeAt(0));
            a.jcc("ne", badVersion);
            a.add("rcx", 1);
        }
        peek();
        a.sub("rax", 48);
        a.cmp("rax", 9);
        a.jcc("a", badVersion);
        outStore(4, "rax");
        a.add("rcx", 1);
        peek();
        a.cmp("rax", 46);
        a.jcc("ne", badVersion);
        a.add("rcx", 1);
        peek();
        a.sub("rax", 48);
        a.cmp("rax", 9);
        a.jcc("a", badVersion);
        outStore(5, "rax");
        a.add("rcx", 1);
        peek();
        a.cmp("rax", 13);
        a.jcc("ne", badVersion);
        a.add("rcx", 1);
        peek();
        a.cmp("rax", 10);
        a.jcc("ne", badVersion);
        a.add("rcx", 1);
        // Header fields until an empty line.
        const fields = a.unique("fields"),
            headEnd = a.unique("headEnd");
        a.label(fields);
        peek();
        {
            const notCr = a.unique("notCr");
            a.cmp("rax", 13);
            a.jcc("ne", notCr);
            a.add("rcx", 1);
            peek();
            a.cmp("rax", 10);
            a.jcc("ne", badHeader);
            a.add("rcx", 1);
            a.jmp(headEnd);
            a.label(notCr);
        }
        // Name: token characters up to the colon (no leading whitespace: obsolete folding is rejected).
        a.store(slot(72), "rcx");
        {
            const loop = a.unique("name"),
                bytewise = a.unique("nameByte"),
                end = a.unique("nameEnd");
            // Eight bytes per step while they are in the input (no bounds
            // check per byte), then byte by byte.
            a.label(loop);
            a.lea("rax", { base: "rcx", disp: 8 });
            a.cmp("rax", "r11");
            a.jcc("g", bytewise);
            a.mov("r8", "r10");
            a.add("r8", "rcx");
            a.lea("rdx", { rip: "rt.net.tchar" });
            const colons: string[] = [];
            for (let k = 0; k < 8; k++) {
                const colon = a.unique("colon");
                colons.push(colon);
                a.load("rax", { base: "r8", disp: k }, 8);
                a.cmp("rax", 58);
                a.jcc("e", colon);
                a.add("rax", "rdx");
                a.load("rax", { base: "rax" }, 8);
                a.test("rax", "rax");
                a.jcc("e", badHeader);
            }
            a.add("rcx", 8);
            a.jmp(loop);
            colons.forEach((colon, k) => {
                a.label(colon);
                if (k) a.add("rcx", k);
                a.jmp(end);
            });
            a.label(bytewise);
            peek();
            a.cmp("rax", 58);
            a.jcc("e", end);
            isToken("rax", badHeader);
            a.add("rcx", 1);
            a.jmp(bytewise);
            a.label(end);
            a.load("rax", slot(72));
            a.cmp("rax", "rcx");
            a.jcc("e", badHeader);
        }
        a.mov("r8", "rcx");
        a.add("rcx", 1);
        // Optional whitespace, then the value up to CR; control characters other than HTAB are invalid.
        {
            const ows = a.unique("ows"),
                value = a.unique("value");
            a.label(ows);
            peek();
            a.cmp("rax", 32);
            {
                const sp = a.unique("sp");
                a.jcc("ne", sp);
                a.add("rcx", 1);
                a.jmp(ows);
                a.label(sp);
            }
            a.cmp("rax", 9);
            a.jcc("ne", value);
            a.add("rcx", 1);
            a.jmp(ows);
            a.label(value);
            a.store(slot(80), "rcx");
        }
        {
            const loop = a.unique("valueLoop"),
                step = a.unique("valueByte"),
                end = a.unique("valueEnd"),
                ok = a.unique("valueOk");
            // Eight bytes at a time while none of them can end the value or
            // be invalid: with b & 0x7f in every byte, none is below 0x20
            // (the lowest flagged byte is exact, borrows only flag bytes above
            // it) and none is 0x7f. Bytes 0x80-0x9f and 0xff are flagged too
            // and take the byte step, which starts at the lowest flagged byte.
            const flagged = a.unique("flagged");
            a.store(slot(120), "r8");
            a.label(loop);
            a.lea("rax", { base: "rcx", disp: 8 });
            a.cmp("rax", "r11");
            a.jcc("g", step);
            a.mov("rax", "r10");
            a.add("rax", "rcx");
            a.load("rax", { base: "rax" });
            a.mov("r8", 0x7f7f7f7f7f7f7f7fn);
            a.and("rax", "r8");
            a.mov("r8", 0x0101010101010101n);
            a.mov("rdx", "rax");
            a.add("rdx", "r8");
            a.mov("r8", 0x2020202020202020n);
            a.sub("rax", "r8");
            a.or("rax", "rdx");
            a.mov("r8", 0x8080808080808080n);
            a.and("rax", "r8");
            a.jcc("ne", flagged);
            a.add("rcx", 8);
            a.jmp(loop);
            a.label(flagged);
            a.bitScanForward("rax", "rax");
            a.shr("rax", 3);
            a.add("rcx", "rax");
            a.label(step);
            peek();
            a.cmp("rax", 13);
            a.jcc("e", end);
            a.cmp("rax", 127);
            a.jcc("e", badHeader);
            a.cmp("rax", 32);
            a.jcc("ae", ok);
            a.cmp("rax", 9);
            a.jcc("ne", badHeader);
            a.label(ok);
            a.add("rcx", 1);
            a.jmp(loop);
            a.label(end);
            a.load("r8", slot(120));
        }
        // Trim trailing whitespace: RDX = value end.
        {
            const trim = a.unique("trim"),
                trimmed = a.unique("trimmed");
            a.mov("rdx", "rcx");
            a.label(trim);
            a.load("rax", slot(80));
            a.cmp("rdx", "rax");
            a.jcc("be", trimmed);
            a.mov("rax", "r10");
            a.add("rax", "rdx");
            a.load("rax", { base: "rax", disp: -1 }, 8);
            a.cmp("rax", 32);
            {
                const t = a.unique("t");
                a.jcc("e", t);
                a.cmp("rax", 9);
                a.jcc("ne", trimmed);
                a.label(t);
            }
            a.sub("rdx", 1);
            a.jmp(trim);
            a.label(trimmed);
            a.store(slot(88), "rdx");
        }
        a.add("rcx", 1);
        peek();
        a.cmp("rax", 10);
        a.jcc("ne", badHeader);
        a.add("rcx", 1);
        // Record the field: out[11 + 4 * count .. ].
        {
            a.load("rax", slot(96));
            a.load("rdx", slot(64));
            a.cmp("rax", "rdx");
            a.jcc("ae", tooMany);
            a.shl("rax", 4);
            a.add("rax", "r9");
            a.load("rdx", slot(72));
            a.store({ base: "rax", disp: 44 }, "rdx", 32);
            a.store({ base: "rax", disp: 48 }, "r8", 32);
            a.load("rdx", slot(80));
            a.store({ base: "rax", disp: 52 }, "rdx", 32);
            a.load("rdx", slot(88));
            a.store({ base: "rax", disp: 56 }, "rdx", 32);
            a.load("rax", slot(96));
            a.add("rax", 1);
            a.store(slot(96), "rax");
        }
        // Known fields. RDX = name length.
        const next = a.unique("nextField");
        // Jumps to `differ` unless bytes[start..start+text.length) equal text ignoring ASCII case. Clobbers RAX.
        const matches = (start: Reg | number, text: string, differ: string) => {
            for (let i = 0; i < text.length; i++) {
                if (typeof start === "number") {
                    a.load("rax", slot(start));
                    a.add("rax", "r10");
                } else {
                    a.mov("rax", "r10");
                    a.add("rax", start);
                }
                a.load("rax", { base: "rax", disp: i }, 8);
                const c = text.charCodeAt(i);
                if (c >= 97 && c <= 122) a.or("rax", 32);
                a.cmp("rax", c);
                a.jcc("ne", differ);
            }
        };
        const setFlag = (bits: number) => {
            a.load("rax", slot(104));
            a.or("rax", bits);
            a.store(slot(104), "rax");
        };
        // RDX = value length.
        const valueLength = () => {
            a.load("rdx", slot(88));
            a.load("rax", slot(80));
            a.sub("rdx", "rax");
        };
        a.mov("rdx", "r8");
        a.load("rax", slot(72));
        a.sub("rdx", "rax");
        {
            const skip = a.unique("notLength");
            a.cmp("rdx", 14);
            a.jcc("ne", skip);
            matches(72, "content-length", skip);
            // Digits only; a repeated field must carry the same value.
            const repeat = a.unique("repeat"),
                parse = a.unique("parse"),
                digit = a.unique("digit"),
                parsed = a.unique("parsed"),
                big = a.unique("big");
            a.load("rax", slot(104));
            a.and("rax", NetFlags.contentLength);
            a.test("rax", "rax");
            a.jcc("ne", repeat);
            setFlag(NetFlags.contentLength);
            a.jmp(parse);
            a.label(repeat);
            setFlag(NetFlags.repeatedLength);
            a.label(parse);
            valueLength();
            a.test("rdx", "rdx");
            a.jcc("e", badLength);
            a.load("rdx", slot(80));
            a.mov("r8", 0);
            a.label(digit);
            a.load("rax", slot(88));
            a.cmp("rdx", "rax");
            a.jcc("ae", parsed);
            a.mov("rax", "r10");
            a.add("rax", "rdx");
            a.load("rax", { base: "rax" }, 8);
            a.sub("rax", 48);
            a.cmp("rax", 9);
            a.jcc("a", badLength);
            a.store(slot(72), "rax");
            a.mov("rax", "r8");
            a.shl("r8", 3);
            a.add("r8", "rax");
            a.add("r8", "rax");
            a.load("rax", slot(72));
            a.add("r8", "rax");
            a.mov("rax", 0x7fffffff);
            a.cmp("r8", "rax");
            a.jcc("g", big);
            a.add("rdx", 1);
            a.jmp(digit);
            a.label(big);
            a.mov("r8", -2);
            a.label(parsed);
            {
                const first = a.unique("first");
                a.load("rax", slot(104));
                a.and("rax", NetFlags.repeatedLength);
                a.test("rax", "rax");
                a.jcc("e", first);
                a.load("rax", slot(112));
                a.cmp("rax", "r8");
                a.jcc("ne", badLength);
                a.label(first);
            }
            a.store(slot(112), "r8");
            a.jmp(next);
            a.label(skip);
        }
        {
            const skip = a.unique("notEncoding"),
                other = a.unique("otherEncoding");
            a.cmp("rdx", 17);
            a.jcc("ne", skip);
            matches(72, "transfer-encoding", skip);
            setFlag(NetFlags.transferEncoding);
            valueLength();
            a.cmp("rdx", 7);
            a.jcc("ne", other);
            matches(80, "chunked", other);
            setFlag(NetFlags.chunked);
            a.jmp(next);
            a.label(other);
            setFlag(NetFlags.otherEncoding);
            a.jmp(next);
            a.label(skip);
        }
        {
            const skip = a.unique("notConnection"),
                other = a.unique("otherConnection"),
                notClose = a.unique("notClose"),
                notKeep = a.unique("notKeep");
            a.cmp("rdx", 10);
            a.jcc("ne", skip);
            matches(72, "connection", skip);
            a.load("rax", slot(104));
            a.and("rax", NetFlags.connectionSeen);
            a.test("rax", "rax");
            a.jcc("ne", other);
            setFlag(NetFlags.connectionSeen);
            valueLength();
            a.cmp("rdx", 5);
            a.jcc("ne", notClose);
            matches(80, "close", other);
            setFlag(NetFlags.close);
            a.jmp(next);
            a.label(notClose);
            a.cmp("rdx", 10);
            a.jcc("ne", notKeep);
            matches(80, "keep-alive", other);
            setFlag(NetFlags.keepAlive);
            a.jmp(next);
            a.label(notKeep);
            a.cmp("rdx", 7);
            a.jcc("ne", other);
            matches(80, "upgrade", other);
            setFlag(NetFlags.upgradeToken);
            a.jmp(next);
            a.label(other);
            setFlag(NetFlags.otherConnection);
            a.jmp(next);
            a.label(skip);
        }
        {
            const skip = a.unique("notUpgrade");
            a.cmp("rdx", 7);
            a.jcc("ne", skip);
            matches(72, "upgrade", skip);
            setFlag(NetFlags.upgrade);
            a.jmp(next);
            a.label(skip);
        }
        {
            const skip = a.unique("notExpect");
            a.cmp("rdx", 6);
            a.jcc("ne", skip);
            matches(72, "expect", skip);
            setFlag(NetFlags.expect);
            a.jmp(next);
            a.label(skip);
        }
        {
            const skip = a.unique("notHost");
            a.cmp("rdx", 4);
            a.jcc("ne", skip);
            matches(72, "host", skip);
            setFlag(NetFlags.host);
            a.jmp(next);
            a.label(skip);
        }
        a.label(next);
        a.jmp(fields);
        a.label(headEnd);
        a.load("rax", slot(96));
        outStore(6, "rax");
        a.load("rax", slot(104));
        outStore(7, "rax");
        a.load("rax", slot(112));
        outStore(8, "rax");
        numberResult(a, "rcx");
        a.jmp(done);
        for (const [label, code] of errors) {
            a.label(label);
            a.mov("rax", code);
            a.jmp(fail);
        }
        a.label(more);
        a.mov("rax", 0);
        a.label(fail);
        numberResult(a, "rax");
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });

    b.fn("rt.netLatin1.code", 72, (a) => {
        // Frame: 48 bytes + start, 56 count.
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done");
        a.cmp("rdx", 3);
        a.jcc("b", bad);
        a.mov("rdx", "r8");
        bytesOf(a, bad);
        a.mov("r9", "r11");
        intArg(a, 2, bad);
        a.cmp("rax", "r9");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r9");
            a.label(ok);
        }
        a.mov("r11", "rax");
        intArg(a, 1, bad);
        a.test("rax", "rax");
        a.jcc("l", bad);
        a.cmp("rax", "r11");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r11");
            a.label(ok);
        }
        a.sub("r11", "rax");
        a.add("r10", "rax");
        a.call("rt.netLatin1String");
        a.load("rcx", slot(40));
        a.mov("rdx", 4);
        a.store({ base: "rcx" }, "rdx");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });
    // R10 bytes, R11 count -> RAX a new string record of the bytes as code
    // units (not yet in any Value: the caller publishes it before a safepoint).
    // rt.netLatin1Lower is the same with ASCII letters folded to lower case
    // (header names, whose lookups are by lower-case key).
    for (const lower of [false, true])
        b.fn(lower ? "rt.netLatin1Lower" : "rt.netLatin1String", 72, (a) => {
            // Frame: 40 bytes, 48 count, 56 the record.
            a.store(slot(40), "r10");
            a.store(slot(48), "r11");
            a.mov("rcx", "r11");
            a.add("rcx", "rcx");
            a.add("rcx", 8);
            a.call("rt.allocRaw");
            a.store(slot(56), "rax");
            a.load("r11", slot(48));
            a.store({ base: "rax" }, "r11");
            a.load("r10", slot(40));
            a.lea("r9", { base: "rax", disp: 8 });
            // Eight bytes per step: one load, then each byte stored as a unit.
            const loop = a.unique("copy"),
                tail = a.unique("tail"),
                tailLoop = a.unique("tailLoop"),
                end = a.unique("copied");
            const fold = (reg: "rdx" | "r8") => {
                if (!lower) return;
                const keep = a.unique("keep");
                a.cmp(reg, 0x41);
                a.jcc("b", keep);
                a.cmp(reg, 0x5a);
                a.jcc("a", keep);
                a.or(reg, 0x20);
                a.label(keep);
            };
            a.mov("rcx", 0);
            a.label(loop);
            a.lea("rax", { base: "rcx", disp: 8 });
            a.cmp("rax", "r11");
            a.jcc("a", tail);
            a.mov("rax", "r10");
            a.add("rax", "rcx");
            a.load("r8", { base: "rax" });
            for (let k = 0; k < 8; k++) {
                a.mov("rdx", "r8");
                if (k) a.shr("rdx", 8 * k);
                a.and("rdx", 0xff);
                fold("rdx");
                a.store({ base: "r9", disp: 2 * k }, "rdx", 16);
            }
            a.add("r9", 16);
            a.add("rcx", 8);
            a.jmp(loop);
            a.label(tail);
            a.label(tailLoop);
            a.cmp("rcx", "r11");
            a.jcc("ae", end);
            a.mov("rdx", "r10");
            a.add("rdx", "rcx");
            a.load("rdx", { base: "rdx" }, 8);
            fold("rdx");
            a.store({ base: "r9" }, "rdx", 16);
            a.add("r9", 2);
            a.add("rcx", 1);
            a.jmp(tailLoop);
            a.label(end);
            a.load("rax", slot(56));
        });
    // __nonaNetHeadLines(bytes, out): the header names and values that the
    // last __nonaNetParse of these bytes left in out (see above), as an array
    // [name, value, ...] of strings. One call makes 2N strings; one call per
    // string cost more than the parse itself. With a third argument, the
    // module's keep array, the strings of recent fields are reused
    // (http-field-cache.ts).
    b.fn("rt.netHeadLines.code", 136, (a) => {
        // Frame: 48 bytes pointer, 56 byte count, 64 out pointer, 72 header
        // count, 80 index, 88 the array Value (16 bytes, published to the result
        // before return), 104 a string Value being appended, 120 the field's
        // cache entry, 128 the keep array's element table (0: no cache).
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done"),
            loop = a.unique("loop"),
            end = a.unique("end");
        a.cmp("rdx", 2);
        a.jcc("b", bad);
        a.mov("rax", 0);
        a.store(slot(128), "rax");
        {
            const none = a.unique("noKeep");
            a.cmp("rdx", 3);
            a.jcc("b", none);
            a.store(slot(48), "r8");
            a.lea("rcx", { base: "r8", disp: 32 });
            a.call("rt.netFieldKeep");
            a.store(slot(128), "rax");
            a.load("r8", slot(48));
            a.label(none);
        }
        a.mov("rdx", "r8");
        bytesOf(a, bad);
        a.store(slot(48), "r10");
        a.store(slot(56), "r11");
        a.lea("rdx", { base: "r8", disp: 16 });
        bytesOf(a, bad, "r10", "r11", "int32");
        a.store(slot(64), "r10");
        a.cmp("r11", 11);
        a.jcc("b", bad);
        a.loadSigned32("rax", { base: "r10", disp: 24 });
        a.test("rax", "rax");
        a.jcc("s", bad);
        // 11 + 4 * count entries must exist.
        a.mov("r9", "rax");
        a.shl("r9", 2);
        a.add("r9", 11);
        a.cmp("r9", "r11");
        a.jcc("a", bad);
        a.store(slot(72), "rax");
        // The array, 2 * count elements (undefined until each is stored).
        {
            const empty = a.unique("empty"),
                made = a.unique("made");
            a.test("rax", "rax");
            a.jcc("e", empty);
            a.lea("rcx", slot(88));
            a.mov("rdx", "rax");
            a.add("rdx", "rdx");
            a.call("rt.newArrayLiteral");
            a.jmp(made);
            a.label(empty);
            a.lea("rcx", slot(88));
            a.mov("rdx", 1);
            a.mov("r8", 0);
            a.call("rt.newObject");
            a.label(made);
        }
        a.mov("rax", 0);
        a.store(slot(80), "rax");
        a.label(loop);
        a.load("rax", slot(80));
        a.load("r9", slot(72));
        a.cmp("rax", "r9");
        a.jcc("ae", end);
        // Two strings: [start, end) pairs at out[11 + 4 i] and out[13 + 4 i],
        // stored into elements 2 i and 2 i + 1.
        for (const part of [0, 8]) {
            a.load("rax", slot(80));
            a.shl("rax", 4);
            a.add("rax", 44 + part);
            a.load("r9", slot(64));
            a.add("r9", "rax");
            a.loadSigned32("r10", { base: "r9" });
            a.loadSigned32("r11", { base: "r9", disp: 4 });
            // Clamp to the bytes.
            a.test("r10", "r10");
            a.jcc("s", bad);
            a.cmp("r11", "r10");
            a.jcc("l", bad);
            a.load("rax", slot(56));
            a.cmp("r11", "rax");
            a.jcc("g", bad);
            a.sub("r11", "r10");
            a.load("rax", slot(48));
            a.add("r10", "rax");
            a.load("r9", slot(128));
            if (part === 0) {
                a.load("r8", slot(80));
                a.call("rt.netFieldName");
                a.store(slot(120), "rdx");
            } else {
                a.load("r8", slot(120));
                a.call("rt.netFieldValue");
            }
            a.load("r10", slot(96));
            a.load("r10", { base: "r10", disp: O.elements });
            a.load("r11", slot(80));
            a.shl("r11", 5);
            a.add("r10", "r11");
            a.mov("r11", 4);
            a.store({ base: "r10", disp: EL.values + part * 2 }, "r11");
            a.store({ base: "r10", disp: EL.values + part * 2 + 8 }, "rax");
        }
        a.load("rax", slot(80));
        a.add("rax", 1);
        a.store(slot(80), "rax");
        a.jmp(loop);
        a.label(end);
        a.load("rcx", slot(40));
        for (const part of [0, 8]) {
            a.load("rax", slot(88 + part));
            a.store({ base: "rcx", disp: part }, "rax");
        }
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });

    b.fn("rt.netWrite.code", 88, (a) => {
        // Frame: 48 units, 56 unit count, 64 latin1 flag.
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done"),
            count = a.unique("count"),
            overflow = a.unique("overflow");
        a.cmp("rdx", 4);
        a.jcc("b", bad);
        a.load("rax", { base: "r8" });
        a.cmp("rax", 4);
        a.jcc("ne", bad);
        a.load("rax", { base: "r8", disp: 8 });
        a.load("r11", { base: "rax" });
        a.add("rax", 8);
        a.store(slot(48), "rax");
        a.store(slot(56), "r11");
        {
            const set = a.unique("set");
            a.mov("rdx", 0);
            a.load("rax", { base: "r8", disp: 48 });
            a.cmp("rax", 2);
            a.jcc("ne", set);
            a.load("rdx", { base: "r8", disp: 56 });
            a.label(set);
            a.store(slot(64), "rdx");
        }
        // R9 destination (0: count only), RDX destination end.
        a.mov("r9", 0);
        a.mov("rdx", 0);
        {
            a.load("rax", { base: "r8", disp: 16 });
            a.test("rax", "rax");
            a.jcc("e", count);
            a.mov("rcx", "r8");
            a.lea("rdx", { base: "r8", disp: 16 });
            bytesOf(a, bad);
            a.mov("r8", "rcx");
            intArg(a, 2, bad);
            a.test("rax", "rax");
            a.jcc("l", bad);
            a.cmp("rax", "r11");
            a.jcc("a", overflow);
            a.mov("r9", "r10");
            a.add("r9", "rax");
            a.mov("rdx", "r10");
            a.add("rdx", "r11");
        }
        a.label(count);
        // RCX unit index, R8 bytes produced, R10 units, R11 unit count. Slots 72
        // and 80 keep the code point and the low surrogate while bytes are written.
        a.mov("rcx", 0);
        a.mov("r8", 0);
        a.load("r10", slot(48));
        a.load("r11", slot(56));
        const loop = a.unique("loop"),
            end = a.unique("end"),
            ascii = a.unique("ascii"),
            two = a.unique("two"),
            three = a.unique("three"),
            pair = a.unique("pair"),
            lone = a.unique("lone"),
            low = a.unique("low"),
            utf8 = a.unique("utf8");
        const put = (reg: "rax") => {
            const skip = a.unique("skip");
            a.test("r9", "r9");
            a.jcc("e", skip);
            a.cmp("r9", "rdx");
            a.jcc("ae", overflow);
            a.store({ base: "r9" }, reg, 8);
            a.add("r9", 1);
            a.label(skip);
            a.add("r8", 1);
        };
        const unit = () => {
            a.mov("rax", "rcx");
            a.add("rax", "rax");
            a.add("rax", "r10");
            a.load("rax", { base: "rax" }, 16);
            a.add("rcx", 1);
        };
        /**
         * Four units at a time while they fit: RAX = the next four UTF-16 units
         * (one qword); with `mask` (an all-ASCII test) a block that fails it goes
         * to `slow`. The low bytes are packed into one dword: R11 is borrowed
         * between push and pop, which contain no jumps.
         */
        const block = (name: string, slow: string, ascii: boolean) => {
            const top = a.unique(name),
                count = a.unique(name + "Count"),
                stored = a.unique(name + "Stored");
            a.label(top);
            a.mov("rax", "rcx");
            a.add("rax", 4);
            a.cmp("rax", "r11");
            a.jcc("a", slow);
            a.test("r9", "r9");
            a.jcc("e", count);
            a.mov("rax", "r9");
            a.add("rax", 4);
            a.cmp("rax", "rdx");
            a.jcc("a", slow);
            a.label(count);
            a.mov("rax", "rcx");
            a.add("rax", "rax");
            a.add("rax", "r10");
            a.load("rax", { base: "rax" });
            if (ascii) {
                a.push("r11");
                a.mov("r11", 0xff80ff80ff80ff80n);
                a.test("rax", "r11");
                a.pop("r11");
                a.jcc("ne", slow);
            }
            a.test("r9", "r9");
            a.jcc("e", stored);
            a.push("r11");
            if (!ascii) {
                a.mov("r11", 0x00ff00ff00ff00ffn);
                a.and("rax", "r11");
            }
            a.mov("r11", "rax");
            a.shr("r11", 8);
            a.or("rax", "r11");
            a.mov("r11", 0x0000ffff0000ffffn);
            a.and("rax", "r11");
            a.mov("r11", "rax");
            a.shr("r11", 16);
            a.or("rax", "r11");
            a.pop("r11");
            a.store({ base: "r9" }, "rax", 32);
            a.add("r9", 4);
            a.label(stored);
            a.add("rcx", 4);
            a.add("r8", 4);
            a.jmp(top);
        };
        {
            const l1 = a.unique("latin1"),
                single = a.unique("latin1Single");
            a.load("rax", slot(64));
            a.test("rax", "rax");
            a.jcc("e", utf8);
            block("latin1Block", single, false);
            a.label(single);
            a.cmp("rcx", "r11");
            a.jcc("ae", end);
            unit();
            put("rax");
            a.jmp(l1);
            a.label(l1);
            block("latin1Block2", single, false);
        }
        a.label(utf8);
        block("asciiBlock", loop, true);
        a.label(loop);
        a.cmp("rcx", "r11");
        a.jcc("ae", end);
        unit();
        a.cmp("rax", 0x80);
        a.jcc("b", ascii);
        a.cmp("rax", 0x800);
        a.jcc("b", two);
        a.cmp("rax", 0xd800);
        a.jcc("b", three);
        a.cmp("rax", 0xdc00);
        a.jcc("ae", low);
        // A high surrogate followed by a low one is a four-byte sequence; anything else is U+FFFD.
        a.cmp("rcx", "r11");
        a.jcc("ae", lone);
        a.store(slot(72), "rax");
        a.mov("rax", "rcx");
        a.add("rax", "rax");
        a.add("rax", "r10");
        a.load("rax", { base: "rax" }, 16);
        {
            const notLow = a.unique("notLow");
            a.cmp("rax", 0xdc00);
            a.jcc("b", notLow);
            a.cmp("rax", 0xe000);
            a.jcc("ae", notLow);
            a.add("rcx", 1);
            a.sub("rax", 0xdc00);
            a.store(slot(80), "rax");
            a.load("rax", slot(72));
            a.sub("rax", 0xd800);
            a.shl("rax", 10);
            a.add("rax", 0x10000);
            a.store(slot(72), "rax");
            a.jmp(pair);
            a.label(notLow);
            a.load("rax", slot(72));
            a.jmp(lone);
        }
        a.label(low);
        a.cmp("rax", 0xe000);
        a.jcc("ae", three);
        a.label(lone);
        a.mov("rax", 0xfffd);
        a.jmp(three);
        const emitBytes = (parts: [number, number, number][]) => {
            a.store(slot(72), "rax");
            for (const [shift, mask, prefix] of parts) {
                a.load("rax", slot(72));
                if (shift) a.shr("rax", shift);
                a.and("rax", mask);
                a.or("rax", prefix);
                put("rax");
            }
        };
        const next = a.unique("next");
        a.label(ascii);
        put("rax");
        a.jmp(next);
        a.label(two);
        emitBytes([
            [6, 0x1f, 0xc0],
            [0, 0x3f, 0x80],
        ]);
        a.jmp(next);
        a.label(three);
        emitBytes([
            [12, 0x0f, 0xe0],
            [6, 0x3f, 0x80],
            [0, 0x3f, 0x80],
        ]);
        a.jmp(next);
        // Pair: code point = slot 72 + slot 80; R11 is borrowed (no jumps while pushed).
        a.label(pair);
        a.push("r11");
        a.load("r11", slot(80 + 8));
        a.load("rax", slot(72 + 8));
        a.add("rax", "r11");
        a.pop("r11");
        emitBytes([
            [18, 0x07, 0xf0],
            [12, 0x3f, 0x80],
            [6, 0x3f, 0x80],
            [0, 0x3f, 0x80],
        ]);
        a.label(next);
        block("asciiBlock2", loop, true);
        a.label(end);
        numberResult(a, "r8");
        a.jmp(done);
        a.label(overflow);
        a.mov("rax", -1);
        numberResult(a, "rax");
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });

    b.fn("rt.netCopy.code", 72, (a) => {
        // Frame: 48 source pointer, 56 count.
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done");
        a.cmp("rdx", 5);
        a.jcc("b", bad);
        a.mov("rdx", "r8");
        bytesOf(a, bad);
        a.mov("r9", "r11");
        intArg(a, 2, bad);
        a.cmp("rax", "r9");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r9");
            a.label(ok);
        }
        a.mov("r11", "rax");
        intArg(a, 1, bad);
        a.test("rax", "rax");
        a.jcc("l", bad);
        a.cmp("rax", "r11");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r11");
            a.label(ok);
        }
        a.sub("r11", "rax");
        a.add("r10", "rax");
        a.store(slot(48), "r10");
        a.store(slot(56), "r11");
        a.lea("rdx", { base: "r8", disp: 48 });
        bytesOf(a, bad);
        intArg(a, 4, bad);
        a.test("rax", "rax");
        a.jcc("l", bad);
        a.cmp("rax", "r11");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r11");
            a.label(ok);
        }
        a.sub("r11", "rax");
        a.add("r10", "rax");
        // count = min(source bytes, target room)
        a.load("rcx", slot(56));
        a.cmp("rcx", "r11");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rcx", "r11");
            a.label(ok);
        }
        a.store(slot(56), "rcx");
        a.push("rsi");
        a.push("rdi");
        a.load("rsi", slot(48 + 16));
        a.mov("rdi", "r10");
        a.repMovsb();
        a.pop("rdi");
        a.pop("rsi");
        a.load("rax", slot(56));
        numberResult(a, "rax");
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });

    // __nonaNetSlice(source, start, end, prototype): a new Uint8Array over
    // its own buffer holding source[start, end) (clamped), whose prototype is
    // the given object (Buffer.prototype) or %Uint8Array.prototype%. The
    // constructor path (new Uint8Array(n) and Buffer.allocUnsafe) costs
    // thousands of instructions in prototype resolution and argument
    // coercion; this is three allocations and a block copy. No safepoint is
    // reached between them (the collector runs only at compiled code's
    // safepoints), so the blocks need no roots before the result is stored.
    b.fn("rt.netSlice.code", 104, (a) => {
        // Frame: 48 source pointer + start, 56 count, 64 prototype, 72 bytes
        // block, 80 buffer object, 88 mode, 96 byte offset of the view.
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done");
        a.cmp("rdx", 3);
        a.jcc("b", bad);
        a.store(slot(32), "rdx");
        {
            const plain = a.unique("plain");
            a.mov("rax", 0);
            a.store(slot(88), "rax");
            a.cmp("rdx", 5);
            a.jcc("b", plain);
            a.load("rax", { base: "r8", disp: 64 });
            a.cmp("rax", 3);
            a.jcc("ne", plain);
            a.movsd("xmm0", { base: "r8", disp: 72 });
            a.cvttsd2si("rax", "xmm0");
            a.store(slot(88), "rax");
            a.label(plain);
        }
        a.mov("rdx", "r8");
        bytesOf(a, bad);
        a.mov("r9", "r11");
        intArg(a, 2, bad);
        a.cmp("rax", "r9");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r9");
            a.label(ok);
        }
        a.mov("r11", "rax");
        intArg(a, 1, bad);
        a.test("rax", "rax");
        a.jcc("l", bad);
        a.cmp("rax", "r11");
        {
            const ok = a.unique("ok");
            a.jcc("le", ok);
            a.mov("rax", "r11");
            a.label(ok);
        }
        a.sub("r11", "rax");
        a.add("r10", "rax");
        a.store(slot(48), "r10");
        a.store(slot(56), "r11");
        {
            const given = a.unique("given"),
                chosen = a.unique("chosen");
            a.lea("rax", { rip: "rt.uint8arrayPrototype" });
            a.load("r9", slot(32));
            a.cmp("r9", 4);
            a.jcc("b", chosen);
            a.load("r9", { base: "r8", disp: 48 });
            a.cmp("r9", 5);
            a.jcc("ne", chosen);
            a.load("rax", { base: "r8", disp: 56 });
            a.label(chosen);
            a.store(slot(64), "rax");
            a.label(given);
        }
        a.mov("rax", 0);
        a.store(slot(96), "rax");
        const own = a.unique("own"),
            copied = a.unique("copied");
        a.load("rax", slot(88));
        a.cmp("rax", 1);
        a.jcc("ne", own);
        {
            // A view of the source's buffer: its offset is the start's
            // address relative to the buffer's bytes.
            a.load("r9", { base: "r8", disp: 8 });
            a.load("r9", { base: "r9", disp: T.buffer });
            a.store(slot(80), "r9");
            a.load("rax", slot(48));
            a.load("r10", { base: "r9", disp: AB.bytes });
            a.sub("rax", "r10");
            a.store(slot(96), "rax");
            a.jmp(copied);
        }
        a.label(own);
        // The bytes: a raw block, not zeroed (it is overwritten here, or in
        // mode 2 by the caller).
        a.load("rcx", slot(56));
        a.call("rt.allocRaw");
        a.store(slot(72), "rax");
        a.load("r10", slot(88));
        a.cmp("r10", 2);
        const buffer = a.unique("buffer");
        a.jcc("e", buffer);
        a.push("rsi");
        a.push("rdi");
        a.load("rsi", slot(48 + 16));
        a.mov("rdi", "rax");
        a.load("rcx", slot(56 + 16));
        a.repMovsb();
        a.pop("rdi");
        a.pop("rsi");
        a.label(buffer);
        // The ArrayBuffer object (as rt.ArrayBuffer.construct lays it out).
        a.mov("rcx", AB.size);
        a.call("rt.alloc");
        a.mov("r10", HeapKind.object);
        a.store({ base: "rax", disp: H.kind - H.size }, "r10");
        a.mov("r10", ArrayBufferKind);
        a.store({ base: "rax", disp: O.kind }, "r10");
        a.mov("r10", 0);
        for (const offset of [O.properties, O.length, O.shape, O.flags])
            a.store({ base: "rax", disp: offset }, "r10");
        a.lea("r10", { rip: "rt.arraybufferPrototype" });
        a.store({ base: "rax", disp: O.prototype }, "r10");
        a.load("r10", slot(72));
        a.store({ base: "rax", disp: AB.bytes }, "r10");
        a.load("r10", slot(56));
        a.store({ base: "rax", disp: AB.byteLength }, "r10");
        a.mov("r10", 0);
        a.store({ base: "rax", disp: AB.detached }, "r10");
        a.mov("r10", -1);
        a.store({ base: "rax", disp: AB.maxByteLength }, "r10");
        a.store(slot(80), "rax");
        a.label(copied);
        // The view (as the typed array constructors lay it out).
        a.mov("rcx", T.size);
        a.call("rt.alloc");
        a.mov("r10", HeapKind.object);
        a.store({ base: "rax", disp: H.kind - H.size }, "r10");
        a.mov("r10", TypedArrayKind);
        a.store({ base: "rax", disp: O.kind }, "r10");
        a.mov("r10", 0);
        for (const offset of [O.properties, O.length, O.shape, O.flags])
            a.store({ base: "rax", disp: offset }, "r10");
        a.load("r10", slot(64));
        a.store({ base: "rax", disp: O.prototype }, "r10");
        a.load("r10", slot(80));
        a.store({ base: "rax", disp: T.buffer }, "r10");
        a.load("r10", slot(96));
        a.store({ base: "rax", disp: T.byteOffset }, "r10");
        a.load("r10", slot(56));
        a.store({ base: "rax", disp: T.byteLength }, "r10");
        a.store({ base: "rax", disp: T.length }, "r10");
        a.store({ base: "rax", disp: T.fixedByteLength }, "r10");
        a.mov("r10", 1);
        a.store({ base: "rax", disp: T.elementType }, "r10");
        a.load("rcx", slot(40));
        a.mov("r10", 5);
        a.store({ base: "rcx" }, "r10");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });

    b.fn("rt.netCheck.code", 40, (a) => {
        a.store(slot(32), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done"),
            found = a.unique("found"),
            loop = a.unique("loop"),
            ok = a.unique("ok"),
            value = a.unique("value");
        a.cmp("rdx", 2);
        a.jcc("b", bad);
        a.load("rax", { base: "r8" });
        a.cmp("rax", 4);
        a.jcc("ne", bad);
        a.load("r10", { base: "r8", disp: 8 });
        a.load("r11", { base: "r10" });
        a.add("r10", 8);
        intArg(a, 1, bad);
        a.mov("r9", "rax");
        // RCX index, R10 units, R11 count, R9 kind.
        a.mov("rcx", 0);
        a.label(loop);
        // A field value four units at a time while each of them is 0x20-0x7e
        // (as netParse does with bytes: a unit 0x80-0x9f or 0xff is flagged
        // too and takes the unit step).
        {
            const unit = a.unique("unit");
            a.cmp("r9", 1);
            a.jcc("ne", unit);
            a.lea("rax", { base: "rcx", disp: 4 });
            a.cmp("rax", "r11");
            a.jcc("a", unit);
            a.mov("rax", "rcx");
            a.add("rax", "rax");
            a.add("rax", "r10");
            a.load("rax", { base: "rax" });
            a.mov("r8", 0xff00ff00ff00ff00n);
            a.mov("rdx", "rax");
            a.and("rdx", "r8");
            a.jcc("ne", unit);
            a.mov("r8", 0x007f007f007f007fn);
            a.and("rax", "r8");
            a.mov("r8", 0x0001000100010001n);
            a.mov("rdx", "rax");
            a.add("rdx", "r8");
            a.mov("r8", 0x0020002000200020n);
            a.sub("rax", "r8");
            a.or("rax", "rdx");
            a.mov("r8", 0x0080008000800080n);
            a.and("rax", "r8");
            a.jcc("ne", unit);
            a.add("rcx", 4);
            a.jmp(loop);
            a.label(unit);
        }
        a.cmp("rcx", "r11");
        {
            const end = a.unique("end");
            a.jcc("ae", end);
            a.mov("rax", "rcx");
            a.add("rax", "rax");
            a.add("rax", "r10");
            a.load("rax", { base: "rax" }, 16);
            {
                const notPath = a.unique("notPath");
                a.cmp("r9", 2);
                a.jcc("ne", notPath);
                a.cmp("rax", 0x21);
                a.jcc("b", found);
                a.cmp("rax", 0xff);
                a.jcc("a", found);
                a.jmp(ok);
                a.label(notPath);
            }
            a.test("r9", "r9");
            a.jcc("ne", value);
            a.cmp("rax", 128);
            a.jcc("ae", found);
            a.lea("rdx", { rip: "rt.net.tchar" });
            a.add("rdx", "rax");
            a.load("rdx", { base: "rdx" }, 8);
            a.test("rdx", "rdx");
            a.jcc("e", found);
            a.jmp(ok);
            a.label(value);
            a.cmp("rax", 9);
            a.jcc("e", ok);
            a.cmp("rax", 32);
            a.jcc("b", found);
            a.cmp("rax", 127);
            a.jcc("e", found);
            a.cmp("rax", 255);
            a.jcc("a", found);
            a.label(ok);
            a.add("rcx", 1);
            a.jmp(loop);
            a.label(end);
        }
        a.mov("rcx", -1);
        a.label(found);
        a.cvtsi2sd("xmm0", "rcx");
        a.load("rcx", slot(32));
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.jmp(done);
        a.label(bad);
        a.load("rcx", slot(32));
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.label(done);
    });
}
