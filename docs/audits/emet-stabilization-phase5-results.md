# EMETSEES Stabilization Phase 5 Results

Date: 2026-10-12

## Scope

Phase 5 changed only planning-reference normalization, answer-generation structure, private evaluation capture, planner instructions for factual authorship and OT foundations, and deterministic regression coverage. Scripture data, lexical indexes, the canonical question contract, cache identity/behavior, historical-source policy, and UI were not changed. Nothing was pushed or deployed. No paid live calls were made.

## Root causes corrected

### 1. Malformed planning references

The retrieval-plan parser received model strings directly. A model-produced editorial subverse expression such as `Luke 1:6a-1:6b?` did not match the accepted reference grammar, causing the entire otherwise useful plan to fail before locked-corpus resolution.

The new normalizer:

- accepts ordinary verses only when the exact locked passage exists;
- expands ordinary ranges only when every verse exists;
- collapses an editorial `a`/`b` range only when both endpoints identify the same base verse and that verse exists in locked Scripture;
- rejects different-base subverse ranges as ambiguous;
- rejects chapter-only governing references as ambiguous rather than guessing an individual verse;
- rejects malformed and nonexistent references with a recorded reason;
- normalizes both planned passages and component governing references before the strict plan parser runs.

### 2. Simple factual planning

`Who wrote Hebrews?` was already eligible for deterministic fast-path probing. The fast path ran but returned insufficient evidence because locked verse-text matching cannot safely establish the absence of an author identification. Forcing a fast answer would weaken evidence integrity.

Semantic fallback therefore remains correct. Its planner instruction is now narrower: simple authorship questions use the named book's opening, closing, sender identification, and internal self-identification, and must not add external candidate-author comparisons unless explicitly requested or the external text identifies the named writing.

### 3. Avoidable continuity repair

The answer schema allowed any number of component and continuity checks, so a model could return valid prose but omit required structured continuity records. Validation then required a second paid generation.

The initial answer and repair schemas now require:

- exactly the number of component checks in the finalized packet;
- component IDs drawn from the packet's component IDs;
- exactly the number of continuity checks in the finalized packet;
- continuity proposition IDs drawn from reverified established propositions.

No checks are fabricated after generation. Duplicate, contradictory, unsupported, or semantically defective checks still fail the existing validator.

### 4. Audit reproducibility

The OpenAI provider now exposes a local audit record containing:

- raw planning output and normalization errors;
- raw first answer draft and its validation errors;
- raw repair draft, status, and validation errors.

The private live-evaluation harnesses include this record in their local JSON artifacts. Credentials, request headers, and unrelated user data are not captured. Production persistence was not added.

### 5. OT-first interpretation

The planning instruction now explicitly requires the relevant Torah, Prophets, or Writings foundation whenever an NT text quotes, alludes to, or depends on an earlier-established subject. It also explicitly forbids assuming either continuity or change before comparing the actual texts.

Behavioral regression cases confirm that finalized retrieval retains both OT foundation and NT witness for:

- Sabbath: Exodus 20:8 / Mark 2:27
- Commandments: Deuteronomy 6:5 / Matthew 22:37
- Covenant: Jeremiah 31:33 / Hebrews 8:10
- Resurrection: Daniel 12:2 / John 6:40
- Messiah: Micah 5:2 / Matthew 2:6
- Prophecy: Joel 2:28 / Acts 2:17

## Files changed in Phase 5

- `app/lib/emet/EmetAiRetrievalPlan.ts`
- `app/lib/emet/EmetAiTopicEvidence.ts`
- `app/lib/emet/providers/EmetAiOpenAiProvider.ts`
- `app/lib/emet/EmetAiService.ts`
- `scripts/verify-emet-phase1-live.mjs`
- `scripts/verify-emet-phase4-followup-live.mjs`
- `scripts/verify-emet-stabilization-phase5.mjs` (new)
- this report

## Verification

Passed:

- Phase 5 deterministic verification
- EMET AI foundation verification
- EMET semantic topic-evidence verification
- EMET requested-coverage verification
- EMET response-design verification
- preserved Phase 4 artifact replay
- TypeScript (`tsc --noEmit`)
- targeted ESLint
- full production build
- every locked Scripture, WEB, Brenton, lexical, word-study, free-reader, and reader-experience integrity gate executed by the build

The build-generated search-manifest timestamp was restored after verification; there is no Scripture dataset diff.

## Remaining repair triggers

The schema correction prevents the specific missing-count defect before generation, but paid live testing is required to measure whether the model supplies unique, substantively valid checks on the first call. Existing validation still intentionally triggers recovery for:

- unsupported claims or references;
- duplicate or wrong structured IDs;
- missing governing evidence;
- interpretive-policy conflicts;
- incomplete requested coverage;
- inaccurate quotations or source-language claims;
- provider or schema failures.

## Latency

No paid live measurement was performed, as required.

Expected effects:

- malformed same-verse editorial references should avoid a wasted failed planning result;
- Hebrews still requires one planning call because deterministic text matching cannot prove anonymous authorship safely, but its evidence plan should be smaller and exclude unrelated author speculation;
- qualifying multi-turn answers should avoid the prior repair caused solely by a missing continuity-check count.

These are estimates until the approved live run is completed.

## Proposed bounded paid evaluation

Proposed maximum: four live questions.

1. The full righteousness comparison that previously emitted `Luke 1:6a-1:6b?`.
2. `Who wrote Hebrews?` to inspect the narrowed plan, total latency, and evidence relevance.
3. A two-turn death/resurrection scenario ending with `When are they raised?` to measure whether continuity checks now succeed on the first answer call.
4. One NT/OT foundation question, preferably `How should Colossians 2:16–17 be understood in light of the Torah's Sabbath instructions?`, to verify OT-first planning without predetermining the conclusion.

Capture for each: raw plan, rejected answer draft if any, validation errors, final verified answer, evidence packet, AI calls, tokens, stage latency, and repair count.

## Scripture-first authority and Git status

No Scripture-first authority rule was weakened. The implementation continues to distinguish explicit statements, implications, and synthesis; validates all references against locked Scripture; retains lexical verification; and fails closed for ambiguity or unsupported evidence.

No `.git/index.lock` exists. The repository is owned by `CreatorStudio`, but checkpoint writes remain blocked by the previously documented explicit ACL deny affecting the sandbox identity. No lock was removed and no permissions were changed. The working tree remains intact.
