# Generated runtime data

Files in this directory are generated; do not edit them by hand.

| File                        | Generator                                     |
| --------------------------- | --------------------------------------------- |
| `unicode-normalize-data.ts` | `node scripts/generate-unicode-normalize.mjs` |
| `unicode-upper-data.ts`     | `node scripts/generate-unicode-upper.mjs`     |
| `regexp-unicode-data.ts`    | `python scripts/generate-regexp-unicode.py`   |
| `regexp-emoji-data.ts`      | `python scripts/generate-regexp-emoji.py`     |
| `pow10-data.ts`             | `node scripts/generate-pow10-tables.mjs`      |

Regenerate the Unicode tables only when the supported Unicode version changes,
and commit the result together with the generator change. `pow10-data.ts` holds
the 128-bit powers of ten of number parsing and formatting; it is committed so
that building the runtime does no BigInt arithmetic (#558).
