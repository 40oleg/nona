// Profiles a program compiled by Nona and prints where its instructions go,
// per runtime routine and per compiled function.
//
//   node scripts/profile-runtime.mjs <program.js|.mjs> [--scale 0.1] [--top 30]
//        [--json out.json] [--cwd directory] [--group]
//
// Linux x64 host only; needs `qemu-x86_64` (or qemu-x86_64-static) from
// qemu-user, `objdump` from binutils and a built compiler (dist/). The program
// is built with NONA_ELF_MAP, which writes the executable's symbol table, and
// runs under QEMU with its execution trace (-d in_asm,exec,nochain): every
// executed translation block is counted, and objdump's disassembly of the
// executable gives the instructions of each block. The counts are executed
// instructions, exact and repeatable, unlike wall time under a profiler.
// (Valgrind is not used: it grows its emulated stack only near the stack
// pointer, and Nona's large frames probe their pages below it first.)
// "entries" counts how often a block starting at a routine's first
// instruction ran: the calls of the routine, plus any jump back to its start.
// `--group` also sums routines into the families of `groups` below.
// SCALE is passed to the program as in bench/.
import { spawnSync } from "node:child_process";
import {
    createReadStream,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const at = args.indexOf(name);
    if (at < 0) return fallback;
    const value = args[at + 1];
    args.splice(at, 2);
    return value;
};
const flag = (name) => {
    const at = args.indexOf(name);
    if (at >= 0) args.splice(at, 1);
    return at >= 0;
};
const scale = option("--scale", "1");
const top = Number(option("--top", "30"));
const json = option("--json", undefined);
const group = flag("--group");
const cwdOption = option("--cwd", undefined);
if (!args[0]) {
    console.error(
        "usage: node scripts/profile-runtime.mjs <program> [--scale s] [--top n] [--json file] [--cwd dir] [--group]",
    );
    process.exit(2);
}
const program = resolve(args[0]);
const cwd = resolve(cwdOption ?? dirname(program));

/** Routine families: a routine belongs to the first family whose pattern matches its name. */
const groups = [
    ["gc: sweep", /^rt\.(sweep|gcSweep|gcPrepareSweep|gcFreeBlock)/],
    ["gc: mark and trace", /^rt\.(gc|collect)/],
    ["allocation", /^rt\.(alloc|newObject|newArray|heapAlloc|allocRaw)/],
    ["strings: compare", /^rt\.compareStrings/],
    [
        "strings: search",
        /^rt\.string(IndexOf|LastIndexOf|Includes|StartsWith|EndsWith|Search)|^rt\.splitSubstring/,
    ],
    ["strings: copy and flatten", /^rt\.(copyBytes|byteCopy|concat|flatten)/],
    ["strings: hash", /^rt\.(propKeyHash|keyFilterBit)/],
    ["strings: encode", /^rt\.(utf8|hexEncode|json)/],
    ["string builtins (other)", /^rt\.string|^rt\.str/],
    ["property access", /^rt\.(get|set|has|define|delete|find|own|prop)/],
    ["calls", /^rt\.(invoke|call|construct|apply|enterFrame|tail|prepareTail)/],
    ["RegExp engine (JS)", /^js\.regexpVm/],
    ["compiled program", /^js\./],
];

const qemu = ["qemu-x86_64", "qemu-x86_64-static"].find(
    (name) => spawnSync(name, ["--version"]).status === 0,
);
if (!qemu) throw new Error("qemu-x86_64 (qemu-user) is required");

const directory = mkdtempSync(join(tmpdir(), "nona-profile-"));
try {
    const executable = join(
        directory,
        basename(program).replace(/\.(c?js|mjs)$/, ""),
    );
    const map = executable + ".map.json";
    const build = spawnSync(
        process.execPath,
        [
            join(root, "dist", "cli.js"),
            "build",
            program,
            "-o",
            executable,
            "--target",
            "linux-x64",
        ],
        { encoding: "utf8", env: { ...process.env, NONA_ELF_MAP: map }, cwd },
    );
    if (build.status !== 0)
        throw new Error("build failed:\n" + build.stdout + build.stderr);

    // Instruction starts of the executable segments, from objdump.
    const image = readFileSync(executable);
    const starts = [];
    const phoff = Number(image.readBigUInt64LE(0x20)),
        phentsize = image.readUInt16LE(0x36),
        phnum = image.readUInt16LE(0x38);
    for (let i = 0; i < phnum; i++) {
        const at = phoff + i * phentsize;
        if (
            image.readUInt32LE(at) !== 1 ||
            (image.readUInt32LE(at + 4) & 1) === 0
        )
            continue;
        const offset = Number(image.readBigUInt64LE(at + 8)),
            address = Number(image.readBigUInt64LE(at + 16)),
            size = Number(image.readBigUInt64LE(at + 32));
        const segment = join(directory, "segment.bin");
        writeFileSync(segment, image.subarray(offset, offset + size));
        const disassembly = spawnSync(
            "objdump",
            [
                "-D",
                "-b",
                "binary",
                "-mi386:x86-64",
                `--adjust-vma=${address}`,
                segment,
            ],
            { encoding: "utf8", maxBuffer: 1 << 30 },
        );
        if (disassembly.status !== 0)
            throw new Error("objdump failed: " + disassembly.stderr);
        for (const line of disassembly.stdout.split("\n")) {
            const match = /^\s+([0-9a-f]+):\t/.exec(line);
            if (match) starts.push(parseInt(match[1], 16));
        }
    }
    starts.sort((a, b) => a - b);
    const firstAtLeast = (address) => {
        let low = 0,
            high = starts.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (starts[middle] < address) low = middle + 1;
            else high = middle;
        }
        return low;
    };

    // Routines are the symbols with a matching ".end"; the other names
    // (local labels such as rt.compareStrings.loop) are counted as part of
    // the routine around them. Symbols without an end (data, compiled
    // blocks) stand for themselves.
    const table = JSON.parse(readFileSync(map, "utf8"));
    const routineSymbols = Object.entries(table).filter(
        ([name]) => !name.endsWith(".end") && !name.includes("$"),
    );
    const ends = new Map(
        routineSymbols
            .filter(([name]) => table[name + ".end"] !== undefined)
            .map(([name, address]) => [name, table[name + ".end"]]),
    );
    const symbols = routineSymbols
        .filter(([name, address]) => {
            if (ends.has(name)) return true;
            // A label inside a routine (its name extends the routine's): drop
            // it, the routine covers it.
            for (
                let dot = name.lastIndexOf(".");
                dot > 0;
                dot = name.lastIndexOf(".", dot - 1)
            ) {
                const routine = name.slice(0, dot),
                    end = ends.get(routine);
                if (
                    end !== undefined &&
                    address >= table[routine] &&
                    address < end
                )
                    return false;
            }
            return true;
        })
        .sort((a, b) => a[1] - b[1]);
    const addresses = symbols.map(([, address]) => address);
    const symbolIndex = (address) => {
        let low = 0,
            high = addresses.length - 1;
        if (high < 0 || address < addresses[0]) return -1;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (addresses[middle] <= address) low = middle;
            else high = middle - 1;
        }
        return low;
    };

    // QEMU writes the trace to a file: about 20 bytes per executed
    // instruction, so keep profiled runs to a few hundred million
    // instructions. (A pipe would avoid the file, but QEMU's small log
    // writes make it several times slower.)
    const log = join(directory, "trace.log");
    const run = spawnSync(
        qemu,
        ["-d", "in_asm,exec,nochain", "-D", log, executable],
        {
            cwd,
            env: { ...process.env, SCALE: scale },
            stdio: ["ignore", "ignore", "pipe"],
            encoding: "utf8",
            maxBuffer: 1 << 28,
        },
    );
    if (run.status !== 0)
        throw new Error(`run failed (status ${run.status}):\n${run.stderr}`);

    const blocks = new Map(); // start address -> instructions in the block
    const executions = new Map(); // start address -> times executed
    // The trace is scanned as bytes (hundreds of millions of lines): an
    // "exec" line is "Trace N: <host> [<cpu>/<pc>/<flags>/<cflags>] ", an
    // "in_asm" entry is "IN: " followed by the address line "0x<pc>:" and
    // "OBJD-T: <hex bytes>" (QEMU without a disassembler prints the bytes).
    const hex = (buffer, from, to) => {
        let value = 0;
        for (let i = from; i < to; i++) {
            const c = buffer[i];
            value = value * 16 + (c <= 57 ? c - 48 : (c | 32) - 87);
        }
        return value;
    };
    let pending = null;
    const onLine = (buffer, from, to) => {
        const first = buffer[from];
        if (first === 84 /* T */) {
            const open = buffer.indexOf(91 /* [ */, from);
            if (open < 0 || open >= to) return;
            const slash = buffer.indexOf(47 /* / */, open);
            const next = buffer.indexOf(47, slash + 1);
            if (slash < 0 || next < 0 || next >= to) return;
            const address = hex(buffer, slash + 1, next);
            executions.set(address, (executions.get(address) ?? 0) + 1);
        } else if (first === 73 /* I */ && buffer[from + 1] === 78 /* N */) {
            pending = "address";
        } else if (first === 48 /* 0 */ && pending === "address") {
            const colon = buffer.indexOf(58 /* : */, from);
            pending = hex(
                buffer,
                from + 2,
                colon < 0 || colon > to ? to : colon,
            );
        } else if (first === 79 /* O */ && typeof pending === "number") {
            let end = to;
            while (
                end > from &&
                (buffer[end - 1] === 32 || buffer[end - 1] === 13)
            )
                end--;
            const bytes = (end - from - 8) / 2;
            blocks.set(
                pending,
                firstAtLeast(pending + bytes) - firstAtLeast(pending),
            );
            pending = null;
        }
    };
    let carry = null;
    for await (const chunk of createReadStream(log, {
        highWaterMark: 1 << 22,
    })) {
        let buffer = carry ? Buffer.concat([carry, chunk]) : chunk,
            from = 0;
        for (;;) {
            const newline = buffer.indexOf(10, from);
            if (newline < 0) break;
            if (newline > from) onLine(buffer, from, newline);
            from = newline + 1;
        }
        carry =
            from < buffer.length ? Buffer.from(buffer.subarray(from)) : null;
    }

    const totals = new Map(),
        entries = new Map();
    let total = 0;
    for (const [address, count] of executions) {
        const instructions = Math.max(1, blocks.get(address) ?? 1);
        // Attribute the block's instructions to the routines they belong to.
        let index = firstAtLeast(address);
        for (let i = 0; i < instructions; i++, index++) {
            const at = starts[index] ?? address;
            const symbol = symbolIndex(at);
            const name = symbol < 0 ? "<outside>" : symbols[symbol][0];
            totals.set(name, (totals.get(name) ?? 0) + count);
            total += count;
        }
        const symbol = symbolIndex(address);
        if (symbol >= 0 && addresses[symbol] === address) {
            const name = symbols[symbol][0];
            entries.set(name, (entries.get(name) ?? 0) + count);
        }
    }

    const rows = [...totals].sort((a, b) => b[1] - a[1]);
    const percent = (value) =>
        ((100 * value) / total).toFixed(2).padStart(6) + "%";
    console.log(
        `${basename(program)} (SCALE=${scale}): ${total.toLocaleString("en")} instructions`,
    );
    console.log("    instructions  share      entries  per entry  routine");
    for (const [name, count] of rows.slice(0, top)) {
        const calls = entries.get(name) ?? 0;
        console.log(
            count.toLocaleString("en").padStart(16),
            percent(count),
            calls.toLocaleString("en").padStart(12),
            (calls ? Math.round(count / calls) : "-").toString().padStart(10),
            name,
        );
    }
    let families;
    if (group) {
        families = new Map();
        for (const [name, count] of rows) {
            const family =
                groups.find(([, pattern]) => pattern.test(name))?.[0] ??
                "other runtime";
            families.set(family, (families.get(family) ?? 0) + count);
        }
        console.log("-- families");
        for (const [name, count] of [...families].sort((a, b) => b[1] - a[1]))
            console.log(
                count.toLocaleString("en").padStart(16),
                percent(count),
                name,
            );
    }
    if (json)
        writeFileSync(
            json,
            JSON.stringify(
                {
                    program: basename(program),
                    scale: Number(scale),
                    total,
                    routines: Object.fromEntries(rows),
                    entries: Object.fromEntries(entries),
                    ...(families
                        ? { families: Object.fromEntries(families) }
                        : {}),
                },
                null,
                1,
            ) + "\n",
        );
} finally {
    rmSync(directory, { recursive: true, force: true });
}
