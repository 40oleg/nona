// Bundles the compiler (../dist, built by `npm run build` in the repository
// root) into a Web Worker for the playground: src/public/playground-worker.js.
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const compiler = join(site, '..', 'dist', 'src', 'compiler.js');
if (!existsSync(compiler)) {
  console.error('The compiler is not built: run `npm run build` in the repository root first.');
  process.exit(1);
}
const shims = join(site, 'playground', 'shims');
const nodeModules = {'node:fs': 'fs.js', 'node:path': 'path.js', 'node:vm': 'vm.js'};

const result = await build({
  entryPoints: [join(site, 'playground', 'worker.js')],
  outfile: join(site, 'src', 'public', 'playground-worker.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  inject: [join(shims, 'process.js'), join(shims, 'buffer.js')],
  metafile: true,
  plugins: [{
    name: 'node-shims',
    setup(build) {
      build.onResolve({filter: /^node:/}, ({path}) => nodeModules[path]
        ? {path: join(shims, nodeModules[path])}
        : {errors: [{text: `${path} has no browser shim in site/playground/shims`}]});
    },
  }],
});
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`playground worker: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
