import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";
import { compile, compileModuleToIR } from "../src/compiler.js";
import { requiredSyntaxParts } from "../src/link.js";

// Top-level await (#306): module graphs compared with Node.js under GC stress.
const cases: [string, Record<string, string>][] = [
    [
        "await, for await and await in blocks and loops at the top level",
        {
            "main.mjs":
                "console.log('start');\nconst x = await Promise.resolve(2);\nconsole.log(x, await 3);\nfor await (const v of [4, Promise.resolve(5)]) console.log(v);\nif (x === 2) { console.log('if', await 6); }\nfor (let i = 0; i < 3; i++) console.log('loop', await i);\ntry { await Promise.reject(new Error('caught')); } catch (e) { console.log(e.message); }\nclass C { static [await 'key']() { return 'computed'; } }\nconsole.log(C.key(), typeof (async () => await 7)());\nPromise.resolve().then(() => console.log('job'));\nawait null;\nconsole.log('end');\n",
        },
    ],
    [
        "siblings: a synchronous module runs while an asynchronous sibling waits",
        {
            "main.mjs":
                "import './a.mjs';\nimport './b.mjs';\nimport {late} from './c.mjs';\nconsole.log('main', late);\n",
            "a.mjs":
                "console.log('a start');\nawait 0;\nconsole.log('a end');\n",
            "b.mjs": "console.log('b');\n",
            "c.mjs":
                "import './a.mjs';\nexport let late = 'early';\nconsole.log('c');\nlate = await Promise.resolve('late');\n",
        },
    ],
    [
        "diamond: dependents of one asynchronous module run in order",
        {
            "main.mjs":
                "import './left.mjs';\nimport './right.mjs';\nimport './slow.mjs';\nconsole.log('main');\n",
            "left.mjs": "import './base.mjs';\nconsole.log('left');\n",
            "right.mjs":
                "import './base.mjs';\nconsole.log('right start');\nawait 1;\nconsole.log('right end');\n",
            "base.mjs":
                "console.log('base start');\nawait new Promise(r => setTimeout(r, 5));\nconsole.log('base end');\n",
            "slow.mjs":
                "console.log('slow start');\nfor (let i = 0; i < 5; i++) await i;\nconsole.log('slow end');\n",
        },
    ],
    [
        "cycles that include an asynchronous module",
        {
            "main.mjs":
                "import {a} from './a.mjs';\nimport {b} from './b.mjs';\nconsole.log('main', a, b);\n",
            "a.mjs":
                "import {b} from './b.mjs';\nexport const a = 'a';\nconsole.log('a sees', b);\n",
            "b.mjs":
                "import './a.mjs';\nimport './c.mjs';\nexport let b = 'b0';\nconsole.log('b start');\nb = await 'b1';\nconsole.log('b end');\n",
            "c.mjs":
                "import './b.mjs';\nconsole.log('c');\nawait 0;\nconsole.log('c end');\n",
        },
    ],
    [
        "import() waits for the evaluation, also of a module already evaluating",
        {
            "main.mjs":
                "import('./slow.mjs').then(m => console.log('first', m.value));\nimport('./slow.mjs').then(m => console.log('second', m.value));\nconst m = await import('./slow.mjs');\nconsole.log('awaited', m.value, m === await import('./slow.mjs'));\nconst again = await import('./uses-slow.mjs');\nconsole.log(again.doubled);\n",
            "slow.mjs":
                "export let value = 'pending';\nconsole.log('slow start');\nimport('./slow.mjs').then(self => console.log('self', self.value));\nawait new Promise(r => setTimeout(r, 5));\nvalue = 'ready';\nconsole.log('slow end');\n",
            "uses-slow.mjs":
                "import {value} from './slow.mjs';\nexport const doubled = value + value;\n",
        },
    ],
    [
        "rejections reach importers and import() with one cached error",
        {
            "main.mjs":
                "let first;\ntry { await import('./importer.mjs'); } catch (e) { first = e; console.log('importer', e.message); }\ntry { await import('./bad.mjs'); } catch (e) { console.log('bad', e === first); }\ntry { await import('./importer.mjs'); } catch (e) { console.log('again', e === first); }\nimport('./sibling.mjs').then(() => console.log('sibling fine'));\n",
            "importer.mjs":
                "import './bad.mjs';\nconsole.log('importer never runs');\n",
            "bad.mjs":
                "console.log('bad start');\nawait 0;\nthrow new Error('bad failed');\n",
            "sibling.mjs": "console.log('sibling');\n",
        },
    ],
    [
        "a synchronous failure after an asynchronous dependency rejects import()",
        {
            "main.mjs":
                "await import('./late-throw.mjs').catch(e => console.log('caught', e.message));\nawait import('./late-throw.mjs').catch(e => console.log('cached', e.message));\n",
            "late-throw.mjs":
                "import './dep.mjs';\nconsole.log('late-throw runs');\nthrow new TypeError('sync after async');\n",
            "dep.mjs": "await 0;\nconsole.log('dep done');\n",
        },
    ],
    [
        "await in exports, and an importer without await runs after its asynchronous dependency",
        {
            "main.mjs":
                "import value, {named, later} from './exports.mjs';\nimport {seen} from './plain.mjs';\nconsole.log(value, named, later, seen);\n",
            "exports.mjs":
                "export default await Promise.resolve('default');\nexport const named = await 'named';\nexport let later = 'early';\nawait null;\nlater = 'late';\nconsole.log('exports done');\n",
            "plain.mjs":
                "import value, {later} from './exports.mjs';\nexport const seen = value + ' ' + later;\nconsole.log('plain', seen);\n",
        },
    ],
    [
        "a self-import sees the default export in TDZ until the awaited value is set",
        {
            "main.mjs":
                "var x = 'sync';\nPromise.resolve().then(() => x = 'tick');\nimport self from './main.mjs';\nimport './cycle.mjs';\ntry { self; } catch (e) { console.log(x, e.name); }\nexport default await Promise.resolve(42);\nconsole.log(x, self);\n",
            "cycle.mjs":
                "import d from './main.mjs';\ntry { d; } catch (e) { console.log('cycle', e.name); }\n",
        },
    ],
    [
        "a throw before the first await rejects importers",
        {
            "main.mjs":
                "try { await import('./early.mjs'); } catch (e) { console.log('early', e.message); }\ntry { await import('./importer.mjs'); } catch (e) { console.log('importer', e.message); }\n",
            "early.mjs":
                "console.log('early start');\nif (true) throw new RangeError('before await');\nawait 0;\nconsole.log('never');\n",
            "importer.mjs": "import './early.mjs';\nconsole.log('never');\n",
        },
    ],
    [
        "require() of an ES module graph with top-level await throws ERR_REQUIRE_ASYNC_MODULE",
        {
            "main.mjs":
                "import {tryIt} from './loader.cjs';\nconsole.log('main', tryIt());\nimport {v} from './tla.mjs';\nconsole.log('v', v);\n",
            "loader.cjs":
                "exports.tryIt = () => { try { require('./tla.mjs'); return 'no error'; } catch (e) { return e.code + ' ' + (e instanceof Error); } };\ntry { require('./indirect.mjs'); } catch (e) { console.log('indirect', e.code); }\nconsole.log('sync', require('./sync.mjs').s);\n",
            "tla.mjs": "console.log('tla runs');\nexport const v = await 1;\n",
            "indirect.mjs":
                "import './tla.mjs';\nconsole.log('indirect runs');\n",
            "sync.mjs": "export const s = 's';\n",
        },
    ],
];
for (const [name, files] of cases)
    test("top-level await: " + name, () => {
        const { native, oracle } = runModulesOnHost(files, "main.mjs");
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, oracle);
    });

test("top-level await: a rejected entry is an uncaught exception", () => {
    const { native, oracle, oracleStatus } = runModulesOnHost(
        {
            "main.mjs":
                "import './dep.mjs';\nconsole.log('main');\nawait 0;\nthrow new Error('entry failed');\n",
            "dep.mjs": "console.log('dep');\nawait 0;\n",
        },
        "main.mjs",
    );
    assert.equal(oracleStatus, 1);
    assert.equal(native.status, 1);
    assert.equal(native.stdout, oracle);
    // Without the process module an uncaught error has no Node.js report.
    assert.notEqual(native.stderr, "");
});

test("top-level await: a rejected dependency is reported once and stops the importer", () => {
    const { native, oracle, oracleStatus } = runModulesOnHost(
        {
            "main.mjs":
                "import './bad.mjs';\nconsole.log('main never runs');\n",
            "bad.mjs":
                "process.on('exit', code => console.log('exit', code));\nawait 0;\nthrow new RangeError('dependency failed');\n",
        },
        "main.mjs",
    );
    assert.equal(oracleStatus, 1);
    assert.equal(native.status, 1);
    assert.equal(native.stdout, oracle);
    assert.match(native.stderr, /RangeError: dependency failed/);
});

test("top-level await: an unsettled entry exits with code 13", () => {
    const { native, oracle, oracleStatus } = runModulesOnHost(
        {
            "main.mjs":
                "process.on('beforeExit', () => console.log('beforeExit'));\nprocess.on('exit', code => console.log('exit', code));\nconsole.log('waiting');\nawait new Promise(() => {});\nconsole.log('never');\n",
        },
        "main.mjs",
    );
    assert.equal(oracleStatus, 13);
    assert.equal(native.status, 13);
    assert.equal(native.stdout, oracle);
    assert.match(native.stderr, /Detected unsettled top-level await/);
});

test("top-level await: an unsettled entry without process listeners", () => {
    const { native, oracle, oracleStatus } = runModulesOnHost(
        {
            "main.mjs":
                "console.log('waiting');\nawait new Promise(() => {});\n",
        },
        "main.mjs",
    );
    assert.equal(oracleStatus, 13);
    assert.equal(native.status, 13);
    assert.equal(native.stdout, oracle);
    assert.match(native.stderr, /Detected unsettled top-level await/);
});

const host = (files: Record<string, string>) => ({
    resolve: (s: string) => "/" + s.replace("./", ""),
    read: (p: string) => files[p.slice(1)],
});
const compiles = (
    files: Record<string, string>,
    entry = "main.mjs",
    module = true,
) =>
    compile(files[entry]!, {
        fileName: "/" + entry,
        target: "linux-x64",
        module,
        moduleHost: host(files),
    }).ok;
test("top-level await: only the module goal accepts it", () => {
    assert.equal(compiles({ "main.mjs": "await 1;" }), true);
    assert.equal(compiles({ "main.mjs": "for await (const x of []);" }), true);
    for (const source of [
        "function f() { await 1; }",
        "function f() { for await (const x of []); }",
        "const f = () => await 1;",
        "const f = (x = await 1) => x;",
        "const f = async (x = await 1) => x;",
        "class A { x = await 1; }",
        "class A { static { await 1; } }",
        "function* g() { await 1; }",
        "var await;",
        "await: 1;",
    ])
        assert.equal(compiles({ "main.mjs": source }), false, source);
    // In scripts `await` stays an identifier outside async functions.
    assert.equal(
        compiles(
            {
                "main.js":
                    "var await = 1; function f(await) { return await; } await: f(await); (() => await)(); class C { x = await; }",
            },
            "main.js",
            false,
        ),
        true,
    );
    // Scripts and CommonJS modules keep rejecting it.
    assert.equal(compiles({ "main.js": "await 1;" }, "main.js", false), false);
    assert.equal(
        compiles({ "main.js": "for await (const x of []);" }, "main.js", false),
        false,
    );
    assert.equal(
        compiles(
            {
                "main.mjs": "import x from './c.cjs';",
                "c.cjs": "await 1; module.exports = 1;",
            },
            "main.mjs",
        ),
        false,
    );
});

test("top-level await: the asynchronous evaluation is linked only when used", () => {
    const parts = (files: Record<string, string>) =>
        [
            ...requiredSyntaxParts([
                compileModuleToIR(files["main.mjs"]!, "/main.mjs", host(files)),
            ]),
        ].sort();
    assert.deepEqual(
        parts({
            "main.mjs": "import {x} from './m.mjs';\nconsole.log(x);",
            "m.mjs": "export const x = 1;",
        }),
        ["moduleRecords"],
    );
    assert.deepEqual(
        parts({
            "main.mjs": "import {x} from './m.mjs';\nconsole.log(x);",
            "m.mjs": "export const x = await 1;",
        }),
        ["moduleRecords", "topLevelAwait"],
    );
    // An async function in a module is not top-level await.
    assert.deepEqual(
        parts({ "main.mjs": "async function f() { await 1; }\nf();" }),
        ["moduleRecords"],
    );
});
