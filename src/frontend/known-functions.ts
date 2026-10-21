import type * as A from "./ast.js";
import type { Binding, BoundFunction, StorageBinding } from "./bound.js";

/**
 * Known-function bindings (#239): the plain function declaration that
 * initializes a local (null: several declarations or not a plain function),
 * and the bindings that something else writes or may write.
 */
export function knownFunctionTracker(
    functionNodes: Map<A.FunctionNode, BoundFunction>,
) {
    const declared = new Map<StorageBinding, A.FunctionDeclaration | null>(),
        otherWrites = new Set<StorageBinding>();
    return {
        /** A function declaration initializes `b`. */
        declare(b: Binding, declaration: A.FunctionDeclaration): void {
            if (b.kind === "globalProperty") return;
            b.assigned = true;
            const plain = !declaration.generator && !declaration.async;
            declared.set(b, plain && !declared.has(b) ? declaration : null);
        },
        /** Something else writes `b`. */
        written(b: Binding): void {
            if (b.kind === "globalProperty") return;
            b.assigned = true;
            otherWrites.add(b);
        },
        /** Something else writes the innermost visible binding of `name`. */
        writeVisible(scopes: Map<string, Binding>[], name: string): void {
            const visible = scopes
                .map((scope) => scope.get(name))
                .reverse()
                .find(Boolean);
            if (visible) this.written(visible);
        },
        /** A with object or an eval var environment may answer for `b`. */
        shadowed(b: Binding): void {
            if (b.kind !== "globalProperty") otherWrites.add(b);
        },
        /** Marks the locals that only their one plain function declaration writes. */
        mark(): void {
            for (const [b, declaration] of declared)
                if (
                    declaration &&
                    b.kind === "local" &&
                    b.name !== "arguments" &&
                    !otherWrites.has(b)
                )
                    b.knownFunction = functionNodes.get(declaration);
        },
    };
}
