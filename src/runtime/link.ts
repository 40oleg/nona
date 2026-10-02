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
}
export const fullRuntimeLink:RuntimeLink={regexp:true,unicodeProperties:true,unicodeNormalization:true};
/** The hint every "not linked" error ends with. */
export const fullRuntimeHint='Compile with --full-runtime (compile option fullRuntime) to include it.';
