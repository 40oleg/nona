import { jsonBytes } from "nona:internal/native";
import { Buffer } from "node:buffer";

// JSON.stringify(value, replacer, space) as the UTF-8 bytes of its result,
// serialized straight into a byte buffer without the intermediate string
// (#155); undefined where JSON.stringify returns undefined.
export function stringifyToBuffer(value, replacer, space) {
    const bytes = jsonBytes(value, replacer, space);
    return bytes === undefined
        ? undefined
        : Buffer.from(bytes.buffer, 0, bytes.length);
}
export default { stringifyToBuffer };
