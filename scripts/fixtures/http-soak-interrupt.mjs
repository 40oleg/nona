// Deliver a catchable signal to the real driver on both Windows and Linux.
if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted"
)
    throw new Error("interruption fixture requires a GitHub-hosted runner");
const write = process.stdout.write.bind(process.stdout);
let sent = false;
process.stdout.write = function (chunk, ...rest) {
    if (!sent && String(chunk).startsWith("[load ")) {
        sent = true;
        setImmediate(() => process.emit("SIGINT"));
    }
    return write(chunk, ...rest);
};
