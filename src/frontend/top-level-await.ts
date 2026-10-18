import type * as A from "./ast.js";

/** An await expression or for await in `body` outside every function. */
export function containsTopLevelAwait(body: A.Statement[]): boolean {
    const seen = new WeakSet<object>();
    const found = (node: unknown): boolean => {
        if (!node || typeof node !== "object" || seen.has(node)) return false;
        seen.add(node);
        if (Array.isArray(node)) return node.some(found);
        const kind = (node as A.Node).kind;
        if (kind === "Await") return true;
        if (kind === "ForOf" && (node as A.ForOf).await) return true;
        // Class field initializers and static blocks are functions too.
        if (kind === "FunctionExpression" || kind === "Function") return false;
        for (const key in node)
            if (key !== "span" && found((node as Record<string, unknown>)[key]))
                return true;
        return false;
    };
    return found(body);
}
