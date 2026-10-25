import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

const source = `import util from "node:util";
import { isProxy } from "node:util/types";
const trap = () => { throw new Error("trap fired"); };
const throwing = new Proxy({}, new Proxy({}, { get: trap }));
const revocable = Proxy.revocable({}, {});
revocable.revoke();
const target = {};
const proxy = new Proxy(target, {});
const values = [
    ["proxy", proxy],
    ["function proxy", new Proxy(function () {}, {})],
    ["class proxy", new Proxy(class {}, {})],
    ["revoked", revocable.proxy],
    ["throwing handler", throwing],
    ["proxy of proxy", new Proxy(proxy, {})],
    ["object", {}],
    ["array", []],
    ["function", function () {}],
    ["Proxy", Proxy],
    ["target", target],
    ["null", null],
    ["undefined", undefined],
    ["number", 1],
    ["string", "s"],
];
for (const [name, value] of values)
    console.log(name, util.types.isProxy(value), isProxy(value));
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(Uint8Array)).join());
`;

for (const gcStress of [false, true]) {
    test(`util.types.isProxy matches Node.js${gcStress ? " under GC stress" : ""}`, () => {
        const { native, oracle } = runModulesOnHost(
            { "main.mjs": source },
            "main.mjs",
            { gcStress },
        );
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, oracle);
        assert.match(native.stdout, /^proxy true true$/m);
        assert.match(native.stdout, /^revoked true true$/m);
        assert.match(native.stdout, /^target false false$/m);
    });
}
