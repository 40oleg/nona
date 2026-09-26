/** Names provided as mutable/configurable properties by the native runtime.
 * Declarations may shadow these names; they are not reserved identifiers. */
export const errorConstructorNames=['Error','EvalError','RangeError','ReferenceError','SyntaxError','TypeError','URIError'] as const;
export const nativeConstructorNames=['Object','Array','Boolean','Number','String','Date','Symbol','Function',...errorConstructorNames] as const;
export const mutableGlobalNames:ReadonlySet<string>=new Set(['globalThis','Math','isFinite','isNaN','encodeURI','encodeURIComponent','decodeURI','decodeURIComponent',...nativeConstructorNames]);
export const immutableGlobalNames:ReadonlySet<string>=new Set(['undefined','NaN','Infinity']);
export const runtimeGlobalNames:ReadonlySet<string>=new Set([...mutableGlobalNames,...immutableGlobalNames,'console']);
