import type { FunctionIR } from "./model.js";
import { removeRedundantInitializationChecks } from "./initialization.js";
import { foldNullishTests } from "./nullish.js";
import { markNumericOperations } from "./numbers.js";
import { coalesceMoves, propagateCopies } from "./copies.js";
import { foldConstants } from "./constants.js";
import { simplifyControlFlow } from "./control-flow.js";
import { replaceScalars } from "./scalar-replacement.js";

/**
 * IR clean-up after lowering (roadmap item 15): drop dead-zone checks of
 * initialized bindings, fold constants and branches on them, simplify the
 * control-flow graph (#146), forward copies, replace non-escaping object
 * and array literals by slots (#236, folded again when one is), mark operations on proven
 * Numbers (which may turn ToNumeric into a copy, so copies are forwarded
 * again) and let Number results go straight to their binding.
 */
export function optimizeFunction(
    fn: FunctionIR,
    captures: ReadonlyMap<string, ReadonlySet<number>> = new Map(),
): FunctionIR {
    let folded = propagateCopies(
        simplifyControlFlow(
            foldConstants(
                removeRedundantInitializationChecks(fn, captures.get(fn.id)),
            ),
        ),
    );
    // Nullish tests are decided once copies are forwarded and the tests of
    // `a || b` branch directly (#237); folding them needs another round.
    const decided = foldNullishTests(folded);
    if (decided !== folded)
        folded = simplifyControlFlow(foldConstants(decided));
    // A literal stored only into a replaced one (`{w: [v]}`) no longer
    // escapes once that one is gone: a few rounds.
    for (let round = 0; round < 3; round++) {
        const scalars = replaceScalars(folded);
        if (scalars === folded) break;
        folded = simplifyControlFlow(foldConstants(propagateCopies(scalars)));
    }
    return coalesceMoves(
        propagateCopies(markNumericOperations(propagateCopies(folded))),
    );
}
