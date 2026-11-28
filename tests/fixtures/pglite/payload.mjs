// Original Nona fixture data; no third-party image or database is required.
export const text = "Nona PGlite: café / Ελληνικά / 日本語 / line\nend";
export const payload = new Uint8Array(259);
for (let i = 0; i < 256; i++) payload[i + 1] = i;
payload[257] = 255;
payload[258] = 0;

export function requireEqual(actual, expected, context) {
    if (actual !== expected) {
        throw new Error(`${context}: expected ${expected}, got ${actual}`);
    }
}

export function requireBytes(actual, expected, context) {
    requireEqual(actual.length, expected.length, `${context} length`);
    for (let i = 0; i < expected.length; i++) {
        requireEqual(actual[i], expected[i], `${context} byte ${i}`);
    }
}
