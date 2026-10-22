/**
 * Node.js builtin modules that npm packages commonly load and that Nona
 * provides in JavaScript (issue #249): `os`, `tty`, `util`, `url`, `assert`, `crypto`,
 * `querystring`, `timers`, `timers/promises`, `perf_hooks`, `module`,
 * `worker_threads` and (issue #292) `http2`.
 * `zlib` (issue #302) is a real implementation, not a stub. Their bodies are in src/lib/modules.
 *
 * They cover what libraries use at load time and in their common paths
 * (feature detection, `util.inherits`, `util.format`, `os.EOL`,
 * `tty.isatty`, `url.fileURLToPath`, ...). Functions that need a service
 * Nona does not have (worker threads, TLS, HTTP/2) exist and throw
 * ERR_NONA_UNSUPPORTED when called, so that a package that only mentions
 * them still loads. `node:child_process` is not here: it has platform
 * layers and lives in child-process-module.ts (other targets throw there too).
 */
import {
    modulesOs,
    modulesTty,
    modulesUtil,
    modulesUtilTypes,
    modulesUrl,
    modulesAssert,
    modulesQuerystring,
    modulesTimers,
    modulesTimersPromises,
    modulesPerfHooks,
    modulesModule,
    modulesWorkerThreads,
    modulesCrypto,
    modulesZlib,
    modulesHttp2,
} from "../lib/sources.generated.js";
import { entropySource } from "../selfhost-adapters.js";
import type { Target } from "../target.js";

/** node:crypto: random bytes from the OS entropy source, hashes and HMAC. */
export function cryptoModuleSource(target: Target): string {
    return entropySource(target) + modulesCrypto;
}

export const nodeCompatModules: readonly (readonly [string, string])[] = [
    ["node:os", modulesOs],
    ["node:tty", modulesTty],
    ["node:util", modulesUtil],
    ["node:util/types", modulesUtilTypes],
    ["node:url", modulesUrl],
    ["node:assert", modulesAssert],
    [
        "node:assert/strict",
        "import assert from 'node:assert'; const s = assert.strict; export default s; export const { ok, equal, notEqual, deepEqual, notDeepEqual, strictEqual, notStrictEqual, deepStrictEqual, notDeepStrictEqual, throws, doesNotThrow, rejects, doesNotReject, match, doesNotMatch, ifError, fail, AssertionError, strict } = s;",
    ],
    ["node:querystring", modulesQuerystring],
    ["node:timers", modulesTimers],
    ["node:timers/promises", modulesTimersPromises],
    ["node:perf_hooks", modulesPerfHooks],
    ["node:module", modulesModule],
    ["node:worker_threads", modulesWorkerThreads],
    ["node:zlib", modulesZlib],
    ["node:http2", modulesHttp2],
];
