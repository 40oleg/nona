# Contributing

## Development setup

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

The suite compiles and runs real executables: PE tests run on Windows and ELF tests on Linux, many under GC stress. CI (`.github/workflows/check.yml`) runs the full suite and Test262 groups on Windows with Node.js 26 and the native tests on Linux. Full Test262 audits are described on the [Test262](/reference/test262) page.

## Workflow

- Every change starts from a GitHub issue with motivation, a proposal and acceptance criteria.
- One issue — one branch (`issue-<number>-<short-slug>`) — one pull request, whose description contains `Closes #N`, the design, how it was tested and known limitations.
- Keep `main` green: a pull request is merged only when the `check` workflow passes.
- Issues, pull requests, commit messages, code comments and documentation are written in English.

## Tests

Tests live in `tests/*.test.ts`. Prefer `runOnHost` with the Node.js oracle (`runOracle`): the same test then runs on both targets, under GC stress, and compares the program's output with Node.js.

## Code conventions

- The compiler is TypeScript (`src/`). Runtime code is emitted as x86-64 through `RuntimeBuilder` (`src/runtime/*.ts`) or written as JavaScript preludes (`src/runtime/*-source.ts`) that are compiled into every executable.
- Preludes must not add top-level `var` bindings; wrap code in an IIFE.
- Native runtime functions follow the Win64 ABI (shadow space, 16-byte alignment at calls, callee-saved registers). Functions that hold values across calls that may allocate use `rootedFn`.
- Every new KERNEL32 import needs a Linux system-call shim in `src/backend/linux/shims.ts`.
- Generated executables stay free of external dependencies: no libc, no C toolchain, no bundled DLLs.

## Documentation

When a feature changes behaviour visible to programs, update:

- `README.md` and `README.ru.md`;
- the reference document in `docs/` (`host-apis.md`, `process.md`, `fs.md`, `ffi.md`, `windows-executables.md`, `test262.md`) — the site includes these files automatically;
- the site pages in `site/src/` that describe the feature, such as the [language support](/guide/language-support) or [command line](/reference/cli) pages;
- `CHANGELOG.md` under `## Unreleased`, with a link to the issue.

## Documentation site

The site is built with [VitePress](https://vitepress.dev) from `site/`:

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

Runnable examples are files in `site/samples/` included with `<<<`; a name containing `.win32.` or `.linux.` limits the sample to that target. `site/README.md` explains how to add a page. The site is deployed to GitHub Pages from `main` by `.github/workflows/pages.yml`.

The site is translated into several languages. The English pages are the source; translations live in `site/src/<locale>/`. When an English page changes, update the translations or at least make sure they do not contradict it.

## Automated contributors

Rules for agents — claiming issues with the `blocked` label, commit authorship and the pull request checklist — are in [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md).
