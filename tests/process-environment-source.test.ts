import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext, type Context } from "node:vm";

// Read the checked-out source both when run directly and from dist/tests in CI.
// No compiler, generated prelude, native process or parent environment is used.
const root = new URL(
    import.meta.url.endsWith(".ts") ? "../" : "../../",
    import.meta.url,
);
const source = readFileSync(
    new URL("src/lib/runtime/process.js", root),
    "utf8",
);
const extensions = readFileSync(
    new URL("src/lib/runtime/process-extensions.js", root),
    "utf8",
);

function fragment(text: string, start: string, end: string) {
    const first = text.indexOf(start),
        last = text.indexOf(end, first + start.length);
    assert.ok(
        first >= 0 && last > first,
        `Missing source boundary: ${start} / ${end}`,
    );
    assert.equal(
        text.indexOf(start, first + start.length),
        -1,
        `Ambiguous start: ${start}`,
    );
    assert.equal(
        text.indexOf(end, last + end.length),
        -1,
        `Ambiguous end: ${end}`,
    );
    return text.slice(first, last);
}

const initializer = fragment(
    source,
    "    var env={};",
    "    function exitStatus(",
);
// Fail closed if this boundary stops being inside the actual lazy build.
const buildStart = source.indexOf("  function build(){");
assert.ok(buildStart >= 0 && buildStart < source.indexOf(initializer));
assert.ok(source.indexOf(initializer) < source.indexOf("    return process"));
const errors = fragment(
    source,
    "    function hostError(",
    "    var execPath,commandLine,environment;",
);
const strings = fragment(
    source,
    "    function copyProcessBytes(",
    "    function readProc(",
);
const environmentExtensions = fragment(
    extensions,
    "    function wideString(",
    "var signalListenerCount=",
);
assert.ok(environmentExtensions.endsWith("process.env=env;"));

function evaluate(context: Context, code: string) {
    return runInContext(code, context, { timeout: 1000 });
}

function initial(environment: string[], windows: boolean, inherited = "") {
    const context = createContext({ environment, windows });
    evaluate(
        context,
        `
        var defineProperty=Object.defineProperty,createObject=Object.create;
        ${inherited}
        var folds=0,originalUpper=String.prototype.toUpperCase;
        String.prototype.toUpperCase=function(){folds++;return Reflect.apply(originalUpper,this,[])};
        ${initializer}
    `,
    );
    return context;
}

function json(context: Context, expression: string) {
    return JSON.parse(evaluate(context, `JSON.stringify(${expression})`));
}

test("actual process bootstrap builds the Windows environment only on first process access", () => {
    const memory = new Map<number, string>([[1, "fixture.exe"]]);
    let pointer = 100,
        reads = 0,
        frees = 0,
        publications = 0;
    for (const entry of ["Path=first", "PATH=ignored"]) {
        memory.set(pointer, entry);
        pointer += (entry.length + 1) * 2;
    }
    memory.set(pointer, "");
    const text = (pointer: number) => {
        assert.ok(memory.has(pointer), "only synthetic pointers may be read");
        return memory.get(pointer)!;
    };
    const hosts = {
        GetCommandLineW: () => 1,
        GetModuleFileNameW: (_module: null, buffer: Uint16Array) => {
            buffer.set(Array.from("fixture.exe", (c) => c.charCodeAt(0)));
            return 11;
        },
        lstrlenW: (pointer: number) => text(pointer).length,
        RtlMoveMemory: (buffer: Uint16Array, pointer: number, size: number) => {
            const value = text(pointer);
            assert.equal(size, value.length * 2);
            buffer.set(Array.from(value, (c) => c.charCodeAt(0)));
        },
        GetEnvironmentStringsW: () => {
            reads++;
            return 100;
        },
        FreeEnvironmentStringsW: (pointer: number) => {
            assert.equal(pointer, 100);
            frees++;
        },
        GetCurrentProcessId: () => 123,
        NtQueryInformationProcess: () => -1,
        replaceEnvironment: () => {
            publications++;
        },
    };
    const context = createContext({
        TextEncoder,
        TextDecoder,
        __nonaRegexpVm: { eventEmitterModule: function () {} },
        __nonaPromiseDrainJobs() {},
        __nonaProcessNow: () => 0,
        ...Object.fromEntries(
            Object.entries(hosts).map(([name, fn]) => [
                "__nonaHost_" + name,
                fn,
            ]),
        ),
    });
    let bootstrap = source;
    // Only unrelated generated dependencies are omitted; build(), the initializer,
    // processBuiltin() and the global lazy accessor run from the actual source.
    for (const [marker, replacement] of [
        ["__NONA_PROCESS_HOST_NAMES__", JSON.stringify(Object.keys(hosts))],
        ["${processExtensionsSource}", environmentExtensions],
        ["${processMetadataSource(undefined,true)}", ""],
        ["${processReportNetworkIntrinsicsSource}", ""],
        ["${processReportNetworkSource}", ""],
        ["${processReportSource}", ""],
    ] as const) {
        assert.equal(
            bootstrap.split(marker).length,
            2,
            `unique dependency: ${marker}`,
        );
        bootstrap = bootstrap.replace(marker, () => replacement);
    }
    evaluate(context, bootstrap);
    assert.deepEqual([reads, frees, publications], [0, 0, 0]);
    assert.equal(
        evaluate(
            context,
            "typeof Object.getOwnPropertyDescriptor(globalThis,'process').get",
        ),
        "function",
    );
    assert.equal(evaluate(context, "process.env.PATH"), "first");
    assert.equal(
        evaluate(context, "__nonaRegexpVm.processBuiltin()===process"),
        true,
    );
    assert.equal(evaluate(context, "process.env.path"), "first");
    assert.deepEqual([reads, frees, publications], [1, 1, 1]);
    assert.equal(
        evaluate(
            context,
            "Object.getOwnPropertyDescriptor(globalThis,'process').get",
        ),
        undefined,
    );
});

function assertEntries(context: Context, entries: string[][]) {
    assert.deepEqual(json(context, "Object.entries(env)"), entries);
    assert.equal(
        evaluate(context, "Object.getPrototypeOf(env)===Object.prototype"),
        true,
    );
    for (const [key, value] of entries) {
        assert.deepEqual(
            json(
                context,
                `Object.getOwnPropertyDescriptor(env,${JSON.stringify(key)})`,
            ),
            {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
            },
        );
    }
}

for (const count of [32, 64, 150]) {
    test(`initial Windows environment folds ${count} distinct keys at most once each`, (t) => {
        const entries = Array.from({ length: count }, (_, i) => [
            `NONA_SAFE_${i}`,
            `value${i}`,
        ]);
        const context = initial(
            entries.map(([key, value]) => `${key}=${value}`),
            true,
        );
        const folds = evaluate(context, "folds");
        t.diagnostic(
            `distinct keys=${count}, folds=${folds}, linear bound=${count}`,
        );
        assertEntries(context, entries);
        assert.ok(
            folds <= count,
            `${count} keys used ${folds} folds; expected <= ${count}`,
        );
    });
}

test("initial Windows environment retains first spelling/value, numeric order and Unicode folds", () => {
    const context = initial(
        [
            "Path=first",
            "pATH=later",
            "Path=last",
            "10=ten",
            "2=two",
            "01=leading",
            "0=zero",
            "__proto__=proto",
            "__PROTO__=later",
            "constructor=ctor",
            "CONSTRUCTOR=later",
            "toString=string",
            "TOSTRING=later",
            "straße=street",
            "STRASSE=later",
            "σ=sigma",
            "ς=later",
            "Σ=later",
            "ı=dotless",
            "I=later",
            "İ=dotted",
            "é=accent",
            "É=later",
            "K=kelvin",
            "k=ascii",
            "K=later",
        ],
        true,
    );
    assertEntries(context, [
        ["0", "zero"],
        ["2", "two"],
        ["10", "ten"],
        ["Path", "first"],
        ["01", "leading"],
        ["__proto__", "proto"],
        ["constructor", "ctor"],
        ["toString", "string"],
        ["straße", "street"],
        ["σ", "sigma"],
        ["ı", "dotless"],
        ["İ", "dotted"],
        ["é", "accent"],
        ["K", "kelvin"],
        ["k", "ascii"],
    ]);
});

for (const windows of [true, false]) {
    test(`initial ${windows ? "Windows" : "POSIX"} environment preserves empty/invalid/drive and embedded-equals parsing`, () => {
        const context = initial(
            [
                "",
                "NO_EQUALS",
                "=empty-name",
                "EMPTY=",
                "WITH_EQUALS=a=b=c",
                "=C:=C:\\safe",
                "==twice",
                "TAIL=end",
            ],
            windows,
        );
        // Preserve the actual parser, including drive entries accepted by indexOf('=',1).
        assertEntries(context, [
            ["EMPTY", ""],
            ["WITH_EQUALS", "a=b=c"],
            ["=C:", "C:\\safe"],
            ["=", "twice"],
            ["TAIL", "end"],
        ]);
        if (!windows) assert.equal(evaluate(context, "folds"), 0);
    });
}

test("initial Windows environment suppresses inherited enumerable aliases without reading values", (t) => {
    const context = initial(
        [
            "inheritedalias=ignored",
            "CONSTRUCTOR=ignored",
            "hidden=own",
            "Fresh=kept",
            "FRESH=ignored",
        ],
        true,
        `
        defineProperty(Object.prototype,'InheritedAlias',{enumerable:true,configurable:true,get:function(){throw Error('must not read inherited value')}});
        defineProperty(Object.prototype,'constructor',{value:'inherited constructor',enumerable:true,configurable:true});
        defineProperty(Object.prototype,'HIDDEN',{value:'non-enumerable',enumerable:false,configurable:true});
    `,
    );
    assertEntries(context, [
        ["hidden", "own"],
        ["Fresh", "kept"],
    ]);
    assert.deepEqual(
        json(
            context,
            "(function(){var keys=[];for(var key in env)keys.push(key);return keys})()",
        ),
        ["hidden", "Fresh", "constructor", "InheritedAlias"],
    );
    t.diagnostic(
        `5 parsed keys, 2 inherited enumerable keys, folds=${evaluate(context, "folds")}`,
    );
    assert.ok(
        evaluate(context, "folds") <= 7,
        "fold each parsed and inherited enumerable key at most once",
    );
});

test("initial POSIX environment keeps case distinctions, overwrites exact duplicates and never folds", () => {
    const context = initial(
        [
            "Path=first",
            "PATH=upper",
            "Path=replaced",
            "2=two",
            "1=one",
            "__proto__=proto",
            "constructor=ctor",
            "toString=string",
            "straße=street",
            "STRASSE=upper-street",
            "σ=sigma",
            "ς=final",
            "inheritedalias=own",
            "InheritedAlias=overwrite inherited",
        ],
        false,
        "defineProperty(Object.prototype,'InheritedAlias',{value:'inherited',enumerable:true,configurable:true})",
    );
    assertEntries(context, [
        ["1", "one"],
        ["2", "two"],
        ["Path", "replaced"],
        ["PATH", "upper"],
        ["__proto__", "proto"],
        ["constructor", "ctor"],
        ["toString", "string"],
        ["straße", "street"],
        ["STRASSE", "upper-street"],
        ["σ", "sigma"],
        ["ς", "final"],
        ["inheritedalias", "own"],
        ["InheritedAlias", "overwrite inherited"],
    ]);
    assert.equal(evaluate(context, "folds"), 0);
});

// Linux, Darwin and BSD all reach this same initializer with windows=false.
for (const count of [32, 64, 150]) {
    test(`initial POSIX environment performs zero folds for ${count} distinct keys`, () => {
        const context = initial(
            Array.from({ length: count }, (_, i) => `SAFE_${i}=value`),
            false,
        );
        assert.equal(evaluate(context, "folds"), 0);
        assert.equal(evaluate(context, "Object.keys(env).length"), count);
    });
}

function mutationBoundary(windows = true) {
    const context = initial(
        ["Path=first", "pATH=ignored", "KEEP=stable"],
        windows,
    );
    const publications: string[][] = [],
        calls: (string | null)[][] = [];
    const decode = (bytes: Uint8Array) =>
        new TextDecoder().decode(bytes).split("\0")[0]!;
    const wide = (units: Uint16Array) =>
        String.fromCharCode(...units.subarray(0, units.length - 1));
    let error = 0;
    Object.assign(context, {
        TextEncoder,
        TextDecoder,
        platform: windows ? "win32" : "linux",
        process: {},
        __nonaRegexpVm: {
            arrayBufferCopy: (
                source: ArrayBuffer,
                target: ArrayBuffer,
                start: number,
                count: number,
                offset: number,
            ) =>
                new Uint8Array(target, offset, count).set(
                    new Uint8Array(source, start, count),
                ),
        },
        host: {
            SetEnvironmentVariableW: (
                key: Uint16Array,
                value: Uint16Array | null,
            ) => {
                calls.push([wide(key), value === null ? null : wide(value)]);
                return error ? 0 : 1;
            },
            GetLastError: () => error,
            replaceEnvironment: (
                bytes: Uint8Array,
                size: number,
                count: number,
            ) => {
                assert.equal(size, bytes.length);
                const text = new TextDecoder().decode(bytes);
                assert.ok(!count || text.endsWith("\0"));
                const entries = text ? text.slice(0, -1).split("\0") : [];
                assert.equal(entries.length, count);
                publications.push(entries);
            },
            environmentVector: () => 1234,
            environmentContains: (bytes: Uint8Array) =>
                publications.at(-1)!.includes(decode(bytes)),
        },
    });
    evaluate(
        context,
        `var encoder=new TextEncoder();${strings}${errors}${environmentExtensions}`,
    );
    return {
        context,
        publications,
        calls,
        fail: (number: number) => {
            error = number;
        },
    };
}

test("Windows environment Proxy retains alias lookup, descriptors, mutation spelling and reinsertion", () => {
    const { context, publications, calls } = mutationBoundary();
    assert.deepEqual(publications, [["Path=first", "KEEP=stable"]]);
    assert.deepEqual(
        json(
            context,
            "[env.PATH, 'path' in env, Object.getOwnPropertyDescriptor(env,'pAtH')]",
        ),
        [
            "first",
            true,
            {
                value: "first",
                writable: true,
                enumerable: true,
                configurable: true,
            },
        ],
    );
    evaluate(context, "env.PATH=42");
    assert.deepEqual(json(context, "[Object.keys(env),env.path]"), [
        ["Path", "KEEP"],
        "42",
    ]);
    evaluate(
        context,
        "Object.defineProperty(env,'pAtH',{value:'ü=value',writable:true,enumerable:true,configurable:true})",
    );
    assert.equal(evaluate(context, "env.PATH"), "ü=value");
    assert.equal(
        evaluate(context, "__nonaRegexpVm.processEnvironmentVector()"),
        1234,
    );
    assert.equal(
        evaluate(
            context,
            "__nonaRegexpVm.processEnvironmentHas('Path','ü=value')",
        ),
        true,
    );
    assert.equal(
        evaluate(
            context,
            "__nonaRegexpVm.processEnvironmentHas('PATH','ü=value')",
        ),
        false,
    );
    assert.equal(evaluate(context, "delete env.pATH"), true);
    assert.deepEqual(
        json(
            context,
            "[env.Path, 'PATH' in env, Object.getOwnPropertyDescriptor(env,'path')]",
        ),
        [null, false, null],
    );
    evaluate(context, "env.pATH='reinserted'");
    assertEntries(context, [
        ["KEEP", "stable"],
        ["pATH", "reinserted"],
    ]);
    assert.deepEqual(publications, [
        ["Path=first", "KEEP=stable"],
        ["Path=42", "KEEP=stable"],
        ["Path=ü=value", "KEEP=stable"],
        ["KEEP=stable"],
        ["KEEP=stable", "pATH=reinserted"],
    ]);
    assert.deepEqual(calls, [
        ["PATH", "42"],
        ["pAtH", "ü=value"],
        ["Path", null],
        ["pATH", "reinserted"],
    ]);
});

test("Windows environment OS errors preserve object/vector and missing-variable deletion succeeds", () => {
    const { context, publications, calls, fail } = mutationBoundary();
    fail(5);
    for (const operation of [
        "env.PATH='refused'",
        "Object.defineProperty(env,'path',{value:'refused',writable:true,enumerable:true,configurable:true})",
    ]) {
        assert.throws(() => evaluate(context, operation), {
            code: "EINVAL",
            errno: -22,
            syscall: "setenv",
        });
    }
    assert.throws(() => evaluate(context, "delete env.PATH"), {
        code: "EINVAL",
        errno: -22,
        syscall: "unsetenv",
        path: "Path",
    });
    assert.throws(() => evaluate(context, "delete env.MISSING"), {
        code: "EINVAL",
        errno: -22,
        syscall: "unsetenv",
        path: "MISSING",
    });
    assertEntries(context, [
        ["Path", "first"],
        ["KEEP", "stable"],
    ]);
    assert.deepEqual(publications, [["Path=first", "KEEP=stable"]]);
    fail(203); // ERROR_ENVVAR_NOT_FOUND is a successful deletion, even if target held it.
    assert.equal(evaluate(context, "delete env.MISSING"), true);
    assert.equal(evaluate(context, "delete env.PATH"), true);
    assertEntries(context, [["KEEP", "stable"]]);
    assert.deepEqual(publications, [
        ["Path=first", "KEEP=stable"],
        ["Path=first", "KEEP=stable"],
        ["KEEP=stable"],
    ]);
    assert.deepEqual(calls, [
        ["PATH", "refused"],
        ["path", "refused"],
        ["Path", null],
        ["MISSING", null],
        ["MISSING", null],
        ["Path", null],
    ]);
});

test("environment Proxy keeps descriptor validation, NUL boundaries and invalid-name no-ops", () => {
    const { context, publications, calls } = mutationBoundary();
    assert.throws(
        () => evaluate(context, "Object.defineProperty(env,'PATH',{value:1})"),
        { code: "ERR_INVALID_OBJECT_DEFINE_PROPERTY" },
    );
    assert.throws(
        () =>
            evaluate(
                context,
                "Object.defineProperty(env,'PATH',{get:function(){return 1},enumerable:true,configurable:true})",
            ),
        { code: "ERR_INVALID_OBJECT_DEFINE_PROPERTY" },
    );
    assert.throws(() => evaluate(context, "env.PATH=Symbol('invalid')"), {
        code: "ERR_INVALID_ARG_TYPE",
    });
    evaluate(
        context,
        "env['']='ignored';env['BAD=KEY']='ignored';delete env[''];delete env['BAD=KEY']",
    );
    assert.deepEqual(calls, []);
    assert.equal(publications.length, 1);
    evaluate(context, "env['pATH\\0suffix']='a\\0b'");
    assert.equal(evaluate(context, "env['PATH\\0suffix']"), "a");
    assert.deepEqual(publications.at(-1), ["Path=a", "KEEP=stable"]);
    assert.deepEqual(calls, [["pATH", "a"]]);
});

test("POSIX environment Proxy keeps distinct aliases and publishes mutations without Windows calls", () => {
    const { context, publications, calls } = mutationBoundary(false);
    evaluate(context, "env.PATH='upper';delete env.Path;env.Path='new'");
    assertEntries(context, [
        ["pATH", "ignored"],
        ["KEEP", "stable"],
        ["PATH", "upper"],
        ["Path", "new"],
    ]);
    assert.deepEqual(publications.at(-1), [
        "pATH=ignored",
        "KEEP=stable",
        "PATH=upper",
        "Path=new",
    ]);
    assert.deepEqual(calls, []);
    assert.equal(evaluate(context, "folds"), 0);
});
