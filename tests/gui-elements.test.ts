import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { compile } from "../src/compiler.js";
import { RuntimeBuilder, slot, failIf } from "../src/runtime/abi.js";
import { guiSystemCall } from "../src/runtime/gui-abi.js";
import { prependFunctionBuiltin } from "../src/runtime/function-builtin.js";
import { replaceImport } from "./helpers/native.js";
import {
    canRunGuiProbe,
    guiManagedSource,
    guiWrapper,
    guiProbe,
    probeProgram,
    runGuiProbe,
} from "./helpers/gui-native.js";
import { withNativeTarget } from "../src/backend/machine/context.js";
import { guiRenderProgram } from "./helpers/gui-render-native.js";
import { linkHost } from "./helpers/program.js";

function managed() {
    let failure = 0,
        poller: any,
        current: Uint32Array | null = null;
    const calls: Uint32Array[] = [];
    const context: any = {
        TextEncoder,
        process: { execPath: "/app/bin/demo" },
        performance: { now: () => 0 },
        __nonaGui(buffer: Uint32Array) {
            calls.push(buffer.slice());
            if (failure) {
                const code = failure;
                failure = 0;
                return code;
            }
            if (buffer[0] === 1) {
                buffer[1] = 0;
                buffer[2] = 1;
            }
            if (buffer[0] === 6) current = buffer.slice();
            return 0;
        },
        __nonaIoLoop(value: unknown) {
            poller = value;
        },
    };
    runInNewContext(
        guiManagedSource +
            "\nglobalThis.api = {Window, Element, state, scene, deviceBounds};",
        context,
    );
    return {
        ...context.api,
        calls,
        get current() {
            return current;
        },
        get poller() {
            return poller;
        },
        fail() {
            failure = -6;
        },
    };
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

test("GUI typed properties and drawing snapshots reject malformed updates before native work", () => {
    const m = managed(),
        E = m.Element;
    const commands = [
        { op: "fillRect", x: 1, y: 2, width: 3, height: 4, color: "#123456" },
    ];
    const e = new E("drawing", { commands });
    commands[0]!.width = 900;
    assert.equal(e.properties.commands[0].width, 3);
    assert.ok(Object.isFrozen(e.properties));
    assert.ok(Object.isFrozen(e.properties.commands[0]));
    for (const patch of [
        { width: NaN },
        { height: Infinity },
        { width: -1 },
        { padding: [1, 2] },
        { clip: 1 },
        { background: "red" },
        { align: "baseline" },
        { unknown: 1 },
        { minWidth: 20, maxWidth: 10 },
        { commands: [{ op: "javascript" }] },
        {
            commands: [
                { op: "circle", x: 1, y: 2, radius: -1, color: "#ffffff" },
            ],
        },
    ])
        assert.throws(() => e.update(patch));
    assert.throws(() => new E("button"));
    assert.throws(() => new E("image", { text: "wrong kind" }));
    assert.throws(() => new E("text", { fontSize: 0 }));
    assert.throws(() => new E("text", { text: "NUL\0" }));
    assert.throws(() => new E("text", {}, [e]));
    assert.equal(m.calls.length, 0);
});

test("GUI ownership, cycles, IDs, explicit subtree disposal and window disposal include detached elements", () => {
    const m = managed(),
        E = m.Element,
        leaf = new E("text", { text: "hello" }),
        root = new E("column", {}, [leaf]);
    const a = new m.Window(),
        b = new m.Window();
    a.setRoot(root);
    assert.throws(() => root.setChildren([root]), /cycle|attached/);
    assert.throws(() => root.setChildren([leaf, leaf]), /duplicate/);
    assert.throws(() => b.setRoot(root), /attached/);
    root.setChildren([]);
    assert.throws(() => b.setRoot(leaf), /another window/);
    root.setChildren([leaf]);
    const id = leaf.id;
    root.setChildren([]);
    root.setChildren([leaf]);
    assert.equal(leaf.id, id);
    leaf.dispose();
    leaf.dispose();
    assert.equal(root.children.length, 0);
    assert.equal(leaf.disposed, true);
    assert.equal(leaf.id, id);
    assert.throws(() => leaf.update({ text: "dead" }), /disposed/);
    assert.throws(() => root.setChildren([leaf]), /disposed/);
    const detached = new E("stack");
    root.setChildren([detached]);
    root.setChildren([]);
    a.dispose();
    assert.equal(root.disposed, true);
    assert.equal(detached.disposed, true);
    assert.throws(() => a.setRoot(null), /disposed/);
});

test("GUI native failure rolls back property, child, root and disposal transactions", () => {
    const m = managed(),
        E = m.Element,
        first = new E("text", { text: "old" }),
        root = new E("column", {}, [first]);
    const window = new m.Window();
    window.setRoot(root).open();
    const nativeBefore = m.current;
    m.fail();
    assert.throws(() => first.update({ text: "new" }), /scene update/);
    assert.equal(first.properties.text, "old");
    assert.equal(m.current, nativeBefore);
    const child = new E("text", { text: "new child" });
    m.fail();
    assert.throws(() => root.setChildren([child]));
    assert.equal(root.children[0], first);
    assert.equal(m.state(child).owner, null);
    m.fail();
    assert.throws(() => window.setRoot(child));
    assert.equal(window.root, root);
    assert.equal(m.state(root).root, window);
    m.fail();
    assert.throws(() => first.dispose());
    assert.equal(first.disposed, false);
    assert.equal(root.children[0], first);
    first.update({ text: "success" });
    assert.equal(first.properties.text, "success");
    window.close();
    window.open();
    assert.equal(window.root, root);
    window.dispose();
});

test("GUI tree depth/capacity and padding holes reject without changing existing children", () => {
    const m = managed(),
        E = m.Element;
    let chain = new E("stack");
    for (let i = 0; i < 64; i++) chain = new E("stack", {}, [chain]);
    assert.throws(() => new E("stack", {}, [chain]), /depth/);
    const root = new E("column"),
        tooMany: any[] = [];
    for (let i = 0; i < 4096; i++) tooMany.push(new E("text"));
    assert.throws(() => root.setChildren(tooMany), /capacity/);
    assert.equal(root.children.length, 0);
    assert.throws(() => root.update({ padding: new Array(4) }));
    root.setChildren([tooMany[0]]);
    const snapshot = root.children;
    snapshot.length = 0;
    assert.equal(root.children.length, 1);
});

function fixtureTree(E: any) {
    return new E(
        "column",
        {
            padding: 8,
            gap: 4,
            align: "stretch",
            scroll: true,
            scrollY: 6,
            background: "#ffffff",
        },
        [
            new E("row", { height: 24, gap: 4, align: "center" }, [
                new E("text", {
                    width: 40,
                    height: 16,
                    text: "Nona",
                    font: "assets/Abel-Regular.ttf",
                    fontFamily: "Abel",
                }),
                new E("drawing", {
                    width: "fill",
                    height: 20,
                    commands: [
                        {
                            op: "circle",
                            x: 4,
                            y: 4,
                            radius: 3,
                            color: "#ff0000",
                        },
                    ],
                }),
            ]),
            new E(
                "stack",
                { height: 72, width: "fill", clip: true, radius: 4 },
                [
                    new E("image", {
                        x: 2,
                        y: 3,
                        width: 32,
                        height: 16,
                        src: "assets/pixels.png",
                        imageFit: "cover",
                    }),
                    new E("drawing", { x: -3, y: -2, width: 20, height: 20 }),
                ],
            ),
        ],
    );
}
test("GUI deterministic layout, scrolling, clipping, resize and device coverage match owned fixtures", () => {
    const m = managed(),
        root = fixtureTree(m.Element);
    const expected = JSON.parse(
        readFileSync("tests/fixtures/gui/layout.json", "utf8"),
    );
    for (const [width, height] of [
        [200, 120],
        [240, 160],
    ]) {
        const result = m.scene(root, width, height);
        const bounds = result.bounds.map(({ element, ...rect }: any) => ({
            kind: element.kind,
            ...rect,
        }));
        assert.deepEqual(json(bounds), expected[width!]);
        const clips = result.commands
            .filter((c: any) => c.op === 3)
            .map((c: any) => c.args);
        assert.equal(clips.length, 6);
        assert.deepEqual(json(clips[0]), [0, 0, width, height, 0]);
        assert.deepEqual(json(clips[3]), [8, 30, width! - 16, 72, 4]);
    }
    assert.deepEqual(
        json(
            m.deviceBounds(
                { x: -0.25, y: 0.25, width: 10.5, height: 4.5 },
                1.5,
            ),
        ),
        { x: -1, y: 0, width: 17, height: 8 },
    );
    assert.throws(() => m.deviceBounds({}, 0));
    const window = new m.Window({ width: 200, height: 120 });
    window.setRoot(root).open();
    const bytes = new Uint8Array(m.current!.buffer);
    const decoded = new TextDecoder().decode(bytes);
    assert.ok(decoded.includes("/app/bin/assets/Abel-Regular.ttf\0"));
    assert.ok(decoded.includes("/app/bin/assets/pixels.png\0"));
    window.dispose();
});

for (const gcStress of [false, true])
    test(
        `GUI compiled retained scene, native replay and cleanup (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const source = `${guiWrapper}
let loop; globalThis.__nonaIoLoop = p => {loop=p;};
const text = new Element('text',{text:'Nona',font:'Abel-Regular.ttf',fontFamily:'Abel',height:24});
const image = new Element('image',{src:'pixels.png',width:16,height:16});
const art = new Element('drawing',{width:40,height:40,commands:[{op:'fillRect',x:1,y:2,width:5,height:7,radius:2,color:'#ff0000'},{op:'strokeRect',x:2,y:3,width:8,height:9,lineWidth:1,color:'#000000'},{op:'line',x1:0,y1:0,x2:12,y2:4,color:'#00ff00'},{op:'circle',x:5,y:6,radius:3,color:'#0000ff'}]});
const root = new Element('column',{padding:4,clip:true},[text,image,art]);
const w = new Window({width:320,height:240,onEvent(e){if(e.type==='resize')console.log('resized',root.bounds.width===e.width);}});w.setRoot(root).open();
const id=text.id;text.update({text:'updated'});root.setChildren([art]);
image.dispose();text.dispose();
loop.poll(0);loop.run();
console.log(id===text.id,text.disposed,image.disposed,art.bounds.width);
w.close();w.open();w.dispose();
console.log(root.disposed,art.disposed,globalThis.guiStat(8)===globalThis.guiStat(10),globalThis.guiStat(10)===globalThis.guiStat(11),globalThis.guiStat(9)===globalThis.guiStat(8)+globalThis.guiStat(19),globalThis.guiStat(13),globalThis.guiStat(12)>0,globalThis.guiStat(20)===globalThis.guiStat(21));
`;
            const run = runGuiProbe(
                guiProbe(source, gcStress, {
                    render: true,
                    drawOnIteration: true,
                }),
            );
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr);
            assert.equal(
                run.stdout.replaceAll("\r", ""),
                "resized true\ntrue true true 40\ntrue true true true true 2 true true\n",
            );
        },
    );

for (const gcStress of [false, true])
    test(
        `GUI native packet rejects invalid extents, strings and save stacks before graphics allocation (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const run = runGuiProbe(
                guiProbe(
                    `
const raw=globalThis.guiNative, p=new Uint32Array(256), bytes=new Uint8Array(p.buffer), view=new DataView(p.buffer);
p[0]=1;p[3]=64;p[4]=64;console.log(raw(p));
p[0]=6;p[10]=16385;p[11]=p.byteLength;console.log(raw(p));
p[10]=2;p[160]=1;p[192]=2;view.setFloat64(648,Infinity,true);console.log(raw(p));
view.setFloat64(648,0,true);p[161]=1023;bytes[1023]=65;console.log(raw(p));
p[161]=0;p[160]=2;console.log(raw(p));
p[160]=1;p[192]=1;console.log(raw(p));
console.log(globalThis.guiStat(8));p[0]=2;console.log(raw(p));
`,
                    gcStress,
                    { render: true },
                ),
            );
            assert.equal(run.status, 0, run.stderr);
            assert.equal(
                run.stdout.replaceAll("\r", ""),
                "0\n-3\n-3\n-3\n-3\n-3\n0\n0\n",
            );
        },
    );

for (const gcStress of [false, true])
    test(
        `GUI failed native asset update keeps committed scene and frees candidate resources (GC stress ${gcStress})`,
        { skip: !canRunGuiProbe },
        () => {
            const run = runGuiProbe(
                guiProbe(
                    `${guiWrapper}
globalThis.__nonaIoLoop = () => {};
const leaf=new Element('drawing',{width:10,height:10});const root=new Element('column',{},[leaf]);
const w=new Window();w.setRoot(root).open();
const bad=new Element('image',{src:'missing.png',width:5,height:5});
try {root.setChildren([bad]);} catch(e) {console.log(e.message.includes('-6'));}
console.log(root.children[0]===leaf,bad.disposed,globalThis.guiStat(14));
w.dispose();bad.dispose();
console.log(globalThis.guiStat(8),globalThis.guiStat(10),globalThis.guiStat(11),globalThis.guiStat(9));
const other=new Window();const badRoot=new Element('image',{src:'missing.png',width:5,height:5});other.setRoot(badRoot);
try {other.open();} catch(e) {console.log('initial',!other.isOpen,!badRoot.disposed,globalThis.guiStat(0),globalThis.guiStat(1));}
other.dispose();
`,
                    gcStress,
                    { render: true, failImage: true },
                ),
            );
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr);
            assert.equal(
                run.stdout.replaceAll("\r", ""),
                "true\ntrue false 1\n2 2 2 3\ninitial true true 2 2\n",
            );
        },
    );

test(
    "GUI mixed scalar ABI independently marshals GP/FP registers, stack doubles and floating return",
    { skip: !canRunGuiProbe },
    () => {
        const program = probeProgram(
                "console.log(globalThis.guiMixed());",
                true,
            ),
            b = new RuntimeBuilder();
        b.bundle = program;
        withNativeTarget("linux-x64", () =>
            guiSystemCall(b, "gui-test", "mixed", "pddpddp"),
        );
        const values = new Float64Array([1.25, -2.5, 3.75, 4.5, 10.25]);
        b.data("gui.test.fp", new Uint8Array(values.buffer));
        prependFunctionBuiltin(
            b,
            "gui.test.mixed",
            "guiMixed",
            0,
            "rt.globalObject",
        );
        b.fn("gui.test.mixed.code", 88, (a) => {
            a.store(slot(64), "rcx");
            a.mov("rcx", 11);
            a.movsd("xmm1", { rip: "gui.test.fp" });
            a.movsd("xmm2", { rip: "gui.test.fp", addend: 8 });
            a.mov("r9", 22);
            for (const [i, at] of [16, 24].entries()) {
                a.load("rax", { rip: "gui.test.fp", addend: at });
                a.store(slot(32 + i * 8), "rax");
            }
            a.mov("rax", 33);
            a.store(slot(48), "rax");
            a.call("gui.abi.mixed");
            a.load("rcx", slot(64));
            a.mov("rax", 3);
            a.store({ base: "rcx" }, "rax");
            a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        });
        b.fn("gui.test.mixed.sysv", 40, (a) => {
            a.cmp("rax", 4);
            failIf(a, "ne");
            for (const [reg, value] of [
                ["rdi", 11],
                ["rsi", 22],
                ["rdx", 33],
            ] as const) {
                a.cmp(reg, value);
                failIf(a, "ne");
            }
            for (const [i, reg] of (
                ["xmm0", "xmm1", "xmm2", "xmm3"] as const
            ).entries()) {
                a.ucomisd(reg, { rip: "gui.test.fp", addend: i * 8 });
                failIf(a, "ne");
            }
            a.mov("rax", "rsp");
            a.and("rax", 15);
            a.cmp("rax", 0);
            failIf(a, "ne");
            a.movsd("xmm0", { rip: "gui.test.fp", addend: 32 });
        });
        replaceImport(program, "gui.import.mixed", "gui.test.mixed.sysv");
        const run = runGuiProbe(program);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout.trim(), "10.25");
    },
);

test("GUI pinned font identity and retained fixture compile in both GC modes", () => {
    assert.equal(
        createHash("sha256")
            .update(readFileSync("tests/fixtures/gui/Abel-Regular.ttf"))
            .digest("hex"),
        "8809dcad25318225052f88333e208c5aad4adcb7b2c934c135735ec19aa410b4",
    );
    const fileName = resolve("tests/fixtures/gui/retained.mjs");
    for (const gcStress of [false, true]) {
        const result = compile(readFileSync(fileName, "utf8"), {
            fileName,
            target: "linux-x64",
            gcStress,
        });
        assert.ok(result.ok, JSON.stringify(result));
        const captureImage = linkHost(
            guiRenderProgram(
                guiWrapper + "\nglobalThis.guiCapture(0);",
                gcStress,
            ),
            "linux-x64",
        );
        assert.deepEqual(
            Array.from(captureImage.slice(0, 4)),
            [127, 69, 76, 70],
        );
    }
});

for (const gcStress of [false, true])
    test(
        `GUI real Cairo rendered pixels, local assets and rollback at scales 1/2 (GC stress ${gcStress})`,
        {
            skip:
                process.platform !== "linux" ||
                process.arch !== "x64" ||
                process.env.NONA_GTK_GUI_TESTS !== "1",
        },
        () => {
            const pixels = JSON.parse(
                readFileSync("tests/fixtures/gui/pixels.json", "utf8"),
            );
            const source = `${guiWrapper}
const cap=globalThis.guiCapture,pixel=globalThis.guiPixel;
const label=new Element('text',{x:4,y:44,width:56,height:16,text:'Nona',font:${JSON.stringify(resolve("tests/fixtures/gui/Abel-Regular.ttf"))},fontFamily:'Abel',fontSize:12,lineHeight:14});
const image=new Element('image',{x:40,y:8,width:16,height:16,src:${JSON.stringify(resolve("tests/fixtures/gui/pixels.png"))},imageFit:'stretch'});
const art=new Element('drawing',{x:8,y:8,width:32,height:32,commands:[{op:'fillRect',x:-4,y:-4,width:40,height:40,color:'#ff0000'},{op:'circle',x:16,y:16,radius:8,color:'#00ff00'}]});
const root=new Element('stack',{background:'#ffffff',clip:true},[art,image,label]);
const w=new Window({width:64,height:64});w.setRoot(root).open();
const points=${JSON.stringify(pixels.points)};
for(const scale of [1,2]) {cap(scale);console.log(points.map(p=>pixel((p[1]*scale)*64*scale+p[0]*scale).toString(16)).join(','));const ink=pixel(-1);console.log('font',ink>10*scale*scale,ink<300*scale*scale);}
try {label.update({font:'/nonexistent-nona-font.ttf'});} catch(e) {console.log('font rollback',label.properties.font.includes('Abel-Regular.ttf'));}
try {image.update({src:'/nonexistent-nona-image.png'});} catch(e) {console.log('image rollback',image.properties.src.includes('pixels.png'));}
art.update({commands:[{op:'fillRect',x:0,y:0,width:32,height:32,color:'#0000ff'}]});cap(1);console.log('update',pixel(9*64+9).toString(16));
root.setChildren([image,label]);art.dispose();cap(1);console.log('remove',pixel(9*64+9).toString(16));
w.close();w.open();cap(2);console.log('reopen',pixel(-1)>40);w.dispose();cap(0);
`;
            const run = runGuiProbe(guiRenderProgram(source, gcStress));
            assert.equal(run.error, undefined);
            assert.equal(run.status, 0, run.stderr);
            const expected = pixels.argb.join(",") + "\nfont true true\n";
            assert.equal(
                run.stdout,
                expected +
                    expected +
                    "font rollback true\nimage rollback true\nupdate ff0000ff\nremove ffffffff\nreopen true\n",
            );
        },
    );
