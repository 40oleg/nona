/** Module aliases expose the same constructor as the global Buffer. */
export const bufferModuleSource=`
const buffer = globalThis.Buffer[Symbol.for('nona.buffer.module')];
export const Buffer = buffer.Buffer, SlowBuffer = buffer.SlowBuffer;
export const Blob = buffer.Blob, File = buffer.File, resolveObjectURL = buffer.resolveObjectURL;
export const isAscii = buffer.isAscii, isUtf8 = buffer.isUtf8;
export const atob = buffer.atob, btoa = buffer.btoa, transcode = buffer.transcode;
export const INSPECT_MAX_BYTES = buffer.INSPECT_MAX_BYTES;
export const kMaxLength = buffer.kMaxLength, kStringMaxLength = buffer.kStringMaxLength;
export const constants = buffer.constants;
export default buffer;
`;
