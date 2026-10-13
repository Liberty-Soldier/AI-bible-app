# EMETSEES Stabilization Phase 4 Results

Date: 2026-10-12

## Scope and preservation

- No Scripture dataset, question contract, retrieval architecture, cache, historical-source subsystem, UI, remote branch, or deployment was changed.
- The Phase 2 and Phase 3 working tree remains present.
- No `.git/index.lock` exists. Checkpoint creation remains blocked because the repository `.git` ACL contains explicit write-deny entries affecting the sandbox identity. No lock was removed and no permissions were changed.
- A tracked binary diff was preserved at `.private/checkpoints/phase4-precheckpoint-tracked.patch` (SHA-256 `5F3E465A596086FBC763E7440BCD8C30593D4D6FCF9C7C56A8F6CB2E4786E192`). Existing untracked files remain untouched in the worktree.

## Root causes and corrections

1. **Weak categorical opening was treated as a substantive failure.** A response with `possible-interpretation`, `theological-synthesis`, or `does-not-establish` support could begin with `Yes` or `No`, forcing a paid repair. The opening is now removed deterministically before validation. This changes presentation only; it does not rewrite the conclusion.
2. **Repair could repeat the same unsupported reference or interpretive-policy defect.** The recovery instruction now forbids references outside the finalized packet, forbids weak categorical openings, directs continuity answers back to governing evidence, and requires representative broad lists to say that they are representative.
3. **Broad concrete-list answers could silently appear exhaustive.** The completeness validator now rejects a broad enumeration that supplies only part of the category without identifying the examples as representative. Named lists remain governed by their existing count check.
4. **Minor deterministic grammar defect.** Reader prose now normalizes `Scripture do not` to `Scripture does not`.
5. **Phase 3 artifact limitation.** Final fail-closed answers and validation errors were saved, but rejected draft prose was not. Exact draft replay is therefore impossible and was not claimed. Persisted packets and final answers were replayed exactly.

## Deterministic verification

- Preserved Phase 3 replay: passed. Seven of eight saved complete/fail-closed results remain valid. The prior `What commandments should believers keep?` answer is intentionally rejected because it supplied a partial list without identifying it as representative.
- EMET response-design suite: passed.
- EMET AI foundation suite: passed.
- Requested-coverage suite: passed.
- Topic-evidence suite: passed.
- TypeScript (`tsc --noEmit`): passed.
- Targeted ESLint: passed.
- Production build: passed, including all locked Scripture/source integrity gates. The build-generated manifest timestamp was restored afterward, leaving no Scripture dataset diff.

## Bounded live evaluation

Exactly six reader questions were exercised. The first five are preserved verbatim in `.private/emet-live-audits/phase3-2026-10-12T10-51-13-656Z.json` (the existing harness retains its Phase 3 filename prefix). The follow-up is preserved in `.private/emet-live-audits/phase4-followup-2026-10-12T10-55-43-606Z.json`.

### 1. Righteousness comparison

**Result:** failed before evidence generation. The planner produced an otherwise substantive plan but included the malformed governing reference `Luke 1:6a-1:6b?`; strict plan parsing rejected it. No answer-generation or repair call occurred, and no unsupported answer was shown.

- AI calls: 1 (planning)
- Tokens: 6,975
- Latency: 26.2 s
- Fail closed: yes

This is a retrieval-plan normalization problem outside Phase 4's permitted scope, not a remaining answer-validator defect.

### 2. Sabbath comparison

**Reader answer:**

> Scripture gives real evidence in both directions, so it does not establish a simple universal formula in one verse. The strongest case for continued seventh-day Sabbath observance is that the Sabbath is explicitly commanded as the seventh day, holy to Yahweh, and Israel is told to keep it throughout their generations as a perpetual covenant sign (Exodus 20:8, 20:10; Exodus 31:13, 31:16). Isaiah also includes foreigners who join themselves to Yahweh among those who keep the Sabbath and hold fast his covenant (Isaiah 56:6-7). Jeremiah says the new covenant involves Yahweh writing his law on the heart, and Jesus says he did not come to destroy the Law or the Prophets; he also warns against breaking even the least commandments and teaching others to do so (Jeremiah 31:33; Matthew 5:17-19). Mark 2:27 adds that the Sabbath was made for man, and Luke 23:56 shows disciples still resting on the Sabbath according to the commandment after Jesus’ death.
>
> The strongest case against imposing Sabbath observance as a binding requirement on believers is that the apostolic writings explicitly forbid judging with respect to a Sabbath day, calling such things a shadow in relation to Christ (Colossians 2:16-17). Romans 14:5-6 also allows differing convictions about esteeming a day, with each person to be fully assured in his own mind and act to the Lord. Galatians 4:9-11 warns about returning to bondage by observing days, months, seasons, and years. And Acts 15 frames the controversy around requiring Gentile believers to take on the law of Moses as a commanded obligation, especially when tied to salvation claims (Acts 15:1, 15:5).
>
> On the salvation-versus-obedience distinction: Scripture clearly rejects making law-keeping a condition for being saved in this dispute context; Acts 15:1 states the error as, “Unless you are circumcised after the custom of Moses, you can’t be saved,” and Acts 15:5 speaks of commanding Gentiles to keep the law of Moses. That does not by itself prove that every practice named in Moses is sinful to continue; rather, it shows that imposing Mosaic observance as a salvation requirement is rejected. So the strongest scriptural synthesis is: Sabbath-keeping can be argued as an obedience practice from Torah, Prophets, and Jesus’ continuity statements, but the cited apostolic passages do not support condemning or judging believers over Sabbath observance, nor do they support making it a salvation requirement.

- AI calls: 3; tokens: 27,301; total pipeline: 87.7 s; repair: 1 (33.3 s)
- Status: complete, verified, warm-cache replay 1 ms
- Concern: the answer is evidence-complete, but several applications remain interpretive synthesis and should be reviewed product-wise before deployment.

### 3. Which commandments believers should keep

**Reader answer:**

> Scripture identifies the governing commandments for believers as these: love Yahweh with all your heart, soul, and might, and love your neighbor as yourself. Messiah says the whole Law and the Prophets depend on these two, and he gives the concrete command that his disciples love one another as he loved them. Representative commands summed up under neighbor-love include not committing adultery, not murdering, not stealing, and not coveting; John also states God’s commandment as believing in his Son Jesus Christ and loving one another.

- AI calls: 3; tokens: 17,646; total pipeline: 45.0 s; repair: 1 (15.1 s)
- Status: complete, verified, warm-cache replay 1 ms
- The initial answer omitted the representative qualification and named Matthew 22:38 outside the finalized packet. Recovery removed the unsupported reference and produced a substantively complete answer from governing evidence.

### 4. Baptism and salvation

**Reader answer as generated:**

> No. Scripture joins baptism with repentance, faith, and salvation in proclamation, but Scripture do not establish water baptism as an absolute condition for receiving salvation, since salvation is also stated through faith, and Jesus promised Paradise to a believing man without baptism in that scene (Mark 16:16; Acts 2:38; Romans 10:9; Luke 23:43).

- AI calls: 2; tokens: 10,340; total pipeline: 25.6 s; repairs: 0
- Status: complete, verified, warm-cache replay 0 ms
- The observed grammar defect is now normalized deterministically for subsequent generation. The underlying theological synthesis is supported at `strong-implication`, not explicit-statement, and remains a product-quality review concern.

### 5. Direct factual question — Hebrews authorship

**Reader answer:**

> Scripture does not explicitly name the human author of Hebrews. The book speaks in the first person as one who wrote to the audience and mentions Timothy, but it does not identify the writer by name; 2 Peter 3:15 says Paul wrote to that audience, yet it does not directly name Hebrews as that letter (Hebrews 13:22–23; 2 Peter 3:15).

- AI calls: 2; tokens: 7,672; total pipeline: 31.9 s; repairs: 0
- Status: complete, verified, warm-cache replay 0 ms
- Correct, but the planned 2 Peter comparison is unnecessary for a simple direct answer and adds latency/complexity.

### 6. Multi-turn follow-up — “When are they raised?”

The prior successful, verified death-and-resurrection exchange was loaded as conversation context; prior answer prose was not treated as Scripture evidence.

**Reader answer:**

> Scripture places their raising in the future, at the last day. Jesus repeats that he will raise his people up at the last day, and Paul describes that same event as happening at the last trumpet, when the Lord descends and the dead rise. So the stated timing is not at each person’s individual moment of death, but at that future climactic event: the last day / last trumpet when Messiah comes.

- AI calls: 3; tokens: 16,929; total pipeline: 33.9 s; repair: 1 (12.4 s)
- Status: complete and verified
- Conversation resolution was correct. The repair was caused only by omitted structured continuity checks; automatically inventing those checks was deliberately avoided because doing so could conceal a substantive contradiction.

## Aggregate measurements

- Successful complete answers: 5/6
- Fail-closed questions: 1/6 (16.7%), caused by malformed planning reference
- Total AI calls: 14
- Total tokens: 86,863
- Repair calls: 3
- Median end-to-end pipeline latency: 32.9 s
- Approximate p95 / maximum in this six-question sample: 87.7 s
- Warm validated-answer cache: 0–1 ms for all five cacheable answers

## Remaining concerns and recommendation

No Scripture-first authority safeguard regressed, and no out-of-packet reference survived final validation. Phase 4 corrected the narrow recovery/completeness defects, but the system is not ready to call fully stabilized:

1. Planner output can fail entirely on a malformed verse label; this requires a bounded plan-normalization decision in a later approved phase.
2. Three of five successful live answers required three AI calls. Repair-loop frequency and latency remain high.
3. Missing structured continuity checks caused a paid repair even though the reader prose was sound.
4. Some accepted theological syntheses (especially Sabbath and baptism) deserve explicit product-level review; validator success proves evidence integrity, not that every interpretation is the desired conclusion.
5. Simple factual questions still invoke semantic planning and unnecessary comparison evidence.

Recommendation: do not deploy yet. Preserve this checkpoint and address the malformed-plan and avoidable structured-repair defects in a separately approved Phase 5 without weakening fail-closed behavior.
