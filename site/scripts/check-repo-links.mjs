// Links to files of this repository (github.com/40oleg/nona/{blob,tree,edit}/main/…)
// cannot be checked by an external link checker before the pull request is
// merged, so check them against the working tree instead. Run after a build.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(site);
const dist = join(site, '.vitepress', 'dist');
const pattern = /https:\/\/github\.com\/40oleg\/nona\/(?:blob|tree|edit)\/main\/([^"'#?<>\s)\\]+)/g;
const missing = new Set();
let checked = 0;

function walk(directory) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.html')) {
      for (const [, file] of readFileSync(path, 'utf8').matchAll(pattern)) {
        if (file.includes(':path')) continue; // the editLink pattern in the theme configuration
        checked++;
        if (!existsSync(join(root, decodeURIComponent(file)))) missing.add(file);
      }
    }
  }
}

walk(dist);
if (missing.size) {
  console.error('Links to missing repository files:\n' + [...missing].map(file => '  ' + file).join('\n'));
  process.exit(1);
}
console.log(`${checked} repository links checked`);
