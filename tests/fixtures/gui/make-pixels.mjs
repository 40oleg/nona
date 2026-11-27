// Nona-owned 2x2 RGBA fixture. No external asset generator or network input.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
function chunk(name, data) {
    const type = Buffer.from(name),
        body = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of body) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    body.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(2);
header.writeUInt32BE(2, 4);
header[8] = 8;
header[9] = 6;
const pixels = Buffer.from([
    0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255,
]);
writeFileSync(
    new URL("pixels.png", import.meta.url),
    Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(pixels)),
        chunk("IEND", Buffer.alloc(0)),
    ]),
);
