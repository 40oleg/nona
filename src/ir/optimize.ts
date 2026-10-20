import type { FunctionIR } from "./model.js";
import { removeRedundantInitializationChecks } from "./initialization.js";
import { foldNullishTests } from "./nullish.js";
import { markNumericOperations } from "./numbers.js";
import { coalesceMoves, propagateCopies } from "./copies.js";
import { foldConstants } from "./constants.js";
import { simplifyControlFlow } from "./control-flow.js";
import { versionTypedLoops } from "./typed-loops.js";

/**
 * IR clean-up after lowering (roadmap item 15): drop dead-zone checks of
 * initialized bindings, fold constants and branches on them, simplify the
 * control-flow graph (#146), forward copies, mark operations on proven
 * Numbers (which may turn ToNumeric into a copy, so copies are forwarded
 * again), let Number results go straight to their binding and version
 * counted typed array loops (#240).
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
    return versionTypedLoops(
        coalesceMoves(
            propagateCopies(markNumericOperations(propagateCopies(folded))),
        ),
    );
}
