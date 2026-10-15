import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compile } from "../src/compiler.js";

// FinalizationRegistry (src/lib/runtime/finalization-registry.js over the
// native cell of weak-ref.ts).
function expectOracle(source: string): void {
    const expected = runOracle(source).stdout;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
}

test("FinalizationRegistry constructor and prototype match Node.js", () =>
    expectOracle(`
var d = function (o, k) { var x = Object.getOwnPropertyDescriptor(o, k); return [typeof x.value, x.writable, x.enumerable, x.configurable].join(); };
var F = FinalizationRegistry, P = F.prototype;
console.log(typeof F, F.length, F.name, d(globalThis, "FinalizationRegistry"), d(F, "prototype"));
console.log(Object.getPrototypeOf(F) === Function.prototype, Object.getPrototypeOf(P) === Object.prototype);
console.log(P.constructor === F, d(P, "constructor"), d(P, "register"), d(P, "unregister"));
console.log(P.register.length, P.register.name, P.unregister.length, P.unregister.name, "prototype" in P.register, "prototype" in P.unregister);
console.log(Object.getOwnPropertyNames(P).sort().join(), "cleanupSome" in P);
var tag = Object.getOwnPropertyDescriptor(P, Symbol.toStringTag);
console.log(tag.value, tag.writable, tag.enumerable, tag.configurable, Object.prototype.toString.call(P));
var r = new F(function () {});
console.log(Object.prototype.toString.call(r), typeof r, Object.keys(r).length, r instanceof F, Object.getPrototypeOf(r) === P);
try { new P.register(); } catch (e) { console.log(e.constructor === TypeError); }
try { new P.unregister(); } catch (e) { console.log(e.constructor === TypeError); }
`));

test("FinalizationRegistry rejects bad calls, callbacks, targets, tokens and receivers", () =>
    expectOracle(`
var t = function (f) { try { var v = f(); console.log("no error", v); } catch (e) { console.log(e.constructor === TypeError); } };
t(function () { FinalizationRegistry(function () {}); });
t(function () { FinalizationRegistry(); });
[undefined, null, 1, "s", {}, Symbol("x"), 1n].forEach(function (v) { t(function () { new FinalizationRegistry(v); }); });
t(function () { new FinalizationRegistry(); });
var r = new FinalizationRegistry(function () {}), o = {};
[undefined, null, 1, "s", true, 1n].forEach(function (v) { t(function () { r.register(v, 1); }); });
t(function () { r.register(); });
t(function () { r.register(o, o); });
t(function () { r.register(o, o, {}); });
[null, 1, "s", true, 1n].forEach(function (v) { t(function () { r.register(o, 1, v); }); });
t(function () { return r.register(o, 1, undefined); });
t(function () { return r.register(o); });
[undefined, null, 1, "s", true, 1n].forEach(function (v) { t(function () { r.unregister(v); }); });
t(function () { r.unregister(); });
var reg = FinalizationRegistry.prototype.register, unreg = FinalizationRegistry.prototype.unregister;
[undefined, null, 1, {}, new WeakMap(), new WeakRef(o), FinalizationRegistry.prototype].forEach(function (v) {
    t(function () { reg.call(v, o, 1); });
    t(function () { unreg.call(v, o); });
});
// The receiver check comes before the argument checks.
t(function () { reg.call({}, 1, 1); });
`));

test("FinalizationRegistry register and unregister return values", () =>
    expectOracle(`
var a = new FinalizationRegistry(function () {}), b = new FinalizationRegistry(function () {});
var o1 = {}, o2 = {}, f = function () {}, token = {}, other = {}, shared = {};
console.log(a.register(o1, "one", token), a.register(o2, "two", token), a.register(f, o1, other), a.register(o1, undefined));
console.log(a.unregister(token), a.unregister(token), a.unregister(other), a.unregister({}), a.unregister(f));
// A target can be its own token, and a token is per registry.
console.log(a.register(o1, 1, o1), a.unregister(o1), a.unregister(o1));
a.register(o1, 1, shared); b.register(o2, 2, shared);
console.log(b.unregister(shared), a.unregister(shared), b.unregister(shared), a.unregister(shared));
a.register(o1, 1, shared); a.register(o1, 2, shared); a.register(o2, 3, shared);
console.log(a.unregister(shared), a.unregister(shared));
console.log(a.register(a, 1, a), a.unregister(a), a.register(o1, a, b), b.unregister(b), a.unregister(b));
`));

test("FinalizationRegistry subclasses and Reflect.construct", () =>
    expectOracle(`
class Registry extends FinalizationRegistry {
    constructor(cb) { super(cb); this.extra = 7; }
    track(o, v) { this.register(o, v, o); return this; }
}
var r = new Registry(function () {}), o = {};
console.log(r.extra, r instanceof Registry, r instanceof FinalizationRegistry, Object.getPrototypeOf(r) === Registry.prototype, Object.prototype.toString.call(r));
console.log(r.track(o, 1) === r, r.unregister(o), r.unregister(o));
try { class Bad extends FinalizationRegistry { constructor() { super(1); } } new Bad(); } catch (e) { console.log(e.constructor === TypeError); }
function N() {} N.prototype = Array.prototype;
var n = Reflect.construct(FinalizationRegistry, [function () {}], N);
console.log(Object.getPrototypeOf(n) === Array.prototype, FinalizationRegistry.prototype.register.call(n, o, 1, o), FinalizationRegistry.prototype.unregister.call(n, o));
N.prototype = 1;
console.log(Object.getPrototypeOf(Reflect.construct(FinalizationRegistry, [function () {}], N)) === FinalizationRegistry.prototype);
`));

test("FinalizationRegistry runs cleanup callbacks after a collection", () => {
    // Native only: Node.js collects on its own schedule. Under GC stress every
    // allocation collects, so a target only the registry holds dies as soon as
    // the job that registered it has ended; its callback runs from a later
    // event-loop turn.
    const run = runOnHost(`
var log = [], phase = "script";
var registry = new FinalizationRegistry(function (held) {
    "use strict";
    log.push(phase + ":" + held + ":" + (this === undefined));
});
var strong = { id: "strong" }, token = {}, ref = new WeakRef(strong);
registry.register({ id: 1 }, "lone");
registry.register(strong, "strong");
registry.register({ id: 2 }, "unregistered", token);
registry.register(function () {}, "function");
console.log(registry.unregister(token));
var other = new FinalizationRegistry(function (held) { log.push(phase + ":" + held.name); });
other.register({}, { name: "object" });
for (var i = 0; i < 20; i++) ({ i: i });
console.log("script", log.length);
Promise.resolve().then(function () {
    phase = "microtask";
    for (var i = 0; i < 20; i++) ({ i: i });
});
var turns = 0;
function tick() {
    phase = "turn" + turns;
    for (var i = 0; i < 20; i++) ({ i: i });
    if (++turns < 5) setTimeout(tick, 2);
    else {
        console.log(log.sort().join(" "));
        console.log(strong.id, ref.deref() === strong);
    }
}
setTimeout(tick, 2);
`);
    assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.split("\n");
    assert.equal(lines[0], "true");
    assert.equal(lines[1], "script 0");
    const entries = (lines[2] ?? "").split(" ");
    assert.deepEqual(entries.map((e) => e.replace(/^[^:]*:/, "")).sort(), [
        "function:true",
        "lone:true",
        "object",
    ]);
    // Never from the script or its microtask checkpoint.
    for (const entry of entries) assert.match(entry, /^turn\d:/);
    // Linked together, WeakRef and FinalizationRegistry share the native cell.
    assert.equal(lines[3], "strong true");
});

test("FinalizationRegistry cleanup does not keep the process alive and reports a throwing callback", () => {
    const quiet = runOnHost(`
var registry = new FinalizationRegistry(function () { console.log("cleanup"); });
registry.register({}, 1);
for (var i = 0; i < 20; i++) ({ i: i });
console.log("done");
`);
    assert.equal(quiet.status, 0, quiet.stderr);
    assert.equal(quiet.stdout, "done\n");
    const throwing = runOnHost(`
process.on("uncaughtException", function (e) { console.log("caught", e.message); });
var calls = 0;
var registry = new FinalizationRegistry(function (held) {
    calls++;
    throw new Error("boom " + held);
});
registry.register({}, 1);
registry.register({}, 2);
var turns = 0;
function tick() {
    for (var i = 0; i < 20; i++) ({ i: i });
    if (++turns < 8) setTimeout(tick, 2);
    else console.log("calls", calls);
}
setTimeout(tick, 2);
`);
    assert.equal(throwing.status, 0, throwing.stderr);
    const lines = throwing.stdout.trim().split("\n");
    assert.deepEqual(lines.slice(0, 2).sort(), [
        "caught boom 1",
        "caught boom 2",
    ]);
    assert.equal(lines[2], "calls 2");
    const fatal = runOnHost(`
var registry = new FinalizationRegistry(function () { throw new Error("fatal cleanup"); });
registry.register({}, 1);
setTimeout(function () { for (var i = 0; i < 20; i++) ({ i: i }); setTimeout(function () {}, 20); }, 2);
`);
    // Like an uncaught exception from a timer callback.
    assert.notEqual(fatal.status, 0);
    assert.match(fatal.stderr, /error/i);
});

test("FinalizationRegistry callbacks run under memory pressure", () => {
    // Without GC stress: each target owns 1 MiB, so keeping them would need
    // 200 MiB; the callbacks report the collected ones.
    const run = runOnHost(
        `
var cleaned = 0, count = 200;
var registry = new FinalizationRegistry(function (held) { if (typeof held === "number") cleaned++; });
function step(i) {
    if (i === count) {
        setTimeout(function () { console.log(cleaned > count / 2, cleaned <= count); }, 5);
        return;
    }
    registry.register({ buffer: new ArrayBuffer(1048576) }, i);
    setTimeout(function () { step(i + 1); }, 0);
}
step(0);
`,
        { gcStress: false },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "true true\n");
});

test("programs that do not name FinalizationRegistry link none of it", () => {
    const image = (source: string) => {
        const result = compile(source, {
            fileName: "size.js",
            target: "win32-x64",
        });
        if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
        return Buffer.from(result.image);
    };
    const marker = (text: string) => Buffer.from(text, "utf16le");
    const gcCount = marker("__nonaGcCount"),
        prelude = marker("target and holdings must not be same"),
        target = marker("__nonaWeakRefTarget");
    const plain = image('console.log("hi")'),
        weak = image('console.log("hi", typeof WeakRef)'),
        registry = image('console.log("hi", typeof FinalizationRegistry)');
    for (const m of [gcCount, prelude, target])
        assert.equal(plain.includes(m), false);
    assert.equal(weak.includes(gcCount), false);
    assert.equal(weak.includes(prelude), false);
    assert.equal(weak.includes(target), true);
    for (const m of [gcCount, prelude, target])
        assert.equal(registry.includes(m), true);
    assert.ok(registry.length > plain.length);
});
