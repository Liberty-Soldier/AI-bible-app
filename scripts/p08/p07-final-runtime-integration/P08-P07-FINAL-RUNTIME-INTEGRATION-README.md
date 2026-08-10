# EMETSEES P08 — P07 Final Runtime Integration

The failed source-path trace contained enough source evidence to identify the
real runtime path without another audit.

Current path before this package:

`WordStudySheet -> /api/word-study -> BibleIQEngine -> WordStudyEntityStore +
EmetApprovedOverrideStore`

`WordStudyEntityStore` supplies lexical/evidence data from the existing P05
sharded runtime.

`EmetApprovedOverrideStore` supplies the reader-facing `Across Scripture`
explanation from the old P04.1 `emet-approved` runtime.

That is the defect: the completed P07 final cache was promoted successfully,
but `BibleIQEngine` never consulted it.

This package performs the production-grade fix:

1. Keeps the existing Word Study entity/evidence runtime intact.
2. Converts the single promoted P07 explanation cache into a 64-way sharded
   runtime under:
   `public/data/bibleiq/word-study/emet-final/`
3. Adds `EmetFinalStore.ts`, with manifest, source-provenance, shard-identity,
   and byte-checksum validation.
4. Replaces only the `BibleIQEngine` P04.1 explanation lookup with the P07 final
   store.
5. Preserves WordStudySheet. Approved P07 records render through the existing
   `Across Scripture` UI. Explicit P07 no-explanation records return
   `insufficient-evidence`, so unsupported prose remains hidden.
6. Runs the production build.
7. Automatically rolls back the source/runtime integration if any validation or
   build step fails.
8. Automatically packages success or failure under `.private/reports`.

The original promoted P07 source cache remains protected and byte-for-byte
unchanged.

AI/API calls: zero.
