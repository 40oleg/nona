import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { lex, setRegExpValidator } from "../src/frontend/lexer.js";
import { validateRegExp } from "../src/regexp-validator.js";

// ES2025 duplicate named capture groups (#319): one name in different
// alternatives; groups and $<name> take the group that participated.
const cases = [
    String.raw`
const show = (m) => m === null ? 'null' : JSON.stringify([m[0], m.groups, Object.keys(m.groups)]);
const re = /(?<year>\d{4})-(?<month>\d\d)|(?<month>\d\d)\/(?<year>\d{4})/;
console.log(show(re.exec('2024-05')));
console.log(show(re.exec('05/2024')));
console.log(show(re.exec('none')));
console.log(show(/(?<a>x)|(?<b>y)|(?<a>z)/.exec('z')));
console.log(show(/(?<a>x)|(?<b>y)|(?<a>z)/.exec('y')));
console.log(show(/(?:(?<a>x)|(?<a>y))?q/.exec('q')));
console.log(JSON.stringify('x1 y2 z3'.match(/(?<k>x)\d|(?<k>y)\d/).groups));
console.log(JSON.stringify([...'x1 y2 z3'.matchAll(/(?<k>x)(?<n>\d)|(?<k>y)(?<n>\d)/g)].map((m) => m.groups)));
console.log(/^(?:(?<a>x)|(?<a>y))$/.test('y'), /^(?:(?<a>x)|(?<a>y))$/.test('z'));
console.log(JSON.stringify('axbyc'.split(/(?<s>x)|(?<s>y)/)));
`,
    String.raw`
console.log(/^(?:(?<a>x)|(?<a>y))\k<a>$/.test('xx'), /^(?:(?<a>x)|(?<a>y))\k<a>$/.test('yy'));
console.log(/^(?:(?<a>x)|(?<a>y))\k<a>$/.test('xy'), /^(?:(?<a>x)|(?<a>y)|z)\k<a>$/.test('z'));
console.log(/(?<=(?:(?<a>x)|(?<a>y))\k<a>)q/.exec('yyq')?.index, /(?<=(?:(?<a>x)|(?<a>y))\k<a>)q/.exec('xyq'));
console.log(/(?<=\k<a>(?:(?<a>x)|(?<a>y)))q/.exec('xxq')?.index);
console.log(/(?:(?<a>x)|(?<a>y))+/.exec('xy').groups.a, /(?:(?<a>x)|(?<a>y))+/.exec('yx').groups.a);
console.log(/^(?:(?:(?<a>x)|(?<a>y))\k<a>){2}$/.test('xxyy'), /^(?:(?:(?<a>x)|(?<a>y))\k<a>){2}$/.test('xxyx'));
console.log(/(?:(?<a>x)|(?<a>y))\k<a>/i.test('xX'));
console.log(JSON.stringify(/(?<k>x)|(?<k>y)/d.exec('y').indices.groups), JSON.stringify(/(?<k>x)|(?<k>y)/d.exec('x').indices.groups));
`,
    String.raw`
const re = /(?<w>a)(?<n>\d)|(?<n>\d)(?<w>b)/g;
console.log('a1 2b'.replace(re, '[$<w>$<n>]'));
console.log('a1 2b'.replaceAll(re, '<$<n>|$<w>>'));
console.log('a1 2b'.replace(re, (...args) => JSON.stringify(args[args.length - 1])));
console.log('zz'.replace(/(?<v>x)|(?<v>z)/, '{$<v>}'));
console.log('q'.replace(/(?:(?<v>x)|(?<v>y))?q/, '{$<v>}'));
`,
    String.raw`
const build = new RegExp('(?<d>[0-9]+)|(?<d>[a-z]+)', 'g');
console.log(JSON.stringify([...'12 ab'.matchAll(build)].map((m) => m.groups.d)));
for (const source of ['(?<a>x)(?<a>y)', '(?:(?<a>x)|(?<a>y))(?<a>z)', '(?<a>x)|(?:(?<a>y)(?<a>z))', '(?<a>x)(?=(?<a>y))', '(?<a>(?<a>x))', '(?<a>x)|(?<a>y)\\k<b>'])
    try { new RegExp(source); console.log('accepted', source) } catch (error) { console.log(error.name, source) }
for (const source of ['(?<a>x)|(?<a>y)', '(?:(?<a>x)|(?<a>y))\\k<a>', '(?:(?<a>x)|(?<a>y))|(?<a>z)', '((?<a>x)|(?<b>y))|(?<a>z)(?<b>w)', '(?<a>x)|(?=(?<a>y))'])
    console.log(new RegExp(source).source);
`,
];

for (const [index, source] of cases.entries()) {
    test("duplicate named groups match the Node oracle " + index, () => {
        const native = runOnHost(source, { gcStress: true });
        assert.equal(native.status, 0, JSON.stringify(native));
        assert.equal(native.stdout, runOracle(source).stdout);
    });
}

test("RegExp literals reject a name repeated where both groups may participate", () => {
    setRegExpValidator(validateRegExp);
    assert.equal(lex("/(?<a>x)|(?<a>y)/")[0]?.kind, "regexp");
    assert.equal(
        lex(String.raw`/(?:(?<a>x)|(?<a>y))\k<a>/`)[0]?.kind,
        "regexp",
    );
    for (const pattern of [
        "/(?<a>x)(?<a>y)/",
        "/(?:(?<a>x)|(?<a>y))(?<a>z)/",
        "/(?<a>x)|(?:(?<a>y)(?<a>z))/",
        "/(?<a>x)(?=(?<a>y))/",
    ])
        assert.throws(() => lex(pattern), /Invalid regular expression pattern/);
});
