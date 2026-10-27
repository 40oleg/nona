export const performance = globalThis.performance;
export const PerformanceEntry = globalThis.PerformanceEntry;
export const PerformanceMark = globalThis.PerformanceMark;
export const PerformanceMeasure = globalThis.PerformanceMeasure;
export const constants = {};
export function monitorEventLoopDelay() {
    return {
        enable() {},
        disable() {},
        reset() {},
        percentile() {
            return 0;
        },
        min: 0,
        max: 0,
        mean: 0,
        stddev: 0,
    };
}
export class PerformanceObserver {
    constructor(callback) {
        this.callback = callback;
    }
    observe() {}
    disconnect() {}
}
export default {
    performance,
    PerformanceEntry,
    PerformanceMark,
    PerformanceMeasure,
    constants,
    monitorEventLoopDelay,
    PerformanceObserver,
};
