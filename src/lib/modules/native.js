const g = globalThis;
export const parse = g.__nonaNetParse,
    latin1 = g.__nonaNetLatin1,
    write = g.__nonaNetWrite,
    copy = g.__nonaNetCopy,
    check = g.__nonaNetCheck;
delete g.__nonaNetParse;
delete g.__nonaNetLatin1;
delete g.__nonaNetWrite;
delete g.__nonaNetCopy;
delete g.__nonaNetCheck;
