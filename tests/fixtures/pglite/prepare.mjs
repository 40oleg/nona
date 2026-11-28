import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    assetsDir,
    packageDir,
    resources,
    verifiedFile,
    verifyPackage,
} from "./local-assets.mjs";

// Explicit preparation only: no downloads, package execution or compiler hook.
verifyPackage();
mkdirSync(assetsDir, { recursive: true });
for (const name of ["pglite.wasm", "pglite.data"]) {
    const expected = resources.files[`dist/${name}`];
    const bytes = verifiedFile(join(packageDir, "dist", name), expected);
    writeFileSync(join(assetsDir, name), bytes);
    verifiedFile(join(assetsDir, name), expected);
}
console.log("Prepared integrity-checked PGlite 0.3.14 local assets");
