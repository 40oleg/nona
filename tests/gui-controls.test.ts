import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
    guiManagedSource,
    guiWrapper,
    canRunGuiProbe,
    runGuiProbe,
} from "./helpers/gui-native.js";
import { guiControlProbe } from "./helpers/gui-controls-native.js";
import { compile } from "../src/compiler.js";
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

function managed() {
    let poller: any,
        generation = 0;
    const events: {
        code: number;
        id?: number;
        epoch?: number;
        text?: string;
        value?: number;
        request?: number;
        revision?: number;
    }[] = [];
    const calls: Uint32Array[] = [];
    const context: any = {
        TextEncoder,
        TextDecoder,
        process: { execPath: "/app/demo" },
        performance: { now: () => 0 },
        __nonaIoLoop(p: any) {
            poller = p;
        },
        __nonaGui(p: Uint32Array) {
            calls.push(p.slice());
            if (p[0] === 1) {
                p[1] = 0;
                p[2] = ++generation;
            }
            if (p[0] !== 3 || !events.length) return 0;
            const e = events.shift()!;
            p[1] = 0;
            p[2] = generation;
            p[6] = e.code;
            p[10] = e.id || 0;
            p[11] = e.epoch || 1;
            p[12] = e.value || 0;
            p[9] = e.revision || 1;
            p[15] = e.request || 0;
            const bytes = new TextEncoder().encode(e.text || "");
            p[14] = bytes.length;
            new Uint8Array(p.buffer).set(bytes, 64);
            return 1;
        },
    };
    runInNewContext(
        guiManagedSource + "\nglobalThis.api = {Window, Element, state};",
        context,
    );
    return {
        ...context.api,
        calls,
        events,
        get poller() {
            return poller;
        },
        drain() {
            if (poller.poll(0)) poller.run();
        },
    };
}

test("GUI controls deliver copied Unicode state before listeners and invalidate detached events", () => {
    const m = managed(),
        e = new m.Element("entry", {
            text: "old",
            accessibleName: "Service name",
        });
    const w = new m.Window().setRoot(e).open(),
        seen: string[] = [];
    e.on("input", (event: any) =>
        seen.push(event.text + ":" + e.properties.text),
    );
    m.events.push({ code: 5, id: e.id, text: "日本語 e\u0301 🐈" });
    m.drain();
    assert.deepEqual(seen, ["日本語 e\u0301 🐈:日本語 e\u0301 🐈"]);
    m.events.push({ code: 5, id: e.id, text: "late" });
    assert.equal(m.poller.poll(0), 1);
    w.setRoot(null);
    w.setRoot(e);
    m.poller.run();
    assert.equal(seen.length, 1);
    w.dispose();
});

test("GUI toggle events update state, listener removal and disposal stop delivery", () => {
    const m = managed(),
        e = new m.Element("toggle", { text: "Enabled", checked: false });
    const w = new m.Window().setRoot(e).open();
    let n = 0;
    const off = e.on("change", () => {
        assert.equal(e.properties.checked, true);
        n++;
    });
    m.events.push({ code: 6, id: e.id, value: 1 });
    m.drain();
    off();
    m.events.push({ code: 6, id: e.id });
    m.drain();
    assert.equal(n, 1);
    assert.equal(e.properties.checked, false);
    e.dispose();
    m.events.push({ code: 6, id: e.id, value: 1 });
    m.drain();
    assert.equal(n, 1);
    w.dispose();
});

for (const taken of [false, true])
    test(`GUI toggle captions preserve ${taken ? "taken" : "queued"} changes while checked updates replace state`, () => {
        const m = managed(),
            toggle = new m.Element("toggle", {
                text: "Enabled",
                checked: false,
            }),
            w = new m.Window().setRoot(toggle).open(),
            seen: boolean[] = [];
        toggle.on("change", (event: any) => {
            assert.equal(event.checked, toggle.properties.checked);
            seen.push(event.checked);
        });
        const deliver = () => {
            if (taken) m.poller.run();
            else m.drain();
        };
        m.events.push({ code: 6, id: toggle.id, value: 1, revision: 1 });
        if (taken) assert.equal(m.poller.poll(0), 1);
        toggle.update({ text: "New caption" });
        deliver();
        assert.deepEqual(seen, [true]);
        assert.equal(toggle.properties.text, "New caption");
        assert.equal(toggle.properties.checked, true);

        m.events.push({ code: 6, id: toggle.id, value: 0, revision: 1 });
        if (taken) assert.equal(m.poller.poll(0), 1);
        // Even an explicit write of the current value supersedes queued input.
        toggle.update({ checked: true });
        deliver();
        assert.deepEqual(seen, [true]);
        assert.equal(toggle.properties.checked, true);
        m.events.push({ code: 6, id: toggle.id, value: 0, revision: 2 });
        m.drain();
        assert.deepEqual(seen, [true, false]);
        assert.equal(toggle.properties.checked, false);
        w.dispose();
    });

test("GUI state revisions and disposal invalidate already-taken input", () => {
    const m = managed(),
        entry = new m.Element("entry", { text: "initial" }),
        w = new m.Window().setRoot(entry).open();
    let inputs = 0;
    entry.on("input", () => inputs++);
    m.events.push({
        code: 5,
        id: entry.id,
        text: "old native text",
        revision: 1,
    });
    assert.equal(m.poller.poll(0), 1);
    entry.update({ text: "application text" });
    m.poller.run();
    assert.equal(entry.properties.text, "application text");
    assert.equal(inputs, 0);
    m.events.push({ code: 5, id: entry.id, text: "current", revision: 2 });
    m.drain();
    assert.equal(entry.properties.text, "current");
    assert.equal(inputs, 1);
    m.events.push({
        code: 5,
        id: entry.id,
        text: "after disposal",
        revision: 2,
    });
    assert.equal(m.poller.poll(0), 1);
    w.dispose();
    m.poller.run();
    assert.equal(inputs, 1);
    assert.equal(m.poller.total(), 0);
});

test("GUI listeners observe FIFO snapshots and honor removal/disposal during delivery", () => {
    const m = managed(),
        e = new m.Element("entry"),
        w = new m.Window().setRoot(e).open(),
        seen: string[] = [];
    let off = () => {};
    e.on("input", (event: any) => {
        seen.push(event.text);
        off();
        if (event.text === "second") w.dispose();
    });
    off = e.on("input", () => seen.push("removed"));
    e.on("input", () => seen.push("observer"));
    m.events.push(
        { code: 5, id: e.id, text: "first" },
        { code: 5, id: e.id, text: "second" },
    );
    m.drain();
    m.drain();
    assert.deepEqual(seen, ["first", "observer", "second"]);
});

test("GUI chooser stays referenced through late cancellation and settles across parent reopen", async () => {
    const m = managed(),
        w = new m.Window().open();
    const chosen = w.chooseFolder({
        title: "Choose workspace",
        initialFolder: "/tmp",
    });
    const request = m.calls.at(-1)![15]!;
    assert.equal(m.poller.total(), 2);
    m.events.push({ code: 20, request, text: "/tmp/日本語" });
    m.drain();
    assert.equal(await chosen, "/tmp/日本語");
    assert.equal(m.poller.total(), 1);
    const cancelled = w.chooseFolder();
    const late = m.calls.at(-1)![15]!;
    w.close();
    w.open();
    m.events.push({ code: 20, request: late, text: "/must/not/deliver" });
    m.drain();
    assert.equal(await cancelled, null);
    assert.equal(m.poller.total(), 1);
    const pending = w.chooseFolder();
    const last = m.calls.at(-1)![15]!;
    w.dispose();
    assert.equal(m.poller.active(), 1);
    m.events.push({ code: 20, request: last });
    m.drain();
    assert.equal(await pending, null);
    assert.equal(m.poller.total(), 0);
});

test("GUI chooser cancellation after native extraction overrides a selected path", async () => {
    const m = managed(),
        w = new m.Window().open();
    const selection = w.chooseFolder(),
        request = m.calls.at(-1)![15]!;
    m.events.push({ code: 20, request, text: "/selected" });
    assert.equal(m.poller.poll(0), 1);
    w.cancelFolder();
    assert.equal(m.poller.active(), 2);
    m.poller.run();
    assert.equal(await selection, null);
    const failure = w.chooseFolder(),
        failed = m.calls.at(-1)![15]!;
    const rejected = assert.rejects(failure, /folder selection failed/);
    m.events.push({ code: 20, request: failed, value: 2 });
    m.drain();
    await rejected;
    w.dispose();
    assert.equal(m.poller.total(), 0);
});

test("GUI controls validate kinds, native roles, entry limits and shortcuts before native work", () => {
    const m = managed();
    assert.throws(() => new m.Element("entry", { checked: true }));
    assert.throws(() => new m.Element("button", { role: "textbox" }));
    assert.throws(() => new m.Element("entry", { text: "a".repeat(1025) }));
    const e = new m.Element("button", {
        text: "Run",
        role: "button",
        accessibleName: "Run service",
    });
    assert.throws(() => e.on("made-up", () => {}));
    const w = new m.Window();
    assert.throws(() => w.addShortcut(0, 0, () => {}));
    assert.equal(m.calls.length, 0);
});

test("GUI control viewport follows retained scroll/clip bounds without replacing entry generation", () => {
    const m = managed(),
        entry = new m.Element("entry", { x: 10, width: 100, height: 36 });
    const root = new m.Element(
        "stack",
        { width: 80, height: 50, padding: 5, scroll: true, scrollX: 20 },
        [entry],
    );
    const w = new m.Window().setRoot(root).open();
    function control() {
        const packet = m.calls.filter((p: Uint32Array) => p[0] === 6).at(-1)!;
        const view = new DataView(packet.buffer);
        for (let i = 0; i < packet[10]!; i++)
            if (view.getUint32(640 + i * 128, true) === 11)
                return Array.from({ length: 13 }, (_, j) =>
                    view.getFloat64(648 + i * 128 + j * 8, true),
                );
        throw new Error("entry missing");
    }
    assert.deepEqual(
        control().slice(1),
        [1, -5, 5, 100, 36, 0, 1, 1, 0, 5, 80, 36],
    );
    root.update({ scrollX: 25 });
    assert.deepEqual(
        control().slice(1),
        [1, -10, 5, 100, 36, 0, 1, 1, 0, 5, 80, 36],
    );
    w.dispose();
});

for (const stress of [false, true])
    test(
        `GUI executable controls, copied text, FIFO overflow, cleanup and late chooser (GC stress ${stress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
let loop;globalThis.__nonaIoLoop = p => {loop=p;};
const emit=globalThis.guiEmit,stat=globalThis.guiControlStat;
const entry=new Element('entry',{text:'before',accessibleName:'Service name'});
const button=new Element('button',{text:'Run'}),toggle=new Element('toggle',{text:'Enabled'});
const root=new Element('column',{},[entry,button,toggle]);
const w=new Window({onEvent(e){if(e.type==='overflow')console.log('overflow',e.dropped);}}).setRoot(root).open();
function drain(){for(let i=0;i<320;i++){if(!loop.poll(0))break;loop.run();}}
drain();let inputs=0;
entry.on('input',e=>{inputs++;if(inputs===1)console.log('input',e.text,entry.properties.text===e.text);});
button.on('activate',()=>console.log('activate'));
button.on('keydown',e=>console.log('key',e.keyval));
button.on('pointerdown',e=>console.log('pointer',e.button,e.x,e.y,e.modifiers));
button.on('focus',()=>console.log('focus'));button.on('blur',()=>console.log('blur'));
w.addShortcut(115,4,()=>console.log('shortcut'));
toggle.on('change',()=>console.log('toggle',toggle.properties.checked));
emit(1);emit(2);drain();
const sets=stat(8);root.update({gap:3});console.log('entry preserved',stat(8)===sets);
emit(3);emit(4);emit(5);emit(8);emit(6);emit(7);emit(9);drain();
for(let i=0;i<260;i++)emit(1);
// Drain the overflow burst at the native boundary; the Unicode/state delivery
// above already crosses the managed boundary with forced GC at allocations.
let received=0,dropped=0;for(let i=0;i<260;i++){command(3);scratch[5]=0;if(native(scratch)){if(scratch[6]===5)received++;if(scratch[6]===14)dropped=scratch[12];}}
console.log('overflow',dropped,'received',received,'text freed',stat(24)===stat(32));
emit(1);const freed=stat(32);w.close();console.log('close frees',stat(32)===freed+1);
w.open();drain();
w.chooseFolder().then(p=>console.log('folder',p));emit(21);drain();
w.chooseFolder().then(p=>console.log('cancel',p));w.close();w.open();console.log('pending',loop.total());emit(21);drain();
w.chooseFolder().then(p=>console.log('failure missing',p),e=>console.log('failure',e.message.includes('failed')));emit(22);drain();
w.chooseFolder().then(p=>console.log('disposed',p));w.dispose();console.log('retained',loop.total());emit(20);drain();console.log('drained',loop.total(),stat(48)>0);
`;
            const result = runGuiProbe(guiControlProbe(source, stress));
            assert.equal(result.error, undefined, result.stdout);
            assert.equal(result.status, 0, result.stderr + result.stdout);
            assert.equal(
                result.stdout,
                "input 日本語 é 🐈 true\nentry preserved true\ntoggle true\nactivate\nkey 65293\nactivate\npointer 1 12 7 4\nfocus\nblur\nshortcut\noverflow 4 received 256 text freed true\nclose frees true\npending 2\nretained 1\ndrained 0 true\nfolder /tmp/日本語\ncancel null\nfailure true\ndisposed null\n",
            );
        },
    );

for (const gcStress of [false, true]) {
    test(
        `GUI caption updates preserve queued native toggle state (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
let loop;globalThis.__nonaIoLoop=p=>{loop=p;};
const emit=globalThis.guiEmit,stat=globalThis.guiControlStat;
const toggle=new Element('toggle',{text:'Enabled',checked:false});
const w=new Window().setRoot(toggle).open();
function drain(){for(let i=0;i<10;i++){if(!loop.poll(0))break;loop.run();}}
drain();let changes=0;toggle.on('change',()=>changes++);
const sets=stat(16);emit(3);toggle.update({text:'New caption'});
console.log('caption preserves native state',stat(16)===sets);drain();
console.log('user change',changes,toggle.properties.checked,toggle.properties.text);
emit(3);toggle.update({checked:false});drain();
console.log('application state',changes,toggle.properties.checked,stat(16)===sets+1);
w.dispose();`;
            const run = runGuiProbe(guiControlProbe(source, gcStress));
            assert.equal(run.error, undefined, run.stdout);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(
                run.stdout,
                "caption preserves native state true\nuser change 1 true New caption\napplication state 1 false true\n",
            );
        },
    );
    test(
        `GUI passes empty and Unicode control text and accessible labels to GTK (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
globalThis.__nonaIoLoop=()=>{};
for(const kind of ['entry','button','toggle']){
    const control=new Element(kind),w=new Window().setRoot(control).open();
    control.update({text:'日本語 é 🐈',accessibleName:'Label 🐈'});
    control.update({text:'',accessibleName:''});
    w.dispose();
}
console.log('checked strings',globalThis.guiControlStat(80));`;
            const run = runGuiProbe(
                guiControlProbe(source, gcStress, {
                    controlStrings: Array.from({ length: 3 }, () => [
                        "",
                        "",
                        "日本語 é 🐈",
                        "Label 🐈",
                        "",
                        "",
                    ]).flat(),
                }),
            );
            assert.equal(run.error, undefined, run.stdout);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(run.stdout, "checked strings 18\n");
        },
    );
    test(
        `GUI failed graphics candidate cannot roll back live controls (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
let loop;globalThis.__nonaIoLoop=p=>{loop=p;};
function drain(){for(let i=0;i<10;i++)if(loop.poll(0))loop.run();}
const w=new Window().open();drain();
const entry=new Element('entry'),root=new Element('column',{},[entry]);w.setRoot(root);
entry.on('input',e=>console.log('usable',e.text));
const disconnects=globalThis.guiStat(2),sets=globalThis.guiControlStat(8);
try{root.setChildren([entry,new Element('image',{src:'/missing.png'})]);}catch(e){console.log('rollback',root.children.length===1,globalThis.guiStat(2)===disconnects,globalThis.guiControlStat(8)===sets);}
globalThis.guiEmit(1);drain();w.dispose();`;
            const run = runGuiProbe(
                guiControlProbe(source, gcStress, {
                    failImage: true,
                    poisonScene: true,
                }),
            );
            assert.equal(run.error, undefined, run.stdout);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(
                run.stdout,
                "rollback true true true\nusable 日本語 é 🐈\n",
            );
        },
    );
    test(
        `GUI native sibling reorder and insertion preserve entry state (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
globalThis.__nonaIoLoop=()=>{};
const stat=globalThis.guiControlStat,a=new Element('entry'),b=new Element('button');
const root=new Element('stack',{},[a,b]),w=new Window().setRoot(root).open();
const sets=stat(8);console.log('initial',stat(64));
root.setChildren([b,a]);console.log('reorder',stat(64));
root.setChildren([new Element('button'),b,a]);console.log('insert',stat(64),stat(72),stat(8)===sets);w.dispose();`;
            const run = runGuiProbe(guiControlProbe(source, gcStress));
            assert.equal(run.error, undefined, run.stdout);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(
                run.stdout,
                "initial 12\nreorder 1221\ninsert 1221421 102042 true\n",
            );
        },
    );
    test(
        `GUI independent window shortcuts survive another window's disposal and reopen (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
let loop;globalThis.__nonaIoLoop=p=>{loop=p;};
const emit=globalThis.guiEmit,a=new Window().open(),b=new Window().open();
a.addShortcut(115,4,()=>console.log('first'));
b.addShortcut(115,4,()=>console.log('second'));
function drain(){for(let i=0;i<20;i++)if(loop.poll(0))loop.run();}
drain();emit(9,a._session.slot);emit(9,b._session.slot);a.close();drain();
a.open();emit(9,a._session.slot);emit(9,b._session.slot);drain();
a.dispose();emit(9,b._session.slot);drain();b.dispose();console.log('empty',loop.total());`;
            const run = runGuiProbe(guiControlProbe(source, gcStress));
            assert.equal(run.error, undefined, run.stdout);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(
                run.stdout,
                "second\nfirst\nsecond\nsecond\nempty 0\n",
            );
        },
    );
    test(
        `GUI release events, stale state and terminal close survive input pressure (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
let loop;globalThis.__nonaIoLoop=p=>{loop=p;};
const emit=globalThis.guiEmit,stat=globalThis.guiControlStat;
const entry=new Element('entry'),button=new Element('button',{text:'Run'});
const w=new Window({onEvent(e){if(e.type==='close')console.log('closed');}}).setRoot(new Element('column',{},[entry,button])).open();
function drain(){for(let i=0;i<270;i++){if(!loop.poll(0))break;loop.run();}}
drain();let inputs=0;
entry.on('input',()=>inputs++);
button.on('keyup',e=>console.log('keyup',e.keyval));
button.on('pointerup',e=>console.log('pointerup',e.button,e.x,e.y));
emit(10);emit(11);emit(1);entry.update({text:'application'});drain();
console.log('state',inputs,entry.properties.text);
for(let i=0;i<260;i++)emit(1);
const copies=stat(24);emit(12);drain();
console.log('terminal',!w.isOpen,loop.total(),stat(32)===copies,inputs);
w.open();drain();w.dispose();`;
            const run = runGuiProbe(guiControlProbe(source, gcStress));
            assert.equal(run.error, undefined, run.stdout);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(
                run.stdout,
                "pointerup 1 12 7\nkeyup 65293\nstate 0 application\nclosed\nterminal true 0 true 0\n",
            );
        },
    );
    test(
        `GUI atomically replaces all 128 native controls (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            // Build one native scene without managed layout/string churn so
            // forcing a GC at every allocation remains a short, bounded probe.
            const source = `
const native=globalThis.guiNative,p=new Uint32Array(4257),v=new DataView(p.buffer);
p[0]=1;p[3]=640;p[4]=480;native(p);
p[0]=6;p[10]=128;p[11]=p.byteLength;
for(let i=0;i<128;i++){
 const r=640+i*128;
 v.setUint32(r,10,true);v.setUint32(r+4,17024,true);v.setUint32(r+120,17024,true);
 v.setFloat64(r+8,i+1,true);v.setFloat64(r+16,1,true);
 v.setFloat64(r+40,100,true);v.setFloat64(r+48,36,true);
 v.setFloat64(r+64,1,true);v.setFloat64(r+72,1,true);
 v.setFloat64(r+96,100,true);v.setFloat64(r+104,36,true);
}
console.log('initial',native(p));
for(let i=0;i<128;i++)v.setFloat64(648+i*128,i+129,true);
console.log('replacement',native(p));
p[0]=2;native(p);`;
            const run = runGuiProbe(guiControlProbe(source, gcStress));
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(run.stdout, "initial 0\nreplacement 0\n");
        },
    );
    test(
        `GUI failed first scene releases staged controls (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
globalThis.__nonaIoLoop = () => {};
const w=new Window().open(),entry=new Element('entry',{text:'preserved'});
try {w.setRoot(entry);} catch(e) {console.log('rollback',w.root===null,entry.properties.text==='preserved',globalThis.guiStat(21)===2);}
w.dispose();`;
            const run = runGuiProbe(
                guiControlProbe(source, gcStress, { failArea: true }),
            );
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr);
            assert.equal(run.stdout, "rollback true true true\n");
        },
    );
    test(`GUI input/chooser fixture cross-compiles (GC stress ${gcStress})`, () => {
        const result = compile(
            readFileSync("tests/fixtures/gui/controls.mjs", "utf8"),
            {
                fileName: resolve("tests/fixtures/gui/controls.mjs"),
                target: "linux-x64",
                gcStress,
            },
        );
        assert.ok(result.ok, JSON.stringify(result));
    });
    test(
        `GUI real GTK accessibility, Unicode, input and chooser (GC stress ${gcStress})`,
        {
            skip:
                process.platform !== "linux" ||
                process.arch !== "x64" ||
                process.env.NONA_GTK_INPUT_TESTS !== "1",
        },
        () => {
            const result = compile(
                readFileSync("tests/fixtures/gui/controls.mjs", "utf8"),
                {
                    fileName: resolve("tests/fixtures/gui/controls.mjs"),
                    target: "linux-x64",
                    gcStress,
                },
            );
            assert.ok(result.ok, JSON.stringify(result));
            mkdirSync("work", { recursive: true });
            const directory = mkdtempSync(resolve("work/gui-controls-")),
                binary = join(directory, "probe");
            // Keep backend-specific receipts with the workflow artifacts, including
            // failures. Only the temporary executable is removed.
            const evidence = resolve(
                "work/gui-evidence",
                "controls-" +
                    (process.env.GDK_BACKEND || "default") +
                    "-" +
                    (process.env.GDK_SCALE || "1") +
                    "-gc-" +
                    gcStress,
            );
            try {
                writeFileSync(binary, result.image);
                chmodSync(binary, 0o755);
                const run = spawnSync(
                    "python3",
                    [
                        resolve("tests/fixtures/gui/drive-controls.py"),
                        binary,
                        evidence,
                    ],
                    { encoding: "utf8", timeout: 180000 },
                );
                assert.equal(run.error, undefined);
                assert.equal(run.status, 0, run.stderr + run.stdout);
            } finally {
                assert.equal(resolve(directory, ".."), resolve("work"));
                rmSync(directory, { recursive: true, force: true });
            }
        },
    );
}
