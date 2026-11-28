import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modulesDns } from "../src/lib/sources.generated.js";
import { builtinSpecifiers } from "../src/frontend/builtin-modules.js";
import { supportedNativeTargets } from "../src/target.js";
import { runModulesOnHost } from "./helpers/host.js";
import { socketBoundary } from "./helpers/net-source.js";

test("shared resolver rejects reserved invalid names without consulting the platform", () => {
    const platformNames: string[] = [];
    const addresses = [{ address: "192.0.2.3", family: 4 }];
    const { lookup } = socketBoundary([], (name) => {
        platformNames.push(name);
        // Even a positive platform answer must not override RFC 6761 names.
        return addresses;
    });
    for (const host of [
        "invalid",
        "invalid.",
        "INVALID",
        "nona-dns-665.invalid.",
        "Nested.Host.InVaLiD",
        "nested.host.INVALID.",
    ]) {
        assert.throws(
            () => lookup(host),
            (error) => {
                assert.ok(error instanceof Error);
                const failure = error as NodeJS.ErrnoException & {
                    hostname: string;
                };
                assert.equal(failure.code, "ENOTFOUND");
                assert.equal(failure.errno, -3008);
                assert.equal(failure.syscall, "getaddrinfo");
                assert.equal(failure.hostname, host);
                assert.ok(error.message.includes(host));
                return true;
            },
        );
    }
    assert.deepEqual(platformNames, []);
    for (const host of [
        "notinvalid",
        "hostinvalid.",
        "INVALID.example",
        "host.invalid.example",
    ])
        assert.deepEqual(lookup(host), addresses);
    assert.deepEqual(platformNames, [
        "notinvalid",
        "hostinvalid.",
        "invalid.example",
        "host.invalid.example",
    ]);
});

// Exercise the public source with a controlled resolver and deferred job queue.
function boundary(resolve: (host: string) => unknown) {
    const tasks: (() => void)[] = [];
    const lookup = new Function(
        "_internal",
        "isIP",
        modulesDns
            .replace(/^import .*$/gm, "")
            .replace(/export default /g, "const defaultExport = ")
            .replace(/\bexport /g, "") + ";return lookup;",
    )(
        { lookup: resolve, defer: (task: () => void) => tasks.push(task) },
        (host: string) => (host === "127.0.0.1" ? 4 : host === "::1" ? 6 : 0),
    );
    return { lookup, tasks };
}

test("dns validates before resolving and delivers one deferred result", () => {
    let resolutions = 0;
    const { lookup, tasks } = boundary(() => {
        resolutions++;
        return [{ address: "192.0.2.1", family: 4 }];
    });
    for (const args of [
        ["host"],
        ["", () => {}],
        [123, () => {}],
        ["host", { family: 5 }, () => {}],
        ["host", { all: "yes" }, () => {}],
        ["host", { hints: 1 }, () => {}],
    ])
        assert.throws(() => lookup(...args), TypeError);
    assert.equal(tasks.length, 0);
    assert.equal(resolutions, 0);
    const received: unknown[][] = [];
    lookup("host", (...args: unknown[]) => received.push(args));
    assert.equal(resolutions, 0);
    assert.deepEqual(received, []);
    assert.equal(tasks.length, 1);
    tasks.shift()!();
    assert.equal(resolutions, 1);
    assert.deepEqual(received, [[null, "192.0.2.1", 4]]);
    assert.equal(tasks.length, 0);
});

test("dns does not catch user callbacks on success or resolution failure", () => {
    for (const fail of [false, true]) {
        const resolutionError = new Error("resolver failure");
        const callbackError = new Error("callback failure");
        const { lookup, tasks } = boundary(() => {
            if (fail) throw resolutionError;
            return [{ address: "192.0.2.2", family: 4 }];
        });
        let calls = 0;
        lookup("host", (error: unknown) => {
            calls++;
            assert.equal(error, fail ? resolutionError : null);
            throw callbackError;
        });
        assert.equal(calls, 0);
        assert.throws(tasks.shift()!, (error) => error === callbackError);
        assert.equal(calls, 1);
        assert.equal(tasks.length, 0);
    }
});

test("dns filters hostname families and returns all resolver addresses", () => {
    const addresses = [
        { address: "192.0.2.1", family: 4 },
        { address: "192.0.2.2", family: 4 },
    ];
    const { lookup, tasks } = boundary(() => addresses);
    const results: unknown[][] = [];
    lookup("host", { all: true, family: 4 }, (...args: unknown[]) =>
        results.push(args),
    );
    tasks.shift()!();
    assert.deepEqual(results, [[null, addresses]]);
    lookup("host", 6, (error: any) => {
        assert.equal(error.code, "ENOTFOUND");
        assert.equal(error.hostname, "host");
        assert.equal(error.errno, -3008);
        assert.equal(error.syscall, "getaddrinfo");
    });
    tasks.shift()!();
});

test("dns has the same target availability as net", () => {
    for (const target of supportedNativeTargets) {
        const names = builtinSpecifiers(target);
        assert.equal(names.has("dns"), names.has("net"), target);
        assert.equal(names.has("node:dns"), names.has("node:net"), target);
    }
});

test("dns bare CommonJS and node ESM imports, literals, hostname and ordering match Node", () => {
    const fixture = readFileSync("tests/fixtures/pg-dns.cjs", "utf8");
    const { native, oracle, oracleStatus } = runModulesOnHost(
        {
            "pg-dns.cjs": fixture,
            "main.mjs": String.raw`import dns, {lookup} from 'node:dns';
import pgDns from './pg-dns.cjs';
console.log(typeof lookup, lookup === dns.lookup, lookup === pgDns.lookup);
let returned = false;
lookup('127.0.0.1', (error, address, family) => {
    console.log('v4', returned, error === null, address, family);
    lookup('::1', 4, (error, address, family) => {
        console.log('v6', error === null, address, family);
        lookup('127.0.0.1', {all: true}, (error, addresses) => {
            console.log('all', error === null, JSON.stringify(addresses));
            lookup('localhost', {family: 4}, (error, address, family) => {
                console.log('host', error === null, address, family);
                pgDns.hostaddr('127.0.0.1', (error, value) => console.log('pg', error === null, value));
            });
        });
    });
});
queueMicrotask(() => console.log('microtask'));
returned = true;
console.log('returned');
`,
        },
        "main.mjs",
        // Like net.test.ts, avoid forced collection across the full net graph.
        { gcStress: false },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(oracleStatus, 0);
    assert.equal(native.stdout, oracle);
    assert.equal(
        native.stdout,
        'function true true\nreturned\nmicrotask\nv4 true true 127.0.0.1 4\nv6 true ::1 6\nall true [{"address":"127.0.0.1","family":4}]\nhost true 127.0.0.1 4\npg true hostaddr=\'127.0.0.1\'\n',
    );
});

test("dns reserved invalid lookup finishes within a host-enforced 10 seconds with error metadata", () => {
    const source = String.raw`import {lookup} from 'node:dns';
const host = 'nona-dns-665.invalid.';
let returned = false;
let calls = 0;
lookup(host, (error, address, family) => {
    calls++;
    console.log(returned, error instanceof Error, error.code, error.errno, error.syscall, error.hostname === host, error.message.includes(host), address === undefined, family === undefined);
    setTimeout(() => console.log('calls', calls), 20);
});
returned = true;
`;
    // A timer inside the compiled program cannot interrupt synchronous DNS.
    const { native } = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: false,
        timeoutMs: 10_000,
        oracleSource: "",
    });
    assert.equal(
        native.error,
        undefined,
        native.error?.message ?? "native deadline",
    );
    assert.equal(native.status, 0, native.stderr);
    // RFC 6761 defines this negative answer independently of the machine's
    // DNS server. Node's OS-controlled retries are not Nona's deadline contract.
    assert.equal(
        native.stdout,
        "true true ENOTFOUND -3008 getaddrinfo true true true true\ncalls 1\n",
    );
});

test("dns callback exceptions propagate from the compiled event loop exactly once", () => {
    const { native } = runModulesOnHost(
        {
            "main.mjs": "import './callback.cjs';",
            "callback.cjs": `const dns = require('dns'); let calls = 0; dns.lookup('127.0.0.1', () => { console.log('callback', ++calls); throw new Error('dns callback sentinel'); });`,
        },
        "main.mjs",
        { gcStress: false, oracleSource: "" },
    );
    assert.equal(native.error, undefined);
    assert.notEqual(native.status, 0);
    assert.equal(native.stdout, "callback 1\n");
    assert.match(native.stderr, /dns callback sentinel/);
});
