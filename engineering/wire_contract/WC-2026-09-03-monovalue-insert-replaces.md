# WC-2026-09-03-monovalue-insert-replaces — an `insert` on a monovalue model REPLACES its (lang-)slice

- **Date:** 2026-09-03, adopted with the change that closes audit row P2-17
  (DATA-14; the same change carries DATA-26/27/32/33, which are not wire
  divergences — see the last section).
- **Decision:** DEC-12 (the invariant lands with its gates:
  `test/unit/value_law_agreement_native.test.ts` — the behaviour —
  and `test/unit/value_law_agreement_tripwire.test.ts` — the ONE-law census).
  Extends WC-2026-08-08-geolocation-emptiness-explicit divergence (e): that
  entry made an id-less `update` on a populated monovalue component replace
  (the deliberate TS extension of PHP's append-and-warn fallback); this one
  RESTORES PHP parity on the branch PHP actually consulted the registry on.

## Shape before (PHP)

`component_common::update_data_value` `case 'insert'` (class.component_common.php
:4128-4131):

```php
// For monovalue components, replace the existing value instead of appending
if (in_array($this->model, self::$components_monovalue ?? [])) {
    $data_lang = [$changed_data->value];
} else {
    $data_lang[] = $changed_data->value;
}
$this->set_data_lang($data_lang, $lang);
```

`$data_lang` is the CURRENT-LANG slice for the translation-supporting literal
classes (`get_data_lang`) and the whole array otherwise, so the replace is
slice-scoped: an insert of an English value into a `component_text_area`
replaces the English item and keeps the Spanish one. The fifteen names of
`$components_monovalue` (:180-196) are the data whose array only ever has its
element 0 read.

## Shape before (TS, 2026-07-11 → 2026-09-02)

The TS insert branch ended in an unconditional atomic append
(`appendMatrixKeyItems`, the concurrent-insert-safe concatenation) for EVERY
model. The monovalue list was consulted on the UPDATE branch only (`applyUpdate`,
WC-2026-08-08 (e)). So an `insert` against a populated `component_select`,
`component_geolocation`, `component_text_area`… GREW the array: element 0 —
the only one any reader serves — kept the old value, the value just written
was stored and invisible, and the record accumulated dead items on every
insert. Unreachable from the browser (no client component sends
`action:'insert'` on a monovalue model); reachable through the MCP
`dedalo_set_field` door with its default `mode:'append'`, through an agent
change-plan and through any import that emits `insert`.

## Shape now (TS)

An `insert` whose target model declares the `monovalue` descriptor facet
(`src/core/components/*/descriptor.ts`, read through registry
`isMonovalueModel` — alias models inherit through the canonical hop):

- **not lang-sliced** (geolocation, json, password, publication, section_id,
  security_access, select, select_lang, the media models) → the stored array
  becomes `[value]`;
- **lang-sliced** (`component_text_area`, the one translation-supporting
  literal in the list) → the CURRENT effective-lang slice becomes `[value]`,
  every other language's items are kept, in PHP's `set_data_lang` order
  (other-lang items first, then the new slice).

The replaced slot is a read-modify-write under the record's `FOR UPDATE` lock
and takes the full-array `persistRecordKeys` path — NEVER the atomic
concatenation, which by construction can only append. It is audited like every
save (one TM row with the new snapshot). The new item gets a FRESH counter id
unless the insert carried one (or resolved one from a sibling language through
`key`), exactly as PHP's `set_data` stamps it; frames paired to the replaced
item's id are orphaned the same way they are in PHP — that is inherited, not
endorsed, and stays a known gap of the monovalue family rather than an
unreviewed extra deletion.

Multi-value models are untouched: their insert is still the atomic append
(gated as the control case in the native gate).

The list itself moved: `MONOVALUE_MODELS` in `save_component.ts` and the
hand-copied `COMPONENTS_MONOVALUE` in `tool_propagate_component_data` are
DELETED; both consult `isMonovalueModel`. `component_model` — the fifteenth
PHP name — is not a registered TS model and is pinned as a measured exemption
(the pin fails the day it registers).

## Reason

Only element 0 of a monovalue array is ever read, by the client and by every
server reader (emit hooks, flat values, diffusion, export). An append on such
a slot is therefore a write the system cannot serve: the curator's or the
agent's value is stored where nobody looks, and the record silently grows.
PHP had the rule on this branch; TS had it on the other one. The wire
vocabulary (`changed_data[].action`) is unchanged — what changes is what the
engine STORES for one action on one class of models, which is the contract the
MCP write door and the import doors depend on.

## Gate reconciliation

- New: `test/unit/value_law_agreement_native.test.ts` — on a `zz` scratch TLD:
  two inserts on a `component_geolocation` leave ONE item (the second value, a
  fresh id, one more TM row); inserts on a `component_text_area` in two
  languages leave one item per language and a third insert replaces only its
  language; two inserts on a `component_input_text` still append (control).
- New: `test/unit/value_law_agreement_tripwire.test.ts` — the registry-derived
  facet set equals the frozen PHP list minus the measured exemption; no literal
  copy of the list under `src/` or `tools/`; every consumer imports
  `isMonovalueModel`; the write engine consults it on BOTH branches.
- `test/unit/save_component_geolocation_item_id.test.ts` keeps the UPDATE-branch
  law (imports the accessor from the registry now); the parity fixtures hold
  READ responses only, no harvested gate sends an `insert` on a monovalue model
  — **no re-harvest is needed**.

## The four non-wire twins carried by the same change (for the record)

- **DATA-33** — `getSectionRealTipo` (first relation of model `section`) moved
  to `src/core/ontology/resolver.ts` and is the ONE virtual→real law; the
  twelve `relations[0].tipo` copies (list definitions, section_map, buttons,
  thesaurus ddo_map, relation_index, subtree walks, identify profile, diffusion
  resolver, MCP discovery, record wipe, request_config) call it. No wire shape
  changes: on every install measured, every `relations[0]` that was not the
  real section was a childless matrix_table, so the answers were identical.
- **DATA-26** — the relation-index trigger, its backfill twin, the coverage
  probe and the integrity report filter locators with
  `sectionIdAddressSqlPredicate` (the app's strict record-address rule,
  int4-bounded so a numeric-but-unstorable id is SKIPPED and reported rather
  than aborting the heritage write). A zero-padded external id is no longer
  cast to a different address. Existing installs: `ensureSearchStores` now
  compares the installed sync-function bodies to the declared ones and
  re-creates a drifted one at boot (`staleFunctions`), so no operator step is
  needed; the suite database takes the same heal in `test:db:setup`.
- **DATA-27** — the blank literal-dataframe slot pairs at `counter + 1` (the
  client's own derivation) instead of the literal `1`. Wire field `id_key` of
  the frame item; the client ignored the wrong one and synthesised its own, so
  nothing a browser rendered changes.
- **DATA-32** — derived-store coverage and the boot backfill are per
  (store, table): `tableCoveredByStore`, `SearchStoreObservation`/
  `SearchStoresDecision` keyed by pair, `backfillSearchStoreTables` (DELETE +
  INSERT of one table's rows, never a boot-time TRUNCATE). Internal decision
  shape only; `search_store_decision_native` / `search_store_ensure_native`
  edited in the same change.
