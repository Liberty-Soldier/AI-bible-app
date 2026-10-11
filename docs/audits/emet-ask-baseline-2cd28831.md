# Ask EMET stabilization baseline — `2cd28831`

This file preserves the read-only audit baseline used for the bounded stabilization work. It records only recovered audit data; it does not infer missing expected evidence or rewrite audit outcomes.

## Corpus (50 questions)

### Independent questions (42)

1. Who created the heavens and the earth?
2. What is sin?
3. What are the Ten Commandments?
4. Who baptized Jesus?
5. What happened on the day of Pentecost?
6. What does the serpent symbolize in Scripture?
7. Who is the woman clothed with the sun in Revelation 12?
8. What does leaven symbolize in the Bible?
9. What does the mark on Cain signify?
10. What do the four beasts in Daniel 7 represent?
11. How does the bronze serpent in Numbers connect to Messiah?
12. How does Jeremiah 31 connect to Hebrews 8?
13. How does Passover connect to Messiah?
14. How does Melchizedek connect Genesis, Psalms, and Hebrews?
15. How does the exodus pattern appear in the New Testament?
16. What commandments should believers keep?
17. How should a believer observe the Sabbath according to Scripture?
18. What foods does Scripture prohibit?
19. What happens when we die and when are the dead raised?
20. Explain the biblical sequence of repentance, baptism, receiving the Spirit, and faithful obedience.
21. What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean there?
22. What Greek word is translated law in Romans 3:31, and what does it mean in context?
23. Compare the Hebrew words translated soul and spirit in Genesis and Ecclesiastes.
24. What Greek words are translated hell in the New Testament, and are they identical?
25. Romans 3:10 calls none righteous, but Genesis 6:9 and Luke 1:6 call people righteous. Examine the Hebrew and Greek terms and explain whether these passages conflict.
26. Does Scripture require believers to keep the seventh-day Sabbath? Present the strongest evidence for and against.
27. Does Scripture teach the Trinity? Examine the complete biblical claim rather than only verses naming Father, Son, and Spirit together.
28. Are believers under the law of Moses?
29. Does Paul teach that the commandments were abolished?
30. Is baptism required for salvation?
31. What was the historical setting of the decree in Acts 15?
32. What historical circumstances prompted Paul to write Galatians?
33. What do we know from Scripture about Roman crucifixion practices?
34. What was a synagogue like in the first century?
35. Does Romans 7:6 contradict Matthew 5:17-19?
36. Does James 2:24 contradict Romans 3:28?
37. Does Ezekiel 18 contradict the idea of inherited guilt?
38. Do the differing resurrection accounts contradict one another?
39. Does Scripture identify the author of Hebrews?
40. Does Scripture say exactly when Messiah will return?
41. Does the Bible establish the age of the earth?
42. Does Scripture say what Paul's thorn in the flesh was?

### Conversation A (4 turns)

1. Does Scripture require believers to keep the seventh-day Sabbath?
2. What passages are strongest against that conclusion?
3. Do those passages explicitly mention the weekly Sabbath, or is that an inference?
4. What was my first question, and what conclusion did the evidence support?

### Conversation B (4 turns)

1. Who is the woman clothed with the sun in Revelation 12?
2. What clues in Genesis help identify her?
3. Does that mean every detail refers only to ethnic Israel?
4. Summarize the distinction you just made and cite the relevant passages.

## Recovered category scoring

| Category | Count | Pass | Partial | Fail |
| --- | ---: | ---: | ---: | ---: |
| Direct factual | 5 | 5 | 0 | 0 |
| Symbols | 5 | 2 | 2 | 1 |
| Cross-Testament | 5 | 5 | 0 | 0 |
| Multi-part/instructions | 5 | 3 | 1 | 1 |
| Lexical | 5 | 1 | 2 | 2 |
| Doctrine | 5 | 1 | 1 | 3 |
| Historical | 4 | 0 | 2 | 2 |
| Apparent conflict | 4 | 1 | 3 | 0 |
| Scripture does not establish | 4 | 4 | 0 | 0 |
| Conversation | 8 | 3 | 3 | 2 |
| **Total** | **50** | **25** | **14** | **11** |

Six of the eleven failures were technical nonanswers.

## Recovered performance baseline

Independent run (`n=42`): 37 complete, 5 fail-closed; 68 AI calls; 341,614 total tokens. Cold median was 23,026 ms and cold p95 was 41,563 ms. Paired-run median was 23,026 ms and p95 was 58,761 ms. Warm median was 0 ms and warm p95 was 29,246 ms; 9 of 42 warm requests regenerated.

| Stage | Median | p95 | Observed max |
| --- | ---: | ---: | ---: |
| Retrieval | 561 ms | 1,309 ms | 1,722 ms |
| Planning | 16,984 ms | 33,194 ms | 35,566 ms |
| Generation (`n=13`) | 11,100 ms | 69,715 ms | not separately recovered |
| Repair (`n=10`) | 19,090 ms | 42,582 ms | not separately recovered |
| Validation | 0 ms | 1 ms | not separately recovered |

The three deterministic fast-path answers were all judged materially defective. Exact per-question expected-evidence records were not present in the recovered audit summary and are intentionally not invented here. Raw recovered logs remained in the audit environment's temporary files when this baseline was created.
