# Combination program regression corpus

The [program catalog](../programs/README.md) documents 1,000 individually authored
standalone applications. This suite complements Test262 by combining features
in complete small workflows rather than testing isolated specification clauses.
Sources, case purposes and feature tags are committed under `programs/`.

`npm run check:programs` builds the compiler and runs the original ten programs,
ten shards for the remaining 990, and inventory validation. Each source is
executed with Node.js and with Nona in normal and GC-stress modes. The runner
checks exit status, launch errors, stderr and exact stdout, normalizing only
native CRLF newlines. A case remains individually named in the test report.

The original ten have independently written expected outputs. The remaining
cases use checked-in Node.js snapshots and source hashes in `manifest.json`.
`npm run snapshot:programs` only executes existing authored sources and writes
reference data. It never creates or multiplies JavaScript programs. Review both
source changes and snapshot changes; compiler failures must not be blessed as
new reference output.

Inventory validation requires all IDs from 1 to 1,000, one registry entry per
source, current hashes, category catalogs matching the manifest, purpose descriptions, at least three feature tags and
no repeated bodies hidden by whole-line comments. `node scripts/audit-program-corpus.mjs` additionally reports candidate duplicates after
normalizing local names and literal values. This is a review aid: neither exact
body uniqueness nor different token structure proves semantic diversity.

The dedicated `program corpus` workflow runs all cases on Linux and Windows
for every push and pull request. Each platform performs 2,000 native executions.
The corpus also belongs to the repository's full `npm run check` suite. A passing
corpus provides regression evidence for these inputs, not complete JavaScript
conformance or proof of compiler correctness.
