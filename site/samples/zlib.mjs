import {
    gzipSync,
    gunzipSync,
    gunzip,
    createGzip,
    createGunzip,
    crc32,
} from "nona:zlib";
import { pipeline } from "nona:stream/promises";
import { Readable, Writable } from "nona:stream";

const text = "hello hello hello hello, zlib in a native executable\n".repeat(
    20,
);

// Synchronous: gzip and decompress in one call each.
const packed = gzipSync(text, { level: 9 });
console.log("sync round trip:", gunzipSync(packed).toString() === text);
console.log("smaller than the input:", packed.length < text.length);
console.log("crc32:", crc32(text));

// Callback: the same result, delivered asynchronously.
gunzip(packed, (error, unpacked) => {
    if (error) throw error;
    console.log("callback round trip:", unpacked.toString() === text);
});

// Streams: compress and decompress chunks as they arrive.
async function streamed() {
    const chunks = [];
    await pipeline(
        Readable.from([text.slice(0, 300), text.slice(300)]),
        createGzip(),
        createGunzip(),
        new Writable({
            write(chunk, encoding, callback) {
                chunks.push(chunk.toString());
                callback();
            },
        }),
    );
    console.log("stream round trip:", chunks.join("") === text);
}
streamed().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
