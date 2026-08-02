# WC-2026-08-02-observer-references-limit-not-honoured — the observer recompute never honours `references_limit`

- **Date:** 2026-08-02 (D3, the set_dato_external value law port).
- **Decision:** — (kernel-level write-safety rule; DEC-12 gate shipped with it).

### Shape before (PHP)

`set_dato_external` reads `perform.params.references_limit` (default 10 when
absent; the shipped observe configs mostly declare `0` = ALL, the tchi family
declares `200`) and threads it into the related-mode SQO as a naked SQL
`LIMIT` (v6 `class.component_relation_common.php:2040`,
`$sqo->set_limit($references_limit)`). A capped result set then feeds the
order-preserving merge, which removes stored entries by OMISSION — anything
past the cap reads as "no longer references you".

### Shape after (TS)

`recomputeExternalRelation` (src/core/section/record/observers.ts) ALWAYS
searches with `limit: false`. The cascade ignores the declared
`perform.params.references_limit` entirely, and a caller that passes a finite
NONZERO `options.referencesLimit` is refused OUTRIGHT before any compute: loud
log + `observers_references_limit_refused` counter + `{possiblyTruncated:
true}` in the outcome — never a truncated persist.

`referencesLimit: 0` is NOT refused: 0 is PHP's UNCAPPED sentinel
(`set_limit(0)` = 'ALL'), and most shipped observe configs declare 0 — a
faithful params port passing the declared value through must fall to the
normal uncapped search, not dead-stop every recompute install-wide. A port
mapping the params should still prefer omitting the option for 0.

This is a write-path VALUE divergence, not a JSON-shape one: the persisted
mirror bag (which IS served on the wire) can hold more entries than PHP's
capped recompute would have left it.

### Reason

MEASURED 2026-08-02: `tchi1/162` stores 1,023 `numisdata250` locators against
a declared `references_limit: 200`. Honouring the cap on a recompute would
persist a 200-entry bag and destroy 823 locators — silently, because the
merge's removal mechanism is omission. A limit is a pagination concept; on a
write path it is data loss. The refusal (rather than a silent ignore of the
option) is the tripwire for anyone later "completing" the params port.

Scope of the measurement (review 2026-08-02): `numisdata250` itself does not
currently REACH the TS refusal — its `properties.source` has no
`component_to_search` (verified in `dd_ontology`), so the kernel returns at
the counted `observers_component_to_search_missing` skip first; in PHP that
node ran via the no-fct `st_si` flat-locator branch of `search_related`, which
TS does not implement. The 823-locator figure measures what honouring the cap
WOULD destroy on that stored bag. And no production caller threads
`perform.params.references_limit` into `options.referencesLimit` today — the
refusal exists purely as the defensive tripwire for a future params port.

### Gate reconciliation

`test/unit/observer_seed_native.test.ts` — static pin that the kernel search
carries `limit: false`, plus the behavioral refusal (counter + outcome flag).
No parity gate replays observer writes against the frozen store, so no
fixture is affected. **No re-harvest** (impossible anyway): read-path
fixtures never contained a recompute-capped bag.
