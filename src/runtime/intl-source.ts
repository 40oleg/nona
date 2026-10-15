import { runtimeIntl } from "../lib/sources.generated.js";
// Intl (ECMA-402) for the en locale (#300): getCanonicalLocales,
// NumberFormat, Collator and PluralRules, and the toLocaleString and
// localeCompare methods of Number, BigInt and String that delegate to them.
// Linked when a program names Intl or a locale-sensitive method.
export const intlPreludeSource = runtimeIntl;
