// Node is the development bootstrap host. The generated compiler has native
// host imports and compiles the original compiler and RegExp engine directly.
import {
    cpSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { compile } from "../dist/src/compiler.js";
import { regexpVmSource } from "../dist/src/runtime/regexp-vm-source.js";
import {
    compilerCryptoSource,
    compilerUrlSource,
    compilerHomeSource,
} from "../dist/src/selfhost-adapters.js";
import { nonaVersion } from "../dist/src/version.js";

const target = process.argv[2] || "linux-x64";
const output = resolve(process.argv[3] || "out/selfhost/stage1");
const sources = resolve(dirname(output), "sources");
cpSync(resolve("dist/src"), sources, { recursive: true });
const entry = resolve(sources, "selfhost-entry.mjs");
const cliMode = process.argv.includes("--cli");
const source = `import {compile,compileToIR,compileModuleToIR} from './compiler.js';
${cliMode ? "import {main} from './cli.js';" : ""}
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(process.versions.nona?1:2);
${cliMode ? "" : "if(args.length!==3)throw new Error('Usage: stage1 <input> <output> <target>');"}
function serialize(data){return JSON.stringify(data,(_key,value)=>typeof value==='bigint'?{bigint:String(value)}:value)}
if(process.env.NONA_SELFHOST_TRACE)globalThis.__nonaSelfhostTrace=(kind,data)=>writeFileSync(process.env.NONA_SELFHOST_TRACE+'.'+kind+'.json',serialize(data));
if(process.env.NONA_SELFHOST_DUMP_IR){
 const input=${cliMode ? "args[1]" : "args[0]"},target=${cliMode ? "args[args.indexOf('--target')+1]" : "args[2]"},text=readFileSync(input,'utf8'),module=input.endsWith('.mjs');
 const ir=module?compileModuleToIR(text,input,undefined,'',target):compileToIR(text,input,undefined,target);
 writeFileSync(process.env.NONA_SELFHOST_DUMP_IR,serialize(ir));
}else{
 ${
     cliMode
         ? "process.exitCode=main(args);"
         : `
 const text=readFileSync(args[0],'utf8'),module=args[0].endsWith('.mjs');
 const result=compile(text,{fileName:args[0],target:args[2],module});
 if(!result.ok){console.error(JSON.stringify(result.diagnostics));process.exitCode=1}
 else writeFileSync(args[1],result.image);
 `
 }
}
`;
/** String.replace that fails when the pattern is absent, so a reformatted source cannot silently skip an edit. */
function replaceChecked(text, pattern, replacement, file) {
    const result = text.replace(pattern, replacement);
    if (result === text)
        throw new Error(
            "bootstrap-selfhost: " + file + " no longer contains " + pattern,
        );
    return result;
}
// The native compiler has no node:vm: its RegExp literal validator embeds the
// runtime's pattern compiler instead of evaluating it in a separate context.
writeFileSync(
    resolve(sources, "regexp-validator.js"),
    "const compilePattern=(" +
        regexpVmSource +
        ").compile;\nexport function validateRegExp(pattern,flags){compilePattern(pattern,flags);}\n",
);
writeFileSync(entry, source);
const codegen = resolve(sources, "backend/x64/codegen.js");
let generator = readFileSync(codegen, "utf8");
generator = replaceChecked(
    generator,
    "export function generate(",
    "function generateOriginal(",
    "codegen.js",
);
generator += `\nexport function generate(module,options={}){const program=generateOriginal(module,options);if(globalThis.__nonaSelfhostTrace)globalThis.__nonaSelfhostTrace('program',{...program,fragments:program.fragments.map(fragment=>({...fragment,bytes:Buffer.from(fragment.bytes).toString('base64')}))});return program}\n`;
writeFileSync(codegen, generator);
// The runtime prelude is lowered in backend/x64/preludes.js.
const preludesPath = resolve(sources, "backend/x64/preludes.js");
writeFileSync(
    preludesPath,
    replaceChecked(
        readFileSync(preludesPath, "utf8"),
        "cachedRuntimePreludes.set(preludeKey, prelude);",
        "if(globalThis.__nonaSelfhostTrace)globalThis.__nonaSelfhostTrace('prelude',prelude);cachedRuntimePreludes.set(preludeKey, prelude);",
        "preludes.js",
    ),
);
if (cliMode) {
    writeFileSync(
        resolve(sources, "selfhost-crypto.js"),
        compilerCryptoSource(target),
    );
    writeFileSync(resolve(sources, "selfhost-url.js"), compilerUrlSource);
    writeFileSync(
        resolve(sources, "selfhost-home.js"),
        compilerHomeSource(target),
    );
    const cliPath = resolve(sources, "cli.js");
    let cli = readFileSync(cliPath, "utf8");
    cli = replaceChecked(
        cli,
        'from "node:crypto"',
        "from './selfhost-crypto.js'",
        "cli.js",
    );
    cli = replaceChecked(
        cli,
        'from "node:url"',
        "from './selfhost-url.js'",
        "cli.js",
    );
    cli = replaceChecked(
        cli,
        "process.exitCode = main(process.argv.slice(2));",
        "",
        "cli.js",
    );
    writeFileSync(cliPath, cli);
    const cachePath = resolve(sources, "cache.js");
    let cache = readFileSync(cachePath, "utf8");
    cache = replaceChecked(
        cache,
        'from "node:crypto"',
        "from './selfhost-crypto.js'",
        "cache.js",
    );
    cache = replaceChecked(
        cache,
        /^import \{ fileURLToPath \} from "node:url";\r?\n/m,
        "",
        "cache.js",
    );
    cache = replaceChecked(
        cache,
        'from "node:os"',
        "from './selfhost-home.js'",
        "cache.js",
    );
    // The native distribution contains compiled functions, not a JavaScript
    // source installation. Embed a fingerprint of the prepared compiler sources.
    cache = replaceChecked(
        cache,
        /function compilerFingerprint\(\) \{[\s\S]*?\r?\n\}/,
        'function compilerFingerprint(){return "SELFHOST_FINGERPRINT";}',
        "cache.js",
    );
    writeFileSync(cachePath, cache);
    const hash = createHash("sha256");
    function fingerprint(directory) {
        for (const entry of readdirSync(directory, {
            withFileTypes: true,
        }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) fingerprint(path);
            else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))
                hash.update(path.slice(sources.length).replaceAll("\\", "/"))
                    .update("\0")
                    .update(readFileSync(path))
                    .update("\0");
        }
    }
    fingerprint(sources);
    writeFileSync(
        cachePath,
        replaceChecked(
            cache,
            "SELFHOST_FINGERPRINT",
            hash.digest("hex"),
            "cache.js",
        ),
    );
}
const result = compile(source, { fileName: entry, target, module: true });
mkdirSync(dirname(output), { recursive: true });
if (!result.ok) {
    writeFileSync(
        output + ".diagnostics.json",
        JSON.stringify(result.diagnostics, null, 2),
    );
    console.error(JSON.stringify(result.diagnostics, null, 2));
    process.exitCode = 1;
} else {
    writeFileSync(output, result.image, { mode: 0o755 });
    writeFileSync(output + ".version", nonaVersion + "\n");
    console.log("Stage 1 image compiled:", target, result.image.length, output);
}
