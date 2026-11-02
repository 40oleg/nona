// Canonical diagnostic workload, shared by the driver and strict acceptance.
export function trialMatrix() {
    const trials = [];
    const add = (config) => {
        for (const runtime of ["node", "nona"])
            for (const gc of runtime === "nona" ? ["off", "stress"] : ["n/a"])
                trials.push({
                    route: "/big",
                    ...config,
                    runtime,
                    gc,
                    id: `trial-${trials.length + 1}`,
                });
    };
    // First run the unminimized #603 topology, with only settings reporting.
    add({
        fixture: "reference",
        listeners: "original",
        concurrency: 32,
        state: "keepalive",
        chunkBytes: 65536,
        chunks: 16,
    });
    for (const listeners of ["original", "none"])
        for (const concurrency of [1, 32])
            for (const state of [
                "keepalive",
                "queued-timeout",
                "idle-timeout",
                "destroy-queued",
            ])
                add({
                    fixture: "controlled",
                    listeners,
                    concurrency,
                    state,
                    chunkBytes: 65536,
                    chunks: 16,
                });
    // Reduced pressure, without implying that it reproduces the same fault.
    for (const listeners of ["original", "none"])
        add({
            fixture: "controlled",
            listeners,
            concurrency: 4,
            state: "destroy-queued",
            chunkBytes: 16384,
            chunks: 4,
        });
    return trials;
}

// The caller selects a fixed partition, never an arbitrary expected subset.
export function shardPlan(index) {
    if (typeof index === "string" && /^(?:[1-9]|10)$/.test(index))
        index = Number(index);
    if (!Number.isInteger(index) || index < 1 || index > 10)
        throw Error("Expected shard 1..10");
    return {
        index,
        id: `shard-${String(index).padStart(2, "0")}`,
        jobIndex: index - 1,
        jobKey: `windows-${index}`,
        trials: trialMatrix().slice((index - 1) * 6, index * 6),
    };
}

export function diagnosticArgs(args) {
    if (args.length !== 3 || !args[0] || args[1] !== "--shard")
        throw Error("Expected output-directory --shard 1..10");
    return { directory: args[0], shard: shardPlan(args[2]).index };
}
