function stream(fd) {
  try { return fd === 0 ? process.stdin : fd === 1 ? process.stdout : fd === 2 ? process.stderr : undefined; } catch { return undefined; }
}
export function isatty(fd) {
  const s = stream(fd);
  return !!(s && s.isTTY);
}
export class ReadStream {
  constructor(fd) { this.fd = fd; this.isRaw = false; this.isTTY = true; }
  setRawMode(mode) { this.isRaw = !!mode; return this; }
}
export class WriteStream {
  constructor(fd) { this.fd = fd; this.isTTY = true; this.columns = 80; this.rows = 24; }
  getColorDepth() { return 8; }
  hasColors(count) { return (count === undefined ? 16 : count) <= 256; }
  getWindowSize() { return [this.columns, this.rows]; }
}
export default {isatty, ReadStream, WriteStream};
