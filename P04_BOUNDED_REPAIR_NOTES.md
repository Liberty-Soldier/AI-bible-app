# EMETSEES P04 v1.6.4 — Bounded Reader Retry

This hotfix addresses occasional valid model responses that fail the strict 90–120 word quality gate by being too short.

## Changes

- Prompt contract: `emet-free-tier-entity-explanation@1.4.4`
- Compiler: `1.6.4`
- The prompt now requires the model to silently count and rewrite the explanation before returning JSON if it is outside 90–120 words.
- The isolated `test:emet-reader` command now uses the compiler's bounded retry path with up to two attempts.
- Every attempt uses the same P03 packet, compact evidence catalog, allowed evidence IDs, model, and Scripture-only rules.
- A failed attempt is never saved as a cache record.
- Production synchronous generation already used bounded retries; Batch imports continue to reject invalid records and the scheduler retries those entities in a later job.

No popup or P03 data is changed.
