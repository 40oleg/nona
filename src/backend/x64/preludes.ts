import { patchSource } from "../../source-patch.js";
import { currentNativeTarget } from "../machine/context.js";
import type { ModuleIR } from "../../ir/model.js";
import {
    optionalPreludes,
    preludeDependencies,
    type OptionalPrelude,
    type RuntimeLink,
} from "../../link.js";
import {
    regexpVmPrelude,
    type RegExpLink,
} from "../../runtime/regexp-vm-source.js";
import { reflectPreludeSource } from "../../runtime/reflect-source.js";
import {
    proxyPreludeSource,
    preludeCleanupSource,
} from "../../runtime/proxy-source.js";
import { promisePreludeSource } from "../../runtime/promise-source.js";
import { encodingPreludeSource } from "../../runtime/encoding-source.js";
import { bufferPreludeSource } from "../../runtime/buffer-source.js";
import { urlPreludeSource } from "../../runtime/url-source.js";
import { processPreludeForTarget } from "../../runtime/process-source.js";
import { eventsPreludeSource } from "../../runtime/events-source.js";
import { asyncHooksPreludeSource } from "../../runtime/async-hooks-source.js";
import { eventEmitterPreludeSource } from "../../runtime/event-emitter-source.js";
import { streamPreludeForTarget } from "../../runtime/stream-source.js";
import { timersPreludeSource } from "../../runtime/timers-source.js";
import { objectAnnexBPreludeSource } from "../../runtime/object-annexb-source.js";
import { arraySortPreludeSource } from "../../runtime/array-sort-source.js";
import { objectIntegrityPreludeSource } from "../../runtime/object-integrity-source.js";
import { es2021PreludeSource } from "../../runtime/es2021-source.js";
import { annexBBuiltinsPreludeSource } from "../../runtime/annexb-builtins-source.js";
import { lex } from "../../frontend/lexer.js";
import { parse } from "../../frontend/parser.js";
import { bind } from "../../frontend/binder.js";
import { lower } from "../../ir/lower.js";

const cachedRuntimePreludes = new Map<string, ModuleIR>();
/** The optional preludes `link` selects, with their dependencies, in declaration order. */
export function linkedPreludes(link: RuntimeLink): OptionalPrelude[] {
    const selected = new Set(
        optionalPreludes.filter((name) => link.preludes[name]),
    );
    for (const name of selected)
        for (const dependency of preludeDependencies[name] ?? [])
            selected.add(dependency);
    return optionalPreludes.filter((name) => selected.has(name));
}
/**
 * The runtime prelude as IR: the JavaScript preludes `linked` selects for
 * the active target, concatenated and lowered once per set of options.
 */
export function lowerRuntimePrelude(
    rejectionPolicy: "throw" | "ignore",
    regexpLink: RegExpLink,
    linked: readonly OptionalPrelude[],
): ModuleIR {
    const preludeKey = JSON.stringify({
        target: currentNativeTarget(),
        rejectionPolicy,
        regexpLink,
        linked,
    });
    let prelude = cachedRuntimePreludes.get(preludeKey);
    if (!prelude) {
        const promiseSource = promisePreludeSource.replace(
            "__NONA_FAIL_ON_UNHANDLED__",
            rejectionPolicy === "throw" ? "true" : "false",
        );
        // Order matters: later preludes capture intrinsics installed by earlier ones.
        const parts: [OptionalPrelude | null, string][] = [
            [null, regexpVmPrelude(regexpLink)],
            [null, reflectPreludeSource],
            ["objectAnnexB", objectAnnexBPreludeSource],
            ["arraySort", arraySortPreludeSource],
            ["objectIntegrity", objectIntegrityPreludeSource],
            ["annexB", annexBBuiltinsPreludeSource],
            ["es2021", es2021PreludeSource],
            [null, promiseSource],
            ["encoding", encodingPreludeSource],
            ["url", urlPreludeSource],
            [
                "buffer",
                currentNativeTarget()?.startsWith("win32")
                    ? patchSource(
                          bufferPreludeSource,
                          `nativeNewline = "\\n"`,
                          `nativeNewline = "\\r\\n"`,
                      )
                    : bufferPreludeSource,
            ],
            ["events", eventsPreludeSource],
            ["asyncHooks", asyncHooksPreludeSource],
            ["eventEmitter", eventEmitterPreludeSource],
            ["stream", streamPreludeForTarget(currentNativeTarget())],
            ["process", processPreludeForTarget(currentNativeTarget())],
            ["timers", timersPreludeSource],
            ["network", ""],
            ["proxy", proxyPreludeSource],
            [null, preludeCleanupSource],
        ];
        prelude = lower(
            bind(
                parse(
                    lex(
                        parts
                            .filter(
                                ([name]) =>
                                    name === null || linked.includes(name),
                            )
                            .map(([, source]) => source)
                            .join("\n"),
                    ),
                ),
            ),
        );
        cachedRuntimePreludes.set(preludeKey, prelude);
    }
    return prelude;
}
