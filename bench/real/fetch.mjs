// Downloads the libraries of the real-world benchmark corpus into
// bench/real/vendor/ (git-ignored: no third-party code is kept in the
// repository). Versions are pinned so results stay comparable.
//
//   node bench/real/fetch.mjs
//
// Every package is fetched with `npm pack` and unpacked here, so the only
// requirement is npm and access to its registry.

import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

const packages = {acorn: '8.18.0', marked: '12.0.2'};

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, 'vendor');

// Unpacks a .tgz made by `npm pack` (ustar; every entry under "package/").
function untar(archive, destination) {
  const data = gunzipSync(archive);
  const text = (start, length) => data.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= data.length;) {
    const name = text(offset, 100);
    if (!name) break;
    const size = parseInt(text(offset + 124, 12).trim() || '0', 8), type = text(offset + 156, 1) || '0';
    const prefix = text(offset + 345, 155), path = (prefix ? prefix + '/' : '') + name;
    const relative = path.split('/').slice(1).join('/');
    if (type === '0' && relative && !relative.split('/').includes('..')) {
      const file = join(destination, relative);
      mkdirSync(dirname(file), {recursive: true});
      writeFileSync(file, data.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}

mkdirSync(vendor, {recursive: true});
for (const [name, version] of Object.entries(packages)) {
  const r = spawnSync('npm', ['pack', `${name}@${version}`, '--pack-destination', vendor, '--json', '--silent'],
    {encoding: 'utf8', shell: process.platform === 'win32'});
  if (r.status !== 0) throw new Error(`npm pack ${name}@${version} failed: ${r.stderr}`);
  const archive = join(vendor, JSON.parse(r.stdout)[0].filename);
  const destination = resolve(vendor, name);
  rmSync(destination, {recursive: true, force: true});
  untar(readFileSync(archive), destination);
  rmSync(archive);
  console.log(`${name}@${version} -> ${destination}`);
}
