# Native compiler bootstrap

Work in progress for [#143](https://github.com/40oleg/nona/issues/143).

`scripts/bootstrap-selfhost.mjs` uses the development Node.js compiler to
compile the compiler's emitted JavaScript into a native stage 1 image. It
prepares a source tree next to the image so stage 1 can compile that same tree
into stage 2. RegExp validation is compiled directly from Nona's own engine;
the native source tree's lexer does not import `node:vm` or evaluate source.
No Node.js source, third-party polyfill or JavaScript interpreter is bundled.

```sh
npm run build
node scripts/bootstrap-selfhost.mjs linux-x64 work/selfhost/stage1
node scripts/verify-selfhost.mjs linux-x64 work/selfhost/stage1
```

Stage 1 has built a byte-identical stage 2 on Windows x64 and Linux x64 in
[native CI](https://github.com/40oleg/nona/actions/runs/37493485834), with Node
absent from the child compiler's PATH. Both stages compiled and executed
arithmetic, Path-module and Unicode RegExp regressions matching bootstrap images.

Windows uses `win32-x64` and `stage1.exe`. Generated Windows executables are
verified in native CI; local verification refuses to execute them.

The development verifier launches native children with an empty `PATH`, checks
representative programs against bootstrap images, asks stage 1 to build stage 2,
compares the two compiler images, and repeats the program regressions with stage
2. Its use of Node.js for bootstrap, comparison and orchestration does not imply
a native compiler runtime dependency.

The initial driver accepts `<input> <output> <target>`. It is a bootstrap probe.
Passing `--cli` to the bootstrap and verifier instead builds the original CLI,
with private original SHA-256/UUID/file-URL adapters and an embedded fingerprint
of the prepared compiler sources. This mode is under native validation; it is
not yet a replacement distribution CLI. The verifier checks help, version,
warm cache, executable permissions and source overwrite refusal as well as
stage 2. Additional jobs execute the complete native CLI on Windows/Linux ARM64,
both macOS CPUs and both BSD guests. BSD smoke checks run without Node installed,
including module/RegExp output, hard-link/symlink overwrite refusal and warm
cache image identity. These new full CLI and host checks are pending; distribution
integration is still required before completion.
