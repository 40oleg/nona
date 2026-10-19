const g = globalThis;
export const parse = g.__nonaNetParse,
    latin1 = g.__nonaNetLatin1,
    write = g.__nonaNetWrite,
    copy = g.__nonaNetCopy,
    check = g.__nonaNetCheck,
    jsonBytes = g.__nonaJsonStringifyBytes,
    // Registers node:http's JSON response path (#155, the network prelude).
    registerHttpJson = g.__nonaHttpJson;
delete g.__nonaNetParse;
delete g.__nonaNetLatin1;
delete g.__nonaNetWrite;
delete g.__nonaNetCopy;
delete g.__nonaNetCheck;
delete g.__nonaJsonStringifyBytes;
delete g.__nonaHttpJson;
