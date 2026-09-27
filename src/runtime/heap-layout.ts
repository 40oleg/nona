/** Allocation metadata preceding the stable payload. Never scanned as Values. */
export const HeapLayout={next:0,bytes:8,kind:16,marked:24,greyNext:32,size:40} as const;
export const HeapKind={raw:0,object:1,property:2,cell:3,environment:4,boundData:5,valueList:6,symbol:7,mapEntry:8} as const;
/** Internal contiguous, initialized Value storage; exposed only as CellTag roots. */
export const ValueListLayout={count:0,values:8,size:8} as const;
/** Stack-owned precise root record, linked only while its JS function is active. */
export const RootLayout={next:0,values:8,count:16,size:24} as const;
