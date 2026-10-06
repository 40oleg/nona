/**
 * Optional parts of the runtime. The compiler links a part only when the
 * program's sources can reach it (see collectSourceUsage in the lexer);
 * `fullRuntimeLink` links everything.
 */
export interface RuntimeLink {
  /** The RegExp engine: pattern compiler, matcher and case folding. */
  regexp:boolean;
  /** Unicode property tables for \p{…} and \P{…} in RegExp patterns. */
  unicodeProperties:boolean;
  /** Unicode normalization tables for String.prototype.normalize and localeCompare. */
  unicodeNormalization:boolean;
  /** Optional JavaScript preludes (see preludeTriggers). */
  preludes:Record<OptionalPrelude,boolean>;
}
/**
 * Preludes that only install globals or built-in methods. Each is linked when
 * one of its trigger names appears in a source: as an identifier, a property
 * name or a string literal (computed access such as globalThis['Proxy']).
 * Reflect and Promise (which also carries the module and script machinery)
 * are always linked.
 */
export const preludeTriggers={
  asyncHooks:['AsyncResource','AsyncLocalStorage','executionAsyncId','triggerAsyncId','nona.async_hooks.internal'],
  events:['Event','CustomEvent','EventTarget','AbortController','AbortSignal','DOMException','NodeEventTarget','nona.events.internal'],
  proxy:['Proxy'],
  encoding:['TextEncoder','TextDecoder'],
  buffer:['Buffer','Blob','File','URL','ReadableStream','ReadableStreamDefaultReader','ReadableStreamBYOBReader','WritableStream','WritableStreamDefaultWriter','node:buffer','nona:buffer','bufferModule'],
  process:['process'],
  // Timers installs enumerable globals, which a program can list through globalThis.
  timers:['setTimeout','setInterval','setImmediate','clearTimeout','clearInterval','clearImmediate','queueMicrotask','performance','globalThis'],
  // The prelude also adds its methods to Array.prototype[Symbol.unscopables].
  es2021:['at','findLast','findLastIndex','hasOwn','AggregateError','any','unscopables'],
  annexB:['escape','unescape','substr','setYear','toGMTString','compile','anchor','big','blink','bold','fixed','fontcolor','fontsize','italics','link','small','strike','sub','sup'],
  arraySort:['sort'],
  objectIntegrity:['freeze','seal','isFrozen','isSealed'],
  objectAnnexB:['__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__'],
} as const satisfies Record<string,readonly string[]>;
export type OptionalPrelude=keyof typeof preludeTriggers;
export const optionalPreludes=Object.keys(preludeTriggers) as OptionalPrelude[];
/** Preludes another prelude needs while it initializes. */
export const preludeDependencies:Partial<Record<OptionalPrelude,readonly OptionalPrelude[]>>={process:['encoding'],buffer:['encoding'],events:['timers'],asyncHooks:['events','timers']};
/** Buffer's URL validation and Blob native line endings use internal regexes. */
export function runtimeRegExpLink(link:RuntimeLink):{regexp:boolean;unicodeProperties:boolean} {
  const regexp=link.regexp||link.preludes.buffer;
  return {regexp,unicodeProperties:regexp&&link.unicodeProperties};
}
/**
 * Names that enumerate built-ins: a program using one could observe a missing
 * method, so it links every prelude.
 */
export const reflectiveNames:readonly string[]=['getOwnPropertyNames','getOwnPropertyDescriptors','ownKeys'];
export function preludeSet(value:boolean):Record<OptionalPrelude,boolean> {
  return Object.fromEntries(optionalPreludes.map(name=>[name,value])) as Record<OptionalPrelude,boolean>;
}
export const fullRuntimeLink:RuntimeLink={regexp:true,unicodeProperties:true,unicodeNormalization:true,preludes:preludeSet(true)};
/** The hint every "not linked" error ends with. */
export const fullRuntimeHint='Compile with --full-runtime (compile option fullRuntime) to include it.';
