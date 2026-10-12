import { Assembler } from "../x64/assembler.js";
import { Arm64Assembler } from "../arm64/assembler.js";
import { x87Math } from "../x64/x87-math.js";
import { softwareMath, type MachineMath } from "./math.js";
import { detectHostTarget, getTarget, type Target } from "../../target.js";

// The runtime reaches the backend only through backend/machine/*: these
// re-exports are the machine model it emits code against (see
// docs/architecture.md, "Machine model").
export { Assembler, Arm64Assembler };
export type {
    Reg,
    Xmm,
    Mem,
    Condition,
    NativeArgumentKind,
} from "../x64/assembler.js";
export type { MachineMath } from "./math.js";

let activeTarget = detectHostTarget();
export function currentNativeTarget(): Target | undefined {
    return activeTarget;
}
/** Compilation is synchronous; nested compilations and errors restore the scope. */
export function withNativeTarget<T>(target: Target, body: () => T): T {
    if (!getTarget(target))
        throw new Error(`Unsupported native target ${target}`);
    const previous = activeTarget;
    activeTarget = target;
    try {
        return body();
    } finally {
        activeTarget = previous;
    }
}
export function createAssembler(name = ""): Assembler {
    const target =
        activeTarget === undefined ? undefined : getTarget(activeTarget);
    if (!target)
        throw new Error(
            "Unsupported native host; choose an explicit emission target",
        );
    if (target.arch === "arm64") {
        if (
            target.os !== "linux" &&
            target.os !== "darwin" &&
            target.os !== "win32"
        )
            throw new Error("Unsupported ARM64 native operating system");
        return new Arm64Assembler(name, target.os);
    }
    return new Assembler(name);
}
/** The transcendental floating-point steps of the active target: x87 on x86-64, software routines on ARM64. */
export function machineMath(): MachineMath {
    return getTarget(activeTarget ?? "")?.arch === "arm64"
        ? softwareMath
        : x87Math;
}
