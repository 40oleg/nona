// A mismatch exits 1; operational/incomplete evidence exits 2. The historical
// control invokes this exact command, rather than treating a crash as proof.
import { readFileSync } from "node:fs";
import { assessMode } from "./report.mjs";
try {
    const result = assessMode(
        JSON.parse(readFileSync(process.argv[2], "utf8")),
    );
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
} catch (error) {
    console.error(error);
    process.exitCode = 2;
}
