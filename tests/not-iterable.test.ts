import { test } from "node:test";
import { expectProgram } from "./helpers/program.js";
import { runOracle } from "./helpers/oracle.js";

const cases: [string, string][] = [
    ["spread of a number", "[...5]"],
    ["destructuring an object", "const [a] = {}"],
    ["for-of over undefined", "for (const x of undefined);"],
    ["new Map with a number", "new Map(5)"],
];
for (const [name, code] of cases)
    test(`not iterable: ${name}`, () => {
        const source = `try { ${code}; console.log("no error"); } catch (e) { console.log(e instanceof TypeError, e.message.includes("is not iterable")); }`;
        const expected = runOracle(source).stdout;
        expectProgram(source, expected);
        if (expected !== "true true\n") throw new Error(expected);
    });
