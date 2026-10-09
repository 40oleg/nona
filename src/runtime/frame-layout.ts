/**
 * The stack frame of a compiled JS function (src/backend/x64/codegen.ts), as
 * RSP-relative offsets once the frame is allocated. The shared prologue stub
 * (prologue.ts) builds it from a static descriptor, so the layout is fixed
 * for every function; only the number of value slots varies.
 *
 *   0..31    outgoing shadow space of the function's own calls
 *   32, 40   outgoing fifth and sixth arguments (this and new.target pointers)
 *   48, 56   incoming argument count and argument vector (RDX, R8)
 *   64, 72   incoming function object and result pointer (R9, RCX)
 *   80       the function's stack map table (stack-maps.ts)
 *   88       the frame's GC root record (RootLayout); its count is negative,
 *            which tells the collector that the table and the return address
 *            below the frame (the function's current call) say which slots
 *            are live (gc.ts rt.gcMarkFrame)
 *   112      the caller's RBP
 *   120      value slots, 16 bytes each; then this, new.target, the super
 *            receiver, the outgoing argument area and exception handlers
 *
 * RBP points `bias` bytes above the first value slot, so that the first
 * sixteen slots have 8-bit displacements.
 */
export const JsFrame={result:72,argc:48,argv:56,callee:64,maps:80,roots:88,savedFrame:112,values:120,bias:248,
 /** Incoming this and new.target pointers: the caller's fifth and sixth arguments, above the return address. */
 incomingThis:40,incomingNewTarget:48} as const;
/** The static frame descriptor rt.enterFrame reads (one per function, .rdata): 64-bit fields. */
export const FrameDescriptor={allocation:0,slots:8,parameters:16,maps:24,size:32} as const;
