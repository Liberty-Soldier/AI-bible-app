# EMETSEES P04 Reader-Meaning Hotfix v1.6.2

## Purpose

This is a narrow quality-contract correction after the Greek NT `G0119` review exposed remaining report-style wording.

## Versions

- Compiler: `1.6.2`
- Prompt: `emet-free-tier-entity-explanation@1.4.2`
- Generation view: `1.2.2`
- Reader test: `0.3.2`

## Changes

- Detailed morphology is no longer transmitted to the cached reader-explanation model.
- Part of speech remains available when it genuinely clarifies the word.
- The prompt explicitly prohibits discussion of supplied glosses, evidence mechanics, grammatical form, gender/case/number, and procedural explanation boundaries.
- The validator rejects phrases such as `supplied glosses`, `grammatical form`, and `this explanation`.
- Single-occurrence entries must use their limited space to explain the word itself, not describe how the answer was generated.
- The 90–120 word requirement, evidence-ID validation, corpus separation, and Scripture-only grounding remain unchanged.

## Validation

A synthetic `G0119` packet confirmed:

- `morphology_english` is absent from the model generation view.
- A 100-word natural explanation passes.
- Three report/morphology variants fail validation.
- Prompt, compiler, and generation-view versions are included in the generation signature so stale records rebuild automatically.

## Review command

```powershell
npm run test:emet-reader -- --entity word:greek-nt:G0119
```

Do not restart the production watch until the resulting Greek NT explanation is approved.
