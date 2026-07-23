# EMETSEES P05.12U — Brenton Display-Alignment Candidate

This is the first actual alignment-rebuild stage after the source-faithful V8
Brenton reader promotion.

The candidate builder:

- verifies the completed 53-book Brenton production state;
- verifies the committed production file against its integrity manifest;
- loads the authoritative private Greek LXX canonical corpus;
- accounts for all 28,548 visible reader verses;
- resolves all 27,216 verses explicitly eligible for LXX ownership;
- keeps 1,047 translation-only verses fail-closed;
- keeps 285 unresolved ownership verses fail-closed;
- tokenizes the corrected Brenton reader text;
- transfers reusable prior Brenton token alignments by text and sequence;
- generates fresh gloss/order alignments only for remaining tokens;
- requires every aligned entity to be a canonical `word:lxx:L...` entity;
- builds the complete reader-alignment candidate twice and requires identical
  fingerprints;
- stages one alignment chapter file per Brenton reader chapter;
- leaves production, the canonical LXX source, and current word-study runtime
  unchanged.

## Run

```powershell
Expand-Archive "$env:USERPROFILE\Downloads\EMETSEES-P0512U-BRENTON-DISPLAY-ALIGNMENT-CANDIDATE.zip" `
  -DestinationPath . `
  -Force
```

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\p0512\run-brenton-display-alignment-candidate.ps1
```

Upload the generated P05.12U report ZIP. The next step will promote the staged
reader-alignment runtime transactionally and re-enable taps only for records
that passed the alignment gates.
