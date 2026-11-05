// Evaluate only test registration and fixture composition. No compiler or native
// execution is reachable here. Replay uses the original assertion callbacks.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const pins = {
    assert: "79afe8e11770d6c297eb0e84476af09fb46a0bf2",
    regexp: "a80f8b4a67c921546860806c8445d722710d8e9f",
    http: "b78f81820ff19105ab85fb10773fab4353b3d8f5",
};
const names = {
    assert: [
        "assert.deepEqual keeps ordinary object semantics and handles cycles",
        "assert.deepStrictEqual matches Map keys deeply",
        "assert.strict and assert/strict use strict equality",
    ],
    regexp: [
        "v behaves as u for dot, surrogate pairs and index advance",
        "v-mode classes nest and support union, intersection and subtraction",
        "\\q{} string disjunctions match the longest string first",
    ],
};
let captureSequence = 0;

export async function loadCases(root, group) {
    assert.ok(Object.hasOwn(pins, group));
    const registrations = [];
    const captureID = ++captureSequence;
    let calls, replay, cursor;
    const call = (kind, args) => {
        if (replay) {
            const previous = calls[cursor++];
            assert.equal(previous.kind, kind);
            assert.deepEqual(
                JSON.stringify(previous.args),
                JSON.stringify(args),
            );
            if (previous.thrown) throw previous.thrown;
            return previous.result;
        }
        calls.push({ kind, args });
        return kind === "modules"
            ? {
                  native: { stdout: "", stderr: "", status: 0 },
                  oracle: "",
                  oracleStatus: 0,
                  oracleStderr: "",
              }
            : { stdout: "", stderr: "", status: 0 };
    };
    const assertion = new Proxy(() => {}, {
        apply(_target, _this, args) {
            if (replay) return assert(...args);
        },
        get(_target, key) {
            if (key === "__esModule") return false;
            return (...args) => {
                if (replay) return assert[key](...args);
            };
        },
    });
    const stateKey = Symbol.for("nona.gc.fixture-capture");
    assert.equal(globalThis[stateKey], undefined, "Only one capture at a time");
    globalThis[stateKey] = {
        assertion,
        test: (name, callback) => registrations.push({ name, callback }),
        host: (...args) => call("host", args),
        modules: (...args) => call("modules", args),
        oracle: (...args) => call("oracle", args),
    };
    const modules = {
        test: "export const test = state.test;",
        assert: "export default state.assertion;",
        host: "export const runOnHost = state.host, runModulesOnHost = state.modules; export const executionFailure = JSON.stringify;",
        oracle: "export const runOracle = state.oracle;",
        compiler:
            "export function compileToIR() { throw new Error('Compiler forbidden in fixture capture'); }",
    };
    const testPrefix = pathToFileURL(resolve(root, "tests") + "/").href;
    const hooks = registerHooks({
        resolve(specifier, context, next) {
            if (!context.parentURL?.startsWith(testPrefix))
                return next(specifier, context);
            const mock =
                specifier === "node:test"
                    ? "test"
                    : specifier === "node:assert/strict"
                      ? "assert"
                      : specifier.endsWith("/host.js")
                        ? "host"
                        : specifier.endsWith("/oracle.js")
                          ? "oracle"
                          : specifier.endsWith("/compiler.js")
                            ? "compiler"
                            : undefined;
            if (mock)
                return {
                    url: `nona-gc-capture:${captureID}:${mock}`,
                    shortCircuit: true,
                };
            if (specifier.startsWith(".") && specifier.endsWith(".js")) {
                const url = new URL(
                    specifier.replace(/\.js$/u, ".ts"),
                    context.parentURL,
                );
                if (existsSync(fileURLToPath(url)))
                    return { url: url.href, shortCircuit: true };
            }
            throw new Error("Unexpected fixture dependency: " + specifier);
        },
        load(url, context, next) {
            if (!url.startsWith("nona-gc-capture:")) return next(url, context);
            return {
                format: "module",
                source:
                    "const state = globalThis[Symbol.for('nona.gc.fixture-capture')];\n" +
                    modules[url.split(":").at(-1)],
                shortCircuit: true,
            };
        },
    });
    let agentCases;
    try {
        for (const file of group === "assert"
            ? ["assert-deep-equal", "assert-strict"]
            : group === "regexp"
              ? ["regexp-v-flag"]
              : ["http-agent"])
            await import(
                pathToFileURL(resolve(root, "tests", file + ".test.ts"))
            );
        if (group === "http")
            ({ agentCases } = await import(
                pathToFileURL(
                    resolve(root, "tests/helpers/http-agent-cases.ts"),
                )
            ));
    } finally {
        hooks.deregister();
        delete globalThis[stateKey];
    }
    let selected;
    if (group === "http") {
        const witness = agentCases.find((item) => item.id === "origins/2");
        assert.ok(witness);
        selected = registrations.filter((item) => item.name === witness.name);
        assert.equal(selected.length, 1);
    } else {
        selected = names[group].map((name) => {
            const matches = registrations.filter((item) => item.name === name);
            assert.equal(matches.length, 1, name);
            return matches[0];
        });
    }
    return selected.map(({ name, callback }) => {
        calls = [];
        replay = false;
        callback();
        const captured = calls;
        return {
            name,
            calls: captured,
            replay() {
                calls = captured;
                cursor = 0;
                replay = true;
                callback();
                assert.equal(
                    cursor,
                    calls.length,
                    "Original assertions consumed every call",
                );
            },
        };
    });
}

export function diagnosticPlan(group) {
    const originalNative = { assert: 6, regexp: 5, http: 1 }[group];
    assert.ok(originalNative);
    return {
        group,
        pin: pins[group],
        originalGroups: group === "http" ? 1 : 3,
        originalNative,
        originalNode: originalNative,
        comparisonNative: 2,
        comparisonConcurrency: 2,
        tailNative: group === "http" ? 1 : 0,
        markedNative: 1,
        startupNative: 1,
        totalNative: originalNative + 4 + (group === "http" ? 1 : 0),
        totalNode: originalNative + 4 + (group === "http" ? 1 : 0),
        nativeDeadlinesMs: [60000, 180000],
        oracleDeadlineMs: 60000,
        workerBoundMs: 480000,
        controllerBoundMs: 2100000,
        jobBoundMinutes: 55,
    };
}
