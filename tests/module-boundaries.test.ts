import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

// Layer direction of the compiler sources: the frontend and the IR know
// nothing about the runtime or the backends, and the runtime knows nothing
// about the frontend. Shared data lives in top-level modules (src/link.ts,
// src/shape-limits.ts, src/target.ts, …).
const root = resolve("src");
interface Edge {
    to: string;
    typeOnly: boolean;
}
function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? sources(join(directory, entry.name))
            : entry.name.endsWith(".ts")
              ? [join(directory, entry.name)]
              : [],
    );
}
/** Relative imports and re-exports of every source file, as paths relative to src/. */
const graph = new Map<string, Edge[]>(
    sources(root).map((file) => {
        const edges: Edge[] = [];
        for (const match of readFileSync(file, "utf8").matchAll(
            /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm,
        ))
            edges.push({
                to: relative(
                    root,
                    resolve(dirname(file), match[2]!.replace(/\.js$/, ".ts")),
                ).replaceAll("\\", "/"),
                typeOnly: match[1] !== undefined,
            });
        return [relative(root, file).replaceAll("\\", "/"), edges];
    }),
);
const layer = (path: string) =>
    path.includes("/") ? path.slice(0, path.indexOf("/")) : "";

test("the module graph is read from src/", () => {
    assert.ok(graph.size > 100);
    assert.ok(
        graph
            .get("compiler.ts")!
            .some((edge) => edge.to === "frontend/lexer.ts"),
    );
});

test("frontend and ir import nothing from runtime or backend", () => {
    const violations = [...graph].flatMap(([file, edges]) =>
        ["frontend", "ir"].includes(layer(file))
            ? edges
                  .filter((edge) =>
                      ["runtime", "backend"].includes(layer(edge.to)),
                  )
                  .map((edge) => file + " -> " + edge.to)
            : [],
    );
    assert.deepEqual(violations, []);
});

test("runtime imports nothing from frontend", () => {
    const violations = [...graph].flatMap(([file, edges]) =>
        layer(file) === "runtime"
            ? edges
                  .filter((edge) => layer(edge.to) === "frontend")
                  .map((edge) => file + " -> " + edge.to)
            : [],
    );
    assert.deepEqual(violations, []);
});

test("runtime reaches the backend only through backend/machine", () => {
    // The machine model (assembler, fragments, math steps) is exported by
    // backend/machine/*; x64-, ARM64- and OS-specific modules stay behind it.
    // Inline type imports (`import('…').Assembler`) count as well.
    const violations = [...graph].flatMap(([file, edges]) =>
        layer(file) === "runtime"
            ? edges
                  .filter(
                      (edge) =>
                          layer(edge.to) === "backend" &&
                          !edge.to.startsWith("backend/machine/"),
                  )
                  .map((edge) => file + " -> " + edge.to)
            : [],
    );
    for (const file of sources(join(root, "runtime")))
        for (const match of readFileSync(file, "utf8").matchAll(
            /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
        )) {
            const to = relative(
                root,
                resolve(dirname(file), match[1]!),
            ).replaceAll("\\", "/");
            if (layer(to) === "backend" && !to.startsWith("backend/machine/"))
                violations.push(
                    relative(root, file).replaceAll("\\", "/") + " -> " + to,
                );
        }
    assert.deepEqual(violations, []);
});

test("the shared program model lives in backend/machine, not in an object-file writer", () => {
    assert.ok(graph.has("backend/machine/model.ts"));
    // ELF, Mach-O and the runtime share it with the PE writer.
    const violations = [...graph].flatMap(([file, edges]) =>
        edges
            .filter((edge) => edge.to === "backend/pe/model.ts")
            .map((edge) => file + " -> " + edge.to),
    );
    assert.deepEqual(violations, []);
});

test("value imports have no cycles", () => {
    // Tarjan's strongly connected components over the non-type-only edges.
    const order = new Map<string, number>(),
        low = new Map<string, number>(),
        stack: string[] = [],
        onStack = new Set<string>(),
        cycles: string[][] = [];
    const visit = (node: string) => {
        order.set(node, order.size);
        low.set(node, order.get(node)!);
        stack.push(node);
        onStack.add(node);
        for (const { to, typeOnly } of graph.get(node)!) {
            if (typeOnly || !graph.has(to)) continue;
            if (!order.has(to)) {
                visit(to);
                low.set(node, Math.min(low.get(node)!, low.get(to)!));
            } else if (onStack.has(to))
                low.set(node, Math.min(low.get(node)!, order.get(to)!));
        }
        if (low.get(node) === order.get(node)) {
            const component: string[] = [];
            let member: string;
            do {
                member = stack.pop()!;
                onStack.delete(member);
                component.push(member);
            } while (member !== node);
            if (component.length > 1) cycles.push(component.sort());
        }
    };
    for (const node of graph.keys()) if (!order.has(node)) visit(node);
    assert.deepEqual(cycles, []);
});
