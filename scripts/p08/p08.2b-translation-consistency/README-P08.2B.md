# EMETSEES P08.2B V2 - Translation Persistence Consistency

This package applies only the narrow consistency corrections proven by the
P08.2B translation-persistence audit.

## What it changes

- Adds one small shared translation-preference utility.
- Keeps `preferredTranslation` as the authoritative browser-storage key.
- Keeps WEB as the first-use and invalid-value default.
- Makes translation changes inside an open reader update the stored preference.
- Makes Library bookmarks and highlights reopen in their saved translation.
- Makes Home recent bookmarks reopen in their saved translation.
- Makes legacy saved items without translation use the current active preference.
- Reuses the existing note-to-Scripture flow through the same safe link builder.

## What it does not change

- No new translations are added.
- Ask EMET is not redesigned.
- Search and bottom navigation are not changed.
- No dependency install or upgrade is run.
- No production build is run.
- No Git branch, reset, clean, commit, or checkout operation is run.
- P07 cache-generation paths and processes are not accessed.
- P01-P04 and the retained P04.2 candidate are not accessed.

## Verification

The installer requires the exact P08.2A/current audit source hashes, creates a
rollback backup, applies the five-file payload, verifies exact post-install
hashes, runs isolated TypeScript syntax checks, exercises preference migration
and reader-link behavior, and creates an automatic success or failure ZIP.

## V2 recovery note

The original installer could treat harmless Git line-ending warnings on stderr as terminating PowerShell errors while collecting report metadata. V2 captures Git stdout and stderr through System.Diagnostics.Process, records warnings in the report, and fails only when Git returns a nonzero exit code. The source payload and expected hashes are unchanged. The original failed attempt stopped before preflight, backup, or source apply, so V2 remains safe to run against the same expected source state.
