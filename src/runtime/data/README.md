# Generated Unicode data

Files in this directory are generated; do not edit them by hand.

| File | Generator |
| --- | --- |
| `unicode-normalize-data.ts` | `node scripts/generate-unicode-normalize.mjs` |
| `unicode-upper-data.ts` | `node scripts/generate-unicode-upper.mjs` |
| `regexp-unicode-data.ts` | `python scripts/generate-regexp-unicode.py` |

Regenerate only when the supported Unicode version changes, and commit the
result together with the generator change.
