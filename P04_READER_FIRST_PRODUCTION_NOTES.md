# EMETSEES P04 v1.5 — Reader-First Production Explanations

## Purpose

P04 v1.5 replaces the report-style cached explanation with one coherent reader-facing explanation for an average Bible reader.

The cached explanation answers the entity-level question:

> What does this source word normally mean or communicate in Scripture?

The later Word Study runtime will separately provide **Meaning in this verse** from the tapped verse and alignment context. P04 does not invent verse context from a bare reference.

## Permanent output contract

- Prompt: `emet-free-tier-entity-explanation@1.3.0`
- Explanation schema: `1.2.0`
- Compiler: `P04@1.5.0`
- One natural headline
- One coherent 90–120 word explanation body
- Validated P03 evidence IDs and resolved citations
- No live AI required at ordinary word-tap runtime

## Reader-first rules

The model must:

- explain the word in the first sentence
- prefer explicit glosses and definitions
- synthesize rather than list database fields
- treat English alignment tokens as translation evidence, not automatic meanings
- avoid interpreting a representative verse when P03 supplies only a reference and no verse text
- mention SEE connections only when they provide a clear insight
- avoid repeated missing-data notices
- preserve Hebrew, Greek NT, and LXX corpus identity
- never manufacture Strong's data, doctrine, etymology, history, or verse context

The compiler rejects common report language such as `entity evidence`, `base-ready`, `compiled record`, `supplied view`, `insufficient evidence`, and generic report-style headlines.

## State and Batch behavior

The prompt and schema changes intentionally invalidate all earlier P04 cached records. P03 is unchanged.

The installer detects an active scheduler job from the old prompt. It attempts to cancel that obsolete OpenAI Batch job before installing the new prompt, then marks it superseded locally so it cannot be imported into the reader-first cache.

Old Batch files remain on disk for audit history but are not reusable under the new prompt checksum.

## Safe validation sequence

After installation, generate one isolated production-format review:

```powershell
npm run test:emet-reader -- --entity word:hebrew:H1077
```

This does not modify `generation-state.json` and does not submit a Batch job.

After the output is approved:

```powershell
npm run emet:generate:watch
```

The scheduler uses the Tier-1 5 million enqueued Batch-token limit with a 4.5 million input-token budget, one entity per request, no artificial daily cooldown, resumable imports, and deterministic validation.
