# EMETSEES P04 Context-Safe Reader Hotfix v1.6.3

## Purpose

This narrow correction prevents an entity-level cached explanation from interpreting a referenced verse when the generation packet contains only the reference and no verse text or surrounding context.

## Versions

- Compiler: `1.6.3`
- Prompt: `emet-free-tier-entity-explanation@1.4.3`
- Generation view: `1.2.3`
- Reader test: `0.3.3`

## Changes

- The compact view now states explicitly that verse text and surrounding context are unavailable.
- A bare reference may identify where a word occurs, but it may not be followed by an inferred description of what happens, what the passage teaches, or what virtue the verse requires.
- Corpus-limited occurrence counts must name the exact corpus rather than claiming the word occurs that many times “in Scripture.”
- The validator rejects reference-led context inference, unsupported contextual virtues such as perseverance or steadfastness, and defensive warnings about unrelated spiritual meanings.
- Reader explanations remain 90–120 words, Scripture-only, source-grounded, and distinct from the future runtime “Meaning in this verse” section.

## Review command

```powershell
npm run test:emet-reader -- --entity word:greek-nt:G0119
```

Do not restart the production watcher until the resulting Greek NT explanation is approved.
