// Hosted-only driver fixture: keep the real server and alter only the injected fault.
import http from "node:http";

if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted"
)
    throw new Error("HTTP load fixtures require a GitHub-hosted runner");
const mode = process.env.SOAK_FIXTURE;
if (mode === "startup-exit") {
    console.error("fixture original startup stderr");
    process.exit(23);
}
if (mode === "no-ready") setInterval(() => {}, 1000);
else {
    if (mode === "corrupt-json") {
        const emit = http.Server.prototype.emit;
        http.Server.prototype.emit = function (event, ...args) {
            if (event === "request" && args[0].url === "/json") {
                const res = args[1],
                    end = res.end;
                res.end = function (data, ...rest) {
                    return end.call(
                        this,
                        data.replace('"user7"', '"xxxx7"'),
                        ...rest,
                    );
                };
            }
            return emit.call(this, event, ...args);
        };
    }
    if (mode === "crash" || mode === "early-exit") {
        const write = process.stdout.write.bind(process.stdout);
        process.stdout.write = function (chunk, ...rest) {
            if (String(chunk).startsWith("ready "))
                setTimeout(() => {
                    console.error("fixture exit during load");
                    process.exit(mode === "crash" ? 17 : 0);
                }, 1800);
            return write(chunk, ...rest);
        };
    }
    await import("../../bench/http/soak-server.mjs");
}
