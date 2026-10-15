import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    chmodSync,
    symlinkSync,
    readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { compile } from "../src/compiler.js";
import { requireHostTarget } from "../src/target.js";
import {
    NodeResolver,
    parsePackageSpecifier,
    type NodeFileSystem,
} from "../src/frontend/node-resolution.js";
import { analyzeCommonJs, detectFormat } from "../src/frontend/commonjs.js";
import { lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import { removeTemporaryDirectory } from "./helpers/cleanup.js";

// npm packages (#249): node_modules resolution, package.json exports and
// imports, CommonJS modules and their interplay with ES modules. Every
// program runs natively and on Node.js, which must print the same.

function writeTree(directory: string, files: Record<string, string>): void {
    for (const [name, text] of Object.entries(files)) {
        const path = join(directory, name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
    }
}

function runProject(
    files: Record<string, string>,
    entry: string,
    setup?: (directory: string) => void,
): { native: string; oracle: string } {
    const directory = mkdtempSync(join(tmpdir(), "nona-npm-"));
    try {
        writeTree(directory, files);
        setup?.(directory);
        const entryPath = join(directory, entry);
        const result = compile(readFileSync(entryPath, "utf8"), {
            fileName: entryPath,
            target: requireHostTarget(),
            module: entry.endsWith(".mjs"),
        });
        if (!result.ok)
            assert.fail(
                result.diagnostics
                    .map((d) => `${d.file}: ${d.code} ${d.message}`)
                    .join("\n"),
            );
        const executable = join(
            directory,
            process.platform === "win32" ? "program.exe" : "program",
        );
        writeFileSync(executable, result.image);
        chmodSync(executable, 0o755);
        const native = spawnSync(executable, [], {
            cwd: directory,
            encoding: "utf8",
            timeout: 60_000,
            windowsHide: true,
        });
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        const oracle = spawnSync(process.execPath, [entryPath], {
            cwd: directory,
            encoding: "utf8",
            timeout: 20_000,
            windowsHide: true,
        });
        assert.equal(oracle.status, 0, oracle.stderr);
        return {
            native: native.stdout.replaceAll(directory, "<dir>"),
            oracle: oracle.stdout.replaceAll(directory, "<dir>"),
        };
    } finally {
        removeTemporaryDirectory(directory);
    }
}

const agree = (
    files: Record<string, string>,
    entry: string,
    setup?: (directory: string) => void,
) => {
    const { native, oracle } = runProject(files, entry, setup);
    assert.ok(oracle.length > 0);
    assert.equal(native, oracle);
};

/** A virtual file tree for the resolver (canonical paths). */
function virtualFs(
    files: Record<string, string>,
    links: Record<string, string> = {},
): NodeFileSystem {
    const real = (path: string) => {
        for (const [from, to] of Object.entries(links))
            if (path === from || path.startsWith(from + "/"))
                return to + path.slice(from.length);
        return path;
    };
    const directories = new Set<string>();
    for (const name of Object.keys(files)) {
        let at = name;
        while ((at = at.slice(0, at.lastIndexOf("/"))) !== "")
            directories.add(at);
    }
    return {
        read: (path) => files[real(path)],
        isFile: (path) => Object.hasOwn(files, real(path)),
        isDirectory: (path) => directories.has(real(path)),
        realpath: (path) => real(path),
    };
}

test("package specifiers split into a name and a subpath", () => {
    assert.deepEqual(parsePackageSpecifier("lodash"), {
        name: "lodash",
        subpath: ".",
    });
    assert.deepEqual(parsePackageSpecifier("lodash/fp/map"), {
        name: "lodash",
        subpath: "./fp/map",
    });
    assert.deepEqual(parsePackageSpecifier("@babel/core"), {
        name: "@babel/core",
        subpath: ".",
    });
    assert.deepEqual(parsePackageSpecifier("@babel/core/lib/x.js"), {
        name: "@babel/core",
        subpath: "./lib/x.js",
    });
    for (const invalid of ["./x", "/x", "#x", "@scope", "a/../b", "a\\b"])
        assert.equal(parsePackageSpecifier(invalid), undefined, invalid);
});

test("the resolver follows Node: files, directories, node_modules, exports, imports, self-reference and links", () => {
    const fs = virtualFs(
        {
            "/app/package.json": JSON.stringify({
                name: "app",
                imports: {
                    "#util": "./src/util.js",
                    "#dep": "dep",
                    "#internal/*": "./src/internal/*.js",
                },
                exports: {
                    ".": "./src/index.js",
                    "./feature": "./src/feature.js",
                },
            }),
            "/app/src/index.js": "",
            "/app/src/util.js": "",
            "/app/src/feature.js": "",
            "/app/src/internal/a.js": "",
            "/app/src/dir/index.js": "",
            "/app/src/data.json": "",
            "/app/node_modules/plain/package.json": JSON.stringify({
                main: "lib/main",
            }),
            "/app/node_modules/plain/lib/main.js": "",
            "/app/node_modules/plain/extra.js": "",
            "/app/node_modules/noindex/index.js": "",
            "/app/node_modules/dep/package.json": JSON.stringify({
                exports: {
                    node: { import: "./esm.mjs", require: "./cjs.cjs" },
                    default: "./browser.js",
                },
            }),
            "/app/node_modules/dep/esm.mjs": "",
            "/app/node_modules/dep/cjs.cjs": "",
            "/app/node_modules/dep/browser.js": "",
            "/app/node_modules/patterns/package.json": JSON.stringify({
                exports: {
                    "./*": "./lib/*.js",
                    "./sub/*": "./sub/*.js",
                    "./sub/private/*": null,
                    "./list": ["./missing.js", "./present.js"],
                },
            }),
            "/app/node_modules/patterns/lib/a.js": "",
            "/app/node_modules/patterns/sub/b.js": "",
            "/app/node_modules/patterns/sub/private/c.js": "",
            "/app/node_modules/patterns/present.js": "",
            "/app/node_modules/@scope/pkg/package.json": JSON.stringify({
                exports: "./entry.js",
            }),
            "/app/node_modules/@scope/pkg/entry.js": "",
            "/app/node_modules/@scope/pkg/hidden.js": "",
            "/store/linked@1/node_modules/linked/package.json": JSON.stringify({
                main: "index.js",
            }),
            "/store/linked@1/node_modules/linked/index.js": "",
            "/node_modules/hoisted/index.js": "",
        },
        { "/app/node_modules/linked": "/store/linked@1/node_modules/linked" },
    );
    const resolver = new NodeResolver(fs),
        from = "/app/src/index.js";
    const r = (specifier: string, kind: "import" | "require" = "require") =>
        resolver.resolve(specifier, from, kind);
    assert.equal(r("./util"), "/app/src/util.js");
    assert.equal(r("./util.js"), "/app/src/util.js");
    assert.equal(r("./dir"), "/app/src/dir/index.js");
    assert.equal(r("./data"), "/app/src/data.json");
    assert.equal(r("../package.json"), "/app/package.json");
    assert.equal(r("./missing"), undefined);
    assert.equal(r("plain"), "/app/node_modules/plain/lib/main.js");
    assert.equal(r("plain/extra"), "/app/node_modules/plain/extra.js");
    assert.equal(r("noindex"), "/app/node_modules/noindex/index.js");
    assert.equal(r("dep", "require"), "/app/node_modules/dep/cjs.cjs");
    assert.equal(r("dep", "import"), "/app/node_modules/dep/esm.mjs");
    assert.equal(r("dep/esm.mjs"), undefined, "not exported");
    assert.equal(r("patterns/a"), "/app/node_modules/patterns/lib/a.js");
    assert.equal(
        r("patterns/sub/b"),
        "/app/node_modules/patterns/sub/b.js",
        "the longest pattern wins",
    );
    assert.equal(
        r("patterns/sub/private/c"),
        undefined,
        "a null target excludes",
    );
    assert.equal(
        r("patterns/list"),
        "/app/node_modules/patterns/present.js",
        "an array falls back",
    );
    assert.equal(r("@scope/pkg"), "/app/node_modules/@scope/pkg/entry.js");
    assert.equal(r("@scope/pkg/hidden.js"), undefined);
    assert.equal(
        r("linked"),
        "/store/linked@1/node_modules/linked/index.js",
        "symbolic links resolve to the real path",
    );
    assert.equal(
        r("hoisted"),
        "/node_modules/hoisted/index.js",
        "node_modules of every ancestor",
    );
    assert.equal(r("#util"), "/app/src/util.js");
    assert.equal(r("#internal/a"), "/app/src/internal/a.js");
    assert.equal(
        r("#dep", "import"),
        "/app/node_modules/dep/esm.mjs",
        "imports may name packages",
    );
    assert.equal(r("#missing"), undefined);
    assert.equal(r("app"), "/app/src/index.js", "self-reference");
    assert.equal(r("app/feature"), "/app/src/feature.js");
    assert.equal(
        r("app/src/util.js"),
        undefined,
        "self-reference goes through exports",
    );
    assert.equal(
        new NodeResolver(fs, ["browser"]).resolve(
            "dep",
            "/app/x.js",
            "require",
        ),
        "/app/node_modules/dep/cjs.cjs",
        "node comes first in the package",
    );
});

test("files are CommonJS or ES modules by their syntax when no type says", () => {
    assert.equal(detectFormat('import x from "y"; x();'), "module");
    assert.equal(detectFormat("export const a = 1;"), "module");
    assert.equal(detectFormat("console.log(import.meta.url)"), "module");
    assert.equal(
        detectFormat('const fs = require("fs"); module.exports = fs;'),
        "commonjs",
    );
    assert.equal(detectFormat("exports.a = 1;"), "commonjs");
    assert.equal(detectFormat("console.log(1)"), "module");
    assert.equal(
        detectFormat("var module = {}; module.x = 1;"),
        "module",
        "a declared name is not CommonJS",
    );
    assert.equal(
        detectFormat("with (a) { exports.b = 1 }"),
        "commonjs",
        "sloppy code",
    );
    assert.equal(
        detectFormat('const s = "import x from y"; require("z")'),
        "commonjs",
    );
});

test("the static scan finds requires and exported names as cjs-module-lexer does", () => {
    const program = (text: string) =>
        parse(lex(`(function (exports, require, module) {${text}\n})`));
    const analysis = analyzeCommonJs(
        program(`
  'use strict';
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.b = exports.a = void 0;
  const x = require('./x'), y = require(\`./y\`);
  if (z) require('optional');
  require(name);
  exports.a = 1; exports.b = 2; module.exports.c = 3;
  Object.defineProperty(exports, 'd', { enumerable: true, get: function () { return x.d; } });
  __exportStar(require("./star"), exports);
  tslib.__exportStar(require("./star2"), exports);
  require.resolve('./resolved');
 `),
    );
    assert.deepEqual(analysis.requires, [
        "./x",
        "./y",
        "optional",
        "./star",
        "./star2",
    ]);
    assert.deepEqual(analysis.resolves, ["./resolved"]);
    assert.deepEqual(analysis.exportNames, ["__esModule", "b", "a", "c", "d"]);
    assert.deepEqual(analysis.reexports, ["./star", "./star2"]);
    const literal = analyzeCommonJs(
        program(
            `module.exports = { one, two: 2, 'three': 3, four() {}, ...rest, [computed]: 5 };`,
        ),
    );
    assert.deepEqual(literal.exportNames, ["one", "two", "three", "four"]);
    assert.deepEqual(
        analyzeCommonJs(program(`module.exports = require('./other');`))
            .reexports,
        ["./other"],
    );
});

test("a CommonJS program requires packages, JSON and builtins as Node does", () =>
    agree(
        {
            "package.json": JSON.stringify({ name: "app", version: "1.0.0" }),
            "index.js": String.raw`
'use strict';
const lib = require('lib');
const {name, version} = require('./package.json');
const path = require('node:path'), events = require('events'), fs = require('fs');
console.log(lib.greet('npm'), lib.count(), lib.count(), name, version);
console.log(path.basename('/a/b/c.txt'), typeof events, typeof events.EventEmitter, fs === require('node:fs'));
console.log(require('lib') === lib, require.main === module, module.id, typeof module.exports, this === module.exports);
console.log(typeof __filename, __filename.endsWith('index.js'), __dirname.length > 0, typeof require.resolve('lib'));
console.log(require.resolve('node:path'), require.resolve('lib').endsWith('main.js'));
for (const bad of ['missing-package', './missing', ['computed'][0]]) {
  try { require(bad); console.log('loaded', bad); } catch (error) { console.log(error.code, error.message.split('\n')[0]); }
}
try { require(42); } catch (error) { console.log(error.name, error.code); }
`,
            "node_modules/lib/package.json": JSON.stringify({
                name: "lib",
                main: "./src/main",
            }),
            "node_modules/lib/src/main.js": String.raw`
let counter = 0;
const helper = require('./helper');
module.exports = { greet: name => helper.prefix + name, count: () => ++counter };
`,
            "node_modules/lib/src/helper.js": `exports.prefix = 'hello, ';`,
        },
        "index.js",
    ));

test("CommonJS cycles see partial exports; require.cache controls reloading; a module that throws is loaded again", () =>
    agree(
        {
            "main.js": String.raw`
const a = require('./a');
console.log('main', a.done, a.fromB);
const first = require('./counted');
delete require.cache[require.resolve('./counted')];
const second = require('./counted');
console.log(first === second, first.id, second.id, Object.keys(require.cache).length > 0);
for (let attempt = 0; attempt < 2; attempt++) {
  try { console.log('flaky', require('./flaky').ok); } catch (error) { console.log('flaky threw', error.message); }
}
console.log(module.children.length, module.children[0].exports === a, a.parentIsMain);
`,
            "a.js": String.raw`
exports.done = false;
const b = require('./b');
exports.fromB = b.sawPartial;
exports.done = true;
exports.parentIsMain = module.parent === require.main;
`,
            "b.js": String.raw`
const a = require('./a');
exports.sawPartial = 'a.done=' + a.done;
`,
            "counted.js": `globalThis.loads = (globalThis.loads || 0) + 1; exports.id = globalThis.loads;`,
            "flaky.js": `globalThis.flakyRuns = (globalThis.flakyRuns || 0) + 1; if (globalThis.flakyRuns === 1) throw new Error('first time'); exports.ok = 'second time';`,
        },
        "main.js",
    ));

test("CommonJS code is sloppy unless it says use strict, and its free names are globals", () =>
    agree(
        {
            "main.js": String.raw`
const sloppy = require('./sloppy'), strict = require('./strict');
console.log(sloppy.thisInFunction, sloppy.withValue, typeof leaked, leaked, sloppy.octal);
console.log(strict.thisInFunction, strict.assignError);
console.log(typeof global, global === globalThis, typeof process, typeof setTimeout);
`,
            "sloppy.js": String.raw`
function f() { return this === globalThis; }
var o = { v: 'with' };
with (o) { exports.withValue = v; }
leaked = 'implicit global';
exports.thisInFunction = f();
exports.octal = 010;
`,
            "strict.js": String.raw`
'use strict';
function f() { return this; }
exports.thisInFunction = String(f());
try { undeclaredInStrict = 1; } catch (error) { exports.assignError = error.name; }
`,
        },
        "main.js",
    ));

test("ES modules import CommonJS packages with named exports, and CommonJS requires ES modules", () =>
    agree(
        {
            "main.mjs": String.raw`
import lib, {alpha, beta, gamma, fromStar, fromReexport} from 'cjs-lib';
import * as namespace from 'cjs-lib';
import json from './data.json' with { type: 'json' };
import plain from 'plain-object';
import dual from 'dual';
import {createRequire} from './loader.cjs';
console.log(alpha, beta, gamma, fromStar, fromReexport, typeof lib, lib.alpha === alpha);
// Node.js 23 and later add a 'module.exports' export (Nona does too); Node.js 22 does not.
console.log(Object.keys(namespace).filter(k => k !== 'module.exports').sort().join(), namespace.default === lib, (namespace['module.exports'] ?? lib) === lib);
console.log(json.items.length, plain.x, plain.y, dual);
console.log(createRequire().kind, createRequire().value);
`,
            "data.json": JSON.stringify({ items: [1, 2, 3] }),
            "loader.cjs": String.raw`
const esm = require('./esm-dep.mjs');
exports.createRequire = () => ({ kind: typeof esm, value: esm.value });
`,
            "esm-dep.mjs": `export const value = 'from esm';`,
            "node_modules/cjs-lib/package.json": JSON.stringify({
                name: "cjs-lib",
            }),
            "node_modules/cjs-lib/index.js": String.raw`
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.alpha = 'a';
module.exports.beta = 'b';
Object.defineProperty(exports, 'gamma', { enumerable: true, value: 'g' });
function __exportStar(m, e) { for (const k in m) if (k !== 'default' && !(k in e)) e[k] = m[k]; }
__exportStar(require('./star'), exports);
`,
            "node_modules/cjs-lib/star.js": String.raw`
exports.fromStar = 'star';
exports.fromReexport = require('./again').fromReexport;
`,
            "node_modules/cjs-lib/again.js": `module.exports = { fromReexport: 'again' };`,
            "node_modules/plain-object/package.json": JSON.stringify({
                name: "plain-object",
                main: "lib.js",
            }),
            "node_modules/plain-object/lib.js": `module.exports = { x: 1, y: 2 };`,
            "node_modules/dual/package.json": JSON.stringify({
                name: "dual",
                exports: { import: "./index.mjs", require: "./index.cjs" },
            }),
            "node_modules/dual/index.mjs": `export default 'dual esm';`,
            "node_modules/dual/index.cjs": `module.exports = 'dual cjs';`,
        },
        "main.mjs",
    ));

test("packages use exports patterns, imports, self-reference and type module", () =>
    agree(
        {
            "package.json": JSON.stringify({
                name: "app",
                type: "module",
                imports: { "#config": "./config.js", "#lib/*": "./lib/*.js" },
                exports: { ".": "./main.js", "./tools": "./lib/tools.js" },
            }),
            "main.js": String.raw`
import config from '#config';
import {tool} from '#lib/tools';
import {tool as again} from 'app/tools';
import feature from 'patterns/features/one';
import {required} from 'patterns/cjs';
console.log(config.mode, tool(), again === tool, feature, required);
`,
            "config.js": `export default { mode: 'module' };`,
            "lib/tools.js": `export function tool() { return 'tool'; }`,
            "node_modules/patterns/package.json": JSON.stringify({
                name: "patterns",
                exports: {
                    "./features/*": "./src/features/*.mjs",
                    "./cjs": { require: "./src/c.cjs", import: "./src/c.mjs" },
                },
            }),
            "node_modules/patterns/src/features/one.mjs": `export default 'feature one';`,
            "node_modules/patterns/src/c.mjs": `export const required = 'import condition';`,
            "node_modules/patterns/src/c.cjs": `exports.required = 'require condition';`,
        },
        "main.js",
    ));

test("pnpm-style linked packages are one module", () =>
    agree(
        {
            "index.js": String.raw`
const direct = require('linked');
const viaOther = require('other');
console.log(direct === viaOther.linked, direct.instance);
`,
            ".pnpm/linked@1.0.0/node_modules/linked/package.json":
                JSON.stringify({ name: "linked" }),
            ".pnpm/linked@1.0.0/node_modules/linked/index.js": `globalThis.instances = (globalThis.instances || 0) + 1; exports.instance = globalThis.instances;`,
            ".pnpm/other@1.0.0/node_modules/other/package.json": JSON.stringify(
                { name: "other" },
            ),
            ".pnpm/other@1.0.0/node_modules/other/index.js": `exports.linked = require('linked');`,
        },
        "index.js",
        (directory) => {
            const link = (target: string, path: string) => {
                mkdirSync(dirname(path), { recursive: true });
                symlinkSync(target, path, "junction");
            };
            link(
                join(directory, ".pnpm/linked@1.0.0/node_modules/linked"),
                join(directory, "node_modules/linked"),
            );
            link(
                join(directory, ".pnpm/other@1.0.0/node_modules/other"),
                join(directory, "node_modules/other"),
            );
            link(
                join(directory, ".pnpm/linked@1.0.0/node_modules/linked"),
                join(directory, ".pnpm/other@1.0.0/node_modules/linked"),
            );
        },
    ));

test("compile errors in packages name the file and the line", () => {
    const directory = mkdtempSync(join(tmpdir(), "nona-npm-"));
    try {
        writeTree(directory, {
            "index.js": `require('broken');`,
            "node_modules/broken/index.js": `exports.a = 1;\nexports.b = ;\n`,
        });
        const entry = join(directory, "index.js");
        const result = compile(readFileSync(entry, "utf8"), {
            fileName: entry,
            target: requireHostTarget(),
        });
        assert.equal(result.ok, false);
        if (result.ok) return;
        const diagnostic = result.diagnostics[0]!;
        assert.match(
            diagnostic.file.replaceAll("\\", "/"),
            /node_modules\/broken\/index\.js$/,
        );
        const text = readFileSync(
            join(directory, "node_modules/broken/index.js"),
            "utf8",
        );
        assert.equal(
            text.slice(0, diagnostic.span.start).split("\n").length,
            2,
            "the error is on line 2",
        );
    } finally {
        removeTemporaryDirectory(directory);
    }
});

test("a RegExp literal may follow export default (uuid), a division may follow a property named default", () => {
    const program = parse(
        lex("export default /^[0-9a-f]{8}$/i;", { module: true }),
        { module: true },
    );
    assert.equal(program.body[0]!.kind, "Export");
    const division = parse(
        lex("var x = a.default / 2 / 1, y = a?.extends / 3;"),
    );
    assert.equal(division.body.length, 1);
});

test("packages load the os, tty, util, url, assert, querystring and timers modules", () =>
    agree(
        {
            "main.js": String.raw`
const util = require('util'), os = require('node:os'), tty = require('tty'), url = require('url'), assert = require('assert'), qs = require('querystring');
console.log(util.format('%s=%d %i %j %%', 'a', 42.5, '7px', {x: [1, 2]}), util.format('x', 1, 'y'), util.format(1, {a: 1}));
console.log(util.inspect({a: 1, b: 's', c: [1, 2, {d: null}], e: new Map([[1, 2]]), f: function foo() {}, g: undefined}));
console.log(util.inspect({a: {b: {c: {d: {}}}}}), util.inspect("it's"), util.inspect([, 1]), util.inspect(new Set(['x'])), util.inspect(Object.create(null)));
class Custom { [util.inspect.custom]() { return 'custom!'; } }
console.log(util.inspect(new Custom()), util.inspect(-0), util.inspect(10n), util.inspect(Symbol('s')));
function A() {} function B() {} util.inherits(B, A);
console.log(new B() instanceof A, B.super_ === A, util.isDeepStrictEqual({a: [1, new Set([2])]}, {a: [1, new Set([2])]}), util.types.isDate(new Date()));
console.log(typeof os.EOL, os.EOL.length === (process.platform === 'win32' ? 2 : 1), typeof os.homedir(), os.platform() === process.platform, os.endianness(), tty.isatty(99));
console.log(url.pathToFileURL('/a b#c?d%e[f]^g|h~i{j};k,l@m&n=o+p$q!r').href, url.pathToFileURL('rel/../x/').href === url.pathToFileURL(process.cwd()).href + '/x/', url.fileURLToPath(url.pathToFileURL(__filename)) === __filename, url.parse('http://u@h:8/p?q=1#f').port, url.format({protocol: 'https', host: 'x.org', pathname: '/a'}));
assert.strictEqual(1, 1); assert.deepStrictEqual({a: [1]}, {a: [1]}); assert(true);
try { assert.strictEqual(1, 2); } catch (e) { console.log(e.name, e.code, e instanceof assert.AssertionError); }
assert.throws(() => { throw new TypeError('x'); }, TypeError);
assert.throws(() => { throw new Error('boom'); }, /boom/);
console.log(qs.stringify({a: [1, 2], b: 'x y'}), JSON.stringify(qs.parse('a=1&a=2&b=x+y&c')));
util.promisify((x, cb) => cb(null, x * 2))(21).then(v => console.log('promisify', v));
util.callbackify(async x => x + 1)(1, (e, v) => console.log('callbackify', e, v));
require('timers/promises').setTimeout(1, 'later').then(v => console.log(v));
`,
        },
        "main.js",
    ));

test("URL and URLSearchParams follow the URL Standard", () =>
    agree(
        {
            "main.js": String.raw`
const cases = [['https://user:pa ss@EXAMPLE.com:443/a/./b/../c?x=1 2#frag ment'], ['http://example.com:8080'], ['HTTP://a.b/%7Efoo/'], ['../d?q', 'http://h/a/b/c'],
 ['//other/p', 'https://h/x'], ['?y', 'http://h/a?b#c'], ['#z', 'http://h/a?b'], ['file:///C:/x/../y'], ['file:///tmp/a b'], ['mailto:me@x.org?subject=hi'],
 ['data:text/plain,hello world'], ['http://[::1]:3000/'], ['http://[2001:db8:0:0:1:0:0:1]/'], ['http://192.168.0.1.'], ['http://0x7f.1/'], ['http://a\\b\\c'],
 ['foo://host/p/../q'], ['urn:isbn:123'], ['http://ex.com/\u00e4?\u00fc#\u00f6'], ['blob:https://a.com/uuid'], ['http://'], ['nonsense'], ['http://a:99999/'], ['/abs', 'file:///C:/dir/f']];
for (const [input, base] of cases) {
  try { const u = new URL(input, base); console.log(JSON.stringify([u.href, u.origin, u.protocol, u.username, u.password, u.host, u.hostname, u.port, u.pathname, u.search, u.hash])); }
  catch (e) { console.log('error', input, e.name, e.code); }
}
const u = new URL('http://h/p?a=1&b=2&a=3');
u.searchParams.append('c', 'x y&z'); u.searchParams.delete('b');
console.log(u.href, JSON.stringify(u.searchParams.getAll('a')), u.searchParams.size);
u.search = '?k=v'; console.log(u.searchParams.get('k'));
u.hash = 'h'; u.pathname = '/n m'; u.port = '81'; u.hostname = 'Z.COM'; console.log(u.href, String(u), JSON.stringify({u}));
const p = new URLSearchParams({b: '2', a: '1'}); p.sort();
console.log(p.toString(), JSON.stringify([...p]), JSON.stringify([...p.keys()]), new URLSearchParams('?a=%20b+c&d').toString(), String(new URLSearchParams([['x', '1'], ['y', '\u00e9']])));
console.log(URL.canParse('x:'), URL.canParse('nope'), URL.canParse('a', 'http://b/'));
`,
        },
        "main.js",
    ));

test("node:crypto hashes, HMACs and random values", () =>
    agree(
        {
            "main.js": String.raw`
const crypto = require('crypto');
for (const algorithm of ['md5', 'sha1', 'sha256', 'sha384', 'sha512'])
  for (const text of ['', 'abc', 'x'.repeat(200)])
    console.log(algorithm, crypto.createHash(algorithm).update(text).digest('hex'), crypto.createHmac(algorithm, 'key'.repeat(algorithm === 'md5' ? 1 : 50)).update(text).digest('base64'));
const hash = crypto.createHash('sha256').update('a');
console.log(hash.copy().update('b').digest('hex'), hash.update(Buffer.from('b')).digest('hex'));
console.log(crypto.randomBytes(8).length, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(crypto.randomUUID()));
const n = crypto.randomInt(3, 9); console.log(n >= 3 && n < 9, crypto.timingSafeEqual(Buffer.from('ab'), Buffer.from('ab')), crypto.getRandomValues(new Uint32Array(4)).length);
try { crypto.createHash('nope'); } catch (e) { console.log(e.message); }
`,
        },
        "main.js",
    ));

test("packages require the zlib module", () =>
    agree(
        {
            "main.js": String.raw`
const zlib = require('zlib'), node = require('node:zlib');
console.log(zlib === node, typeof zlib.deflateSync, zlib.constants.Z_BEST_COMPRESSION, zlib.Z_SYNC_FLUSH, zlib.codes.Z_DATA_ERROR);
console.log(zlib.inflateSync(zlib.deflateSync('compressed by Nona')).toString(), zlib.gunzipSync(zlib.gzipSync(Buffer.from('gzip'))).toString(), zlib.crc32('abc'));
try { zlib.gunzipSync(Buffer.from('plain')); } catch (e) { console.log(e.code, e.errno, e.message); }
`,
        },
        "main.js",
    ));

test("nona build <package directory> builds its command; --conditions selects exports", () => {
    const directory = mkdtempSync(join(tmpdir(), "nona-npm-cli-"));
    try {
        writeTree(directory, {
            "package.json": JSON.stringify({
                name: "@me/tool",
                bin: { tool: "bin/tool.js" },
            }),
            "bin/tool.js":
                "const dep = require('dep'); console.log('tool', dep);",
            "node_modules/dep/package.json": JSON.stringify({
                name: "dep",
                exports: { custom: "./custom.js", default: "./plain.js" },
            }),
            "node_modules/dep/custom.js": "module.exports = 'custom';",
            "node_modules/dep/plain.js": "module.exports = 'plain';",
            "multi/package.json": JSON.stringify({
                name: "multi",
                bin: { a: "a.js", b: "b.js" },
            }),
        });
        const executable = (name: string) =>
            join(
                directory,
                process.platform === "win32" ? name + ".exe" : name,
            );
        const build = (...args: string[]) =>
            spawnSync(process.execPath, ["dist/cli.js", "build", ...args], {
                encoding: "utf8",
                windowsHide: true,
            });
        const run = (name: string) =>
            spawnSync(executable(name), [], {
                encoding: "utf8",
                windowsHide: true,
            }).stdout;
        let result = build(directory, "-o", executable("plain"));
        assert.equal(result.status, 0, result.stderr);
        assert.equal(run("plain"), "tool plain\n");
        result = build(
            directory,
            "-o",
            executable("custom"),
            "--conditions",
            "custom",
        );
        assert.equal(result.status, 0, result.stderr);
        assert.equal(run("custom"), "tool custom\n");
        result = build(join(directory, "multi"), "-o", executable("multi"));
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /several commands in "bin" \(a, b\)/);
    } finally {
        removeTemporaryDirectory(directory);
    }
});

test('the namespace of a CommonJS module has a "module.exports" export, as in Node.js 23 and later', () => {
    const { native } = runProject(
        {
            "main.mjs":
                "import * as ns from './lib.cjs';\nconsole.log(Object.keys(ns).join(), ns['module.exports'] === ns.default);\n",
            "lib.cjs": "exports.a = 1;",
        },
        "main.mjs",
    );
    assert.equal(native, "a,default,module.exports true\n");
});

test("import.meta has the url, filename and dirname of the module file", () =>
    agree(
        {
            "dir with space~[x]/main.mjs":
                "import {fileURLToPath} from 'node:url';\nimport {meta} from './lib.mjs';\nconsole.log(import.meta.url, import.meta.filename, import.meta.dirname, fileURLToPath(import.meta.url) === import.meta.filename, meta.filename);\n",
            "dir with space~[x]/lib.mjs":
                "export const meta = {filename: import.meta.filename};\n",
        },
        "dir with space~[x]/main.mjs",
    ));
