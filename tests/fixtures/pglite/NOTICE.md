# Redistribution notices

The workload scripts and generated text/binary payload in this directory are
original Nona fixtures, covered by the repository's [MIT license](../../../LICENSE).
No VI Toolkit source, image or profile is copied here. Upstream executable assets
are installed separately and remain unmodified; they are not checked into Git.

PGlite 0.3.14 is copyright Electric DB Limited and licensed under Apache-2.0.
The published tarball includes `LICENSE` but no separate `NOTICE` file. Its exact
license is retained as [PGLITE-APACHE-2.0.txt](licenses/PGLITE-APACHE-2.0.txt).
PostgreSQL's copyright, permission and disclaimer are retained in
[POSTGRES-LICENSE](licenses/POSTGRES-LICENSE).

The published JavaScript source maps identify bundled async-mutex 0.4.1 and
tinytar 0.1.0; PGlite also contains its pg-protocol fork. Preserve their MIT notices:
[async-mutex](licenses/async-mutex-0.4.1-MIT.txt),
[tinytar](licenses/tinytar-0.1.0-MIT.txt) and
[pg-protocol](licenses/pg-protocol-MIT.txt). Notice source locations and the
downloaded npm license tarballs' integrity strings are in
[provenance.json](provenance.json).

The optional audit tool WABT 1.0.39 is Apache-2.0; preserve its installed
`node_modules/wabt/LICENSE` when redistributing that tool. It is not imported by
the database workload. When copying a prepared fixture or CI artifact, include
this notice, `licenses/`, the installed packages' license files, the lockfile and
provenance manifest alongside the executable assets. Do not relabel upstream
JavaScript, WASM or database data as Nona-licensed code.
