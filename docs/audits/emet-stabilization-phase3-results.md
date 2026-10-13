# Ask EMET Stabilization Phase 3 Results

Date: 2026-10-12  
Phase 1 checkpoint: `c6b09f5d`  
Phase 2 checkpoint: **not created** — Windows denied `.git/index.lock` even after explicit `.git` write permission was granted. No files were staged.  
Deployment: **not performed**

## Bounded scope

Phase 3 changed retrieval-plan completeness, governing-evidence retention, claim-strength guidance, substantive enumeration guidance, and the local live-evaluation harness. It did not change UI code, cache implementation, historical-source architecture, locked Scripture data, or production deployment.

## Root causes corrected

1. **Material reasoning components had no enforceable governing evidence.** A plan could name a component but omit its most direct passage, or ranking could discard that passage. Retrieval plan schema `@4` now requires `governingReferences` for every component.
2. **Evidence ranking could displace essential Scripture.** Governing references are resolved against locked Scripture and force-retained before ordinary ranking limits.
3. **Generation and validation did not require the same governing passages.** The finalized packet now carries component-to-evidence `governingCoverage`; every component check must use at least one corresponding verified evidence ID.
4. **Chapter requests were overvalidated.** A request to examine a chapter required every verse to be individually cited. Chapter-level coverage now requires meaningful use and citation of relevant evidence from the chapter; explicit verse/range requests still require every requested verse.
5. **Enumeration guidance allowed circular summaries.** The planner now requires representative concrete instructions or Scripture-defined categories and must label a representative answer as non-exhaustive. Generic “obey/love/believe” language alone is not treated as an enumeration.
6. **Live tests did not preserve exact artifacts.** The harness now saves complete plans, verified packets, structured cold/warm answers, failures, calls, tokens, and stage timings under ignored `.private/emet-live-audits`, rejects more than ten questions, and stores no secrets or conversation history.

## Files changed in Phase 3

- `app/lib/emet/EmetAiRetrievalPlan.ts`
- `app/lib/emet/EmetAiTopicEvidence.ts`
- `app/lib/emet/EmetAiContract.ts`
- `app/lib/emet/providers/EmetAiOpenAiProvider.ts`
- `scripts/verify-emet-topic-evidence.mjs`
- `scripts/verify-emet-requested-coverage.mjs`
- `scripts/verify-emet-ai-foundation.mjs`
- `scripts/verify-emet-phase1-live.mjs`
- `docs/audits/emet-stabilization-phase3-results.md`

Phase 2 files remain uncommitted in the same worktree because the requested local checkpoint could not be written.

## Verification

Passed:

- `npm run verify:emet-ai`
- `npm run verify:emet-stabilization-phase1`
- `npm run verify:emet-topic`
- `npm run verify:emet-coverage`
- `npm run verify:emet-response-design`
- `npx tsc --noEmit`
- targeted ESLint
- `npm run build`
- all Scripture, Brenton, WEB, lexical, word-study, reader, and source-integrity prebuild gates

The build-generated search-manifest timestamp was restored; locked/runtime Scripture data is unchanged.

## Authorized live evaluation

Exactly ten live question attempts were made. No additional paid requests were run.

- Attempts 1–2: the new strict plan schema rejected plans for righteousness and Sabbath before retrieval. The cause was governing references expressed as ranges versus individual planned verses. Reference expansion was corrected immediately.
- Attempts 3–10: complete verbatim local artifacts were preserved. Six returned verified answers and two failed closed.

Persisted post-schema-run aggregate (8 questions):

- AI calls: 20
- Tokens: 118,991
- Median total time: 33,943 ms
- Repair path: 4/8
- Fail closed: 2/8
- Successful verified answers: 6/8

### 1. Righteousness comparison — fail closed

Evidence completeness materially improved. The finalized packet included Romans 3:9–12, 19–22; Genesis 6:9; Luke 1:6, 18, 20; Ezekiel 18:5–9; all of Psalm 14; and verified `δίκαιος` (`dikaios`), `צַדִּיק` (`tsaddîyq`), and `δικαιόω` (`dikaioō`).

The answer failed because chapter-level Psalm coverage was overstrict and lexical-only explicit claims were rejected. Both deterministic defects were corrected afterward, but the question was not rerun because the ten-question ceiling had been reached.

- Calls: 3
- Tokens: 30,457
- Time: 100,030 ms

### 2. Sabbath comparison — fail closed

The finalized packet contained the full requested comparison set: Colossians 2:16–17; Romans 14:5–6; Galatians 4:9–11; plus Exodus 20:8, 10; Exodus 31:13, 16; Isaiah 56:6–7; Jeremiah 31:33; Matthew 5:17; Ephesians 2:8–9; John 14:15; and 1 John 2:3.

Recovery still failed because the prose used a modern-audience/restatement rationale prohibited by the continuity validator and then began categorically while grading the conclusion as only possible. Fail-closed behavior was correct; recovery quality remains unresolved.

- Calls: 3
- Tokens: 25,512
- Time: 90,489 ms

### 3. Baptism and salvation — pass, improved

Before Phase 3, Acts 2:38 was omitted and the answer opened with an unsupported categorical “No.” After Phase 3, the governing packet included Ephesians 2:8; Romans 10:9; Mark 16:16; and Acts 2:38.

Actual answer:

> Scripture does not give a simple unqualified yes or no. Some salvation summaries say people are saved through faith and by confessing and believing, without naming baptism as an added condition, while other passages directly join baptism with being saved or forgiveness. So baptism is materially connected to salvation in some texts, but the four passages here do not by themselves settle the full question.

- Calls: 3, including one repair
- Tokens: 12,946
- Time: 37,441 ms

### 4. Commandments believers should keep — partial improvement

The answer moved beyond “keep the commandments” and named love for Yahweh, love for neighbor, faith in Messiah, and love for one another, supported by nine governing passages. It still functions more as a summary than a representative treatment of concrete applicable commands. The general enumeration instruction was strengthened after this run, but not rerun.

Actual answer:

> Scripture identifies believers as people who keep God’s commandments. Those commandments are summed up in loving God with all your heart, soul, and might, and loving your neighbor as yourself. For believers in Messiah, his commandment is also stated as believing in the name of his Son, Jesus Christ, and loving one another as he commanded.

- Calls: 3, including one repair
- Tokens: 15,315
- Time: 38,640 ms

### 5. Death and resurrection sequence — pass, improved

The prior answer relied on an overstated inference from Philippians 1:23. The Phase 3 answer instead used direct governing sequence texts: Genesis 3:19; Ecclesiastes 9:5; John 6:39; and 1 Corinthians 15:52.

Actual answer:

> At death, man returns to the dust, and the dead do not know anything in this world; Scripture presents them as awaiting resurrection rather than being raised immediately at death. The dead are raised in the future at the last day, at the last trumpet, when Messiah raises them up (Genesis 3:19; Ecclesiastes 9:5; John 6:39; 1 Corinthians 15:52).

- Calls: 2
- Tokens: 7,911
- Time: 15,227 ms

### 6. Paul and abolition of commandments — pass with interpretive caution

The planner correctly used Paul’s own governing passages: Romans 3:31; Romans 7:12; 1 Corinthians 7:19; and Ephesians 2:15.

Actual answer:

> No. Paul does not teach that God’s commandments, as commandments, were abolished. In scope, his statements concern the law/commandment itself, the believer’s relation to it through faith, and one specific abolished object in Ephesians: “the hostility, the law of commandments contained in ordinances” in the Jew-Gentile division context (Romans 3:31; Ephesians 2:15). Paul explicitly says faith does not nullify the law but establishes it, says the law is holy and the commandment holy, righteous, and good, and says what matters is keeping God’s commandments (Romans 3:31; Romans 7:12; 1 Corinthians 7:19). So Scripture does not support the claim that Paul taught commandments were abolished categorically. Rather, it supports that he upheld the law/commandment while also saying that, in Messiah’s flesh, the hostility embodied in commandments contained in ordinances dividing Jew and Gentile was abolished to make peace (Ephesians 2:15).

The broad conclusion is well supported. The phrase “hostility embodied in commandments” is interpretive synthesis and should remain identified as such rather than as Ephesians’ exact wording.

- Calls: 2
- Tokens: 9,284
- Time: 26,879 ms

### 7. Revelation 12 symbolism — pass

Actual answer:

> Revelation 12 explicitly identifies the dragon: he is “the old serpent,” “the devil and Satan,” and “the deceiver of the whole world,” and the chapter also explicitly mentions Michael, the dragon’s angels, and the woman’s other offspring as those who “keep God’s commandments and hold Jesus’ testimony” (Revelation 12:7, 9, 17). The male child is not named, but his role is strongly identified by what the text says: he is the one “who is to rule all the nations with a rod of iron” and who was “caught up to God and to his throne” (Revelation 12:5). By contrast, the woman, her clothing with sun/moon/twelve stars, the wilderness period, the eagle’s wings, and the river from the serpent are presented as symbolic imagery without full explicit identification in the chapter itself, so those features remain interpretive, though Genesis 37:9 and Genesis 3:15 provide strong canonical background rather than direct identifications.

- Calls: 2
- Tokens: 10,646
- Time: 30,445 ms

### 8. Authorship of Hebrews — pass

Actual answer:

> Scripture does not identify who wrote Hebrews. Its opening begins with God speaking through the prophets rather than naming a human sender, unlike letters such as Romans, which begin by naming the writer as Paul (Hebrews 1:1; Romans 1:1).

- Calls: 2
- Tokens: 6,920
- Time: 10,183 ms

## Performance impact

- Governing-evidence resolution is deterministic and adds no AI call.
- Successful questions without repair used two calls: plan plus answer.
- Two ordinary questions still required repairs, showing that generation-format stability remains a latency problem.
- Successful two-call cases ranged from 10.2 to 30.4 seconds total.
- Complex repaired/fail-closed cases remained 90–100 seconds and are not acceptable for production conversational use.
- Warm validated-answer retrieval remained effectively immediate in the local in-memory harness.

## Scripture-first authority assessment

No authority rule was removed or weakened. Governing references are resolved only from locked Scripture. Original-language evidence remains independently verified. The implementation distinguishes explicit text, strong implication, synthesis, possibility, and non-establishment, and categorical answers now require explicit statement or strong implication. No modern scientific, denominational, historical, or external authority was added.

## Remaining failures and recommendation

Phase 3 corrected the foundational evidence-omission mechanism. It did not fully solve answer reliability:

1. Complex righteousness and Sabbath answers can still fail after a repair despite complete evidence.
2. Enumeration answers can still remain too summary-oriented.
3. Repair frequency (4/8) and complex latency remain too high.
4. Claim-strength labels are structurally constrained, but nuanced semantic overstatement can still require human review.

Recommendation: do not deploy this checkpoint yet. The next bounded phase should focus only on deterministic recovery of otherwise valid prose, reducing repair-triggering format defects, and improving enumeration completeness from already retrieved governing evidence. Retrieval architecture, UI, caches, historical sources, and locked datasets should remain unchanged.
