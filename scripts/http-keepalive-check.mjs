// Hosted native witness for #601. The Node.js control and the current compiler
// receive the same server and client: 100 sequential 1 MiB chunked responses,
// sixteen synchronous 64 KiB writes each, on one keep-alive TCP connection.
//
//   node scripts/http-keepalive-check.mjs --identity
//   node scripts/http-keepalive-check.mjs --node
//   node scripts/http-keepalive-check.mjs
//
// Reports, server output and the exact source are retained in work/http-601/.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "work", "http-601");
mkdirSync(out, { recursive: true });

export function hostedIdentity() {
    const identity = {
        commit: process.env.GITHUB_SHA,
        run: process.env.GITHUB_RUN_ID,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
        runner: process.env.RUNNER_NAME,
        environment: process.env.NONA_RUNNER_ENVIRONMENT,
        image: process.env.ImageOS,
        imageVersion: process.env.ImageVersion,
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        node: process.version,
    };
    writeFileSync(
        join(out, "runner.json"),
        JSON.stringify(identity, null, 2) + "\n",
    );
    assert.equal(process.env.GITHUB_ACTIONS, "true", "hosted CI only");
    assert.equal(identity.environment, "github-hosted", "hosted runner only");
    assert.equal(identity.arch, "x64");
    assert.equal(process.versions.node.split(".")[0], "26");
    assert.ok(["win32", "linux"].includes(identity.platform));
    return identity;
}

function errorInfo(error) {
    return {
        name: error.name,
        code: error.code,
        message: error.message,
        stack: error.stack,
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const identity = hostedIdentity();
    if (process.argv.includes("--identity")) {
        console.log(JSON.stringify(identity, null, 2));
    } else {
        await check(identity);
    }
}

async function check(identity) {
    const control = process.argv.includes("--node");
    const name = control ? "node" : "native";
    const target = process.platform === "win32" ? "win32-x64" : "linux-x64";
    const source = join(out, "keepalive-server.mjs");
    const binary = join(
        out,
        "keepalive-server" + (process.platform === "win32" ? ".exe" : ""),
    );
    const sourceText = `import http from "node:http";
const chunk = "b".repeat(65536);
let requests = 0;
const server = http.createServer((req, res) => {
    const index = ++requests;
    req.on("error", error => console.error("request-error", error.name, error.code, error.message));
    res.on("error", error => console.error("response-error", error.name, error.code, error.message));
    res.on("finish", () => {
        console.log("finish", index, res.writableFinished);
        if (index === 100) server.close(() => console.log("closed"));
    });
    for (let i = 0; i < 16; i++) res.write(chunk);
    res.end();
});
server.on("connection", socket => {
    console.log("connection");
    socket.on("error", error => console.error("socket-error", error.name, error.code, error.message));
});
server.on("clientError", error => console.error("client-error", error.name, error.code, error.message));
server.on("error", error => console.error("server-error", error.name, error.code, error.message));
server.listen(Number(process.argv[process.argv.length - 1]), "127.0.0.1", () => console.log("ready"));
`;
    writeFileSync(source, sourceText);
    const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const expected = Buffer.alloc(1048576, "b");
    const expectedHash = digest(expected);
    const report = {
        identity,
        mode: name,
        target,
        sourceSha256: digest(sourceText),
        responses: [],
        events: [],
        errors: [],
        pass: false,
        server: { stdout: "", stderr: "", exit: null },
    };
    const started = performance.now();
    const event = (kind, data = {}) => {
        report.events.push({
            sequence: report.events.length + 1,
            ms: performance.now() - started,
            kind,
            ...data,
        });
    };
    let child;
    let exited;
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const sockets = new Set();
    const abort = new AbortController();
    const deadline = setTimeout(() => {
        event("deadline");
        abort.abort(new Error("100-response check exceeded 120 seconds"));
    }, 120000);
    try {
        if (!control) {
            const buildArgs = [
                join(root, "dist", "cli.js"),
                "build",
                source,
                "-o",
                binary,
                "--target",
                target,
                "--module",
            ];
            const build = spawnSync(process.execPath, buildArgs, {
                cwd: root,
                encoding: "utf8",
                timeout: 120000,
                maxBuffer: 16 * 1024 * 1024,
            });
            report.build = {
                args: buildArgs,
                status: build.status,
                signal: build.signal,
                stdout: build.stdout,
                stderr: build.stderr,
                error: build.error && errorInfo(build.error),
            };
            assert.ifError(build.error);
            assert.equal(build.status, 0, "native server build failed");
            report.binarySha256 = digest(readFileSync(binary));
            report.compilerCommit = identity.commit;
            report.compilerEntrySha256 = digest(
                readFileSync(join(root, "dist", "cli.js")),
            );
        }
        const port = await freePort();
        const command = control ? process.execPath : binary;
        const args = control ? [source, String(port)] : [String(port)];
        report.server.command = command;
        report.server.args = args;
        child = spawn(command, args, {
            cwd: root,
            stdio: ["ignore", "pipe", "pipe"],
        });
        event("server.spawn", { pid: child.pid });
        exited = new Promise((done) =>
            child.on("close", (code, signal) => {
                report.server.exit = {
                    code,
                    signal,
                    hex: code > 255 ? "0x" + code.toString(16) : undefined,
                };
                event("server.close", report.server.exit);
                done();
            }),
        );
        child.on("error", (error) => {
            report.errors.push(errorInfo(error));
            event("server.error", errorInfo(error));
        });
        child.stdout.on("data", (chunk) => {
            report.server.stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            report.server.stderr += chunk;
        });
        await ready(child, report.server);
        event("server.ready");
        for (let index = 1; index <= 100; index++) {
            assert.equal(
                abort.signal.aborted,
                false,
                "overall deadline exceeded",
            );
            await request(index, port);
        }
        agent.destroy();
        await boundedExit(exited, 5000);
        assert.deepEqual(report.server.exit, {
            code: 0,
            signal: null,
            hex: undefined,
        });
        assert.equal(report.server.stderr, "", "server reported an error");
        assert.equal(
            report.errors.length,
            0,
            "unexpected socket/request/response errors",
        );
        assert.equal(
            sockets.size,
            1,
            "requests must use exactly one TCP connection",
        );
        assert.equal(
            (report.server.stdout.match(/^connection\r?$/gm) || []).length,
            1,
        );
        const finishes = report.server.stdout
            .split(/\r?\n/)
            .filter((line) => line.startsWith("finish "));
        assert.deepEqual(
            finishes,
            Array.from(
                { length: 100 },
                (_, index) => `finish ${index + 1} true`,
            ),
            "every response must finish exactly once, in order",
        );
        assert.match(report.server.stdout, /^closed\r?$/m);
        report.pass = true;
    } catch (error) {
        report.failure = errorInfo(error);
        console.error(error.stack || error);
        process.exitCode = 1;
    } finally {
        clearTimeout(deadline);
        abort.abort();
        agent.destroy();
        if (child && child.exitCode === null && child.signalCode === null) {
            event("cleanup.terminate");
            child.kill();
            try {
                await boundedExit(exited, 3000);
            } catch {
                event("cleanup.kill");
                child.kill("SIGKILL");
                try {
                    await boundedExit(exited, 3000);
                } catch (error) {
                    report.cleanupError = errorInfo(error);
                    process.exitCode = 1;
                    child.stdout.destroy();
                    child.stderr.destroy();
                    child.unref();
                }
            }
        }
        report.connections = sockets.size;
        report.elapsedMs = performance.now() - started;
        writeFileSync(
            join(out, name + ".json"),
            JSON.stringify(report, null, 2) + "\n",
        );
        writeFileSync(join(out, name + ".stdout.log"), report.server.stdout);
        writeFileSync(join(out, name + ".stderr.log"), report.server.stderr);
        console.log(
            `${name}: ${report.responses.length}/100 responses, ${sockets.size} connection(s), ${report.pass ? "PASS" : "FAIL"}; ${out}`,
        );
    }

    function request(index, port) {
        return new Promise((resolveRequest, reject) => {
            let bytes = 0;
            const hash = createHash("sha256");
            let mismatch = false;
            event("request.start", { index });
            const req = http.get(
                {
                    host: "127.0.0.1",
                    port,
                    path: "/",
                    agent,
                    signal: abort.signal,
                },
                (res) => {
                    event("response.start", {
                        index,
                        status: res.statusCode,
                        headers: res.headers,
                    });
                    res.on("data", (chunk) => {
                        bytes += chunk.length;
                        hash.update(chunk);
                        for (const byte of chunk)
                            if (byte !== 98) {
                                mismatch = true;
                                break;
                            }
                    });
                    res.on("aborted", () =>
                        reject(
                            new Error(
                                `response ${index} aborted after ${bytes} bytes`,
                            ),
                        ),
                    );
                    res.on("error", (error) => failed("response.error", error));
                    res.on("close", () =>
                        event("response.close", {
                            index,
                            bytes,
                            complete: res.complete,
                        }),
                    );
                    res.on("end", () => {
                        const actualHash = hash.digest("hex");
                        event("response.end", {
                            index,
                            bytes,
                            complete: res.complete,
                        });
                        report.responses.push({
                            index,
                            bytes,
                            sha256: actualHash,
                            reusedSocket: req.reusedSocket,
                        });
                        try {
                            assert.equal(res.statusCode, 200);
                            assert.equal(
                                res.headers["transfer-encoding"],
                                "chunked",
                            );
                            assert.equal(res.complete, true);
                            assert.equal(bytes, expected.length);
                            assert.equal(mismatch, false);
                            assert.equal(actualHash, expectedHash);
                            resolveRequest();
                        } catch (error) {
                            reject(error);
                        }
                    });
                },
            );
            req.setTimeout(15000, () => {
                const error = new Error(
                    `request ${index} timed out after ${bytes} bytes`,
                );
                error.code = "ETIMEDOUT";
                event("request.timeout", { index, bytes });
                req.destroy(error);
            });
            req.on("socket", (socket) => {
                event("request.socket", {
                    index,
                    reusedSocket: req.reusedSocket,
                });
                if (!sockets.has(socket)) {
                    sockets.add(socket);
                    socket.on("error", (error) => {
                        report.errors.push(errorInfo(error));
                        event("socket.error", errorInfo(error));
                    });
                    socket.on("close", (hadError) =>
                        event("socket.close", { hadError }),
                    );
                }
            });
            req.on("finish", () => event("request.finish", { index }));
            req.on("close", () => event("request.close", { index }));
            req.on("error", (error) => failed("request.error", error));
            function failed(kind, error) {
                report.errors.push(errorInfo(error));
                event(kind, { index, bytes, ...errorInfo(error) });
                reject(error);
            }
        });
    }
}

function freePort() {
    return new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close((error) =>
                error ? reject(error) : resolvePort(port),
            );
        });
    });
}

function ready(child, output) {
    return new Promise((resolveReady, reject) => {
        const timer = setTimeout(
            () => finish(new Error("server readiness timed out")),
            15000,
        );
        const data = () => {
            if (/^ready\r?$/m.test(output.stdout)) finish();
        };
        const close = () => finish(new Error("server exited before readiness"));
        const error = (value) => finish(value);
        function finish(failure) {
            clearTimeout(timer);
            child.stdout.off("data", data);
            child.off("close", close);
            child.off("error", error);
            if (failure) reject(failure);
            else resolveReady();
        }
        child.stdout.on("data", data);
        child.on("close", close);
        child.on("error", error);
        data();
    });
}

function boundedExit(exited, milliseconds) {
    return new Promise((resolveExit, reject) => {
        const timer = setTimeout(
            () => reject(new Error("server exit timed out")),
            milliseconds,
        );
        exited.then(() => {
            clearTimeout(timer);
            resolveExit();
        }, reject);
    });
}
