export interface FrameLayout {
  allocation: number;
  shadowBytes: 32;
  needsProbe: boolean;
}
export function planFrame(
  localBytes: number,
  outgoingBytes: number,
): FrameLayout {
  if (
    !Number.isSafeInteger(localBytes) ||
    !Number.isSafeInteger(outgoingBytes) ||
    localBytes < 0 ||
    outgoingBytes < 0
  )
    throw Error("Invalid frame size");
  const allocation =
    Math.ceil((32 + localBytes + outgoingBytes + 8) / 16) * 16 - 8;
  if (allocation > 0x7ffffff8) throw Error("Frame size range exceeded");
  return { allocation, shadowBytes: 32, needsProbe: allocation >= 4096 };
}
