import {runtimeObjectAnnexb} from '../lib/sources.generated.js';
// Annex B.2.2.2-B.2.2.5 legacy accessor methods on Object.prototype.
// Intrinsics are captured while the prelude runs so later user mutation of
// Object or its static methods cannot change the observable algorithm.
export const objectAnnexBPreludeSource=runtimeObjectAnnexb;
