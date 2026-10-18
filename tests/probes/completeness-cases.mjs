// These are opt-in audit workloads, not additional default conformance tests.
export async function completenessCases(target) {
    const { streamProbeCases } =
        await import("../../dist/tests/probes/stream-probes.js");
    const packages = [
        ["cli", "cli", "cli 3 false input.json\n"],
        ["filesystem", "filesystem", "filesystem 5\n"],
        ["json", "json", "json demo 6\ninvalid SyntaxError\n"],
        ["http-server", "server", "server 201 5\n"],
        ["http-client", "client", "client 200 42\n"],
        ["compression", "compression", "compression hello stream\n"],
        ["subprocess", "subprocess", "subprocess 7 child-ok\n"],
        ["concurrency", "concurrency", "concurrency 2,4,6,8 2 0 0\n"],
        ["workers", "workers", "workers 5\n"],
    ].map(([id, file, expected]) => ({
        id,
        file: `${file}.mjs`,
        expected,
        package: true,
    }));
    return [
        ...packages,
        ...streamProbeCases(target)
            .filter((probe) =>
                ["stream-writable-queues", "stream-web-cancellation"].includes(
                    probe.name,
                ),
            )
            .map((probe) => ({
                id: probe.name,
                source: probe.source,
                expected: probe.expected,
            })),
        {
            id: "gc-roots",
            gcStress: true,
            source: `function make(x) { return () => x; }
const keep = []; for (let i = 0; i < 100; i++) keep.push(make({ i, text: 'value-' + i }));
console.log('roots', keep.length, keep[0]().text, keep[99]().i);`,
            expected: "roots 100 value-0 99\n",
        },
        {
            id: "worker-api",
            source: `import { Worker } from 'node:worker_threads';
try { const worker = new Worker('const { parentPort } = require("node:worker_threads"); parentPort.postMessage(42)', { eval: true });
worker.on('message', value => console.log('worker', value));
} catch (error) { console.log('worker', error.code); }`,
            expected: "worker 42\n",
            expectedNative: "worker ERR_NONA_UNSUPPORTED\n",
        },
        {
            id: "zlib-api",
            source: `import { gzipSync, gunzipSync } from 'node:zlib';
console.log('zlib', gunzipSync(gzipSync('hello')).toString());`,
            expected: "zlib hello\n",
        },
        {
            id: "dns-api",
            source: `import { lookup } from 'node:dns';
lookup('localhost', (error, address) => { if (error) throw error; console.log('dns', address === '127.0.0.1' || address === '::1'); });`,
            expected: "dns true\n",
        },
        {
            id: "tls-verification",
            source: `import tls from 'node:tls';
import fs from 'node:fs';
const ca = fs.readFileSync(process.env.NONA_PROBE_CA, 'utf8');
async function connect(label, options) { await new Promise(resolve => {
const socket = tls.connect(Object.assign({ host:'127.0.0.1', port:Number(process.env.NONA_PROBE_TLS), servername:'localhost' }, options), () => {
console.log(label, 'authorized', socket.authorized); socket.end();
}); socket.on('error', error => console.log(label, error.code)); socket.on('close', resolve);
}); }
(async () => { await connect('trusted', { ca }); await connect('hostname', { ca, servername:'wrong.invalid' }); await connect('untrusted', {}); })();`,
            expected:
                "trusted authorized true\nhostname ERR_TLS_CERT_ALTNAME_INVALID\nuntrusted UNABLE_TO_VERIFY_LEAF_SIGNATURE\n",
        },
    ];
}
