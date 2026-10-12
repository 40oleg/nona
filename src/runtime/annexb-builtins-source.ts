import { runtimeAnnexbBuiltins } from "../lib/sources.generated.js";
// Annex B.2 additional built-in properties: escape/unescape (B.2.1),
// String.prototype.substr and the HTML methods (B.2.3), Date.prototype.setYear
// and toGMTString (B.2.4). Intrinsics are captured while the prelude runs so
// later user mutation cannot change the algorithms.
export const annexBBuiltinsPreludeSource = runtimeAnnexbBuiltins;
