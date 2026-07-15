# EMETSEES P04 v1.6.5 — Adaptive Reader Length

This hotfix keeps GPT-5.6 Luna and changes only the cached explanation contract.

## Permanent reader rule

- Explanation body: 60–120 words.
- Simple, grammatical, rare, or single-occurrence entities will often need 60–90 words.
- Broadly used or well-supported entities may use 90–120 words.
- Completeness matters more than length.
- Never pad with repetition, morphology trivia, evidence mechanics, procedural disclaimers, or unsupported verse-context inference.
- All Scripture-only, corpus-identity, citation, quality-gate, and context-safety rules remain unchanged.

## Versions

- Compiler: `1.6.5`
- Prompt: `emet-free-tier-entity-explanation@1.4.5`
- Generation view: `1.2.4`

The prompt change invalidates older cached records by generation signature. P03 is unchanged.
