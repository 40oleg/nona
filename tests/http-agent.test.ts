import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";
import { agentCases, type AgentCase } from "./helpers/http-agent-cases.js";
import { agentProgram } from "./helpers/http-agent-policy.js";

// Match generate()'s module-load selection, including explicit normal controls.
const gcSelection = process.env.NONA_GC_STRESS;

// Each tuple gets its own native program and unchanged host execution bound.
// Request stress even on PRs: generate() applies NONA_GC_STRESS=off centrally.
function expectNode(witness: AgentCase, gcStress: boolean): void {
    const program = agentProgram(witness, gcStress, gcSelection);
    const { native, oracle, oracleStatus, oracleStderr } = runModulesOnHost(
        { "main.mjs": program.source },
        "main.mjs",
        program.options,
    );
    const expected = witness.expected;
    assert.equal(oracleStatus, 0, oracleStderr + oracle);
    assert.equal(oracleStderr, "");
    assert.equal(native.error, undefined, native.stderr + native.stdout);
    assert.equal(native.status, 0, native.stderr + native.stdout);
    assert.equal(oracle, expected.join("\n") + "\n");
    assert.equal(native.stdout, oracle);
    assert.equal(native.stderr, oracleStderr);
}

for (const witness of agentCases) {
    test(witness.name, () => expectNode(witness, true));
    if (witness.control)
        test(witness.name + " (non-stress control)", () =>
            expectNode(witness, false),
        );
}
