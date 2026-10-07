# Building an Angular application with a Nona-native builder

`ng-build.mjs` builds a standard Angular project (the one `ng new` generates) without Node.js. Nona compiles it, together with the TypeScript compiler, into one native executable.

The Angular CLI itself cannot run on Nona. `ng build` drives esbuild, a Go binary, through child processes and uses worker threads and CommonJS `require` throughout. This builder does the essential steps with code that Nona compiles.

## What it does

1. **Finds the entry.** It reads `angular.json` and starts from the `browser` entry (`src/main.ts`).
2. **Transpiles every reachable module to CommonJS** with `ts.transpileModule`. This covers both the application's TypeScript and the packages' ES modules (`@angular/*`, `rxjs`, `tslib`). Packages are resolved from `node_modules` through their `exports` maps, using the `browser`, `es2015`, `import` and `default` conditions.
3. **Inlines component resources.** `templateUrl` and `styleUrl(s)` become `template` and `styles`.
4. **Bundles `@angular/compiler`.** Components are compiled in the browser (JIT) rather than ahead of time by `@angular/compiler-cli`.
5. **Writes `dist/<project>/browser`:**
   - `main.js`: all modules and a minimal CommonJS loader;
   - `styles.css`: the global styles;
   - `index.html`;
   - the `public` assets.

It does no tree shaking, minification, AOT compilation, Sass or i18n.

## Build the builder

```sh
cd my-app && npm install          # node_modules for the application (once)
cd …/nona/examples/angular
node wrap-typescript.mjs ../../path/to/my-app/node_modules/typescript/lib/typescript.js
node ../../dist/cli.js build ng-build.mjs -o ng-build --target linux-x64
./ng-build path/to/my-app         # or: ng-build.exe on Windows
```

`wrap-typescript.mjs` turns TypeScript's CommonJS file into `typescript.generated.mjs`, which the builder imports. That module provides a small `require` that maps `fs` and `path` to Nona's built-in modules. The generated file is about 9 MB and is not committed.

The same `ng-build.mjs` also runs on Node.js (`node ng-build.mjs path/to/my-app`). Both produce byte-identical output.

## Results

Angular 22.2.1, TypeScript 6.0.3, `ng new ngapp --defaults --zoneless --ssr=false`, Linux x64:

| | `ng build` on Node.js 22 (Windows machine) | `ng-build.mjs` on Node.js (Linux) | Nona-native `ng-build` (Linux) |
| --- | --- | --- | --- |
| Build time | 16 s (bundle 6.4 s) | 5.3 s | 839 s |
| Output | `main-*.js` 216 kB (AOT, minified) | `main.js` 3.8 MB (JIT, not minified) | identical to the Node.js run |
| Page in Chromium | "Hello, ngapp", 9 links | the same | the same |

Compiling the builder takes 97 s and 3.2 GB of memory. The executable is 146 MB, almost all of it TypeScript.

The native build is slow because the TypeScript compiler spends most of its time in property lookups, which Nona's object model makes linear scans (issue #114, shapes).
