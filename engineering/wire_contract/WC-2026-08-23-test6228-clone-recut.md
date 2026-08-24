# WC-2026-08-23-test6228-clone-recut — the `test6228` clone re-cut to the HARVESTED stored declaration

- **Date:** 2026-08-23.
- **Extends:** `WC-2026-08-19-test-tld-replay` (the clone manifest + adoption seam).
  Nothing on the wire changes; this entry records a correction to the COMMITTED
  CLONE (`src/core/test_data/test_tld_ontology.json`), never to a frozen fixture.
- **Decision:** DEC-14b; the frozen-oracle law (a fixture is never edited — the
  clone manifest is NOT a fixture, it is the repo-owned twin ontology the
  fixtures are replayed against).

## What was wrong

`test6228` (clone of `numisdata159`, 'explicit multi-section' row of
`test/parity/relation_corpus_config.test.ts`) was the ONLY node of the gate's 17
comparable stored request_configs whose committed declaration drifted from the
frozen harvest: the frozen body's own `properties` echo — the authoritative
declaration PHP resolved on 2026-07-11 — stores `section_tipo: "rsc197"`
explicitly on the `rsc85`/`rsc86` show+search ddos, while the committed clone
(cut from the post-harvest mht-era numisdata ontology, where the install's
declaration had meanwhile changed) stored `"self"`.

`'self'` is not the same declaration: with a multi-section sqo
(`["rsc197","rsc106"]`) both engines resolve `'self'` to the target ARRAY
(TS `src/core/relations/request_config/explicit.ts` processSingleDdo; frozen PHP
`trait.request_config_ddo.php` ar_section_tipo), so TS — correctly resolving the
clone it was given — could never match a frozen body resolved from the explicit
form. The divergence was the ONTOLOGY INPUT, not the resolution.

## The fix

The four `"section_tipo": "self"` entries of `test6228`'s stored
`properties.source.request_config[0]` `show.ddo_map`/`search.ddo_map`
(`rsc85` + `rsc86`, both maps) are re-cut to `"rsc197"` — the harvested
declaration, adopted through the committed tipo map (`rsc197` is seed-shipped
and maps to itself). No other node changed; `rsc116` already carried its
explicit `rsc106`.

Materialized by `bun run test:db:setup` like every clone edit. Gate:
`test/parity/relation_corpus_config.test.ts` `test6228` row (red before, green
after — measured with the rebuild).
