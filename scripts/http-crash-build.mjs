// One bounded compiler child per image; the diagnostic driver owns its timeout.
import { readFileSync, writeFileSync } from "node:fs";

// Never load the compiler as a side effect of a local unit import.
if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    process.platform !== "win32" ||
    process.arch !== "x64" ||
    !process.version.startsWith("v26.")
)
    throw new Error(
        "Compiler entry requires GitHub-hosted Windows x64 Node 26",
    );
const { compile } = await import("../dist/src/compiler.js");

const [source, output, gcMode] = process.argv.slice(2);
if (!source || !output || !["off", "stress"].includes(gcMode))
    throw new Error("Expected source, output, off|stress");
const result = compile(readFileSync(source, "utf8"), {
    fileName: source,
    target: "win32-x64",
    module: true,
    gcStress: gcMode === "stress",
    printAsm: true,
});
if (!result.ok) {
    console.error(JSON.stringify(result.diagnostics, null, 2));
    process.exitCode = 1;
} else {
    writeFileSync(output, result.image);
    writeFileSync(
        output + ".asm",
        result.assembly ?? "No assembly available\n",
    );
}
