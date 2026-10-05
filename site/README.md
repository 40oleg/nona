# Nona documentation site

The site at https://40oleg.github.io/nona/ is built with [VitePress](https://vitepress.dev) and deployed by `.github/workflows/pages.yml` from `main`.

```sh
npm run build            # in the repository root: the compiler, needed by check:samples
cd site
npm ci
npm run dev              # local server with live reload
npm run build            # production build into .vitepress/dist; fails on broken internal links
npm run preview          # serve the production build
npm run check:samples    # compile every program in samples/ for its targets
npm run check:playground # the browser bundle of the compiler matches the CLI (after a build)
npm run check:links      # links to repository files on GitHub exist (after a build)
```

## Layout

| Path | Contents |
| --- | --- |
| `.vitepress/config.mts` | Title, locales, navigation, sidebar, search, `base: '/nona/'`. |
| `.vitepress/locales/` | Per-language dictionaries: navigation, sidebar and theme labels, search translations. |
| `src/` | Pages. The URL is the path without `.md` (`src/guide/getting-started.md` → `/guide/getting-started`). |
| `src/<locale>/` | Translated pages (see [Translations](#translations)). |
| `src/public/` | Static files (favicon). `src/public/playground-worker.js` is generated. |
| `playground/` | The playground's Web Worker and the browser shims for the Node.js modules the compiler uses. |
| `.vitepress/components/Playground.vue` | The playground UI (`/playground`). |
| `samples/` | Runnable programs shown on the pages. |
| `scripts/sync-docs.mjs` | Copies reference documents into `generated/` (not committed). |
| `scripts/build-playground.mjs` | Bundles `../dist/src/compiler.js` with esbuild into the playground worker. |
| `scripts/check-samples.mjs`, `scripts/check-playground.mjs`, `scripts/check-repo-links.mjs` | CI checks. |

## Generated pages

These pages include a document from the repository; edit the source, not the page:

| Page | Source |
| --- | --- |
| `/reference/host-apis` | `docs/host-apis.md` |
| `/reference/native-platforms` | `docs/native-platforms.md` |
| `/reference/process` | `docs/process.md` |
| `/reference/fs` | `docs/fs.md` |
| `/reference/ffi` | `docs/ffi.md` |
| `/reference/windows-executables` | `docs/windows-executables.md` |
| `/reference/test262` | `docs/test262.md` |
| `/changelog` | `CHANGELOG.md` |

`sync-docs.mjs` rewrites relative links: documents published on the site point to their page, everything else to the file on GitHub. To publish another document, add it to `sources` and `pages` in the script and create a wrapper page like `src/reference/ffi.md`. Internal notes in `docs/` (development logs, status reports, `superpowers/`) are not published; pages link to them on GitHub.

## Adding a page

1. Create `src/<section>/<slug>.md` with one `#` heading.
2. Add it to `sidebar()` in `.vitepress/config.mts` and its label to every dictionary in `.vitepress/locales/`.
3. Add the translated pages under `src/<locale>/` (see [Translations](#translations)).
4. Link to other pages with absolute paths without `.md`: `[FFI](/reference/ffi)`. Link to source files with `https://github.com/40oleg/nona/blob/main/<path>`.

## Samples

Every runnable example is a file in `samples/` included with `<<< ../../samples/name.js` (add `{js}` after `.mjs` files for highlighting). `check-samples.mjs` compiles each file with the compiler from `../dist`:

- `name.win32.mjs` — Windows only; the page shows a `<Badge type="warning" text="Windows only" />` and a `::: warning Windows only` box;
- `name.linux.mjs` — Linux only;
- anything else — both targets.

Samples use only documented features: no `Buffer`, `require`, class fields or top-level `await`, and `process.argv[1]` is the first argument.

## Writing style

Neutral technical English in the present tense. Claims about support name their limits ("ES2020 with documented exceptions") and numbers carry their version or date. Build commands are shown for both targets with a `::: code-group` (`Windows`/`Linux`).

## Translations

The site is published in English (the root locale, `/`) and in Chinese (`zh`), Hindi (`hi`), Spanish (`es`), French (`fr`), Arabic (`ar`, right-to-left), Bengali (`bn`), Portuguese (`pt`) and Russian (`ru`).

- **English is the source of truth.** Translated pages live under `src/<locale>/` with the same slugs as the English pages (`src/zh/guide/getting-started.md` → `/zh/guide/getting-started`).
- **When an English page changes, update its translations** in the same pull request, or at least keep them consistent: a translation may lag behind, but it must not contradict the English page.
- Pages that include a document from `generated/` are translated snapshots: they start with an `::: info` box that links to the English page and says that the English version is authoritative and may be newer. The changelog is not translated; every locale links to `/changelog`.
- Keep code blocks, program output, identifiers, CLI flags and file names in English. Samples are included with `<<<` from `samples/` (one more `../` than on the English page). Internal links stay within the locale (`/zh/reference/ffi`), and headings that other pages link to keep the English anchor with an explicit id (`## 签名 {#signatures}`).
- Navigation, sidebar, theme labels and search translations come from the dictionaries in `.vitepress/locales/` (`en.ts` is the source, `types.ts` the shape). `config.mts` builds the navigation and sidebar of every locale from them, so a new page or menu item is added once for all languages.

To add a locale: create `.vitepress/locales/<locale>.ts` (copy `en.ts` and translate it), add it to `dictionaries` in `.vitepress/locales/index.ts` (the order is the order of the language switcher), translate every page except `changelog.md` into `src/<locale>/`, and run `npm run build` — dead links fail the build.

## Playground

`/playground` compiles in the browser: `scripts/build-playground.mjs` bundles the compiler from `../dist` (so `npm run build` in the repository root comes first, also for `npm run dev`) together with small shims in `playground/shims/` for `node:fs`, `node:path`, `node:vm`, `process` and `Buffer`. If the compiler starts using another Node.js API, the bundle fails with "has no browser shim" (for `node:*` imports) or `check:playground` fails; add a shim. Examples are files in `samples/` (`playground-*`), so `check:samples` compiles them too.
