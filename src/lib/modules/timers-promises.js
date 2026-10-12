function aborted(signal) {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    error.code = "ABORT_ERR";
    error.cause = signal && signal.reason;
    return error;
}
export function setTimeout(delay, value, options) {
    const signal = options && options.signal;
    if (signal && signal.aborted) return Promise.reject(aborted(signal));
    return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => resolve(value), delay);
        if (signal)
            signal.addEventListener(
                "abort",
                () => {
                    globalThis.clearTimeout(timer);
                    reject(aborted(signal));
                },
                { once: true },
            );
    });
}
export function setImmediate(value, options) {
    const signal = options && options.signal;
    if (signal && signal.aborted) return Promise.reject(aborted(signal));
    return new Promise((resolve) =>
        globalThis.setImmediate(() => resolve(value)),
    );
}
export async function* setInterval(delay, value) {
    for (;;) yield await setTimeout(delay, value);
}
export const scheduler = {
    wait: (delay, options) => setTimeout(delay, undefined, options),
    yield: () => setImmediate(),
};
export default { setTimeout, setImmediate, setInterval, scheduler };
