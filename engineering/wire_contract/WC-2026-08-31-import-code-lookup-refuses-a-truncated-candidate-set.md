# WC-2026-08-31-import-code-lookup-refuses-a-truncated-candidate-set — an import that cannot resolve an identifier says so

- **Date:** 2026-08-31, adopted with the fix to the candidate cap in
  `src/core/tools/import_code_lookup.ts`.
- **Decision:** DEC-12 (the invariant lands with its gate:
  `test/unit/marc_identity_native.test.ts`). The divergence is DELIBERATE: it
  turns a silent wrong answer into a refusal a curator can act on.

## What changed on the wire

A mapped import (MARC21 / Zotero, through `importMappedRecords`) whose `id`
column resolves an existing record can now FAIL that record with
`resource.conflict` where it previously proceeded. The public sentence names the
identifier, the cap it hit, and the likely cause — a code component that is not
an identifier on that section.

## Why

The lookup narrows with the engine's `=` operator and DECIDES with a byte
comparison, because `=` compares `f_unaccent(value)` with quotes stripped:
`"O'Brien-1"`, `'OBrien-1'` and `'Évict-1'`/`'Evict-1'` are ONE candidate set
while only one of them is the identifier.

The candidate cap bounded that set. It was 2, justified as ">1 is already a
refusal, so a third row cannot change the answer" — true of MATCHES, false of
CANDIDATES. With three look-alikes the byte-exact record could be evicted from
the window, the lookup answered "no such code", and the importer **created a
duplicate of a record that already existed**.

A truncated window cannot answer the question in EITHER direction: the rows the
cap dropped could hold the identifier (answering null makes the caller duplicate)
or a second copy of it (answering an address writes into one of two records that
share it). So it refuses.

## The cap is the SANITIZER's, not the constant's

`sanitizeClientSqo` clamps `limit` to `DEDALO_SEARCH_CLIENT_MAX_LIMIT`, a
per-install key. On an install that lowered it, the real window is smaller than
`CANDIDATE_CAP` — so the refusal compares `rows.length` against the limit the
sanitizer actually left on the SQO, not against the constant. Comparing against
the constant would have made the refusal unreachable on exactly those installs,
restoring the defect through a config key.

## What did NOT change

- A code held by two records still refuses (that rule predates this entry).
- An unmatched code still resolves to `null`, and the caller still CREATES.
- The byte comparison is unchanged; a look-alike is still not an address.
