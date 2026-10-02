// Compiles every program in site/samples/ with the Nona compiler from ../dist
// (run `npm run build` in the repository root first). File names choose the
// targets: *.win32.* → win32-x64, *.linux.* → linux-x64, otherwise both.
// .mjs files are compiled as modules. Fails on the first compile error.
import {mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(dirname(site), 'dist', 'cli.js');
const samples = join(site, 'samples');
const out = mkdtempSync(join(tmpdir(), 'nona-site-samples-'));
let count = 0;
try {
  for (const name of readdirSync(samples).sort()) {
    if (!/\.(m?js|cjs)$/.test(name)) continue;
    const targets = name.includes('.win32.') ? ['win32-x64'] : name.includes('.linux.') ? ['linux-x64'] : ['win32-x64', 'linux-x64'];
    for (const target of targets) {
      const output = join(out, `${name}.${target}${target === 'win32-x64' ? '.exe' : ''}`);
      const run = spawnSync(process.execPath, [cli, 'build', join(samples, name), '-o', output, '--target', target], {encoding: 'utf8'});
      if (run.error) throw run.error;
      if (run.status !== 0) {
        process.stderr.write(run.stderr + run.stdout);
        throw new Error(`${name} does not compile for ${target}`);
      }
      console.log(`ok ${name} (${target})`);
      count++;
    }
  }
} finally {
  rmSync(out, {recursive: true, force: true});
}
console.log(`${count} sample builds passed`);
