/**
 * Source of `nona:internal/native`: the native helpers of node:net and
 * node:http (see src/runtime/http-native.ts). The code generator installs
 * them as global functions when a program can reach them; this module takes
 * them off the global object so programs cannot see them.
 */
export const nativeModuleSource=String.raw`
const g = globalThis;
export const parse = g.__nonaNetParse, latin1 = g.__nonaNetLatin1, write = g.__nonaNetWrite, copy = g.__nonaNetCopy, check = g.__nonaNetCheck;
delete g.__nonaNetParse; delete g.__nonaNetLatin1; delete g.__nonaNetWrite; delete g.__nonaNetCopy; delete g.__nonaNetCheck;
`;
