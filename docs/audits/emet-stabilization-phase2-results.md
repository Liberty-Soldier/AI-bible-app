# Ask EMET Stabilization Phase 2 Results

Date: 2026-10-11  
Phase 1 checkpoint: `c6b09f5d` (`checkpoint Ask EMET stabilization phase 1`)  
Deployment: **not performed**

## Scope

This phase changed answer validation and recovery only. It did not modify retrieval architecture, caches, historical sources, the reader UI, locked Scripture data, or production deployment.

## Confirmed corrections

- Concise-answer word and citation targets are now generation guidance rather than contradictory hard validation limits. Necessary verified passages are no longer rejected merely for exceeding a style quota.
- Reader-visible Bible references must resolve to the final verified evidence packet and structured citations.
- Scripture quotations attributed as quotations must match verified packet text. Verified ellipsis segments are accepted; ordinary interpretive scare quotes are not misclassified as Bible quotations.
- Reader-visible Hebrew and Greek text must have an exact verified lexical identity in the final packet.
- Internal draft/packet wording is rejected regardless of whether the model labels the answer complete or insufficient-evidence.
- Safe normalization removes internal evidence annotations, canonicalizes citation labels, removes duplicates and unused unavailable citations, and restores missing structured citations already used by verified claims.
- Validation failures are classified as formatting, missing essential evidence, unsupported claim, evidence integrity, or genuine uncertainty. Only safe structural corrections are deterministic; substantive unsupported claims still fail closed or use the existing single repair path.

## Deterministic verification

Passed:

- `npm run verify:emet-ai`
- `npm run verify:emet-stabilization-phase1`
- `npm run verify:emet-topic`
- `npm run verify:emet-coverage`
- `npm run verify:emet-response-design`
- `npx tsc --noEmit`
- targeted ESLint
- `npm run build`

New deterministic cases cover excessive-but-required citations, visible unsupported references, fabricated and exact Scripture quotations, exact ellipsis quotations, interpretive scare quotes, verified/unverified Hebrew terms, and internal evidence wording in an insufficient-evidence response.

## Bounded live evaluation (10 questions)

No additional live questions may be run without approval. The evaluation harness printed answers to the test run but did not persist a complete verbatim transcript; the assessment below records the observed answer substance, exact problematic phrases, evidence, calls, tokens, and timings. This harness limitation is reported rather than reconstructing model prose.

| # | Question | Result | Final Scripture evidence | Calls | Tokens | Total ms |
|---|---|---|---|---:|---:|---:|
| 1 | Who created the heavens and the earth? | Pass | Genesis 1:1; Exodus 20:11; Isaiah 42:5; Nehemiah 9:6 | 2 | 7,134 | 11,264 |
| 2 | What does the serpent symbolize in Scripture? | Pass | Revelation 12:9; Genesis 3:1; 2 Corinthians 11:3; Numbers 21:8 | 2 | 7,519 | 14,552 |
| 3 | How does the bronze serpent in Numbers connect to Messiah? | Pass | John 3:14–15; Numbers 21:8–9; John 12:32–33 | 2 | 9,150 | 24,240 |
| 4 | What commandments should believers keep? | Partial | John 14:15; Matthew 22:37, 39–40; 1 John 5:2–3; Revelation 14:12; 2 John 1:6 | 3 | 15,064 | 31,029 |
| 5 | What happens when we die and when are the dead raised? | Partial | Ecclesiastes 12:7; Philippians 1:23; John 6:40; 1 Thessalonians 4:16; 1 Corinthians 15:52; Psalm 146:4 | 2 | 9,888 | 28,810 |
| 6 | What does the Hebrew word translated “one” in Deuteronomy 6:4 mean? | Pass | Deuteronomy 6:4; 4:35; 4:39; 6:5; Zechariah 14:9; verified Hebrew lexical evidence | 2 | 10,641 | 31,661 |
| 7 | Romans 3:10 / Noah / Luke 1:6 / Ezekiel 18 righteousness comparison | Fail closed | Requested passages, Psalm 14, and verified lexical evidence were retrieved | 3 | 19,785 | 63,460 |
| 8 | Strongest evidence for and against continued Sabbath observance | Fail closed | Included Colossians 2:16–17; Romans 14:5–6; Galatians 4:9–11; Hebrews 4:9; Exodus 20:8–11; Isaiah 56; Matthew 24:20; Mark 2; Acts 13; Matthew 5; Jeremiah 31 | 3 | 25,573 | 81,186 |
| 9 | Is baptism required for salvation? | Partial | Acts 16:30–31; Romans 10:9, 13; Mark 16:16; Acts 10:44, 47–48; 1 Peter 3:21 | 2 | 11,693 | 40,318 |
| 10 | Who wrote Hebrews? | Pass | Hebrews 1:1; 13:23–25 | 2 | 7,237 | 11,704 |

Observed answer details:

- Tests 1–3 were direct, natural, and appropriately distinguished explicit text from inference.
- Test 4 used the internal phrase “this evidence packet does not include” and did not enumerate enough concrete commandments. The validator bypass that admitted internal wording under `insufficient-evidence` is now closed deterministically; retrieval specificity remains a later-phase issue.
- Test 5 presented a coherent sequence, but the statement that Philippians 1:23 “directly supports believers being with Messiah prior to resurrection” is stronger than the verse alone establishes.
- Test 6 visibly named and explained `אֶחָד` (`ʼechâd`) from verified source evidence.
- Test 7 initially failed because an exact quotation used an ellipsis and because internal generation language remained after repair. Exact verified ellipsis segments are now accepted; internal wording is rejected at every status. It was not rerun because the paid evaluation limit was reached.
- Test 8 initially had quotation-classification errors; after repair the model introduced Acts 13:43, which was not in the finalized packet, and correctly failed closed. Scare-quote and ellipsis classification are now corrected deterministically. It was not rerun.
- Test 9 opened with a categorical “No” while omitting Acts 2:38 and overstating what the selected evidence settles. This is an evidence-strategy/retrieval defect outside Phase 2's authorized scope.
- Test 10 correctly stated that Hebrews does not name its human author and avoided overclaiming.

## Aggregate live measurements

- Total AI calls: 23
- Total measured tokens: 123,684
- Median full test time: 29,920 ms
- Average full test time: 33,822 ms
- Average cold answer-generation time: 20,297 ms
- Repair path used: 2/10 questions (20%)
- Technical fail-closed rate: 2/10 (20%)
- Strict manual assessment: 5 pass, 3 partial/material quality concerns, 2 fail closed

These measurements are not a clean before/after performance comparison because Phase 1 did not preserve a comparable ten-question run under identical provider conditions. Phase 2 adds no AI call and no new service. Deterministic normalization should prevent avoidable repairs for formatting/citation-shape defects; the actual provider latency remains dominant.

## Remaining issues

1. Retrieval/evidence strategy can omit materially relevant passages (notably Acts 2:38 for baptism) or select general statements when concrete instructions are requested.
2. Prose-level validation can verify that cited evidence exists without always detecting that an interpretive characterization is too strong (Philippians 1:23 example).
3. The live harness should persist complete verbatim response artifacts for future paid evaluations. Changing that harness behavior is advisable before Phase 3, but no further paid run was made.
4. The two corrected stochastic failures need an approved bounded live rerun to measure the actual post-correction failure rate.

## Scripture-first authority check

No authority-policy regression was found. Scripture remains the governing evidence; claims, visible references, quotations, and source-language terms must be tied to finalized verified evidence. No modern scientific, denominational, historical, or external authority was added. Locked Scripture and lexical datasets remained unchanged.

## Recommendation

Phase 2 is code-complete for its bounded validator/recovery scope and passes deterministic and production-build gates. It should not yet be described as full Ask EMET stabilization. Before deployment, approve a small post-fix rerun of the two fail-closed questions. Phase 3 should then address retrieval completeness and claim-to-evidence strength, separately from caching, historical-source architecture, and UI work.
