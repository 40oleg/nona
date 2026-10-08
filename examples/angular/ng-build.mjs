// A small Angular application builder that runs as a Nona-compiled native
// executable instead of on Node.js. It builds a standard `ng new` project
// into dist/<name>/browser:
//
//   - every module reachable from the `browser` entry of angular.json is
//     transpiled by the TypeScript compiler (typescript.js, compiled into
//     this executable) to CommonJS, the application's .ts files and the
//     packages' ES modules alike;
//   - component `templateUrl`/`styleUrl(s)` are inlined, and the Angular
//     compiler is bundled, so components are compiled just in time in the
//     browser (JIT) instead of ahead of time by @angular/compiler-cli;
//   - the modules go into one script (main.js) with a minimal CommonJS
//     loader; styles are concatenated into styles.css and the `public`
//     assets copied.
//
//   ng-build [project directory] [--out dir]
//
// It does no tree shaking or minification, and supports the project layout
// that `ng new` generates (one application, CSS styles).
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {loadTypeScript} from './typescript.generated.mjs';

// Node.js passes [node, script, ...]; a native executable gets [executable, ...].
const args = process.argv.slice(/ng-build\.m?js$/.test(process.argv[1] ?? '') ? 2 : 1);
let project = '.', outOption;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outOption = args[++i];
  else project = args[i];
}
project = resolve(project);
const started = performance.now();
const log = message => console.log(message);

const workspace = JSON.parse(readFileSync(join(project, 'angular.json'), 'utf8'));
const [name, config] = Object.entries(workspace.projects)[0];
const options = config.architect.build.options;
const outDir = resolve(project, outOption ?? join('dist', name, 'browser'));
const ts = loadTypeScript();
log(`Building ${name} with TypeScript ${ts.version} (Nona-native)`);

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  experimentalDecorators: true,
  useDefineForClassFields: false,
  importHelpers: false,
  esModuleInterop: false,
  sourceMap: false,
  allowJs: true,
};

const isFile = path => { try { return statSync(path).isFile(); } catch { return false; } };
const isDirectory = path => { try { return statSync(path).isDirectory(); } catch { return false; } };

// Module resolution: relative files with the usual extensions, and packages
// from node_modules through their "exports" map (browser ES module builds).
const conditions = ['browser', 'es2015', 'import', 'module', 'default'];
function pickExport(target) {
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) { for (const t of target) { const r = pickExport(t); if (r) return r; } return undefined; }
  if (target && typeof target === 'object') {
    for (const condition of conditions) if (condition in target) { const r = pickExport(target[condition]); if (r) return r; }
  }
  return undefined;
}
function resolveFile(path) {
  for (const candidate of [path, path + '.ts', path + '.mjs', path + '.js', join(path, 'index.ts'), join(path, 'index.mjs'), join(path, 'index.js')])
    if (isFile(candidate)) return candidate;
  return undefined;
}
function resolvePackage(specifier, from) {
  const parts = specifier.split('/');
  const packageName = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const subpath = '.' + specifier.slice(packageName.length);
  for (let dir = dirname(from); ; dir = dirname(dir)) {
    const root = join(dir, 'node_modules', packageName);
    if (isDirectory(root)) {
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      if (manifest.exports) {
        let entry = typeof manifest.exports === 'string' || Array.isArray(manifest.exports) || !Object.keys(manifest.exports).some(k => k.startsWith('.'))
          ? (subpath === '.' ? pickExport(manifest.exports) : undefined)
          : pickExport(manifest.exports[subpath]);
        if (!entry) for (const key of Object.keys(manifest.exports)) {
          if (!key.endsWith('*')) continue;
          const prefix = key.slice(0, -1);
          if (subpath.startsWith(prefix)) { const target = pickExport(manifest.exports[key]); if (target) entry = target.replace('*', subpath.slice(prefix.length)); }
        }
        if (entry) return resolveFile(join(root, entry));
      }
      if (subpath !== '.') return resolveFile(join(root, subpath));
      return resolveFile(join(root, manifest.module ?? manifest.main ?? 'index.js'));
    }
    if (dirname(dir) === dir) return undefined;
  }
}
function resolveModule(specifier, from) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return resolveFile(resolve(dirname(from), specifier));
  return resolvePackage(specifier, from);
}

// Component resources: templateUrl/styleUrl(s) become template/styles.
const styles = [];
function inlineResources(source, file) {
  const read = url => readFileSync(resolve(dirname(file), url), 'utf8');
  return source
    .replace(/templateUrl\s*:\s*(['"`])([^'"`]+)\1/g, (_, q, url) => 'template: ' + JSON.stringify(read(url)))
    .replace(/styleUrl\s*:\s*(['"`])([^'"`]+)\1/g, (_, q, url) => 'styles: [' + JSON.stringify(read(url)) + ']')
    .replace(/styleUrls\s*:\s*\[([^\]]*)\]/g, (_, list) =>
      'styles: [' + [...list.matchAll(/(['"`])([^'"`]+)\1/g)].map(m => JSON.stringify(read(m[2]))).join(', ') + ']');
}

// Transpile every reachable module; record its dependencies.
const modules = new Map(); // file -> {id, code, deps: Map<specifier, file>}
const queue = [];
function add(file) {
  if (modules.has(file)) return modules.get(file).id;
  const record = {id: modules.size, code: '', deps: new Map()};
  modules.set(file, record);
  queue.push(file);
  return record.id;
}
const entry = resolve(project, options.browser ?? options.main);
const compilerEntry = resolvePackage('@angular/compiler', entry);
if (compilerEntry) add(compilerEntry); // JIT: the compiler registers itself first
add(entry);
let transpiled = 0, inputBytes = 0;
while (queue.length) {
  const file = queue.shift(), record = modules.get(file);
  let source = readFileSync(file, 'utf8');
  inputBytes += source.length;
  if (file.endsWith('.ts')) source = inlineResources(source, file);
  const output = ts.transpileModule(source, {compilerOptions, fileName: file.endsWith('.ts') ? file : file.replace(/\.m?js$/, '.js'), reportDiagnostics: false});
  record.code = output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '');
  transpiled++;
  for (const match of record.code.matchAll(/\brequire\((["'])([^"']+)\1\)/g)) {
    const specifier = match[2];
    if (record.deps.has(specifier)) continue;
    const target = resolveModule(specifier, file);
    if (!target) throw new Error(`Cannot resolve '${specifier}' from ${relative(project, file)}`);
    record.deps.set(specifier, target);
    add(target);
  }
}

// One script: module functions plus a CommonJS loader.
let bundle = '(function () {\n"use strict";\nvar definitions = [], cache = [];\n' +
  'function load(id) {\n  var module = cache[id];\n  if (module) return module.exports;\n  module = cache[id] = {exports: {}};\n' +
  '  var definition = definitions[id];\n  definition[0].call(module.exports, module, module.exports, function (specifier) { return load(definition[1][specifier]); });\n  return module.exports;\n}\n';
for (const [file, record] of modules) {
  const deps = {};
  for (const [specifier, target] of record.deps) deps[specifier] = modules.get(target).id;
  bundle += `// ${relative(project, file).replace(/\\/g, '/')}\ndefinitions[${record.id}] = [function (module, exports, require) {\n${record.code}\n}, ${JSON.stringify(deps)}];\n`;
}
for (const file of [compilerEntry, entry].filter(Boolean)) bundle += `load(${modules.get(file).id});\n`;
bundle += '})();\n';

mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'main.js'), bundle);
for (const style of options.styles ?? []) styles.push(readFileSync(resolve(project, typeof style === 'string' ? style : style.input), 'utf8'));
writeFileSync(join(outDir, 'styles.css'), styles.join('\n'));
let html = readFileSync(resolve(project, options.index ?? 'src/index.html'), 'utf8');
html = html.replace('</head>', '  <link rel="stylesheet" href="styles.css">\n</head>').replace('</body>', '  <script src="main.js"></script>\n</body>');
writeFileSync(join(outDir, 'index.html'), html);

// Assets: copy every file of each input directory.
let assets = 0;
function copyTree(from, to) {
  for (const entryName of readdirSync(from)) {
    const source = join(from, entryName), target = join(to, entryName);
    if (isDirectory(source)) { mkdirSync(target, {recursive: true}); copyTree(source, target); }
    else { writeFileSync(target, readFileSync(source)); assets++; }
  }
}
for (const asset of options.assets ?? []) {
  const input = resolve(project, typeof asset === 'string' ? asset : asset.input);
  const output = typeof asset === 'string' ? join(outDir, asset) : join(outDir, asset.output ?? '');
  if (isDirectory(input)) { mkdirSync(output, {recursive: true}); copyTree(input, output); }
  else if (isFile(input)) { writeFileSync(join(output, input.split(/[\\/]/).pop()), readFileSync(input)); assets++; }
}

const seconds = ((performance.now() - started) / 1000).toFixed(2);
log(`${transpiled} modules (${(inputBytes / 1e6).toFixed(1)} MB of source) -> main.js ${(bundle.length / 1e3).toFixed(0)} kB, styles.css, index.html, ${assets} assets`);
log(`Output: ${outDir} (${seconds} s)`);
