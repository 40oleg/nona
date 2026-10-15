import { runtimeIntl } from "../lib/sources.generated.js";
// Intl (ECMA-402) for the en locale (#300): getCanonicalLocales,
// DateTimeFormat, NumberFormat, Collator and PluralRules, and the
// locale-sensitive methods of Number, BigInt, String and Date
// (toLocaleString, toLocaleDateString, toLocaleTimeString, localeCompare)
// that delegate to them.
// Linked when a program names Intl or a locale-sensitive method.
export const intlPreludeSource = runtimeIntl;
