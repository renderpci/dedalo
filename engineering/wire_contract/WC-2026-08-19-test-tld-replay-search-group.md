# WC-2026-08-19-test-tld-replay-search-group — the search/SQO gates replay under the generic `test` TLD

- **Date:** 2026-08-19 (the generic-`test`-TLD migration, phase 5 — the search family).
- **Extends:** `WC-2026-08-19-test-tld-replay` (the seam itself: `adoptTipoIdMap`,
  `unmapRqo`, the two committed maps, the refusal rules). Nothing here changes the seam;
  this entry records what the SEARCH gates declare when they use it.
- **Decision:** DEC-14b + the AGENTS.md hard rule: a test uses the generic `test` TLD and
  BUILDS the situation it tests.

## Gates migrated with this entry

`sqo_differential`, `indexation_grid_differential`, `projects_filter_differential`,
`multihop_search_differential`, `multihop_order_differential`,
`autocomplete_search_differential`, `autocomplete_hi_search_differential`,
`relation_search_pipelines_differential`, `count_differential`,
`list_column_sortable_differential`.

All ten bind **zero** install TLDs after this change (`scripts/lib/tld_census.ts`), and all
ten left `engineering/generic_tld_baseline.json` in the same change.

## What moved, beyond the seam

The search family is the one place where a gate's SQO — not just its comparison — spoke an
installation's terms. Three things had to change with it:

1. **The SQO itself is written in `test`-TLD terms.** A search names its section in the
   request, so `search assembler: no resolvable matrix table for the SQO section_tipo` was
   the family's dominant red: the clone sections live in `matrix_test`, and an install
   section_tipo resolves to a table the suite database does not have.
2. **Ground-truth SQL follows the section.** `sqo_differential`'s white-box leg queried
   `matrix` directly. On the suite database that table holds none of the clone records, so
   the query counted 0 and "agreed" with nothing — a check that could not fail. It now
   reads `matrix_test`.
3. **A gate that borrowed the install's ACL now builds one.** `projects_filter_differential`
   read a hand-copied project id (`7`) belonging to the monedaiberica install's user. It
   now resolves the corpus user's projects through `getUserProjects` — the engine's own
   door — so the filter under test is derived from the situation the gate built, not from
   an ambient row.

`count_differential`'s non-admin leg was the same class of vacuity in a different shape: it
"passed" on a 403 for a section the suite principal cannot reach, so the count path never
ran. It is now rebuilt against a section the principal genuinely holds.

## Declared reductions

Two, both gate-local, both refuse-if-not-exercised:

- **Scale-bound page assertions restated as set assertions.** `projects_filter` pinned
  literal page sizes (`200`, `50`, `1000`) that describe one install's record count. They
  now assert that the unfiltered search returns the section's WHOLE record set — a
  statement about the filter, which is what the gate is for, and stronger than a magic
  number that any corpus change would falsify.
- **`list_column_sortable`'s section root is read from the body** (the entry whose
  `model` is `section`) rather than spelled. The frozen column slice is adopted with a
  per-section rewrite floor, so an adoption that stopped rewriting would redden.

Two literal install tokens survive in non-comment code and are spelled through `seed()`
without changing the string, because they are part of the frozen REQUEST hash rather than
of the ontology under test: `` id: `ac_diff_${seed('rsc', 92)}` `` and
`` `caption section ${seed('rsc', 205)}` ``.

## What a consumer must expect

1. **Nothing on the wire changes** — same class as the parent entry: this is a test-harness
   contract, ledgered because it changes how a frozen PHP response is read.
2. Every migrated gate asserts `matched === true` plus a non-zero rewrite floor, so the
   translation can never go vacuous. (Audited 2026-08-23: `indexation_grid` shipped
   without the floor; it carries it now.)
3. The residual reds in this family are **corpus content, not TLD binding**, and each is
   documented in its own file header. In summary: thesaurus parent (`hierarchy36`) and
   index (`hierarchy40`/`dd96`) edges are not reconstructed by
   `scripts/derive_test_corpus.ts`, so `indexation_grid` and `relation_search_pipelines`
   search a populated fixture against an empty index; several frozen totals count
   install-wide row sets the reduced corpus deliberately does not hold (`multihop_search`'s
   1790 and `multihop_order`'s global sort page among them — corrected 2026-08-23: this
   entry originally blamed a missing `test6099`→`test6113` edge, but the current corpus
   carries those edges on 36/38 records, so the multihop reds are the install-wide totals,
   not a broken join); and a reconstructed record keeps
   only the lang projections a frozen body revealed, which is why the `lg-eng` half of the
   autocomplete lang-clause case is missing.

**Re-harvest: NONE, and impossible by definition** (`engineering/ORACLE_HARVEST.md`). The
migrated gates replay the same interaction hashes they always did; the store is
byte-identical.
