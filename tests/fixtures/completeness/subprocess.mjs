import spawn from "cross-spawn";
const result = spawn.sync(
    process.env.NONA_PROBE_NODE,
    ["-e", "process.stdout.write('child-ok');process.exitCode=7"],
    {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
    },
);
console.log("subprocess", result.status, result.stdout);
if (result.error) throw result.error;
