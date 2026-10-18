import { Gzip, gunzipSync, strToU8, strFromU8 } from "fflate";
const chunks = [];
const gzip = new Gzip({ mtime: 0 }, (chunk) => chunks.push(chunk));
gzip.push(strToU8("hello "), false);
gzip.push(strToU8("stream"), true);
const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
const compressed = new Uint8Array(length);
let offset = 0;
for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
}
console.log("compression", strFromU8(gunzipSync(compressed)));
