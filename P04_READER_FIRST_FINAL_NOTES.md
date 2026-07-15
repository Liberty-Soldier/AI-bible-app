# EMETSEES P04 Reader-First Compiler v1.6.1

## Purpose

This release corrects the fallback-meaning selection and validation defect discovered by the H1077 production review test.

## Corrected behavior

- English rendering rows are aggregated by normalized phrase before fallback selection.
- Duplicate translation rows can no longer place the same word in both the approved and excluded sets.
- When no gloss or definition exists, the strongest aggregate rendering is the primary fallback.
- A second fallback is allowed only when nearly tied and not a common English helper token.
- For `word:hebrew:H1077`, the approved fallback is `not`; `that` remains excluded as an alignment artifact.
- The quality gate accepts an approved meaning such as “not” and rejects an excluded quoted artifact such as “that.”
- When only one fallback is approved, EMET must not add extra translation synonyms or discuss translation variation.

## Versions

- Compiler: `1.6.1`
- Prompt: `emet-free-tier-entity-explanation@1.4.1`
- Generation view: `1.2.1`
- Generation contract: `1.4.1`
- Explanation schema: `1.2.0`

## Installation safety

The installer replaces complete compiler files, backs up prior files, clears failures from superseded prompt runs, performs syntax checks, and validates the real H1077 P03 packet before succeeding. It makes no OpenAI request.

## Review command

```powershell
npm run test:emet-reader -- --entity word:hebrew:H1077
```

Do not restart production generation until the displayed explanation is approved.
