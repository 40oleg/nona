# HTTP and HTTPS drain verification (#615)

This continuation retains issue #615 / draft PR #629 on its existing branch
and owned claim `6560306699`. The parent applied pinned #601 / PR #622 commit
`47193961f3bf9b69c0177d5522de3db1069447df` to HEAD
`a677eff170fb5f363805a85902103e708440afc0` without a merge commit.
Only file contents were resolved: the Socket fallback retains the third
callback argument for live and terminal writes, and the suite manifest keeps
both HTTP backpressure files and HTTP keep-alive. The index remains unmerged
until the parent stages it. No worker staging, commit, push, branch/worktree
creation, GitHub mutation or delegation is authorized.

## Reproduced failure

On Windows with Node.js 26.9.0, the persistent test
`HTTPS partial-send tail below HWM fulfills the corked HTTP drain promise`
failed before the production repair. It executes production OutgoingMessage,
TLSSocket, ClientEngine, TrafficKeys, TLS record crypto, Readable and Socket
methods. Only transport send results and native byte helpers are adapted.
Fixed application traffic secrets bypass key exchange and certificate
verification, which remain hosted acceptance requirements. Node's independent
AES-GCM decoder verifies the exact HTTP header, 20 KiB body and chunk framing.

The public HTTP write returns false. Sending 10,000 encrypted bytes leaves a
raw tail below 16 KiB; flushing it completes the callback and empties raw,
TLS and message queues. The unfixed message never emits drain. Exit status 1:

```text
AssertionError [ERR_ASSERTION]: empty HTTPS queues; message needDrain=true, TLS needDrain=true, raw needDrain=false
actual: [ 'callback' ]
expected: [ 'callback', 'drain' ]
```

Red test output is retained in `work/https-review-red.txt` (ignored local
evidence). This is a deterministic source-method witness, not native TLS
execution. A separate control confirms production TLS/raw writes legitimately
return true for a 10,524-byte encrypted tail and do not invent a drain.

## Mechanism and review

HTTP owns its public false-write obligation. Socket's internal `_requestDrain`
arms the transport notification without changing write return values or HWM.
TLS overrides it to arm its raw Socket when encrypted bytes remain. After
the handshake flushes pending plaintext, TLS rearms any raw tail and checks
completion on a deferred job. `_drained` forwards only when secure, alive,
and both pending plaintext and raw bytes are empty. HTTP waits for the socket
obligation to clear before scheduling its own drain. This also prevents an
already queued HTTP drain job from racing ahead of raw error propagation.
No polling or extra completion wrappers are needed.

The review traced `_watchDrain`, `_scheduleDrain`, `_sent`, `_sendNow`,
`_sendPlain`, `_onSecure`, `_raw` and destroy/error paths. #601's owner objects
still pass through the actual raw write queue unchanged, retaining `_sent`
identity and FIFO completion after the last byte. Terminal TLS writes invoke
the same function/object protocol; a real sealing error destroys the socket
after queuing its one failed completion. Successful queued callbacks precede
drain. Immediate sends retain the existing deferred callback/drain ordering.
HTTP finish remains driven by its final `_sent`, not by drain.

The pinned #601 tests that characterized dropped terminal completions now
assert once-only error completion and order; their wire, type/code, ownership
and close checks remain. The needDrain test now observes the latch until the
deferred drain actually fires. Existing #615 tests are retained, including
corking, pre-assignment output, pipelining, detach/reassign and cancellation.
The native forced-GC completion-owner fixtures and #601 heap/resource
witnesses are retained. No native emitter, ABI, allocation/GC implementation,
target imports or AOT architecture changes were made in this continuation.

## Local commands and boundaries

Dependencies were installed only here with `npm ci --cache work/npm-cache`.
Generate source constants (JavaScript/TypeScript only; no native compiler):

```sh
node --input-type=module -e 'import {generateLibSources} from "./scripts/lib-sources.mjs"; generateLibSources(process.cwd())();'
node node_modules/typescript/bin/tsc --ignoreConfig --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --strict --noUncheckedIndexedAccess --skipLibCheck --outDir work/https-review-green tests/http-backpressure-source.test.ts tests/net-send-source.test.ts tests/helpers/https-backpressure.ts tests/suites.test.ts tests/lib-sources.test.ts src/frontend/parser.ts src/frontend/lexer.ts
node --test --test-concurrency=1 work/https-review-green/tests/http-backpressure-source.test.js work/https-review-green/tests/net-send-source.test.js work/https-review-green/tests/suites.test.js work/https-review-green/tests/lib-sources.test.js
```

For the red run the output directory was `work/https-review-red`, with only
the first two test entry points compiled, then:

```sh
node --test --test-concurrency=1 --test-name-pattern='HTTPS partial-send' work/https-review-red/tests/http-backpressure-source.test.js
```

The small Node-only HTTPS control uses the exact shared client in
`tests/helpers/https-backpressure.ts` and Node fixture server in
`tests/https.test.ts`. Local runner: `node work/https-backpressure-oracle.mjs`;
it checks exit status 0, empty stderr and these exact lines:

```text
https bounded true transitions true empty true
body true callbacks true finish 2 close 2
progress true true reuse true
```

Its first envelope check failed: Node 26's HTTP cork accepted one oversized
20 KiB chunk, then returned false at 41,074 bytes (16 KiB HWM). Instrumented
queue measurements justified a two-chunk allowance for the Node control;
the native assertion retains Nona's stricter one-chunk allowance. See
[network buffering limits](network.md#write-backpressure). No assertions were
skipped and there was no loopback EACCES in this run.

Formatting uses only changed files. Documentation link prerequisites are
`node site/scripts/sync-docs.mjs`, then `npm run check:doc-links`.
No local native compilation/execution, forced-GC campaign, full suite,
load/soak/fuzz run or benchmark was performed. Local checks use concurrency 1.

Additional targeted commands:

```sh
node node_modules/typescript/bin/tsc --ignoreConfig --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --strict --noUncheckedIndexedAccess --skipLibCheck --noEmit tests/https.test.ts tests/http-backpressure.test.ts tests/http-keepalive.test.ts tests/net-native.test.ts
node node_modules/prettier/bin/prettier.cjs --check .github/workflows/http-keepalive.yml CHANGELOG.md README.md README.ru.md docs/network.md docs/issue-615-verification.md src/lib/modules/http.js src/lib/modules/net-common.js src/lib/modules/tls.js tests/http-backpressure-source.test.ts tests/net-send-source.test.ts tests/https.test.ts tests/helpers/https-backpressure.ts tests/suites.json
git diff --check
```

The same Prettier file list was first run with `--write`. A source-only
`lex`/`parse` pass from `src/frontend/` accepted all three changed production
modules. Focused type checks passed, the four Node/source test files passed
75/75, the HTTPS Node-only control passed with empty stderr, and doc links
passed (1,571 links in 305 documents). This is local evidence only.

Files edited by this continuation (other staged #601 changes were preserved):

- `src/lib/modules/http.js`, `src/lib/modules/net-common.js`, `src/lib/modules/tls.js`;
- `tests/http-backpressure-source.test.ts`, `tests/net-send-source.test.ts`,
  `tests/https.test.ts`, `tests/helpers/https-backpressure.ts`, `tests/suites.json`;
- `.github/workflows/http-keepalive.yml`;
- `CHANGELOG.md`, `README.md`, `README.ru.md`, `docs/network.md`, this record.

The pre-flight interface conflict was #601's terminal callback fallback versus
#615's uniform function/object completion protocol; the retained third argument
and upgraded cancellation regressions preserve both changes' intent. The
remaining policy decisions are explicit: the measured Node envelope differs
from Nona's bound; full/native validation and independent review stay with
the parent/hosted gates; no local full suite or delegated review overrides
the owner's prohibition. No minor findings were deferred by self-review.

## Acceptance still pending on hosted Windows and Linux

The [existing hosted workflow](../.github/workflows/http-keepalive.yml)
requires actual GitHub-hosted identity on windows-latest and ubuntu-24.04.
It now also runs HTTP backpressure and TLS/HTTPS/handshake tests on both,
retaining TLS TAP output with the HTTP evidence artifacts. The parent must
apply/verify full-ci and gc-stress before its CI-triggering push.

- Deterministic partial/EAGAIN/EINTR, queue/cork transitions, handshake queue
  state and terminal scheduling have local source evidence. Real native
  transport scheduling and TLS key exchange/record behavior remain pending.
- Public paused-reader HTTP and HTTPS correctness, bounded stopped-producer
  queues, independent clients/timers, keep-alive/pipeline handoff and exact
  callback/finish/close counts require final-head hosted results.
- Retained forced-GC ownership tests and #601 resource reclamation evidence
  must pass separately from ordinary buffering. RSS alone is insufficient.
- Final-head hosted check, compare, platform/full-ci, GC and #601 acceptance
  are required; old-head or adapter-only success does not satisfy them.

PR #629 remains draft with main as base. Dependency #622 must be accepted
and merged before integration. The queue remains off, foreign done/status
records remain untouched, NONA_WORK_AHEAD remains disabled, and the parent
alone owns staging, publication, label/claim revalidation and release gates.
Self-review is the only review performed here because this continuation
forbids subagents; the parent's independent review remains required.
