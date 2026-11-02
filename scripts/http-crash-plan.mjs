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
