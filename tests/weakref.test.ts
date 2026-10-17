import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compile } from "../src/compiler.js";

// WeakRef (src/lib/runtime/weakref.js over the native cell of weak-ref.ts).
function expectOracle(source: string): void {
    const expected = runOracle(source).stdout;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
}

test("WeakRef constructor and prototype match Node.js", () =>
    expectOracle(`
var d = function (o, k) { var x = Object.getOwnPropertyDescriptor(o, k); return [typeof x.value, x.writable, x.enumerable, x.configurable].join(); };
console.log(typeof WeakRef, WeakRef.length, WeakRef.name, d(globalThis, "WeakRef"), d(WeakRef, "prototype"));
console.log(Object.getPrototypeOf(WeakRef) === Function.prototype, Object.getPrototypeOf(WeakRef.prototype) === Object.prototype);
console.log(WeakRef.prototype.constructor === WeakRef, d(WeakRef.prototype, "constructor"), d(WeakRef.prototype, "deref"));
var deref = WeakRef.prototype.deref;
console.log(typeof deref, deref.length, deref.name, "prototype" in deref, Object.getOwnPropertyNames(WeakRef.prototype).join());
var tag = Object.getOwnPropertyDescriptor(WeakRef.prototype, Symbol.toStringTag);
console.log(tag.value, tag.writable, tag.enumerable, tag.configurable, Object.prototype.toString.call(WeakRef.prototype));
try { new deref(); } catch (e) { console.log(e.constructor === TypeError); }
`));

test("WeakRef rejects bad targets, calls and receivers", () =>
    expectOracle(`
var t = function (f) { try { f(); console.log("no error"); } catch (e) { console.log(e.constructor === TypeError); } };
t(function () { WeakRef({}); });
[undefined, null, 1, "s", true, 1n].forEach(function (v) { t(function () { new WeakRef(v); }); });
t(function () { new WeakRef(); });
[undefined, null, 1, {}, new WeakMap(), WeakRef.prototype].forEach(function (v) { t(function () { WeakRef.prototype.deref.call(v); }); });
`));

test("WeakRef deref returns its target and subclasses construct", () =>
    expectOracle(`
var o = { id: 1 }, f = function () {}, w = new WeakRef(o), g = new WeakRef(f);
console.log(w.deref() === o, w.deref() === w.deref(), g.deref() === f, w instanceof WeakRef, Object.prototype.toString.call(w), typeof w, Object.keys(w).length);
console.log(new WeakRef(WeakRef.prototype).deref() === WeakRef.prototype, new WeakRef(w).deref() === w);
class Ref extends WeakRef { constructor(t) { super(t); this.extra = 7; } id() { return this.deref().id; } }
var r = new Ref(o);
console.log(r.id(), r.extra, r instanceof Ref, r instanceof WeakRef, Object.getPrototypeOf(r) === Ref.prototype, Object.prototype.toString.call(r));
function N() {} N.prototype = Array.prototype;
var n = Reflect.construct(WeakRef, [o], N);
console.log(Object.getPrototypeOf(n) === Array.prototype, WeakRef.prototype.deref.call(n) === o);
N.prototype = 1;
console.log(Object.getPrototypeOf(Reflect.construct(WeakRef, [o], N)) === WeakRef.prototype);
`));

test("WeakRef targets live through strong references and kept objects", () => {
    // Native only: Node.js collects on its own schedule. Under GC stress every
    // allocation collects, so a target only a WeakRef holds dies as soon as
    // the job that created or dereferenced it has ended.
    const run = runOnHost(`
var lone = new WeakRef({ id: 1 }), strong = { id: 2 }, viaStrong = new WeakRef(strong);
var inArray = new WeakRef({ id: 3 }), array = [inArray.deref()];
var closure = (function () { var t = { id: 4 }; return { ref: new WeakRef(t), get: function () { return t; } }; })();
var map = new WeakMap(), key = {}, mapped = { id: 5 }; map.set(key, mapped);
var viaMap = new WeakRef(mapped); mapped = null;
var refs = new WeakMap(); refs.set(key, new WeakRef({ id: 6 }));
for (var i = 0; i < 20; i++) ({ i: i });
console.log("job", lone.deref().id, refs.get(key).deref().id);
Promise.resolve().then(function () {
    for (var i = 0; i < 20; i++) ({ i: i });
    console.log("microtask", lone.deref(), viaStrong.deref() === strong, inArray.deref() === array[0], closure.ref.deref() === closure.get(), viaMap.deref() === map.get(key), refs.get(key).deref());
});
var holder = { id: 7 }, later = new WeakRef(holder);
setTimeout(function () {
    // deref keeps the target alive until this callback's job ends.
    var again = later.deref();
    holder = again = null;
    for (var i = 0; i < 20; i++) ({ i: i });
    console.log("timer", later.deref().id);
    setTimeout(function () {
        for (var i = 0; i < 20; i++) ({ i: i });
        console.log("next", later.deref());
    }, 0);
}, 0);
`);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "job 1 6\nmicrotask undefined true true true true undefined\ntimer 7\nnext undefined\n",
    );
});

test("WeakRef targets are collected under memory pressure", () => {
    // Without GC stress: each target owns 1 MiB, so keeping them would need
    // 200 MiB; collected targets read back as undefined.
    const run = runOnHost(
        `
var refs = [], count = 200;
function step(i) {
    if (i === count) {
        var live = 0;
        for (var j = 0; j < count; j++) if (refs[j].deref() !== undefined) live++;
        console.log(live < count / 2, refs[count - 1].deref() === undefined || refs[count - 1].deref().buffer.byteLength === 1048576);
        return;
    }
    refs.push(new WeakRef({ buffer: new ArrayBuffer(1048576) }));
    setTimeout(function () { step(i + 1); }, 0);
}
step(0);
`,
        { gcStress: false },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "true true\n");
});

test("programs that do not name WeakRef link none of it", () => {
    const image = (source: string) => {
        const result = compile(source, {
            fileName: "size.js",
            target: "win32-x64",
        });
        if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
        return result.image;
    };
    const plain = image('console.log("hi")'),
        weak = image('console.log("hi", typeof WeakRef)');
    const marker = Buffer.from("__nonaWeakRefTarget", "utf16le");
    assert.equal(Buffer.from(plain).includes(marker), false);
    assert.equal(Buffer.from(weak).includes(marker), true);
    assert.ok(weak.length > plain.length);
});
