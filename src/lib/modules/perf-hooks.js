export const performance = globalThis.performance;
export const constants = {};
export function monitorEventLoopDelay() { return {enable() {}, disable() {}, reset() {}, percentile() { return 0; }, min: 0, max: 0, mean: 0, stddev: 0}; }
export class PerformanceObserver { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} }
export default {performance, constants, monitorEventLoopDelay, PerformanceObserver};
