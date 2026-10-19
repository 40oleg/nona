import { appendFileSync } from "node:fs";
import type { FunctionIR } from "../../ir/model.js";

/**
 * NONA_FN_NAMES=<file>: the compiler appends "id name module:offset" per
 * compiled function (FunctionIR.origin), so that profiling tools
 * (scripts/profile-runtime.mjs, bench/http/profile.sh) can name js.fn.N;
 * preludes.ts writes the runtime prelude's text next to it.
 */
export function recordName(fn: FunctionIR): void {
    const file = process.env.NONA_FN_NAMES;
    if (!file) return;
    appendFileSync(
        file,
        fn.id +
            " " +
            (fn.name || fn.source?.name || "") +
            (fn.origin ? ` ${fn.origin.script}:${fn.origin.start}` : "") +
            "\n",
    );
}
