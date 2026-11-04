import type { Target } from "../../src/target.js";
import { getTarget } from "../../src/target.js";
import { compileModuleToIR } from "../../src/compiler.js";
import { collectSourceUsage } from "../../src/frontend/lexer.js";
import { withNativeTarget } from "../../src/backend/machine/context.js";
import { generate } from "../../src/backend/x64/codegen.js";
import { linkPe } from "../../src/backend/pe/writer.js";
import { linkWindowsArm64 } from "../../src/backend/arm64/windows.js";
import { linkLinux } from "../../src/backend/linux/index.js";
import { linkDarwin } from "../../src/backend/darwin/index.js";
import { linkBsd } from "../../src/backend/bsd/index.js";

import { eventProbeSources } from "./event-probe-sources.js";
export {
    eventProbeSources,
    bufferCancellationProbeSource,
} from "./event-probe-sources.js";

/** Compile module probes under allocation stress; callers choose when to execute. */
export function eventProbes(
    target: Target,
): { name: string; image: Uint8Array; expected: string; timeoutMs: number }[] {
    return withNativeTarget(target, () =>
        eventProbeSources.map((probe) => {
            const descriptor = getTarget(target)!;
            const { result: ir, usage } = collectSourceUsage(
                () =>
                    compileModuleToIR(
                        probe.source,
                        probe.name + ".mjs",
                        undefined,
                        "",
                        target,
                    ),
                {
                    unavailableReflectivePreludes:
                        descriptor.os === "darwin" ||
                        descriptor.os === "freebsd" ||
                        descriptor.os === "openbsd"
                            ? ["process"]
                            : [],
                },
            );
            const program = generate(ir, { gcStress: true, link: usage });
            const image =
                descriptor.os === "linux"
                    ? linkLinux(program, descriptor.arch)
                    : descriptor.os === "darwin"
                      ? linkDarwin(program, descriptor.arch)
                      : descriptor.os === "freebsd" ||
                          descriptor.os === "openbsd"
                        ? linkBsd(program, descriptor.os)
                        : descriptor.arch === "arm64"
                          ? linkWindowsArm64(program)
                          : linkPe(program);
            // Collection at every safepoint makes these module probes slower on ARM hosts.
            return {
                name: probe.name,
                image,
                expected: probe.expected,
                timeoutMs: 60000,
            };
        }),
    );
}
