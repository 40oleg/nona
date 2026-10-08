/** Byte offsets shared by native object operations; all pointers are 64-bit.
 * Named properties are a list of separately allocated nodes (dictionary
 * mode), or slots after the header described by the object's shape (shapes.ts). */
/** index: raw-heap array-index table of the property list (property-index.ts), or 0. */
/** elements: raw-heap table from array index to property node (array-elements.ts), or 0. */
/** keys: a filter of the own property keys (keyFilterValid set: every key ever added has its bit; see named-properties.ts), or 0 when unknown; for a shaped object, its out-of-line slots (a value list) or 0. */
/** shape: the object's shape (shapes.ts) while its named properties live in slots, or 0 for a property list (dictionary mode). */
export const ObjectLayout={kind:0,properties:8,length:16,prototype:24,shape:32,flags:40,index:48,elements:56,keys:64,size:72} as const;
/** Bit 63 of ObjectLayout.keys: the filter covers every own key of the object. */
export const keyFilterValid=1n<<63n;
export const PropertyLayout={next:0,key:8,value:16,attributes:32,getter:40,setter:56,size:72} as const;
export const PropertyAttributes={writable:1,enumerable:2,configurable:4,ordinary:7,accessor:8} as const;

/** Zero is extensible with writable array length. */
export const ObjectFlags={nonExtensible:1,lengthReadonly:2,defaultPrototypeFallback:4,deferredConstructPrototype:32,/** Some inline cache depends on this object's properties and prototype (property-cache.ts). */cachedPrototype:64,/** JSON.stringify or Array.prototype.join is serializing this object (cycle detection). */stringifying:256} as const;
export const ProxyKind=21;
export const ProxyCallable=8;
export const ProxyConstructable=16;
