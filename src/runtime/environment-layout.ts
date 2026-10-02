/** Internal compiler root tag; never a JavaScript-observable value. */
export const CellTag=254;
export const CellLayout={value:0,size:16} as const;
/** Count, then one 16-byte Value per capture: an internal Cell reference for
 * a shared variable, or the captured Value itself for a parameter that is
 * never reassigned (see capturedByValue in the lowering). */
export const EnvironmentLayout={count:0,cells:8,entry:16} as const;
