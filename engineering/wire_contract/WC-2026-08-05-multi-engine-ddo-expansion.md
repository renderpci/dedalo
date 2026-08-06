# WC-2026-08-05-multi-engine-ddo-expansion — every request_config item's children expand; the dedup key is STRUCTURAL, not composite

- **Date:** 2026-08-05 (with WC-2026-08-05-external-request-field-union and
  -external-first-record-reduce).
- **Decision:** — (DEC-12 gates:
  `test/unit/external_multi_source_native.test.ts`,
  `test/unit/external_config_narrowing_census.test.ts`).

## 1. The gap: only `request_config[0]` expanded

PHP `common::get_subdatum` (`class.common.php:2312-2341`) builds ONE
`full_ddo_map` before it touches a locator:

```php
foreach ($request_config as $request_config_object) {
    if (empty($request_config_object->show->ddo_map)) { debug_log(WARNING); continue; }
    array_push($full_ddo_map, ...$request_config_object->show->ddo_map);
    if (isset($request_config_object->hide->ddo_map)) {
        array_push($full_ddo_map, ...$request_config_object->hide->ddo_map);
    }
}
```

TS took `ownConfig[0].show` + `ownConfig[0].hide` and nothing else. Fourteen
nodes in this installation declare more than one config item, so the second
item's children were never resolved:

- **five multi-ENGINE nodes** — `rsc368`, `numisdata162`, `rsc1285`, `tchi29`
  (dedalo + zenon) and `test204` (zenon only). rsc368's zenon1 locators were
  filtered against dedalo-only ddos, matched none, and rendered an empty cell.
  This is the whole rsc368 bug.
- **nine multi-SCOPE dedalo nodes** — a `type:'main'` item plus a
  `type:'secondary'` one (`numisdata573`'s hierarchy25 + hierarchy95,
  `numisdata560`, `numisdata627`, …). PHP applies NO type filter, so their
  secondary children were emitted by the oracle and missing from TS.

Both are now closed by `src/core/relations/config_ddo_map.ts`, applied at the
portal edit-cell builder, the `section_list` list-cell builder, the `get_data`
child map and the view lookup (the census file lists all four).

**Not a divergence** — a gap. The emitted set moves TOWARD the oracle.

## 2. The divergence: the dedup key

PHP dedups the merged map on a COMPOSITE key:

```php
$key = $ddo->tipo . '_' . ($ddo->parent ?? '') . '_' . json_encode($ddo->section_tipo);
```

TS keys on the **whole normalised ddo** (`normalizedDdoKey`).

### Why

The composite key silently drops a second ddo that differs only in `mode`,
`lang`, `limit`, `view`, `value_with_parents` or any other field — two
genuinely different renders of the same component collapse into one, and the
one that survives is whichever engine's item came first. That is a wrong answer
that looks right. The structural key never collapses two ddos that differ, so
the TS set is a **strict superset** of what PHP keeps.

### Measured effect on this installation

**CORRECTED 2026-08-06.** The original text of this section claimed "None —
no node declares two ddos that agree on (tipo, parent, section_tipo) and differ
elsewhere". That census was wrong, and the correction is the point of a ledger:

**57 nodes are affected**, all through the show/hide pair of ONE component:

- **49 `component_dataframe` frames** (`numisdata188`, `numisdata1016`, … ,
  `tchi98`) declare `rsc1246` in `show` with `mode:'edit', view:'line'` AND in
  `hide` with `mode:'solved', role:'rating'`. Same tipo, same `parent:'self'`,
  same `section_tipo:'self'` — PHP's composite key collapses them to the SHOW
  entry alone; the structural key keeps both. The emitted `full_ddo_map` of
  every one of these frames therefore carries ONE MORE ddo than the oracle's.
- **8 `component_autocomplete_hi`** (`numisdata585`, `hierarchy92`, …) hide
  `hierarchy31`; no show entry collides, so both keys agree there. Listed
  because they are the other half of the live hide census.

The census is TOTAL, re-measured 2026-08-06 against the application DB: **58 hide
ddos exist in the whole ontology, every one `parent:'self'`, spread over 58
distinct nodes** — the 49 above (`component_dataframe` → `rsc1246`), the 8 above
(`component_autocomplete_hi` → `hierarchy31`), and **one `component_radio_button`
(`rsc1246` hiding `rsc1260`)** which collides with no show ddo and therefore
changes no bytes under either key. That 58th is named so the count reconciles:
57 affected + 1 inert = the whole census, nothing rounded away.

The divergence stands — the superset is still the right answer, since a `solved`
render and an `edit` render of the same component are genuinely two ddos and the
client widgets read both — but it is a CHANGE TO TODAY'S BYTES on 49 nodes, not
a guarantee about the future. Gate: `external_read_path_consumers_native`
asserts the emission map keeps both.

### The one normalisation

`section_tipo` is a SET of target sections, so an ARRAY is sorted **in a copy**
before keying: `['s2','s1']` and `['s1','s2']` are the same ddo. PHP's
`json_encode` is order-sensitive and would keep both. The EMITTED ddo keeps the
declared array verbatim — flattening it to `[0]` is the numisdata6 §2 bug (a
multi-target child then matched only the first target section).

## 3. Empty show map skips the WHOLE item

Reproduced exactly, including the consequence PHP's control flow implies but
does not spell out: an item with an empty `show.ddo_map` contributes nothing,
**and its `hide.ddo_map` does not contribute either** (the `continue` at :2325
runs before the hide push). The skip is logged at the subdatum call site only,
where PHP logs it — the config-shape readers (`section_list`) stay quiet, since
a search-only config item is ordinary rather than a warning.

## 3b. The hide map is EMISSION-ONLY (added 2026-08-06)

`full_ddo_map` is what the CLIENT gets. The FLAT/EXPORT consumer is a different
one and the oracle builds it from `show->ddo_map` alone —
`class.component_relation_common.php:756-761` (`get_export_value`) and
`:331-339` (`get_grid_value`) — resolving hide separately into `$ar_hide`,
"used as internal data … it doesn't show into the list"
(`class.component_common.php:2932-2960`).

The flattener therefore takes `includeHideDdos`, and `resolveOwnConfigMap`
(`section_list.ts`) — the map behind the list-cell JOIN (`resolve/relation_list`)
and the export atoms (`diffusion/export/atoms`) — passes `false`. Applied at the
resolver rather than in each consumer's loop so a new consumer cannot forget it.
`resolveListCellMap` / `resolveFrameConfig` keep hide: they feed the emission.

Without it the 49 rating frames of §2 printed their rating TWICE into one cell
("Alta, Alta", joined by the frame separator) and the 8 hierarchy31 hiders each
pushed a false entry into the response's `unresolved` ledger — a
`component_geolocation` has no flat value to resolve. **Not a divergence: a
correction back to the oracle.** Gate:
`test/unit/external_read_path_consumers_native.test.ts`.

## 4. What did NOT change

No `api_engine` branch entered the read path, and none may. Which children a
locator sees is decided by the LOCATOR's `section_tipo` against the child ddo's
declared `section_tipo` — the filter that already existed in
`relation_core.expandPortal` — exactly as the oracle does it (v6 switches on the
locator's section and then on the component MODEL, never on the engine name).
A zenon1 locator therefore sees only the ddos declared at zenon1, and an rsc205
locator only the dedalo ones, with no engine-aware code anywhere.

## Gate reconciliation

`external_read_path_consumers_native` covers the §3b consumer split (show-only
flat map, hide kept for emission) and the un-gated local cell limit;
`external_multi_source_native` covers the flattening (both items' children
expand, per-locator `section_tipo` filtering, the structural dedup key, the
empty-show-map skip); `external_config_narrowing_census` is the shrink-only
ratchet over every site that still narrows a multi-item config to one.
`request_config_differential` and `relation_search_builders` are unchanged: the
flattening is additive for a single-item config, which is every node they touch.

**No parity fixture was edited.** The frozen store DOES carry `rsc368`'s
`request_config` (`request_config_differential`, `relation_corpus_config`), so
this change is inside the replay rather than outside it — and it stays green
there because the dedup keeps the FIRST occurrence, which makes the flattening a
strict no-op for a single-item config (every other node those gates touch) and
purely ADDITIVE for `rsc368`, whose compared projection is ddo identity.
**Re-harvest: NO — impossible by definition.**
