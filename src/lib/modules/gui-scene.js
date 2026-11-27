// This packet is borrowed only while the runtime builds a Cairo recording.
// Cairo owns all paths, glyphs and image references after the synchronous call.
const sceneEncoder = new TextEncoder();
function assetPath(value) {
    if (!value || value[0] === "/") return value;
    const executable = process.execPath;
    return executable.slice(0, executable.lastIndexOf("/") + 1) + value;
}
export function scenePacket(result, session) {
    const recordsEnd = 640 + result.commands.length * 128;
    let bytes = recordsEnd;
    const strings = [];
    for (const c of result.commands) {
        const values = [
            c.op === 7 ? assetPath(c.text) : c.text,
            c.family,
            assetPath(c.font),
        ];
        const offsets = [];
        for (const value of values) {
            if (!value) {
                offsets.push(0);
                continue;
            }
            const encoded = sceneEncoder.encode(value);
            offsets.push(bytes);
            strings.push({ offset: bytes, encoded });
            bytes += encoded.length + 1;
        }
        c.offsets = offsets;
    }
    if (bytes > 8388608) throw new RangeError("GUI scene exceeds 8 MiB");
    const packet = new Uint32Array(Math.ceil(bytes / 4));
    packet[0] = 6;
    packet[1] = session.slot;
    packet[2] = session.generation;
    packet[10] = result.commands.length;
    packet[11] = packet.byteLength;
    const view = new DataView(packet.buffer),
        raw = new Uint8Array(packet.buffer);
    for (let i = 0; i < result.commands.length; i++) {
        const c = result.commands[i],
            start = 640 + i * 128;
        view.setUint32(start, c.op, true);
        view.setUint32(start + 4, c.offsets[0], true);
        view.setUint32(start + 120, c.offsets[1], true);
        view.setUint32(start + 124, c.offsets[2], true);
        for (let j = 0; j < c.args.length; j++)
            view.setFloat64(start + 8 + j * 8, c.args[j], true);
    }
    for (const s of strings) raw.set(s.encoded, s.offset);
    return packet;
}
