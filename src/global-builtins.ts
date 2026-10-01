/** Names provided as mutable/configurable properties by the native runtime.
 * Declarations may shadow these names; they are not reserved identifiers. */
export const errorConstructorNames=['Error','EvalError','RangeError','ReferenceError','SyntaxError','TypeError','URIError'] as const;
export const nativeConstructorNames=['Object','Array','Boolean','Number','String','Date','RegExp','Map','Set','WeakMap','WeakSet','ArrayBuffer','SharedArrayBuffer','DataView','Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array','Symbol','BigInt','Function',...errorConstructorNames] as const;
/** Host globals installed by the timer prelude. */
export const hostGlobalNames=['setTimeout','setInterval','clearTimeout','clearInterval','queueMicrotask','performance'] as const;
export const mutableGlobalNames:ReadonlySet<string>=new Set(['globalThis','TextEncoder','TextDecoder','process',...hostGlobalNames,'Math','JSON','Atomics','eval','isFinite','isNaN','encodeURI','encodeURIComponent','decodeURI','decodeURIComponent',...nativeConstructorNames]);
export const immutableGlobalNames:ReadonlySet<string>=new Set(['undefined','NaN','Infinity']);
export const runtimeGlobalNames:ReadonlySet<string>=new Set([...mutableGlobalNames,...immutableGlobalNames,'console']);
