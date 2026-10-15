import { test } from "node:test";
import assert from "node:assert/strict";
import * as zlib from "node:zlib";
import { runModulesOnHost } from "./helpers/host.js";

// Deterministic test data, the same in Nona and in Node.js.
const data = String.raw`
function randomBytes(n, seed) { let s = seed >>> 0; const b = Buffer.alloc(n); for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; b[i] = s >>> 24; } return b; }
function textBytes(n) { let s = ''; for (let i = 0; s.length < n; i++) s += 'line ' + i + ': the quick brown fox ' + (i % 13) + ' jumps over the lazy dog ' + (i * 7919 % 1000) + '\n'; return Buffer.from(s.slice(0, n)); }
function repeated(n) { const b = Buffer.alloc(n), p = Buffer.from('abcabcabd0123'); for (let i = 0; i < n; i++) b[i] = p[i % p.length]; return b; }
function smaller() { return samples().map(([name, bytes]) => [name, bytes.subarray(0, name === 'random' ? 3000 : 20000)]); }
function samples() { return [['empty', Buffer.alloc(0)], ['one', Buffer.from('a')], ['tiny', Buffer.from('hello hello hello')], ['text', textBytes(20000)], ['random', randomBytes(20000, 7)], ['repeated', repeated(70000)]]; }
`;

/** Run an ES module in Nona and in Node.js; both must print the same. */
function agree(
    source: string,
    options: { gcStress?: boolean; oracleSource?: string } = {},
): void {
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        {
            gcStress: options.gcStress ?? false,
            ...(options.oracleSource === undefined
                ? {}
                : { oracleSource: options.oracleSource }),
        },
    );
    assert.equal(native.status, 0, JSON.stringify(native));
    assert.ok(oracle.length > 0);
    assert.equal(native.stdout, oracle);
}

test("zlib, node:zlib and nona:zlib are one module with Node's constants", () => {
    const body = String.raw`
console.log(zlib === bare, zlib === nona, ns.default === zlib, ns.deflateSync === zlib.deflateSync, typeof ns.inflateSync, typeof ns.crc32);
const names = Object.keys(zlib.constants).filter((k) => /^(Z_|DEFLATE|INFLATE|GZIP|GUNZIP|UNZIP)/.test(k));
console.log(names.map((k) => k + '=' + zlib.constants[k]).join(' '));
console.log(Object.getPrototypeOf(zlib.constants), zlib.Z_SYNC_FLUSH, zlib.Z_BEST_COMPRESSION, zlib.DEFLATERAW, Object.keys(zlib).includes('Z_OK'));
console.log(JSON.stringify(zlib.codes), Object.isFrozen(zlib.codes));
for (const name of ['deflateSync', 'inflateSync', 'gzipSync', 'gunzipSync', 'deflateRawSync', 'inflateRawSync', 'unzipSync', 'crc32']) console.log(name, typeof zlib[name], typeof ns[name]);
`;
    agree(
        "import zlib from 'node:zlib'; import bare from 'zlib'; import nona from 'nona:zlib'; import * as ns from 'node:zlib';" +
            body,
        {
            gcStress: true,
            oracleSource:
                "import zlib from 'node:zlib'; import bare from 'zlib'; import nona from 'node:zlib'; import * as ns from 'node:zlib';" +
                body,
        },
    );
});

test("crc32, Adler-32 and gzip trailers match Node", () =>
    agree(
        "import zlib from 'node:zlib';" +
            data +
            String.raw`
for (const [name, bytes] of samples()) {
  console.log(name, zlib.crc32(bytes), zlib.crc32(bytes, 12345), zlib.crc32(bytes.toString('latin1')), zlib.crc32(new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1)));
  // The trailers do not depend on how the data was compressed.
  console.log(zlib.deflateSync(bytes).subarray(-4).toString('hex'), zlib.gzipSync(bytes).subarray(-8).toString('hex'), zlib.gzipSync(bytes).subarray(0, 4).toString('hex'));
}
let crc = 0; const text = textBytes(5000);
for (let i = 0; i < text.length; i += 333) crc = zlib.crc32(text.subarray(i, i + 333), crc);
console.log(crc === zlib.crc32(text), zlib.crc32('héllo wörld'), zlib.crc32(new DataView(text.buffer, text.byteOffset, 100)));
`,
    ));

test("deflate round trips at every level and strategy", () =>
    agree(
        "import zlib from 'node:zlib';" +
            data +
            String.raw`
for (const [name, bytes] of samples()) {
  const line = [];
  for (let level = -1; level <= 9; level++)
    for (let strategy = 0; strategy <= 4; strategy++) {
      const options = { level, strategy };
      const a = zlib.inflateSync(zlib.deflateSync(bytes, options));
      const b = zlib.gunzipSync(zlib.gzipSync(bytes, options));
      const c = zlib.inflateRawSync(zlib.deflateRawSync(bytes, options));
      const d = zlib.unzipSync(zlib.gzipSync(bytes, options));
      line.push(a.equals(bytes) && b.equals(bytes) && c.equals(bytes) && d.equals(bytes) ? 1 : 0);
    }
  console.log(name, bytes.length, line.join(''));
}
for (const windowBits of [8, 9, 12, 15])
  for (const memLevel of [1, 8, 9]) {
    const bytes = textBytes(40000), c = zlib.deflateSync(bytes, { windowBits, memLevel });
    console.log(windowBits, memLevel, zlib.inflateSync(c).equals(bytes), zlib.inflateSync(c, { windowBits: 15 }).equals(bytes), c[0].toString(16));
  }
const dictionary = Buffer.from('the quick brown fox jumps over the lazy dog'), text = textBytes(3000);
console.log(zlib.inflateSync(zlib.deflateSync(text, { dictionary }), { dictionary }).equals(text), zlib.inflateRawSync(zlib.deflateRawSync(text, { dictionary }), { dictionary }).equals(text));
console.log(zlib.inflateSync(zlib.deflateSync('typed', {})).toString(), zlib.inflateSync(new Uint8Array(zlib.deflateSync('u8'))).toString(), zlib.inflateSync(zlib.deflateSync(new Uint16Array([65, 66]).buffer)).toString('hex'));
const info = zlib.deflateSync('info', { info: true }); console.log(Object.keys(info).join(), Buffer.isBuffer(info.buffer), zlib.inflateSync(info.buffer).toString());
console.log(Buffer.isBuffer(zlib.deflateSync('x')), zlib.inflateSync(zlib.deflateSync('abc', { finishFlush: zlib.constants.Z_SYNC_FLUSH }), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString());
console.log(zlib.inflateSync(zlib.deflateSync(textBytes(600)).subarray(0, 40), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString().slice(0, 12));
`,
    ));

test("Nona's compressed output decodes in Node and is about as compact", () => {
    const { native } = runModulesOnHost(
        {
            "main.mjs":
                "import zlib from 'node:zlib';" +
                data +
                String.raw`
for (const [name, bytes] of smaller()) {
  for (let level = -1; level <= 9; level++) {
    console.log(name, 'deflate', level, 0, zlib.deflateSync(bytes, { level }).toString('base64'));
    console.log(name, 'gzip', level, 0, zlib.gzipSync(bytes, { level }).toString('base64'));
    console.log(name, 'raw', level, 0, zlib.deflateRawSync(bytes, { level }).toString('base64'));
  }
  for (let strategy = 1; strategy <= 4; strategy++) console.log(name, 'deflate', 6, strategy, zlib.deflateSync(bytes, { strategy }).toString('base64'));
}
const dictionary = Buffer.from('the quick brown fox jumps over the lazy dog');
console.log('dictionary', zlib.deflateSync(textBytes(3000), { dictionary }).toString('base64'));
console.log('rawDictionary', zlib.deflateRawSync(textBytes(3000), { dictionary }).toString('base64'));
console.log('window', zlib.deflateSync(textBytes(40000), { windowBits: 9, memLevel: 1 }).toString('base64'));
`,
        },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.status, 0, JSON.stringify(native));
    const make = new Function(
        "Buffer",
        data + "return { smaller, textBytes };",
    )(Buffer) as {
        smaller: () => [string, Buffer][];
        textBytes: (n: number) => Buffer;
    };
    const expected = new Map(make.smaller());
    const lines = native.stdout.trim().split(/\r?\n/);
    assert.equal(lines.length, 6 * 37 + 3);
    const dictionary = Buffer.from(
        "the quick brown fox jumps over the lazy dog",
    );
    for (const line of lines) {
        const parts = line.split(" ");
        const compressed = Buffer.from(parts.at(-1)!, "base64");
        if (parts[0] === "dictionary") {
            assert.deepEqual(
                zlib.inflateSync(compressed, { dictionary }),
                make.textBytes(3000),
            );
            continue;
        }
        if (parts[0] === "rawDictionary") {
            assert.deepEqual(
                zlib.inflateRawSync(compressed, { dictionary }),
                make.textBytes(3000),
            );
            continue;
        }
        if (parts[0] === "window") {
            assert.deepEqual(
                zlib.inflateSync(compressed),
                make.textBytes(40000),
            );
            continue;
        }
        const [name, format, levelText, strategyText] = parts;
        const bytes = expected.get(name!)!,
            level = Number(levelText),
            strategy = Number(strategyText);
        const decode =
            format === "deflate"
                ? zlib.inflateSync
                : format === "gzip"
                  ? zlib.gunzipSync
                  : zlib.inflateRawSync;
        assert.deepEqual(decode(compressed), bytes, line.slice(0, 40));
        const encode =
            format === "deflate"
                ? zlib.deflateSync
                : format === "gzip"
                  ? zlib.gzipSync
                  : zlib.deflateRawSync;
        const reference = encode(bytes, { level, strategy }).length;
        assert.ok(
            compressed.length <= reference * 1.1 + 16,
            `${name} ${format} ${level} ${strategy}: ${compressed.length} > ${reference}`,
        );
    }
});

test("large inputs round trip and decode Node's output", () => {
    const make = new Function(
        "Buffer",
        data + "return { repeated, textBytes, randomBytes };",
    )(Buffer) as Record<string, (n: number, seed?: number) => Buffer>;
    const big = Buffer.concat([
        make.repeated!(1 << 20),
        make.randomBytes!(100000, 3),
        make.textBytes!(300000),
    ]);
    const fromNode = zlib.gzipSync(big).toString("base64");
    agree(
        "import zlib from 'node:zlib';" +
            data +
            String.raw`
const big = Buffer.concat([repeated(1 << 20), randomBytes(100000, 3), textBytes(300000)]);
const node = zlib.gunzipSync(Buffer.from('${fromNode}', 'base64'));
console.log(node.length, node.equals(big), zlib.crc32(node));
for (const level of [1, 6, 9]) {
  const c = zlib.deflateSync(big, { level }), back = zlib.inflateSync(c);
  console.log(level, back.length, back.equals(big), c.length < big.length / 3, c.subarray(-4).toString('hex'));
}
const rep = repeated(3 << 20), c = zlib.gzipSync(rep);
console.log(c.length < 20000, zlib.gunzipSync(c).equals(rep), zlib.unzipSync(c).length, zlib.deflateRawSync(rep, { level: 0 }).length - rep.length < 1000);
`,
    );
});

test("streams produced by Node decode, including gzip header fields, members and dictionaries", () =>
    agree(
        String.raw`import zlib from 'node:zlib';
const streams = {
    stored: "eAEBEQDu/3N0b3JlZCBibG9jayBkYXRhO80Gdw==",
    fixed: "y0jNyclXyEAnAQ==",
    dynamic: "eJxl0EFq6zAUheGtnAWYbCAj15KxaWMXS6XvDVXpConGUtG9pe3uS0kmIcMfPjhwFMWzEwJLI7czfC2cWVAj3s7Vv/MR5Hy6BDKDpTYKHXzdPxoxU8BXloSYvylg+oxxdwW+BuIOtd258FPcnv2thCQncI3AVAS5QBJdNxO5QO0Apcen3moYu+n+ZDCsi5mNxTri4WkdHs0Ruh+mS2A2MHbdtOowrKfnTRujFV5nO2Gc/2mF6WUcT/2CYVXadFi3O6f+L/1pHm4l7NRb9JuG0YvFvMBO+ro56V7p7QAcGgVHCe++nt9ASVAypBCDmoO4JGAK1aO4PcbPCT7vrvwEJMlfCH9vtY+9erSK7lYG+s7xznWBWhUG5+tm8o5w5EvECuHMpXrw7qgJg8SdI6lfJEaoRA==",
    gzipHeader: "H4sIHnhWAAAACgQAQUICAGZpbGUudHh0AGEgY29tbWVudAB+WstLzE1NUchNzU1KLQIArLc7QwwAAAA=",
    concatenated: "H4sIAAAAAAAACkvLLCouUQAA/HrxHAYAAAAfiwgAAAAAAAIKK05Nzs9LAQBpER+2BgAAAB+LCAAAAAAAAAoDAAAAAAAAAAAAAAAAAA==",
    dictionary: "eLs+EAamS0EXSCxKxRAEABO1DoM=",
    rawDictionary: "S0EXSCxKxRAEAA==",
    smallWindow: "GNMrz8xLyS9XKEemAFRcCAk=",
    huffmanOnly: "H4sIAAAAAAAECgXBAQEAAACCoK3S/w9BVVUBAGw734wgyR0AAAA=",
};
const dictionary = Buffer.from('dictionary words ');
const show = (name, f) => { try { const out = f(); console.log(name, out.length, zlib.crc32(out), JSON.stringify(out.toString('latin1').slice(0, 60))); } catch (e) { console.log(name, e.code, e.errno, e.message); } };
const b = (name) => Buffer.from(streams[name], 'base64');
show('stored', () => zlib.inflateSync(b('stored')));
show('stored-unzip', () => zlib.unzipSync(b('stored')));
show('fixed', () => zlib.inflateRawSync(b('fixed')));
show('dynamic', () => zlib.inflateSync(b('dynamic')));
show('dynamic-unzip', () => zlib.unzipSync(b('dynamic')));
show('gzipHeader', () => zlib.gunzipSync(b('gzipHeader')));
show('gzipHeader-unzip', () => zlib.unzipSync(b('gzipHeader')));
show('concatenated', () => zlib.gunzipSync(b('concatenated')));
show('concatenated-unzip', () => zlib.unzipSync(b('concatenated')));
show('dictionary', () => zlib.inflateSync(b('dictionary'), { dictionary }));
show('dictionary-missing', () => zlib.inflateSync(b('dictionary')));
show('dictionary-bad', () => zlib.inflateSync(b('dictionary'), { dictionary: Buffer.from('dictionary wordz ') }));
show('rawDictionary', () => zlib.inflateRawSync(b('rawDictionary'), { dictionary }));
show('smallWindow', () => zlib.inflateSync(b('smallWindow')));
show('smallWindow-9', () => zlib.inflateSync(b('smallWindow'), { windowBits: 9 }));
show('dynamic-small-window', () => zlib.inflateSync(b('dynamic'), { windowBits: 9 }));
show('huffmanOnly', () => zlib.gunzipSync(b('huffmanOnly')));
show('trailing', () => zlib.inflateSync(Buffer.concat([b('dynamic'), Buffer.from('trailing junk')])));
show('max', () => zlib.inflateSync(b('dynamic'), { maxOutputLength: 100 }));
show('max-ok', () => zlib.inflateSync(b('dynamic'), { maxOutputLength: 1e6 }));
`,
    ));

test("corrupt input raises Node's errors", () => {
    // Streams compressed by Node.js, corrupted the same way on both sides.
    const make = new Function(
        "Buffer",
        data + "return { repeated, textBytes, randomBytes };",
    )(Buffer) as Record<string, (n: number, seed?: number) => Buffer>;
    const sources = JSON.stringify(
        [
            ["inflateSync", zlib.deflateSync(make.textBytes!(3000))],
            ["gunzipSync", zlib.gzipSync(make.textBytes!(2000), { level: 1 })],
            ["inflateRawSync", zlib.deflateRawSync(make.randomBytes!(400, 5))],
            [
                "inflateSync",
                zlib.deflateSync(make.repeated!(3000), { strategy: 4 }),
            ],
            [
                "unzipSync",
                zlib.deflateSync(make.textBytes!(1500), { level: 9 }),
            ],
            ["gunzipSync", zlib.gzipSync("hello")],
            ["inflateSync", zlib.deflateSync("hello hello hello hello")],
        ].map(([name, bytes]) => [name, bytes!.toString("base64")]),
    );
    agree(
        "import zlib from 'node:zlib';" +
            String.raw`
const sources = ${sources}.map(([name, text]) => [name, Buffer.from(text, 'base64')]);
const show = (name, f) => { try { const out = f(); console.log(name, 'ok', out.length, zlib.crc32(out)); } catch (e) { console.log(name, e.code, e.errno, e.message, e instanceof Error); } };
const hex = (h) => Buffer.from(h, 'hex');
const raw = {
  blockType: '07', storedLengths: '010500050001020304', storedTruncated: '010500faff0102',
  tooManyLengths: 'f50000000000000000000000', tooManyDistances: '051e00000000000000000000', codeLengths: '050092000000000000000000',
  repeat: '050002240000000000000000', noEndOfBlock: '050080e43f1b0000000000000000', literalSet: '0580010500000080fabf3a0000000000000000',
  distanceSet: '0d81010500000080eaffe92a0000000000000000', literalCode: '1b0300000000', distanceCode: '4b043e00000000', tooFar: '4b046200',
  emptyCodeLengths: '050000000000000000', truncated: '4b04',
};
for (const [name, h] of Object.entries(raw)) show(name, () => zlib.inflateRawSync(hex(h)));
const gzipped = sources[5][1], deflated = sources[6][1];
const flip = (bytes, at, mask) => { const copy = Buffer.from(bytes); copy[at < 0 ? copy.length + at : at] ^= mask; return copy; };
show('empty', () => zlib.inflateSync(Buffer.alloc(0)));
show('emptyRaw', () => zlib.inflateRawSync(Buffer.alloc(0)));
show('emptyGunzip', () => zlib.gunzipSync(Buffer.alloc(0)));
show('emptyUnzip', () => zlib.unzipSync(Buffer.alloc(0)));
show('headerCheck', () => zlib.inflateSync(hex('01020304')));
show('headerOnly', () => zlib.inflateSync(hex('789c')));
show('method', () => zlib.inflateSync(hex('7a9a0000')));
show('windowSize', () => zlib.inflateSync(hex('789c030000000001'), { windowBits: 9 }));
show('windowSizeHeader', () => zlib.inflateSync(hex('881c0300')));
show('needDictionary', () => zlib.inflateSync(hex('78bb000000010300')));
show('adler', () => zlib.inflateSync(flip(deflated, -1, 1)));
show('adlerTruncated', () => zlib.inflateSync(deflated.subarray(0, deflated.length - 2)));
show('gzipMagic', () => zlib.gunzipSync(Buffer.from('hello world')));
show('gzipMethod', () => zlib.gunzipSync(hex('1f8b09000000000000000000')));
show('gzipFlags', () => zlib.gunzipSync(flip(gzipped, 3, 0xe0)));
show('gzipHeaderCrc', () => { const h = Buffer.from(gzipped); h[3] = 2; return zlib.gunzipSync(Buffer.concat([h.subarray(0, 10), hex('0000'), h.subarray(10)])); });
show('gzipCrc', () => zlib.gunzipSync(flip(gzipped, -5, 1)));
show('gzipLength', () => zlib.gunzipSync(flip(gzipped, -1, 1)));
show('gzipTrailingJunk', () => zlib.gunzipSync(Buffer.concat([gzipped, Buffer.from('junk')])));
show('gzipTrailing1f', () => zlib.gunzipSync(Buffer.concat([gzipped, hex('1f')])));
show('gzipTrailing1f00', () => zlib.gunzipSync(Buffer.concat([gzipped, hex('1f000102')])));
show('gzipTrailingZeros', () => zlib.gunzipSync(Buffer.concat([gzipped, Buffer.alloc(9)])));
show('unzipRaw', () => zlib.unzipSync(zlib.deflateRawSync('x')));
show('unzip1f', () => zlib.unzipSync(hex('1f')));
show('rawWithZlibHeader', () => zlib.inflateRawSync(deflated));
show('zlibWithGzip', () => zlib.inflateSync(gzipped));
// Deterministic corruption of valid streams: bit flips and truncation.
let s = 99; const next = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
for (let i = 0; i < 700; i++) {
  const [fn, source] = sources[i % 5];
  let bytes = Buffer.from(source);
  for (let k = 1 + next(3); k > 0; k--) bytes[next(bytes.length)] ^= 1 << next(8);
  if (i % 6 === 0) bytes = bytes.subarray(0, next(bytes.length));
  show('fuzz' + i, () => zlib[fn](bytes));
}
`,
    );
});

test("options and arguments are validated as in Node", () =>
    agree(
        String.raw`import zlib from 'node:zlib';
const show = (name, f) => { try { const out = f(); console.log(name, 'ok', typeof out === 'number' ? out : out.length); } catch (e) { console.log(name, e.name, e.code, e.message); } };
show('level', () => zlib.deflateSync('x', { level: 10 }));
show('levelString', () => zlib.deflateSync('x', { level: 'a' }));
show('levelLongString', () => zlib.deflateSync('x', { level: 'abcdefghijklmnopqrstuvwxyz0123456789' }));
show('levelNull', () => zlib.deflateSync('x', { level: null }));
show('levelNaN', () => zlib.deflateSync('x', { level: NaN }));
show('levelInfinity', () => zlib.deflateSync('x', { level: Infinity }));
show('levelHuge', () => zlib.deflateSync('x', { level: 2 ** 40 }));
show('windowBits', () => zlib.deflateSync('x', { windowBits: 7 }));
show('windowBits16', () => zlib.inflateSync(zlib.deflateSync('x'), { windowBits: 16 }));
show('gzipWindowBits8', () => zlib.gzipSync('x', { windowBits: 8 }));
show('rawWindowBits8', () => zlib.deflateRawSync('x', { windowBits: 8 }));
show('memLevel', () => zlib.deflateSync('x', { memLevel: 10 }));
show('strategy', () => zlib.deflateSync('x', { strategy: 5 }));
show('chunkSize', () => zlib.deflateSync('x', { chunkSize: 10 }));
show('dictionaryString', () => zlib.deflateSync('x', { dictionary: 'abc' }));
show('dictionaryArrayBuffer', () => zlib.inflateSync(zlib.deflateSync('abcabc', { dictionary: new Uint8Array([97, 98, 99]).buffer }), { dictionary: Buffer.from('abc') }));
show('finishFlush', () => zlib.deflateSync('x', { finishFlush: 9 }));
show('flush', () => zlib.deflateSync('x', { flush: -1 }));
show('maxOutputLength', () => zlib.inflateSync('x', { maxOutputLength: 0 }));
show('maxOutputLengthSmall', () => zlib.inflateSync(zlib.deflateSync('x'.repeat(1000)), { maxOutputLength: 10 }));
show('inputNumber', () => zlib.deflateSync(5));
show('inputNull', () => zlib.deflateSync(null));
show('inputUndefined', () => zlib.gzipSync());
show('inputObject', () => zlib.deflateSync({}));
show('inputBoolean', () => zlib.inflateSync(true));
show('inputArray', () => zlib.inflateSync([1, 2]));
show('optionsFirst', () => zlib.deflateSync(5, { level: 10 }));
show('optionsNull', () => zlib.deflateSync('x', null));
show('crcNumber', () => zlib.crc32(5));
show('crcArrayBuffer', () => zlib.crc32(new ArrayBuffer(3)));
show('crcNegative', () => zlib.crc32('x', -1));
show('crcFraction', () => zlib.crc32('x', 1.5));
show('crcString', () => zlib.crc32('x', '1'));
show('crcLarge', () => zlib.crc32('x', 2 ** 32));
show('crcMax', () => zlib.crc32('x', 2 ** 32 - 1));
`,
    ));
