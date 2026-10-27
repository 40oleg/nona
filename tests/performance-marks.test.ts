import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost, runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

function expectOracle(source: string): void {
    const native = runOnHost(source);
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, runOracle(source).stdout);
}

function expectModule(source: string): void {
    const run = runModulesOnHost({ "main.mjs": source }, "main.mjs");
    assert.equal(run.native.error, undefined);
    assert.equal(run.native.status, 0, run.native.stderr);
    assert.equal(run.native.stdout, run.oracle);
}

test("performance.timeOrigin is the epoch time of program start", () =>
    expectOracle(`
console.log(typeof performance.timeOrigin);
console.log(Math.abs(performance.timeOrigin + performance.now() - Date.now()) < 50);
console.log(Object.keys(performance.toJSON()).join());
`));

test("performance.mark and measure in names and options forms", () =>
    expectOracle(`
const a = performance.mark('a', { detail: { x: 1 } });
for (let i = 0; i < 1000; i++);
const b = performance.mark('b');
console.log(a.name, a.entryType, a.duration, JSON.stringify(a.detail), b.detail);
const m1 = performance.measure('m1', 'a', 'b');
console.log(m1.name, m1.entryType, m1.duration >= 0, m1.startTime === a.startTime);
const m2 = performance.measure('m2', { start: 'a', end: 'b', detail: 'd' });
console.log(m2.duration === m1.duration, m2.detail);
const m3 = performance.measure('m3', { start: 10, duration: 5 });
console.log(m3.startTime, m3.duration);
const m4 = performance.measure('m4', { end: 20, duration: 5 });
console.log(m4.startTime, m4.duration);
const m5 = performance.measure('m5');
console.log(m5.startTime, m5.duration >= 0);
try { performance.measure('bad', 'missing'); } catch (e) { console.log(e.name); }
console.log(performance.getEntriesByName('m1').length, performance.getEntriesByName('a', 'measure').length);
console.log(performance.getEntriesByType('mark').map(e => e.name).join());
console.log(performance.getEntries().length);
`));

test("clearMarks and clearMeasures with and without a name", () =>
    expectOracle(`
performance.mark('a'); performance.mark('b'); performance.mark('a');
performance.measure('m', 'a'); performance.measure('n', 'b');
performance.clearMarks('a');
console.log(performance.getEntriesByType('mark').map(e => e.name).join());
performance.clearMeasures('m');
console.log(performance.getEntriesByType('measure').map(e => e.name).join());
performance.clearMarks();
console.log(performance.getEntriesByType('mark').length, performance.getEntriesByType('measure').length);
performance.clearMeasures();
console.log(performance.getEntries().length);
`));

test("PerformanceMark and PerformanceMeasure come from node:perf_hooks", () =>
    expectModule(`
import { PerformanceMark, PerformanceMeasure, PerformanceEntry } from 'node:perf_hooks';
const mark = performance.mark('x');
const measure = performance.measure('y', 'x');
console.log(mark instanceof PerformanceMark, mark instanceof PerformanceEntry, mark instanceof PerformanceMeasure);
console.log(measure instanceof PerformanceMeasure, measure instanceof PerformanceMark);
console.log(JSON.stringify(Object.keys(mark.toJSON())));
`));

test("issue repro", () =>
    expectOracle(`
performance.mark("a");
for (let i = 0; i < 1000; i++);
performance.mark("b");
const m = performance.measure("loop", "a", "b");
console.log(typeof performance.timeOrigin, m.name, m.duration >= 0, performance.getEntriesByName("loop").length);
`));
