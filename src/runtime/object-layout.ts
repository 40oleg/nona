/** Byte offsets shared by native object operations; all pointers are 64-bit.
 * Properties remain separate allocations so later tracing GC can walk Values. */
/** index: raw-heap array-index table of the property list (property-index.ts), or 0. */
/** elements: raw-heap table from array index to property node (array-elements.ts), or 0. */
/** keys: a filter of the own property keys (keyFilterValid set: every key ever added has its bit; see named-properties.ts), or 0 when unknown. */
/** slots: inline property nodes after the header (rt.newObjectSlots): capacity in the low 32 bits, nodes handed out in the high 32 bits; 0 for objects without them. */
/** site: the constructor whose instance hint (FunctionLayout.instanceSlots) grows when this object outgrows its inline nodes, or 0. */
export const ObjectLayout={kind:0,properties:8,length:16,prototype:24,stringifying:32,flags:40,index:48,elements:56,keys:64,slots:72,site:80,size:88} as const;
/** Most inline property nodes an object gets (a constructor's hint stops growing here). */
export const maxInlineSlots=32;
/** Bit 63 of ObjectLayout.keys: the filter covers every own key of the object. */
export const keyFilterValid=1n<<63n;
export const PropertyLayout={next:0,key:8,value:16,attributes:32,getter:40,setter:56,size:72} as const;
export const PropertyAttributes={writable:1,enumerable:2,configurable:4,ordinary:7,accessor:8} as const;

/** Zero is extensible with writable array length. */
export const ObjectFlags={nonExtensible:1,lengthReadonly:2,defaultPrototypeFallback:4,deferredConstructPrototype:32,/** Some inline cache depends on this object's properties and prototype (property-cache.ts). */cachedPrototype:64,/** Some inline cache remembers one of this object's own property nodes: deleting or redefining a property advances the epoch (property-cache.ts). */ownCached:128} as const;
export const ProxyKind=21;
export const ProxyCallable=8;
export const ProxyConstructable=16;
