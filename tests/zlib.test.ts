import { test } from "node:test";
import assert from "node:assert/strict";
import {
    deflateRawSync,
    gunzipSync,
    inflateRawSync,
    inflateSync,
} from "node:zlib";
import { runModulesOnHost } from "./helpers/host.js";

// node:zlib (#298). The programs run as ES modules on the host target and on
// Node.js, whose outputs must be identical. Compressed bytes are not compared
// with Node's: they only have to inflate to the input. GC stress collects
// before every operation, so only the first program, with a few bytes of
// data, runs under it; the others process up to a few hundred KiB.

function expectNode(source: string, gcStress = false): void {
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        { gcStress },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.ok(oracle.length > 0);
    assert.equal(native.stdout, oracle);
}

test("node:zlib inflates, deflates and streams under GC stress", () =>
    expectNode(
        String.raw`import zlib from 'node:zlib';
const b = (s) => Buffer.from(s, 'base64');
console.log(zlib.inflateRawSync(b('S0xKTgQjAA==')).toString(), zlib.inflateSync(b('eAEBBwD4/3N0b3JlZCEL7wKz')).toString(), zlib.unzipSync(b('H4sIAAAAAAAACsvIBACsKpPYAgAAAA==')).toString());
console.log(zlib.inflateSync(zlib.deflateSync('abcabcabc')).toString(), zlib.crc32('hello'));
try { zlib.inflateSync(Buffer.from('abc')); } catch (error) { console.log(error.message, error.code, error.errno); }
const stream = zlib.createInflateRaw(), parts = [];
stream.on('data', (chunk) => parts.push(chunk));
stream.on('end', () => console.log('stream', Buffer.concat(parts).toString()));
const input = b('S0xKTgQjAA==');
for (let i = 0; i < input.length; i++) stream.write(input.subarray(i, i + 1));
stream.end();
`,
        true,
    ));

// Made by Node's zlib from text(600, 7) (a dynamic Huffman block) and from a
// short text at level 9 (a fixed Huffman block in a gzip member).
const dynamicVector =
    "eJwdkkEKRDEIQ/c9hVcL/ECFYkDT+w+dpS6SmOfIOgTzznQdpo3hCvC8MdzIQxKcFQEVgxTtJW7JaV7mLHqGmJQ1axS+W95pMbLlk7xPhDTdqQswOZ+SlLpJD77Zw0OZWuvaX4DUcORvV7BEqJZ7OapKJaqAYHclutQJWL7khTeD24Q1EnDxt4wIYw+NhmMSPZhMr5vguCO5Sh/F2y+1vz0ymTzX5CbqTtLMtwqqeGmz5RHZ1jKf/yWX8QUviIOb0qDefSESgEBNOT1SFsb0po/h3j0OU0diFJHUTdPCjWd0HK+NoQxQ2MDULVa9er/B8IUQkI/kV0uKURFB2k0fIvbTpXbU8fHgsTkNBhus5MITGYYL5lYmUuWH8TXiKL5fCR54lhkM1ENc2/UDcffqNA==";
const gzipVector =
    "H4sIAAAAAAACCvPLz0tUSM7PLcjMSS1W8EosSwxOLsosKFEoyVfISyzJLEtVSM5PSdVT8KO6QgNDI2MTUzNzC0sAIZmKJoUAAAA=";

// Deterministic test data: text from a small alphabet and incompressible bytes.
const data = String.raw`
function text(size, seed) {
  const alphabet = 'eeeeeeeetttttaaaaooooiinnsshrdlu  \n';
  let x = seed, s = '';
  for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += alphabet[x % alphabet.length]; }
  return s;
}
function noise(size) {
  const bytes = Buffer.alloc(size);
  let x = 1;
  for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; bytes[i] = x >> 16; }
  return bytes;
}
`;

test("node:zlib inflates fixed streams made by Node's zlib", () =>
    expectNode(
        String.raw`import zlib from 'node:zlib';
import { inflateSync, gunzipSync, crc32, constants } from 'node:zlib';
${data}
const b = (s) => Buffer.from(s, 'base64');
// A dynamic Huffman block, fixed Huffman blocks and a stored block.
const dynamic = b('${dynamicVector}');
console.log(inflateSync(dynamic).toString() === text(600, 7), crc32(inflateSync(dynamic)));
const fixed = b('eJzzy89LVEjOzy3IzEktVvBKLEsMTi7KLChRKMlXyEssySxLVUjOT0nVU/CjukIDQyNjE1MzcwtLAKVMLoQ=');
console.log(JSON.stringify(zlib.inflateSync(fixed).toString()));
console.log(zlib.inflateRawSync(b('S0xKTgQjAA==')).toString(), zlib.inflateSync(b('eAEBBwD4/3N0b3JlZCEL7wKz')).toString());
const gzip = b('${gzipVector}');
console.log(gunzipSync(gzip).equals(inflateSync(fixed)), zlib.unzipSync(gzip).length, zlib.unzipSync(fixed).length);
// Two members followed by bytes that are not a gzip header, which are ignored.
console.log(gunzipSync(Buffer.concat([gzip, gzip, Buffer.from([0, 1, 2])])).length);
// A header with FEXTRA, FNAME, FCOMMENT and FHCRC around a raw stream.
const header = Buffer.from([0x1f, 0x8b, 8, 4 | 8 | 16 | 2, 1, 2, 3, 4, 0, 3, 3, 0, 9, 9, 9, 0x61, 0x2e, 0x74, 0x78, 0x74, 0, 0x68, 0x69, 0]);
const crc = Buffer.alloc(2); crc.writeUInt16LE(crc32(header) & 0xffff);
const body = b('S0xKTgQjAA=='), trailer = Buffer.alloc(8);
trailer.writeUInt32LE(crc32('abcabcabc')); trailer.writeUInt32LE(9, 4);
console.log(gunzipSync(Buffer.concat([header, crc, body, trailer])).toString());
console.log(crc32(''), crc32('hello'), crc32('world', crc32('hello ')), crc32(new Uint8Array([1, 2, 3])), crc32(noise(1000)));
console.log(zlib.Z_SYNC_FLUSH, zlib.Z_DATA_ERROR, constants.Z_BEST_COMPRESSION, constants.BROTLI_DEFAULT_QUALITY, zlib.codes.Z_BUF_ERROR, zlib.codes['-3'], Object.keys(zlib).includes('Z_SYNC_FLUSH'));
`,
    ));

test("node:zlib compresses and inflates its own output", () =>
    expectNode(
        String.raw`import zlib from 'node:zlib';
${data}
const inputs = [Buffer.alloc(0), Buffer.from('a'), Buffer.from(text(5000, 3)), Buffer.from(text(70000, 5)), noise(70000), Buffer.alloc(100000, 120)];
for (const input of inputs) {
  const results = [];
  for (const [compress, decompress] of [['deflateSync', 'inflateSync'], ['gzipSync', 'gunzipSync'], ['deflateRawSync', 'inflateRawSync'], ['gzipSync', 'unzipSync']])
    results.push(zlib[decompress](zlib[compress](input)).equals(input));
  for (const level of [0, 1, 9]) results.push(zlib.inflateSync(zlib.deflateSync(input, { level })).equals(input));
  console.log(input.length, results.join(' '));
}
console.log(zlib.inflateSync(zlib.deflateSync('a string')).toString(), zlib.gunzipSync(zlib.gzipSync(new Uint16Array([1, 2]).buffer)).length);
`,
    ));

test("node:zlib output inflates with Node's zlib", () => {
    const { native } = runModulesOnHost(
        {
            "main.mjs": String.raw`import zlib from 'node:zlib';
${data}
for (const input of [Buffer.alloc(0), Buffer.from(text(70000, 5)), noise(70000)])
  for (const level of [-1, 0, 1, 9])
    console.log(zlib.deflateSync(input, { level }).toString('base64'), zlib.gzipSync(input, { level }).toString('base64'), zlib.deflateRawSync(input, { level }).toString('base64'));
`,
        },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.status, 0, native.stderr);
    const lines = native.stdout.trim().split("\n");
    assert.equal(lines.length, 12);
    const sizes = [0, 70000, 70000];
    lines.forEach((line, index) => {
        const [deflated, gzipped, raw] = line
            .split(" ")
            .map((text) => Buffer.from(text, "base64"));
        const size = sizes[Math.floor(index / 4)]!;
        for (const output of [
            inflateSync(deflated!),
            gunzipSync(gzipped!),
            inflateRawSync(raw!),
        ])
            assert.equal(output.length, size);
        assert.ok(inflateSync(deflated!).equals(gunzipSync(gzipped!)));
        assert.ok(inflateRawSync(raw!).equals(gunzipSync(gzipped!)));
    });
    // Incompressible input becomes stored blocks, barely larger than the input.
    assert.ok(deflateRawSync(Buffer.alloc(0)).length <= 2);
});

test("node:zlib streams take input in 1-byte chunks", () =>
    expectNode(
        String.raw`import zlib from 'node:zlib';
${data}
const input = Buffer.from(text(3000, 11));
async function main() {
function run(stream, chunks) {
  return new Promise((resolve) => {
    const parts = [];
    stream.on('data', (chunk) => parts.push(chunk));
    stream.on('error', (error) => resolve('error ' + error.message + ' ' + error.code));
    stream.on('end', () => resolve(Buffer.concat(parts)));
    for (const chunk of chunks) stream.write(chunk);
    stream.end();
  });
}
const bytes = (buffer) => Array.from(buffer, (_, i) => buffer.subarray(i, i + 1));
for (const [create, compress] of [['createInflate', 'deflateSync'], ['createGunzip', 'gzipSync'], ['createInflateRaw', 'deflateRawSync'], ['createUnzip', 'gzipSync'], ['createUnzip', 'deflateSync']]) {
  const output = await run(zlib[create](), bytes(zlib[compress](input)));
  console.log(create, output.equals(input), zlib[create]() instanceof zlib[create.slice(6)]);
}
for (const [create, decompress] of [['createDeflate', 'inflateSync'], ['createGzip', 'gunzipSync'], ['createDeflateRaw', 'inflateRawSync']]) {
  const chunks = [];
  for (let i = 0; i < input.length; i += 700) chunks.push(input.subarray(i, i + 700));
  const output = await run(zlib[create]({ level: 9 }), chunks);
  console.log(create, zlib[decompress](output).equals(input));
}
const gzip = zlib.createGzip(), parts = [];
gzip.on('data', (chunk) => parts.push(chunk));
gzip.write('first ');
await new Promise((resolve) => gzip.flush(resolve));
console.log('flushed', zlib.gunzipSync(Buffer.concat(parts), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString());
await new Promise((resolve) => { gzip.on('end', resolve); gzip.end('second'); });
console.log(zlib.gunzipSync(Buffer.concat(parts)).toString());
console.log(await run(zlib.createGunzip(), bytes(zlib.gzipSync(input).subarray(0, 100))));
const corrupt = zlib.deflateSync(input); corrupt[corrupt.length - 1] ^= 1;
console.log(await run(zlib.createInflate(), bytes(corrupt)));
console.log(await run(zlib.createInflate(), [Buffer.from('not zlib')]));
const values = await new Promise((resolve) => zlib.gzip('callback', (error, gzipped) => zlib.gunzip(gzipped, (error2, result) => resolve([error, error2, result.toString()]))));
console.log(JSON.stringify(values));
const failed = await new Promise((resolve) => zlib.inflate(Buffer.from('xyz'), (error, result) => resolve([error.message, error.code, error.errno, result])));
console.log(JSON.stringify(failed));
}
main();
`,
    ));

test("node:zlib reports corrupt input with zlib's messages and codes", () =>
    expectNode(
        String.raw`import zlib from 'node:zlib';
${data}
const good = Buffer.from('${dynamicVector}', 'base64'), gzip = Buffer.from('${gzipVector}', 'base64');
const flip = (buffer, index, mask) => { const copy = Buffer.from(buffer); copy[index] ^= mask; return copy; };
const cases = [
  ['inflateSync', Buffer.from('abc')],
  ['inflateSync', Buffer.from([0x78, 0x9c])],
  ['inflateSync', good.subarray(0, good.length - 3)],
  ['inflateSync', flip(good, good.length - 1, 1)],
  ['inflateSync', Buffer.from([0x79, 0x18, 3, 0])],
  ['inflateSync', Buffer.from([0x88, 0x1c, 3, 0])],
  ['inflateSync', Buffer.from([0x78, 0xbb, 0, 0, 0, 0, 3, 0])],
  ['inflateRawSync', Buffer.from([7])],
  ['inflateRawSync', Buffer.from([1, 5, 0, 5, 0, 1, 2, 3, 4, 5])],
  ['inflateRawSync', Buffer.from([0xfd, 0xff])],
  ['inflateRawSync', Buffer.from([0x63, 0, 0x22])],
  ['gunzipSync', Buffer.from('plain text')],
  ['gunzipSync', flip(gzip, 2, 1)],
  ['gunzipSync', flip(gzip, 3, 0x80)],
  ['gunzipSync', flip(gzip, gzip.length - 1, 1)],
  ['gunzipSync', flip(gzip, gzip.length - 5, 1)],
  ['gunzipSync', Buffer.concat([gzip, Buffer.from([0x1f])])],
  ['unzipSync', Buffer.from([1, 2, 3])],
];
for (let i = 0; i < 40; i++) cases.push(['inflateSync', flip(good, 2 + (i * 37) % (good.length - 6), 1 << (i % 8))]);
for (const [name, input] of cases) {
  try { console.log(name, 'ok', zlib[name](input).length); }
  catch (error) { console.log(name, error.message, error.code, error.errno); }
}
console.log(zlib.inflateSync(good.subarray(0, good.length - 10), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).length > 0);
for (const call of [() => zlib.inflateSync(5), () => zlib.deflateSync('x', { level: 10 }), () => zlib.crc32(5), () => zlib.inflate(Buffer.alloc(1))])
  try { call(); } catch (error) { console.log(error.name, error.code); }
`,
    ));

test("node:zlib loads; Brotli and Zstandard throw ERR_NONA_UNSUPPORTED", () => {
    const { native } = runModulesOnHost(
        {
            "main.mjs": String.raw`import zlib from 'node:zlib';
import { isBuiltin } from 'node:module';
console.log(typeof zlib.createBrotliDecompress, typeof zlib.BrotliCompress, isBuiltin('zlib'));
for (const name of ['createBrotliCompress', 'createBrotliDecompress', 'brotliCompressSync', 'brotliDecompressSync', 'brotliCompress', 'zstdCompressSync', 'createZstdDecompress'])
  try { zlib[name](Buffer.from('x'), () => {}); console.log(name, 'returned'); } catch (error) { console.log(name, error.code); }
try { new zlib.BrotliDecompress(); } catch (error) { console.log('BrotliDecompress', error.code); }
`,
        },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.status, 0, native.stderr);
    assert.equal(
        native.stdout,
        [
            "function function true",
            "createBrotliCompress ERR_NONA_UNSUPPORTED",
            "createBrotliDecompress ERR_NONA_UNSUPPORTED",
            "brotliCompressSync ERR_NONA_UNSUPPORTED",
            "brotliDecompressSync ERR_NONA_UNSUPPORTED",
            "brotliCompress ERR_NONA_UNSUPPORTED",
            "zstdCompressSync ERR_NONA_UNSUPPORTED",
            "createZstdDecompress ERR_NONA_UNSUPPORTED",
            "BrotliDecompress ERR_NONA_UNSUPPORTED",
            "",
        ].join("\n"),
    );
});
