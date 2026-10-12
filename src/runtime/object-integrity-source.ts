import { runtimeObjectIntegrity } from "../lib/sources.generated.js";
// Object.freeze/seal/isFrozen/isSealed (ES2020 19.1.2.6, .13, .20, .21) through
// the object's internal methods, so Proxy traps run in spec order. The
// native versions handled only ordinary objects.
export const objectIntegrityPreludeSource = runtimeObjectIntegrity;
