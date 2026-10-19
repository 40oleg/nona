const g = globalThis;
export const parse = g.__nonaNetParse,
    latin1 = g.__nonaNetLatin1,
    write = g.__nonaNetWrite,
    copy = g.__nonaNetCopy,
    check = g.__nonaNetCheck,
    slice = g.__nonaNetSlice,
    headLines = g.__nonaNetHeadLines,
    lowerNames = g.__nonaNetLowerNames;
delete g.__nonaNetParse;
delete g.__nonaNetLatin1;
delete g.__nonaNetWrite;
delete g.__nonaNetCopy;
delete g.__nonaNetCheck;
delete g.__nonaNetSlice;
delete g.__nonaNetHeadLines;
delete g.__nonaNetLowerNames;
