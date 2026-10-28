// Checks relative links and #anchors in the repository's Markdown documents:
// README*.md, CONTRIBUTING*.md, AGENTS.md, CHANGELOG.md, docs/**/*.md and the
// site pages (site/src/**/*.md, where absolute links like /guide/x map to
// site/src/guide/x.md). Usage: node scripts/check-doc-links.mjs
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const siteSrc = join(root, "site", "src");
const skip = new Set(["node_modules", ".git", "generated", "dist", "tests"]);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (skip.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith(".md")) out.push(p);
    }
    return out;
}

const files = [
    ...readdirSync(root)
        .filter((n) => n.endsWith(".md"))
        .map((n) => join(root, n)),
    ...walk(join(root, "docs")),
    ...walk(siteSrc),
];

// VitePress turns punctuation into "-" ("nona:win32" -> "nona-win32"); GitHub drops it.
function vitepressSlug(text) {
    return text
        .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
}

function slug(heading, site) {
    if (site) {
        return vitepressSlug(
            heading.replace(/`|\*|<[^>]+>|\[([^\]]*)\]\([^)]*\)/g, "$1"),
        );
    }
    return heading
        .trim()
        .toLowerCase()
        .replace(/`|\*|_(?=\S)|<[^>]+>|\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s/g, "-");
}

const anchorCache = new Map();
function anchors(file) {
    if (anchorCache.has(file)) return anchorCache.get(file);
    const set = new Set();
    let fence = false;
    // Generated reference pages include a document synced into site/generated.
    const src = readFileSync(file, "utf8").replace(
        /<!--@include: (.+?)-->/g,
        (_, p) => {
            const f = resolve(dirname(file), p);
            return existsSync(f) ? readFileSync(f, "utf8") : "";
        },
    );
    for (const line of src.split("\n")) {
        if (/^\s*(```|~~~)/.test(line)) fence = !fence;
        if (fence) continue;
        const m = /^#{1,6}\s+(.*?)\s*(\{#([\w-]+)\})?\s*$/.exec(line);
        if (m) {
            if (m[3]) set.add(m[3]);
            const s = slug(
                m[1].replace(/\s*\{#[\w-]+\}$/, ""),
                file.startsWith(siteSrc),
            );
            let n = s;
            for (let i = 1; set.has(n); i++) n = `${s}-${i}`;
            set.add(n);
        }
        for (const a of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g))
            set.add(a[1]);
    }
    anchorCache.set(file, set);
    return set;
}

function target(from, path) {
    const inSite = from.startsWith(siteSrc);
    let p;
    if (path.startsWith("/")) {
        if (!inSite) return null;
        p = join(siteSrc, path);
    } else p = resolve(dirname(from), path);
    for (const c of [p, `${p}.md`, join(p, "index.md")])
        if (existsSync(c) && statSync(c).isFile()) return c;
    if (existsSync(p) && statSync(p).isDirectory()) return p;
    return undefined;
}

let checked = 0;
const errors = [];
for (const file of files) {
    let text = readFileSync(file, "utf8")
        .replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
        .replace(/`[^`\n]*`/g, "");
    for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const href = m[1];
        if (/^(https?:|mailto:|data:)/.test(href)) continue;
        const [path, hash] = href.split("#");
        checked++;
        const rel = relative(root, file);
        let dest = file;
        if (path) {
            dest = target(file, path);
            if (dest === null) continue; // site-absolute link outside the site
            if (dest === undefined) {
                // generated reference pages and files outside src are checked by the site build
                if (
                    /^\/(reference|changelog)/.test(path) &&
                    file.startsWith(siteSrc)
                )
                    continue;
                errors.push(`${rel}: missing target ${href}`);
                continue;
            }
        }
        if (hash && dest.endsWith(".md") && statSync(dest).isFile()) {
            if (!anchors(dest).has(decodeURIComponent(hash)))
                errors.push(`${rel}: missing anchor ${href}`);
        }
    }
}
console.log(`${checked} links checked in ${files.length} documents`);
for (const e of errors) console.log(e);
process.exit(errors.length ? 1 : 0);
