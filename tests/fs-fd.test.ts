import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compileModuleToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { linkHost } from "./helpers/program.js";
import { runModulesOnHost } from "./helpers/host.js";
import { removeTemporaryDirectory } from "./helpers/cleanup.js";
import { fsModuleSource } from "../src/frontend/fs-module.js";
import { supportedNativeTargets } from "../src/target.js";
import { compile } from "../src/compiler.js";
import { fsDescriptorProbe } from "./probes/fs-descriptor-probe.js";

/** Compile an ES module, run it with `input` piped to stdin. */
function runWithInput(source: string, input: string) {
    const directory = mkdtempSync(join(tmpdir(), "nona-fs-fd-"));
    try {
        const entry = join(directory, "main.mjs");
        writeFileSync(entry, source);
        const executable = join(
            directory,
            process.platform === "win32" ? "image.exe" : "image",
        );
        writeFileSync(
            executable,
            linkHost(generate(compileModuleToIR(source, entry))),
        );
        chmodSync(executable, 0o755);
        return spawnSync(executable, [], {
            input,
            encoding: "utf8",
            timeout: 60_000,
            windowsHide: true,
        });
    } finally {
        removeTemporaryDirectory(directory);
    }
}

const repro = String.raw`
import fs from "node:fs";
const input = fs.readFileSync(0, "utf8");
console.log(input.trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0));
fs.writeFileSync(1, "done\n");
fs.appendFileSync(1, new Uint8Array([111, 107, 10]));
fs.writeFileSync(2, "to stderr\n");
`;

test("fs.readFileSync(0) and writeFileSync(1) work on piped stdin and stdout", () => {
    const result = runWithInput(repro, "1 2 3\n");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "6\ndone\nok\n");
    assert.equal(result.stderr, "to stderr\n");
});

test("fs.readFileSync(0) without encoding reads until EOF", () => {
    const source = `import fs from "node:fs"; console.log(fs.readFileSync(0).length);`;
    const result = runWithInput(source, "x".repeat(200000));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "200000\n");
});

test("fs rejects invalid path and descriptor arguments with Node.js error codes", () => {
    const source = String.raw`
import fs from "node:fs";
const probe = (f) => { try { f(); console.log("no error"); } catch (e) { console.log(e.name, e.code); } };
probe(() => fs.readFileSync({}));
probe(() => fs.readFileSync(null));
probe(() => fs.readFileSync(1.5));
probe(() => fs.readFileSync(-1));
probe(() => fs.writeFileSync(1, 5));
probe(() => fs.writeFileSync({}, "x"));
probe(() => fs.appendFileSync(true, "x"));
`;
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        {
            gcStress: false,
        },
    );
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, oracle);
});

function compareDescriptors(source: string) {
    // Each program owns a different directory even though the helper runs them
    // serially in the same cwd. Never let the Node oracle repair native data.
    const result = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: true,
    });
    assert.ifError(result.native.error);
    assert.equal(result.native.signal, null);
    assert.equal(result.native.status, 0, result.native.stderr);
    assert.equal(result.native.stderr, "");
    assert.equal(result.oracleStatus, 0, result.oracleStderr);
    assert.equal(result.native.stdout, result.oracle);
    return result.native.stdout;
}

test("fs descriptors preserve binary views, positioned cursors, short EOF and truncate cursors", () => {
    compareDescriptors(String.raw`
import fs from "node:fs";
const dir = fs.mkdtempSync("fd-");
try {
    const path = dir + "/binary", c = fs.constants;
    const fd = fs.openSync(path, c.O_CREAT | c.O_EXCL | c.O_RDWR, 0o600);
    try {
        const backing = new Uint8Array(262).fill(99);
        for (let i=0; i<256; i++) backing[i+3]=i;
        const input = new DataView(backing.buffer, 3, 256);
        console.log("write", fs.writeSync(fd,input,0,256,4));
        console.log("start", fs.writeSync(fd,new Uint8Array([7,0,255]),0,3,null));
        const out = new Uint8Array(266).fill(88), view = new Int8Array(out.buffer,5,258);
        console.log("short", fs.readSync(fd,view,0,258,4));
        let same=true;
        for (let i=0; i<256; i++) if (out[i+5]!==i) same=false;
        console.log("bytes",same,out[4],out[261],out[262],out[263]);
        const cursor=new Uint8Array(2);
        console.log("cursor",fs.readSync(fd,cursor,0,2,null),Array.from(cursor).join(","));
        console.log("eof",fs.readSync(fd,cursor,0,2,260));
        fs.ftruncateSync(fd,8);
        console.log("size",fs.fstatSync(fd).size);
        fs.ftruncateSync(fd,12);
        const zeros=new Uint8Array(4).fill(9);
        fs.readSync(fd,zeros,0,4,8);
        console.log("extend",Array.from(zeros).join(","));
        fs.writeFileSync(fd,new Uint8Array([42,0]));
        console.log("truncate-cursor",Array.from(fs.readFileSync(path).subarray(5,7)).join(","));
        fs.fsyncSync(fd); fs.fdatasyncSync(fd);
        const a=fs.fstatSync(fd), b=fs.statSync(path);
        console.log("stat",a.isFile(),a.size===b.size,a.ino===b.ino,a.dev===b.dev,
          (a.mode&0o170000)===0o100000,a.nlink>0,a.mtime instanceof Date,a.atimeMs>0,a.ctimeMs>0,
          typeof fs.fstatSync(fd,{bigint:true}).ino);
    } finally { fs.closeSync(fd); }
    const fd2=fs.openSync(path,"r+");
    try {
        fs.writeSync(fd2,"é",0,"utf8");
        const b=new Uint8Array(4).fill(77);
        console.log("options",fs.readSync(fd2,b,{offset:1,length:2,position:0}),Array.from(b).join(","));
    } finally {fs.closeSync(fd2);}
} finally {fs.rmSync(dir,{recursive:true,force:true});}
`);
});

test("fs open flags, append and descriptor failures agree with Node", () => {
    compareDescriptors(String.raw`
import fs from "node:fs";
const dir=fs.mkdtempSync("flags-"), path=dir+"/file";
const probe=(f)=>{try{f();console.log("no-error");}catch(e){console.log(e.code,e.syscall||"argument",e.path===undefined);}};
try {
    probe(()=>fs.openSync(path,"r"));
    let fd=fs.openSync(path,"wx"); fs.writeSync(fd,new Uint8Array([1,0,255])); fs.closeSync(fd);
    probe(()=>fs.openSync(path,"wx"));
    fd=fs.openSync(path,"a+");
    fs.writeSync(fd,new Uint8Array([128,0]),0,2,0);
    fs.closeSync(fd);
    console.log("append",Array.from(fs.readFileSync(path)).join(","));
    fd=fs.openSync(path,"r");
    probe(()=>fs.writeSync(fd,new Uint8Array([1]),0,1,0));
    fs.closeSync(fd);
    for(const f of [()=>fs.closeSync(fd),()=>fs.fstatSync(fd),()=>fs.ftruncateSync(fd),()=>fs.fsyncSync(fd),()=>fs.fdatasyncSync(fd),()=>fs.readSync(fd,new Uint8Array(1)),()=>fs.writeSync(fd,new Uint8Array(1))]) probe(f);
    fd=fs.openSync(path,"w+"); console.log("trunc",fs.fstatSync(fd).size);
    for(const f of [()=>fs.readSync(fd,new Uint8Array(2),-1,1,0),()=>fs.writeSync(fd,new Uint8Array(2),0,3,0),()=>fs.readSync(fd,new Uint8Array(2),0,1,0.5),()=>fs.ftruncateSync(fd,1.5),()=>fs.closeSync("3")]) probe(f);
    fs.closeSync(fd);
    const stats=fs.statfsSync(dir);
    console.log("statfs",stats.bsize>0,stats.blocks>0,stats.bfree>=0,stats.bavail>=0,typeof fs.statfsSync(dir,{bigint:true}).blocks);
    probe(()=>fs.statfsSync(dir+"/absent"));
} finally {fs.rmSync(dir,{recursive:true,force:true});}
`);
});

test("filesystem descriptor sources adapt syscall ABIs for every native target", () => {
    const numbers = {
        "linux-x64": [17, 18, 77, 74, 75, 137],
        "linux-arm64": [67, 68, 46, 82, 83, 43],
        "darwin-x64": [153, 154, 201, 95, 187, 345],
        "darwin-arm64": [153, 154, 201, 95, 187, 345],
        "freebsd-x64": [475, 476, 480, 95, 550, 555],
        "openbsd-x64": [169, 170, 168, 95, 95, 63],
    };
    for (const target of supportedNativeTargets) {
        const source = fsModuleSource(target);
        if (target.startsWith("win32")) continue;
        const ids = numbers[target as keyof typeof numbers];
        for (const [i, name] of [
            "sysPread",
            "sysPwrite",
            "sysFtruncate",
            "sysFsync",
            "sysFdatasync",
            "sysStatfs",
        ].entries())
            assert.match(
                source,
                new RegExp(`const ${name} = define\\("syscall", "${ids[i]}"`),
            );
    }
});

test("portable descriptor probe compiles for all targets and runs against Node on the host", () => {
    for (const target of supportedNativeTargets) {
        const result = compile(fsDescriptorProbe.source, {
            fileName: "fd-probe.mjs",
            module: true,
            target,
        });
        assert.ok(
            result.ok,
            result.ok ? "" : JSON.stringify(result.diagnostics),
        );
    }
    assert.equal(
        compareDescriptors(fsDescriptorProbe.source),
        fsDescriptorProbe.expected,
    );
});

test("POSIX descriptor I/O retries EINTR, returns short counts and propagates failures", async () => {
    const calls: string[] = [];
    const written: number[] = [];
    const replies: Record<string, number[]> = {
        "17": [-4, 2, 0, -9],
        "18": [-4, 1, -28],
        "1": [2, 1, 0],
        "74": [-4, 0],
        "3": [-4],
    };
    const source = readFileSync("src/lib/modules/fs-linux.js", "utf8").replace(
        'import { define } from "nona:ffi";',
        "",
    );
    const load = new Function(
        "define",
        "encoder",
        "fail",
        source + ";return sys;",
    );
    const sys = load(
        (_dll: string, id: string) =>
            (...args: any[]) => {
                calls.push(id);
                const n = replies[id]!.shift();
                if (id === "1" && n! > 0)
                    written.push(...args[1].subarray(0, n));
                return n;
            },
        new TextEncoder(),
        (code: string, syscall: string) => {
            throw Object.assign(new Error(code), { code, syscall });
        },
    );
    const bytes = new Uint8Array([0, 128, 255, 42]);
    assert.equal(sys.read(8, bytes, 20), 2);
    assert.equal(sys.read(8, bytes, 22), 0);
    assert.throws(() => sys.read(8, bytes, 22), {
        code: "EBADF",
        syscall: "read",
    });
    assert.equal(sys.write(8, bytes, 20), 1);
    assert.throws(() => sys.write(8, bytes, 21), {
        code: "ENOSPC",
        syscall: "write",
    });
    assert.throws(() => sys.writeAllFd(8, bytes), {
        code: "EIO",
        syscall: "write",
    });
    assert.deepEqual(written, [0, 128, 255]);
    sys.sync(8, false);
    assert.throws(() => sys.close(8), { code: "EINTR", syscall: "close" });
    assert.deepEqual(calls, [
        "17",
        "17",
        "17",
        "17",
        "18",
        "18",
        "18",
        "1",
        "1",
        "1",
        "74",
        "74",
        "3",
    ]);
});

test("Windows descriptor I/O restores positions after short I/O and errors, and rejects zero-progress whole writes", () => {
    const source = readFileSync("src/lib/modules/fs-win32.js", "utf8").replace(
        'import { define, lastError } from "nona:ffi";',
        "",
    );
    const calls: string[] = [];
    let result = true,
        count = 2,
        last = 112;
    const load = new Function(
        "define",
        "lastError",
        "fail",
        "fsConstants",
        source + ";return sys;",
    );
    const sys = load(
        (_dll: string, name: string, signature: string) =>
            (...args: any[]) => {
                if (name === "CreateFileW") return 100;
                if (name === "SetFilePointerEx") {
                    calls.push("seek:" + args[1] + ":" + args[3]);
                    if (signature.includes("buf"))
                        new DataView(args[2].buffer).setUint32(0, 7, true);
                    return true;
                }
                if (name === "WriteFile" || name === "ReadFile") {
                    args[3][0] = count;
                    return result;
                }
                if (name === "CloseHandle") return true;
                if (name === "FlushFileBuffers") return result;
                throw new Error(name);
            },
        () => last,
        (code: string, syscall: string) => {
            throw Object.assign(new Error(code), { code, syscall });
        },
        {
            O_RDONLY: 0,
            O_WRONLY: 1,
            O_RDWR: 2,
            O_CREAT: 256,
            O_APPEND: 8,
            O_SYNC: 134217728,
            O_DSYNC: 67108864,
        },
    );
    const fd = sys.open("file", 2, 0o600),
        bytes = new Uint8Array(4);
    assert.equal(sys.read(fd, bytes, 100), 2);
    assert.equal(sys.write(fd, bytes, 200), 2);
    result = false;
    assert.throws(() => sys.write(fd, bytes, 300), {
        code: "ENOSPC",
        syscall: "write",
    });
    assert.throws(() => sys.sync(fd, false), {
        code: "ENOSPC",
        syscall: "fsync",
    });
    assert.throws(() => sys.sync(fd, true), {
        code: "ENOSPC",
        syscall: "fdatasync",
    });
    last = 38;
    assert.equal(sys.read(fd, bytes, 400), 0);
    assert.deepEqual(calls, [
        "seek:0:1",
        "seek:100:0",
        "seek:7:0",
        "seek:0:1",
        "seek:200:0",
        "seek:7:0",
        "seek:0:1",
        "seek:300:0",
        "seek:7:0",
        "seek:0:1",
        "seek:400:0",
        "seek:7:0",
    ]);
    result = true;
    count = 0;
    assert.throws(() => sys.writeAllFd(fd, bytes), {
        code: "EIO",
        syscall: "write",
    });
    sys.close(fd);
    assert.throws(() => sys.read(fd, bytes, null), {
        code: "EBADF",
        syscall: "read",
    });
});
