import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
    formatPow10x128Data,
    parsePow10x128Data,
} from "../src/runtime/data/pow10-data.js";

// The 128-bit power-of-ten tables of rt.formatNumber and rt.parseNumber are
// committed data. Computing them with BigInt while building the runtime made
// every self-hosted compile take minutes on x64 and time out on arm64 (#558).
test("committed power-of-ten tables match their BigInt construction", async () => {
    const { formatPow10Table, parsePow10Table } = await import(
        pathToFileURL(resolve("scripts/generate-pow10-tables.mjs")).href
    );
    assert.equal(formatPow10x128Data.length, 617 * 16);
    assert.equal(parsePow10x128Data.length, 651 * 16);
    assert.ok(formatPow10x128Data.equals(formatPow10Table()));
    assert.ok(parsePow10x128Data.equals(parsePow10Table()));
});
