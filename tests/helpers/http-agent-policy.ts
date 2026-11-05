import type { AgentCase } from "./http-agent-cases.js";

export function effectiveAgentGC(
    requested: boolean,
    selection: string | undefined,
): boolean {
    return requested && selection !== "off";
}

function agentSource(
    source: string,
    requested: boolean,
    selection: string | undefined,
): string {
    // Forced GC can spend most of a minute just initializing streams/listeners.
    // Let runModulesOnHost enforce its existing 180000ms process bound instead
    // of cleaning up before any real I/O assertions can run. Normal builds and
    // the Node oracle retain the six-second diagnostic cleanup guard.
    const schedule = effectiveAgentGC(requested, selection)
        ? "return undefined;"
        : "return setTimeout(callback, 6000);";
    return `function cleanupWatchdog(callback) { ${schedule} }\n${source}`;
}

export function agentProgram(
    witness: Pick<AgentCase, "source" | "stressSource">,
    requested: boolean,
    selection: string | undefined,
) {
    const source = effectiveAgentGC(requested, selection)
        ? (witness.stressSource ?? witness.source)
        : witness.source;
    return {
        source: agentSource(source, requested, selection),
        options: {
            // Pass the request through unchanged. Only generate() decides
            // whether NONA_GC_STRESS=off suppresses compilation with stress.
            gcStress: requested,
            oracleSource: agentSource(witness.source, false, selection),
        },
    };
}
