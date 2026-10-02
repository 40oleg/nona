// Only Buffer.from(text, 'base64') is used, by the Unicode tables.
export const Buffer = {
  from(text, encoding) {
    if (encoding !== 'base64') throw new Error(`Buffer.from: unsupported encoding ${encoding}`);
    return Uint8Array.from(atob(text), c => c.charCodeAt(0));
  },
};
