# WC-2026-08-19-test-tld-replay — the frozen store is replayed under the generic `test` TLD

- **Date:** 2026-08-19 (the generic-`test`-TLD migration, phase 4 — the seam; shipped with
  `test/parity/normalize.ts`, `test/parity/oracle_fixtures.ts`, and the four pilot gates
  listed under *Gate reconciliation*).
- **Decision:** DEC-14b (the frozen store is the read-path baseline of record) + the
  AGENTS.md hard rule adopted 2026-08-19: a test uses the generic `test` TLD and BUILDS the
  situation it tests. Canon for the mechanism: `engineering/ORACLE_HARVEST.md`
  (ADDENDUM 2026-08-19).

## The seam

The frozen oracle-harvest store speaks ONE installation's ontology: `numisdata6`, `cult1`,
`oh1`, `rsc170`. A gate written against it is green on the machine holding that install's
records and red on every other — 208 reds on the vendored suite database, which is how a
real regression (WC-034 addendum, `search_options`) hid for weeks.

The store cannot be re-recorded: PHP is decommissioned and a re-harvest is impossible by
definition. So the ontology identity has to be translated at the gate, exactly like every
other deliberate divergence in this ledger — **the fixture bytes are not edited**.

## Shape before

The gate wrote the install's terms and compared the frozen body verbatim:

```ts
source: { tipo: 'numisdata6', section_tipo: 'numisdata6', … }
show:   { ddo_map: [{ tipo: 'numisdata16', … }] }
phpData = body.result.data;              // install terms, compared as-is
```

## Shape after

The gate writes the generic `test` TLD; the seam translates in BOTH directions:

```ts
source: { tipo: 'testmint1', section_tipo: 'testmint1', … }
show:   { ddo_map: [{ tipo: 'testmint1002', … }] }

// request: unmapRqo BEFORE hashRequest (inside lookupInteraction) → the frozen
//          install-term interaction is found, unchanged.
// response:
const adopted = adoptTipoIdMap(body, 'read_differential');
expect(adopted.matched).toBe(true);
expect(adopted.rewrites.tipos).toBeGreaterThan(0);
phpData = adopted.body.result.data;      // test terms, compared as-is
```

Both directions read the SAME two committed files — no third source, no aliasing layer:

- `src/core/test_data/test_tld_tipo_map.json` — append-only and bijective; keys are
  `<tipo>` and, for the twenty-two synthetic thesaurus twins cloned from one
  `hierarchy20` subtree, `<section>@<tipo>`;
- `src/core/test_data/test_corpus/id_map.json` — record addresses.

`adoptTipoIdMap`'s rules, in force: tipo tokens are rewritten as KEYS and as VALUES and
where they are EMBEDDED in a longer string (`rsc29_rsc170_5.jpg`, a css selector key); a
component tipo resolves under the SECTION SCOPE of its enclosing object, and the scope does
not leak into a nested object naming another section; `section_id` is rewritten only beside
its `section_tipo` sibling, through the id map (`rewrites.ids` counts RESOLUTIONS — 1080 of
1080 pairs map to themselves today, so counting changes would count nothing).

It REFUSES rather than guesses: a TS-shaped body (`ok` present — this transform is
fixture-side only), a surviving clone-set install token, a disagreement between the two
maps, a key collision. Every caller asserts `matched === true`.

Two narrow, declared reductions ride with it: `CORPUS_SCALE_FIELDS` (a number that counts
rows the reduced corpus deliberately does not hold — an UNFILTERED install-wide total; a
filtered total stays verbatim) and `UNCLONED_TOKENS` (an install token with no twin because
the clone closure stops at the section root). Both REFUSE a declaration that matches
nothing, so neither can decay into a blanket exemption.

## Reason

The alternative is to edit the fixtures, and a fixture edit is the one thing this store
cannot survive: it is the baseline of record for a wire shape whose author no longer runs.
Translating at the gate keeps every frozen byte answerable, keeps the request hash keyed on
what PHP actually answered, and makes the ontology identity — which is what the migration
is about — the only thing that moves.

The direction matters too. The transform is FIXTURE-SIDE ONLY (the `adoptErrorEnvelopeV2`
precedent): handed a TS body it refuses, so a gate that mistakenly maps the engine's own
output reddens on `matched` instead of comparing the engine with itself.

## What a consumer must expect

1. **Nothing on the wire changes.** This is a test-harness contract: no engine byte, no
   client byte, no fixture byte moves. It is ledgered here because it changes how a frozen
   PHP response is READ, which is a wire-shape decision by any other name.
2. A migrated gate's RQO is written in `test`-TLD terms. `unmapRqo` is a no-op for a
   request naming no clone (every clone target lives in a `test*` TLD, above the
   hand-authored `test` band), so unmigrated gates hash exactly as before — measured across
   the whole tier: zero new failures.
3. A fixture MISS still throws, and now prints the unmapped request.

## Gate reconciliation

- `test/parity/tipo_map_transform.test.ts` — pins the transform: keys/values/embedded
  tokens, the section-scoped clones (and that a flat rewrite is impossible, not merely
  wrong), the id rule including identity pairs, each refusal, prose immunity, the request
  side against the REAL frozen store, and the corpus-scale projection with its
  refuse-if-absent anti-vacuity.
- Pilots migrated with this entry: `test/parity/read_differential.test.ts`,
  `test/parity/context_differential.test.ts`,
  `test/parity/component_publication_search_differential.test.ts` (green on a suite
  database holding no install data) and `test/parity/relation_index_get_data_differential.test.ts`
  (migrated; GREEN since 2026-08-19, when the derive learned to reconstruct INVERSE EDGES —
  a relation entry that is a computed inverse page states a locator held on ANOTHER record,
  and that locator is now materialized on the pointing record, tagged `origin:'inverse_edge'`
  with a `revealed_by` trail. See `engineering/ORACLE_HARVEST.md` ADDENDUM 2026-08-19).
- `test/unit/generic_tld_tripwire.test.ts` — the four gates left
  `engineering/generic_tld_baseline.json` in the same change
  (`bun run scripts/generic_tld_baseline.ts`; 301 → 297 files).

**Re-harvest: NONE, and impossible by definition** (`engineering/ORACLE_HARVEST.md`). The
pilots replay the same interaction hashes they always did; the store is byte-identical.
