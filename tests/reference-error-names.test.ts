import { test } from "node:test";
import assert from "node:assert/strict";
import { expectProgram } from "./helpers/program.js";
import { runOracle } from "./helpers/oracle.js";

const cases: [string, string, string][] = [
    [
        "undeclared global read",
        "try { undefinedVar; } catch (e) { console.log(e.name + ': ' + e.message); }",
        "ReferenceError: undefinedVar is not defined\n",
    ],
    [
        "typeof of an undeclared global does not throw",
        "console.log(typeof undefinedVar);",
        "undefined\n",
    ],
    [
        "TDZ read in the same scope",
        "try { x; let x = 1; } catch (e) { console.log(e.name + ': ' + e.message); }",
        "ReferenceError: Cannot access 'x' before initialization\n",
    ],
    [
        "TDZ read of const inside a closure",
        "const f = () => y; try { f(); } catch (e) { console.log(e.name + ': ' + e.message); } let y = 1; console.log(f());",
        "ReferenceError: Cannot access 'y' before initialization\n1\n",
    ],
    [
        "strict assignment to an undeclared name",
        "'use strict'; try { undeclared = 1; } catch (e) { console.log(e.name + ': ' + e.message); }",
        "ReferenceError: undeclared is not defined\n",
    ],
];

for (const [name, source, expected] of cases)
    test(`ReferenceError names the identifier: ${name}`, () => {
        assert.equal(runOracle(source).stdout, expected);
        expectProgram(source, expected);
    });
