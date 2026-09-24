/** Six initialized Values followed by a presence mask. Missing and undefined
 * are distinct; present=-1 denotes no own property. Record owners must root
 * the six Values across callbacks (the numeric mask is never scanned). */
export const DescriptorLayout={enumerable:0,configurable:16,value:32,writable:48,get:64,set:80,present:96,size:104} as const;
export const DescriptorFields={enumerable:1,configurable:2,value:4,writable:8,get:16,set:32,data:15,accessor:51} as const;
