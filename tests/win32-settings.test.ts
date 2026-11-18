import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, compileModuleToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { linkPe } from "../src/backend/pe/writer.js";
import { withNativeTarget } from "../src/backend/machine/context.js";
import { RuntimeBuilder } from "../src/runtime/abi.js";
import { collectSourceUsage } from "../src/frontend/lexer.js";
import { replaceImport } from "./helpers/native.js";
import { supportedNativeTargets } from "../src/target.js";
import { readPe } from "./helpers/pe-reader.js";
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
    spawn,
    spawnSync,
    type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createInterface } from "node:readline";
import { runInNewContext } from "node:vm";

const source = `import { SettingsWindow } from 'nona:win32/settings';
const window = new SettingsWindow({choices:['0','1','2','3','4','5','6'], onEvent(e) { console.log(e.type); }});
window.open({checked:false, choice:0}); window.dispose();`;

function runLocal(image: Uint8Array) {
    mkdirSync("work", { recursive: true });
    const directory = mkdtempSync(resolve("work/settings-native-"));
    try {
        const executable = join(directory, "settings.exe");
        writeFileSync(executable, image);
        return spawnSync(executable, [], {
            timeout: 10000,
            encoding: "utf8",
            windowsHide: true,
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

function hiddenProgram(
    source: string,
    gcStress: boolean,
    failCreation = false,
) {
    const program = withNativeTarget("win32-x64", () => {
        const { result, usage } = collectSourceUsage(() =>
            compileModuleToIR(source, resolve("hidden-settings.mjs")),
        );
        return generate(result, { gcStress, link: usage });
    });
    const b = new RuntimeBuilder();
    b.fn("settings.test.hide", 40, (a) => a.mov("rax", 0));
    replaceImport(program, "win32.settings.ShowWindow", "settings.test.hide");
    if (failCreation) {
        b.data("settings.test.textCalls", new Uint8Array(8), ".data");
        // Fail the checkbox text update after the parent and every child
        // already exist. The retry forwards to the real user32 function.
        b.fn("settings.test.setText", 40, (a) => {
            const forward = a.unique("forward"),
                done = a.unique("done");
            a.load("rax", { rip: "settings.test.textCalls" });
            a.add("rax", 1);
            a.store({ rip: "settings.test.textCalls" }, "rax");
            a.cmp("rax", 2);
            a.jcc("ne", forward);
            // BOOL result: upper register bits are outside its ABI contract.
            a.mov("rax", 0xfeedbeef00000000n);
            a.jmp(done);
            a.label(forward);
            a.callImport("settings.test.realSetText");
            a.label(done);
        });
        program.imports.push({
            dll: "USER32.dll",
            name: "SetWindowTextW",
            symbol: "settings.test.realSetText",
        });
        replaceImport(
            program,
            "win32.settings.SetWindowTextW",
            "settings.test.setText",
        );
    }
    program.fragments.push(...b.bundle.fragments);
    program.functions.push(...b.bundle.functions);
    return program;
}

for (const gcStress of [false, true])
    test(
        `hidden settings native mouse events and deferred Promise progress (GC stress ${gcStress})`,
        {
            skip: process.platform !== "win32" || process.arch !== "x64",
        },
        () => {
            const program = hiddenProgram(
                `
        import {SettingsWindow} from 'nona:win32/settings';
        import {define} from 'nona:ffi';
        const find=define('user32.dll','FindWindowW','ptr(wstr,wstr)');
        const item=define('user32.dll','GetDlgItem','ptr(ptr,i32)');
        const post=define('user32.dll','PostMessageW','bool(ptr,u32,ptr,ptr)');
        const owner=define('user32.dll','GetWindowThreadProcessId','u32(ptr,buf)');
        const sleep=define('kernel32.dll','Sleep','void(u32)');
        process.on('uncaughtException',error => {
            if(error.message!=='expected listener failure') process.exit(92);
            console.log('caught');
        });
        let ticks=0, other=0, watching=true;
        globalThis.__nonaIoLoop({active(){return watching?1:0;},total(){return watching?1:0;},poll(){return 1;},run(){other++;}});
        // Deliberately always overdue, without consuming CPU in a busy loop.
        const slow=setInterval(() => {ticks++; sleep(5);},1);
        const title='NonaHidden-'+process.pid;
        const window=new SettingsWindow({title,choices:['0','1','2','3','4','5','6'],onEvent(e){
            console.log(e.type,e.checked,e.choice); clearTimeout(fail); clearInterval(slow); watching=false;
            console.log('fairness',ticks>0,other>=4);
            // Reopen from the listener, then discard/dispose before old queued
            // mouse-up messages can be dispatched against a new session.
            window.open({checked:true,choice:3}); window.close();
            window.open({checked:false,choice:2}); window.dispose();
            Promise.resolve().then(() => console.log('microtask'));
            setTimeout(() => console.log('timer'),10);
            throw new Error('expected listener failure');
        }});
        let failed=false;
        try {window.open({checked:false,choice:6});} catch(e) {failed=true;}
        console.log('partial',failed,find(null,title)===0);
        window.open({checked:false,choice:6});
        const hwnd=find(null,title), pid=new Uint32Array(1); owner(hwnd,pid);
        if(!hwnd || pid[0]!==process.pid) process.exit(93);
        const checkbox=item(hwnd,100), save=item(hwnd,1);
        for(let i=0;i<200;i++) post(hwnd,0x8005,0,0);
        post(checkbox,0x201,1,0x80008); post(checkbox,0x202,0,0x80008);
        post(save,0x201,1,0x80008); post(save,0x202,0,0x80008);
        const fail=setTimeout(() => {window.dispose(); process.exit(94);},2000);
    `,
                gcStress,
                true,
            );
            // Exercise actual native button procedures and the I/O pump without
            // presenting or activating any window on the shared local desktop.
            const run = runLocal(linkPe(program, { subsystem: "windows" }));
            assert.equal(run.status, 0, run.stderr);
            assert.equal(
                run.stdout.replaceAll("\r", ""),
                "partial true true\nsave true 6\nfairness true true\ncaught\nmicrotask\ntimer\n",
            );
        },
    );

test("settings bridge links only on Windows x64 and supports the GUI subsystem", () => {
    const result = compile(source, {
        fileName: "settings.mjs",
        target: "win32-x64",
        subsystem: "windows",
    });
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(readPe(result.image).subsystem, 2);
    assert.ok(
        readPe(result.image)
            .imports()
            .some((i) => i.endsWith("!CreateDialogIndirectParamW")),
    );
});

test("settings import rejects unsupported targets including Windows ARM64", () => {
    for (const target of supportedNativeTargets.filter(
        (t) => t !== "win32-x64",
    )) {
        const result = compile(source, { fileName: "settings.mjs", target });
        assert.equal(result.ok, false, target);
        if (!result.ok)
            assert.match(JSON.stringify(result.diagnostics), /Windows x64/);
    }
});

test("settings native helper rejects worker-thread programs", () => {
    const result = compile("console.log('main');", {
        fileName: "main.js",
        target: "win32-x64",
        agents: ["__nonaWin32Settings(undefined);"],
    });
    assert.equal(result.ok, false);
    if (!result.ok)
        assert.match(
            JSON.stringify(result.diagnostics),
            /main Windows x64 JavaScript thread/,
        );
});

test("unrelated programs still link every target without settings imports", () => {
    for (const target of supportedNativeTargets) {
        const result = compile("console.log('portable');", {
            fileName: "portable.js",
            target,
        });
        assert.ok(result.ok, `${target}: ${JSON.stringify(result)}`);
        if (target.startsWith("win32-"))
            assert.ok(
                !readPe(result.image)
                    .imports()
                    .some((i) =>
                        /CreateDialog|IsDialogMessage|MsgWaitFor/.test(i),
                    ),
            );
    }
});

test("settings sample compiles to PE subsystem 2", () => {
    const fileName = resolve("site/samples/settings.win32.mjs");
    const result = compile(readFileSync(fileName, "utf8"), {
        fileName,
        target: "win32-x64",
        subsystem: "windows",
    });
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(readPe(result.image).subsystem, 2);
});

for (const gcStress of [false, true])
    test(
        `settings explicit close/dispose preserves background work (GC stress ${gcStress})`,
        {
            skip: process.platform !== "win32" || process.arch !== "x64",
        },
        () => {
            const program = hiddenProgram(
                `import {SettingsWindow} from 'nona:win32/settings';
    let events=0;
    const w=new SettingsWindow({choices:['0','1','2','3','4','5','6'],onEvent(){events++}});
    w.open({checked:false,choice:0});
    try { w.open({checked:true,choice:1}); } catch(e) {console.log('already open');}
    w.close(); w.close();
    setTimeout(() => {
        w.open({checked:true,choice:6}); w.setStatus('timer'); w.dispose(); w.dispose();
        try { w.open({checked:false,choice:0}); } catch(e) {console.log('disposed');}
        Promise.resolve().then(() => console.log('done',events,w.isOpen));
    },10);`,
                gcStress,
            );
            const run = runLocal(linkPe(program, { subsystem: "windows" }));
            assert.equal(run.status, 0, run.stderr);
            assert.equal(
                run.stdout.replaceAll("\r", ""),
                "already open\ndisposed\ndone 0 false\n",
            );
        },
    );

test("settings wrapper invalidates ready events and detaches sessions before handlers", () => {
    let poller: any,
        result = 0,
        opens = 0;
    const context: any = {
        __nonaWin32Settings(buffer: Uint16Array) {
            if (buffer[0] === 1) opens++;
            if (buffer[0] === 3) {
                const value = result;
                result = 0;
                return value;
            }
            return 0;
        },
        __nonaIoLoop(value: unknown) {
            poller = value;
        },
    };
    runInNewContext(
        readFileSync("src/lib/modules/win32-settings.js", "utf8").replace(
            "export class SettingsWindow",
            "globalThis.SettingsWindow = class SettingsWindow",
        ),
        context,
    );
    const events: string[] = [];
    for (const choices of [new Array(7), ["0", "1", "2", "3", "4", "5", 6]])
        assert.throws(
            () => new context.SettingsWindow({ choices, onEvent() {} }),
            /string/,
        );
    const state = { checked: false, choice: 0 };
    const window = new context.SettingsWindow({
        choices: ["0", "1", "2", "3", "4", "5", "6"],
        onEvent(event: any) {
            assert.equal(window.isOpen, false);
            events.push(event.type);
            window.open(state);
            throw new Error("listener failure");
        },
    });
    window.open(state);
    result = 1 | 8 | (6 << 4);
    assert.equal(poller.poll(100), 1);
    window.close();
    window.open(state);
    poller.run(0);
    assert.deepEqual(events, []);
    result = 2;
    poller.poll(0);
    assert.throws(() => poller.run(0), /listener failure/);
    assert.deepEqual(events, ["cancel"]);
    assert.equal(opens, 3);
    assert.equal(window.isOpen, true);
    window.dispose();
    window.dispose();
    assert.equal(poller.active(), 0);
    assert.throws(() => window.open(state), /disposed/);
});

/** Every read has a deadline; children are always reaped by the caller. */
class Lines {
    lines: string[] = [];
    stderr = "";
    error: Error | undefined;
    constructor(readonly child: ChildProcessWithoutNullStreams) {
        createInterface({ input: child.stdout }).on("line", (line) =>
            this.lines.push(line),
        );
        child.stderr.on("data", (data) => (this.stderr += data));
        child.on("error", (error) => {
            this.error = error;
        });
    }
    async next(pattern: RegExp, timeout = 10_000): Promise<string> {
        const deadline = Date.now() + timeout;
        for (;;) {
            if (this.error) throw this.error;
            const index = this.lines.findIndex((line) => pattern.test(line));
            if (index >= 0) return this.lines.splice(index, 1)[0]!;
            assert.ok(
                Date.now() < deadline,
                `Timed out waiting for ${pattern}: ${this.lines.join("\n")} ${this.stderr}`,
            );
            assert.equal(
                this.child.exitCode,
                null,
                `Child exited: ${this.stderr}`,
            );
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }
    async command(line: string): Promise<string> {
        if (this.error) throw this.error;
        this.child.stdin.write(line + "\n");
        const response = await this.next(/^(OK|ERROR) /);
        assert.match(response, /^OK /);
        return response.slice(3);
    }
}
async function stop(child: ChildProcessWithoutNullStreams) {
    if (child.exitCode !== null || child.pid === undefined) return;
    const closed = new Promise<void>((resolve) =>
        child.once("close", () => resolve()),
    );
    child.kill();
    await Promise.race([
        closed,
        new Promise<never>((_, reject) => {
            const timer = setTimeout(
                () => reject(new Error("Child cleanup timed out")),
                5000,
            );
            timer.unref();
        }),
    ]);
}
const application = `import { SettingsWindow } from 'nona:win32/settings';
let saved={checked:false,choice:0}, stage=0, ticks=0, promises=0, window;
process.on('uncaughtException', e => {
    if (e.message !== 'expected listener failure') process.exit(90);
    console.log('CAUGHT');
});
const background=setInterval(() => { ticks++; Promise.resolve().then(() => {promises++; window.setStatus('T='+ticks+';P='+promises);}); },10);
function open() {
    window=new SettingsWindow({title:'NonaSettings:'+stage, choices:['0','1','2','3','4','5','6'],onEvent(e) {
        console.log('EVENT',stage,e.type,e.checked,e.choice,ticks,promises);
        if(e.type==='save') saved={checked:e.checked,choice:e.choice};
        console.log('SAVED',stage,saved.checked,saved.choice);
        const previous=stage++;
        window.dispose();
        Promise.resolve().then(() => console.log('MICRO',previous));
        if(previous===15) {
            clearInterval(background);
            setTimeout(() => {console.log('EXIT',ticks,promises);process.exit(0);},30);
        } else if(previous===10) {open(); throw new Error('expected listener failure');}
        else setTimeout(open,30);
    }});
    window.open(saved);
    console.log('READY',stage,ticks,promises);
}
open();
setTimeout(() => {window.dispose();process.exit(91);},30000);`;

for (const gcStress of [false, true])
    test(
        `hosted settings controls, lifetime and progress (GC stress ${gcStress})`,
        {
            skip:
                process.platform !== "win32" ||
                process.arch !== "x64" ||
                process.env.NONA_WIN32_GUI_TESTS !== "1",
            timeout: 60_000,
        },
        async () => {
            // Keep every artifact in this checkout, including the controller process.
            mkdirSync("work", { recursive: true });
            const directory = mkdtempSync(resolve("work/settings-"));
            let app: ChildProcessWithoutNullStreams | undefined,
                controller: ChildProcessWithoutNullStreams | undefined;
            try {
                const result = compile(application, {
                    fileName: "settings.mjs",
                    target: "win32-x64",
                    subsystem: "windows",
                    gcStress,
                });
                assert.ok(result.ok, JSON.stringify(result));
                assert.equal(readPe(result.image).subsystem, 2);
                const executable = join(directory, "settings.exe");
                writeFileSync(executable, result.image);
                app = spawn(executable, [], { windowsHide: false });
                const output = new Lines(app);
                await output.next(/^READY 0 /);
                assert.ok(app.pid);
                controller = spawn(
                    "powershell",
                    [
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-File",
                        resolve("tests/helpers/win32-settings-controller.ps1"),
                        "-TargetPid",
                        String(app.pid),
                    ],
                    {
                        windowsHide: true,
                        env: {
                            ...process.env,
                            TEMP: directory,
                            TMP: directory,
                        },
                    },
                );
                const driver = new Lines(controller);
                const waitFor = async (
                    command: string,
                    expected: (value: string) => boolean,
                ) => {
                    const deadline = Date.now() + 5000;
                    for (;;) {
                        const value = await driver.command(command);
                        if (expected(value)) return value;
                        assert.ok(
                            Date.now() < deadline,
                            `${command}: ${value}`,
                        );
                        await new Promise((resolve) => setTimeout(resolve, 20));
                    }
                };
                let previousTicks = 0;
                for (let stage = 0; stage <= 15; stage++) {
                    if (stage > 0)
                        await output.next(new RegExp("^READY " + stage + " "));
                    await waitFor(
                        "find NonaSettings:" + stage,
                        (value) => value !== "0",
                    );
                    assert.equal(await driver.command("visible"), "True");
                    // Wait for a timer and its Promise job; assert all seven native items.
                    const state = await waitFor("state", (value) =>
                        /\|7\|T=[1-9][0-9]*;P=[1-9]/.test(value),
                    );
                    const ticks = Number(state.split("T=")[1]!.split(";")[0]);
                    assert.ok(ticks > previousTicks);
                    previousTicks = ticks;
                    if (stage <= 6) {
                        // Initial checkbox focus, Space or real mouse button messages.
                        if (stage % 2 === 0) await driver.command("mouse 100");
                        else await driver.command("key 32");
                        await waitFor(
                            "state",
                            (value) =>
                                Number(value.split("|")[0]) ===
                                (stage % 2 === 0 ? 1 : 0),
                        );
                        await driver.command("key 9");
                        await waitFor("focus", (value) => value === "101");
                        await driver.command("key 36"); // Home, then selection keys
                        for (let i = 0; i < stage; i++)
                            await driver.command("key 40");
                        await waitFor(
                            "state",
                            (value) => Number(value.split("|")[1]) === stage,
                        );
                        if (stage === 6) {
                            await driver.command("key 36");
                            await waitFor(
                                "state",
                                (value) => Number(value.split("|")[1]) === 0,
                            );
                            await driver.command("mouse 101");
                            await waitFor("dropped", (value) => value === "1");
                            await driver.command("mouseChoice 6");
                            await waitFor(
                                "state",
                                (value) => Number(value.split("|")[1]) === 6,
                            );
                        }
                        if (stage % 2 === 0) await driver.command("mouse 1");
                        else {
                            await driver.command("key 9");
                            await waitFor("focus", (value) => value === "1");
                            await driver.command("key 13");
                        }
                        await output.next(
                            new RegExp(
                                "^EVENT " +
                                    stage +
                                    " save " +
                                    (stage % 2 === 0) +
                                    " " +
                                    stage +
                                    " ",
                            ),
                        );
                        await output.next(
                            new RegExp(
                                "^SAVED " +
                                    stage +
                                    " " +
                                    (stage % 2 === 0) +
                                    " " +
                                    stage +
                                    "$",
                            ),
                        );
                    } else {
                        if (stage === 7 || stage === 8) {
                            await driver.command("mouse 100"); // cancelled draft differs
                            await waitFor("state", (value) =>
                                value.startsWith("0|"),
                            );
                        }
                        if (stage === 9) await driver.command("close");
                        else if (stage === 10)
                            await driver.command("key 13"); // default Save
                        else if (stage === 8) await driver.command("mouse 2");
                        else await driver.command("key 27");
                        const type =
                            stage === 9
                                ? "close"
                                : stage === 10
                                  ? "save"
                                  : "cancel";
                        await output.next(
                            new RegExp("^EVENT " + stage + " " + type + " "),
                        );
                        await output.next(
                            new RegExp("^SAVED " + stage + " true 6$"),
                        );
                        if (stage === 10) await output.next(/^CAUGHT$/);
                    }
                    await output.next(new RegExp("^MICRO " + stage + "$"));
                }
                await output.next(/^EXIT /);
                const exit =
                    app.exitCode === null
                        ? await new Promise<number | null>((resolve) =>
                              app!.once("close", resolve),
                          )
                        : app.exitCode;
                assert.equal(exit, 0, output.stderr);
                assert.equal(
                    output.lines.filter((line) => line.startsWith("EVENT"))
                        .length,
                    0,
                );
            } finally {
                // Attempt both terminations even if one cleanup fails.
                try {
                    if (controller) await stop(controller);
                } finally {
                    try {
                        if (app) await stop(app);
                    } finally {
                        rmSync(directory, { recursive: true, force: true });
                    }
                }
            }
        },
    );
