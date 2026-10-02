// Copies the English reference documents from docs/ (and CHANGELOG.md and
// PERFORMANCE.md) into
// site/generated/, rewriting repository-relative links: documents published on
// the site point to their pages, everything else to the file on GitHub.
// docs/*.md stay the single source of truth; site/generated/ is not committed.
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, posix, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(site);
const out = join(site, 'generated');
const github = 'https://github.com/40oleg/nona/blob/main/';

/** Repository file → generated file name. */
const sources = {
  'docs/host-apis.md': 'host-apis.md',
  'docs/process.md': 'process.md',
  'docs/fs.md': 'fs.md',
  'docs/network.md': 'network.md',
  'docs/ffi.md': 'ffi.md',
  'docs/windows-executables.md': 'windows-executables.md',
  'docs/test262.md': 'test262.md',
  'CHANGELOG.md': 'changelog.md',
  'PERFORMANCE.md': 'performance.md',
};

/** Repository file → site page (without base and .html). */
const pages = {
  'docs/host-apis.md': '/reference/host-apis',
  'docs/process.md': '/reference/process',
  'docs/fs.md': '/reference/fs',
  'docs/network.md': '/reference/network',
  'docs/ffi.md': '/reference/ffi',
  'docs/windows-executables.md': '/reference/windows-executables',
  'docs/test262.md': '/reference/test262',
  'docs/language-support.md': '/guide/language-support',
  'docs/es2020-contract.md': '/guide/compatibility',
  'docs/v0.17-v0.20-status.md': '/guide/status',
  'docs/matrix-calculator.md': '/examples/matrix-calculator',
  'CHANGELOG.md': '/changelog',
  'PERFORMANCE.md': '/guide/performance',
  'AGENTS.md': '/contributing',
  'README.md': '/',
};

function rewrite(target, from) {
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(target)) return target;
  const hash = target.indexOf('#');
  const path = hash < 0 ? target : target.slice(0, hash);
  const anchor = hash < 0 ? '' : target.slice(hash);
  const file = posix.normalize(posix.join(posix.dirname(from), path));
  if (file.startsWith('..')) throw new Error(`${from}: link ${target} leaves the repository`);
  if (pages[file]) return pages[file] + anchor;
  return github + file + anchor;
}

/** Rewrite Markdown link targets outside fenced code blocks and code spans. */
function convert(text, from) {
  let fenced = false;
  return text.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    return line.split(/(`[^`]*`)/).map(part =>
      part.startsWith('`') ? part : part.replace(/\]\(([^)\s]+)\)/g, (_, target) => `](${rewrite(target, from)})`)
    ).join('');
  }).join('\n');
}

rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
for (const [from, name] of Object.entries(sources)) {
  const text = readFileSync(join(root, from), 'utf8');
  writeFileSync(join(out, name), convert(text, from));
}
console.log(`synced ${Object.keys(sources).length} documents into ${relative(root, out)}`);
