# Ask EMET stabilization Phase 1 results

Date: 2026-10-11  
Starting commit: `2cd28831`  
Deployment: not performed

## What changed

- Added one canonical question contract for intent, explicit references, biblical entities, subquestions, requested languages, reader/conversation context, evidence coverage, response depth, narrow subject domains, and the invariant Scripture-first authority policy.
- Routed deterministic-fast-path eligibility, planning input, response design, requested coverage, and evidence selection through that contract.
- Replaced the combined plan-and-provisional-answer model output with a retrieval-plan-only output.
- Removed the pending provisional answer and its reference-hydration path. The answer model now receives only the final locked-data evidence packet used by validation.
- Narrowed cosmology expansion to actual cosmology questions. Symbolic mentions of the sun or moon no longer trigger it.
- Preserved the 50-question audit baseline in `docs/audits/emet-ask-baseline-2cd28831.md`.

## Targeted live results

These were fresh, local, production-equivalent provider runs. Each successful warm test used the in-memory validated evidence cache and completed in 0 ms at the script's measurement precision.

| Question | Result | Retrieved Scripture | AI calls | Tokens | Total pipeline |
| --- | --- | --- | ---: | ---: | ---: |
| Morning star, Revelation 2:28 | Pass; substantive identification and explicit/inferred distinction | Revelation 2:28; 22:16; Numbers 24:17; 2 Peter 1:19 | 2 | 9,154 | 33,892 ms |
| Jezebel, Revelation 2 | Pass; immediate Thyatira context plus Kings background | Revelation 2:20–22; 1 Kings 16:31; 18:4; 21:25; 2 Kings 9:22 | 2 | 10,683 | 39,311 ms |
| Death and resurrection | First run fail-closed; immediate clean rerun passed | Ecclesiastes 12:7; Daniel 12:2; John 6:39; 1 Corinthians 15:52 | 2 on passing rerun | 8,454 | 19,937 ms |
| Paul and abolished commandments | Pass after one repair | Romans 3:31; 7:12; 1 Corinthians 7:19; Ephesians 2:15 | 3 | 14,424 | 40,825 ms |
| Believers under law of Moses | Pass, with a terminology qualification | Romans 6:14; Galatians 5:18; Jeremiah 31:33; Nehemiah 8:1 | 2 | 9,989 | 23,408 ms |
| Woman in Revelation 12 | Pass; no cosmology contamination | Revelation 12:1–2, 5–6, 17; Genesis 37:9; Isaiah 66:7; Micah 4:10 | 2 | 9,808 | 24,896 ms |

Successful targeted runs had a 29,394 ms median total pipeline time. This is not directly comparable to the audit's 42-question median because the targeted set is weighted toward symbolic, doctrinal, and multi-part questions. Planning improved from the audit's 16,984 ms median to roughly 9 seconds in these targeted runs, but total latency did not improve because planned questions now correctly use a separate final-answer call. No latency improvement is claimed.

The first death/resurrection run made five calls across cold and uncached repeat attempts and failed closed both times; an immediate clean rerun passed with two calls and no repair. This confirms a stochastic generation/validation reliability issue remains.

## Conversation test

A fresh three-turn Revelation 12 conversation passed:

1. The woman was identified from Revelation 12, Genesis 37, Isaiah 66, and Micah 4.
2. “What clues in Genesis help identify her?” retained the subject and retrieved Genesis 37:9–10, 3:15, and 22:18.
3. “Does that mean every detail refers only to ethnic Israel?” answered the actual qualification and retained Revelation 12:1, 5, 17 and Genesis 37:9.

Prior answer prose was not used as evidence; current-turn Scripture was retrieved again.

## Before/after findings under comparable intent

- Death/resurrection previously entered the deterministic path with unrelated or incomplete Gospel matches. It now requires semantic planning and retrieved death-state and future-resurrection passages.
- The Paul question previously returned only Matthew 5:17–19 and could not address Paul. It now requires semantic planning and retrieved Romans, 1 Corinthians, and Ephesians.
- The law-of-Moses question previously entered a defective deterministic path with unrelated passages. It now requires scope-aware planning and retrieved “under law,” divine source, and new-covenant internalization passages.
- Revelation 12 previously expanded into cosmology because of the word “sun.” It now remains a symbolic question and retrieves Genesis 37 and prophetic mother/Zion imagery.

No recovered before-results existed for the exact morning-star or Revelation-2 Jezebel wording, so none are invented here.

## Verification

- Phase 1 deterministic architecture/authority regression: pass
- Semantic topic evidence suite: pass
- Requested-coverage suite: pass
- Response-design suite: pass
- Scripture/lexical evidence foundation suite: pass
- TypeScript: pass
- Targeted ESLint: pass after removal of one unused import
- Production build and all prebuild Scripture/source-integrity gates: pass

## Deferred to Phase 2

- Stochastic answer/repair failures and repeated uncached retries.
- Validation gaps that permit internal phrasing such as “supplied Scriptures.”
- Full evidence-validator redesign or prose-citation alignment changes.
- Request/evidence cache redesign or invalidation changes.
- Historical-source architecture.
- UI changes.
- Full 50-question rerun; targeted tests do not establish complete stabilization.
