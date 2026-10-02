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
npm run check:links      # links to repository files on GitHub exist (after a build)
```

## Layout

| Path | Contents |
| --- | --- |
| `.vitepress/config.mts` | Title, navigation, sidebar, search, `base: '/nona/'`. |
| `src/` | Pages. The URL is the path without `.md` (`src/guide/getting-started.md` → `/guide/getting-started`). |
| `src/public/` | Static files (favicon). |
| `samples/` | Runnable programs shown on the pages. |
| `scripts/sync-docs.mjs` | Copies reference documents into `generated/` (not committed). |
| `scripts/check-samples.mjs`, `scripts/check-repo-links.mjs` | CI checks. |

## Generated pages

These pages include a document from the repository; edit the source, not the page:

| Page | Source |
| --- | --- |
| `/reference/host-apis` | `docs/host-apis.md` |
| `/reference/process` | `docs/process.md` |
| `/reference/fs` | `docs/fs.md` |
| `/reference/ffi` | `docs/ffi.md` |
| `/reference/windows-executables` | `docs/windows-executables.md` |
| `/reference/test262` | `docs/test262.md` |
| `/changelog` | `CHANGELOG.md` |

`sync-docs.mjs` rewrites relative links: documents published on the site point to their page, everything else to the file on GitHub. To publish another document, add it to `sources` and `pages` in the script and create a wrapper page like `src/reference/ffi.md`. Internal notes in `docs/` (development logs, status reports, `superpowers/`) are not published; pages link to them on GitHub.

## Adding a page

1. Create `src/<section>/<slug>.md` with one `#` heading.
2. Add it to `sidebar` in `.vitepress/config.mts`.
3. Link to other pages with absolute paths without `.md`: `[FFI](/reference/ffi)`. Link to source files with `https://github.com/40oleg/nona/blob/main/<path>`.

## Samples

Every runnable example is a file in `samples/` included with `<<< ../../samples/name.js` (add `{js}` after `.mjs` files for highlighting). `check-samples.mjs` compiles each file with the compiler from `../dist`:

- `name.win32.mjs` — Windows only; the page shows a `<Badge type="warning" text="Windows only" />` and a `::: warning Windows only` box;
- `name.linux.mjs` — Linux only;
- anything else — both targets.

Samples use only documented features: no `node:path`, `Buffer`, `require`, class fields or top-level `await`, and `process.argv[1]` is the first argument.

## Writing style

Neutral technical English in the present tense. Claims about support name their limits ("ES2020 with documented exceptions") and numbers carry their version or date. Build commands are shown for both targets with a `::: code-group` (`Windows`/`Linux`).

## Languages

The site is English only. Russian pages, when added, go under `src/ru/` with the same slugs and a `locales` entry in the configuration.
