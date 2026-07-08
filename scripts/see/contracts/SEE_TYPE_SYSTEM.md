\# SEE Type System v0.1



\## Core Principle



SEE never starts with conclusions.



SEE starts with sources, references, tokens, and occurrences.



\## Identifier



An Identifier is a stable string used to trace data across compiler passes.



Identifiers must be:

\- deterministic

\- reproducible

\- source-aware

\- never based on English rendering



\## SourceId



Examples:

\- hebrew-wlc

\- greek-lxx

\- greek-nt

\- kjv

\- web

\- brenton



\## CanonicalRef



Format:



book.chapter.verse



Example:



Gen.4.2



\## SourceTokenId



Format:



source:canonicalRef:tokenIndex



Example:



hebrew-wlc:Gen.4.2:7



\## OccurrenceId



Format:



occurrence:source:canonicalRef:tokenIndex



Example:



occurrence:hebrew-wlc:Gen.4.2:7



\## EvidenceId



Format:



evidence:type:hash



Evidence IDs are generated from the evidence content and source references.



\## EntityId



Entities are assembled later.



Early entity IDs may be lemma-based, but final entity identity must be evidence-backed.



Examples:

\- lemma:hebrew:H1893

\- lemma:greek-nt:G0001

\- person:candidate:hash

\- place:candidate:hash



\## Rule



No ID may depend on a renderer sentence.

