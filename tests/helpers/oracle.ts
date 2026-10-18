import { spawnSync } from "node:child_process";
export function runOracle(
    source: string,
    options: { timezone?: string } = {},
): { stdout: string; stderr: string; status: number | null } {
    // Evaluate the source as its own Script so the console adapter cannot end its
    // directive prologue. Script var/this semantics also remain global.
    const script =
        'console.log=((write,stringify)=>(...args)=>{write(args.map(stringify).join(" ")+"\\n");})(process.stdout.write.bind(process.stdout),String);\nrequire("node:vm").runInThisContext(' +
        JSON.stringify(source) +
        ");";
    // Node.js starts in well under a second, but on a loaded CI runner a
    // spawn can wait several seconds for the CPU, so the limit is generous.
    const run = spawnSync(process.execPath, ["-e", script], {
        encoding: "utf8",
        timeout: 60_000,
        windowsHide: true,
        ...(options.timezone === undefined
            ? {}
            : { env: { ...process.env, TZ: options.timezone } }),
    });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(run.stderr);
    return { stdout: run.stdout, stderr: run.stderr, status: run.status };
}
