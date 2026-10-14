import { runtimeRegexpProtocol } from "../lib/sources.generated.js";
// RegExp.prototype[Symbol.match/search/replace/split/matchAll] and
// String.prototype.match/search/matchAll/replaceAll. Linked with the RegExp
// engine, or alone when a source names replaceAll (see preludeTriggers).
export const regexpProtocolPreludeSource = runtimeRegexpProtocol;
