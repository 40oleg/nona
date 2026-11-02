// This is the ONLY new compiler entry. Importing it cannot load the compiler.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startupAllowed } from "./http-startup-plan.mjs";
import { hashFile } from "./http-crash.mjs";
import { startupChildEnv } from "./http-startup-env.mjs";

async function main() {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        env: startupChildEnv(),
    }).trim();
    if (
        !startupAllowed(
            process.env,
            head,
            process.platform,
            process.arch,
            process.version,
        )
    )
        throw Error("Compiler entry requires exact hosted startup provenance");
    const [source, output, pipeline] = process.argv.slice(2);
    if (!source || !output || !["public", "helper"].includes(pipeline))
        throw Error("Expected source/output/public|helper");
    const receipt = {
        head,
        source,
        sourceHash: hashFile(source),
        output,
        pipeline,
        node: process.version,
        options: {
            fileName: source,
            target: "win32-x64",
            module: true,
            gcStress: true,
            printAsm: true,
            reportLink: true,
        },
        environment: {
            NONA_GC_STRESS: process.env.NONA_GC_STRESS,
            NONA_CACHE: process.env.NONA_CACHE,
        },
        builtinPruning:
            "Both paths use compileModuleToIR/prunedModuleGraph/pruneBuiltinModules",
        compilerFiles: Object.fromEntries(
            [
                "src/compiler.ts",
                "src/link.ts",
                "src/backend/x64/codegen.ts",
                "src/backend/pe/writer.ts",
                "src/frontend/builtin-pruning.ts",
                "dist/src/compiler.js",
                "dist/src/link.js",
                "dist/src/backend/x64/codegen.js",
                "dist/src/backend/pe/writer.js",
            ].map((path) => [path, hashFile(path)]),
        ),
        startedAt: new Date().toISOString(),
        status: "starting",
    };
    const save = () =>
        writeFileSync(
            output + ".build.json",
            JSON.stringify(receipt, null, 2) + "\n",
        );
    save();
    try {
        // Deliberately after the hosted guard. Pure tests never import this.
        const { compile, compileModuleToIR } =
            await import("../dist/src/compiler.js");
        const text = readFileSync(source, "utf8");
        let image, assembly;
        if (pipeline === "public") {
            const result = compile(text, receipt.options);
            if (!result.ok) throw Error(JSON.stringify(result.diagnostics));
            ({ image, assembly } = result);
            receipt.linkSelection = {
                path: "collectSourceUsage/requestLink",
                linked: result.linked,
                imports: result.imports,
            };
        } else {
            const { generate } =
                await import("../dist/src/backend/x64/codegen.js");
            const { linkPe } = await import("../dist/src/backend/pe/writer.js");
            const { fullRuntimeLink } = await import("../dist/src/link.js");
            receipt.options = {
                compileModuleToIR: {
                    fileName: source,
                    scriptPrelude: "",
                    target: "win32-x64",
                    lowering: { inline: true },
                },
                generate: {
                    gcStress: true,
                    listing: true,
                    link: "omitted: default fullRuntimeLink",
                },
                linkPe: { options: "omitted: defaults" },
            };
            const ir = compileModuleToIR(
                text,
                source,
                undefined,
                "",
                "win32-x64",
                { inline: true },
            );
            const program = generate(ir, { gcStress: true, listing: true });
            image = linkPe(program);
            assembly = program.assembly;
            receipt.linkSelection = {
                path: "generate default fullRuntimeLink (withSyntaxParts)",
                fullRuntimeLink,
                imports: program.imports,
            };
        }
        writeFileSync(output, image);
        writeFileSync(output + ".asm", assembly ?? "No assembly available\n");
        Object.assign(receipt, {
            status: "built",
            imageHash: hashFile(output),
            assemblyHash: hashFile(output + ".asm"),
        });
    } catch (error) {
        receipt.status = "failed";
        receipt.error = String(error.stack ?? error);
        throw error;
    } finally {
        receipt.endedAt = new Date().toISOString();
        save();
    }
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
    await main();
