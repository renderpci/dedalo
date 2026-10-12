# WC-2026-10-12-user-activity-what-labels — user-activity `what` entries are keyed by ACTION and labelled from the labels engine, never by a label tipo

- **Date:** 2026-10-12 (owner decision: the v7 master ontology is a separate
  branch from v6 and MAY REUSE the tipos of retired `model='label'` nodes).
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (gates in the same
  change); WC-033/WC-034 (the labels engine is the single source of program
  strings).

## Shape before (PHP, and TS until now)

The activity what-code (dd42 / `matrix_activity` dd545, 1..16) was mapped to a
LABEL TIPO (PHP `build_what` `$what_map`; TS `user_stats.ts` `WHAT_MAP`) and its
text read from the ontology (`termByTipo`):

```
stored dd1521 misc->dd1523 item  {type:'what', tipo:'dd696', label:'Entrada', value}
widget totals.what[]             {key:'dd696', label:<term of dd696>, value}
raw tier-2 item                  {type:'what', tipo:'dd696', label:<term>, value}
```

## Shape after (TS)

One frozen table, `WHAT_ACTIONS` (`src/core/area_maintenance/user_stats.ts`):

| code | action key (wire + stored) | label key | legacy stored tipo |
|---|---|---|---|
| 1 | `login` | `activity_login` | dd696 |
| 2 | `logout` | `activity_logout` | dd697 |
| 3 | `new` | `new` | dd695 |
| 4 | `delete` | `delete` | dd729 |
| 5 | `save` | `save` | dd700 |
| 6 | `edit` | `edit` | dd694 |
| 7 | `list` | `list` | dd693 |
| 8 | `search` | `search` | dd699 |
| 9 | `upload` | `upload` | dd1090 |
| 10 | `download` | `download` | dd1080 |
| 11 | `upload_complete` | `activity_upload_complete` | dd1094 |
| 12 | `delete_file` | `delete_file` | dd1095 |
| 13 | `recover_section` | `activity_recover_section` | dd1092 |
| 14 | `recover_component` | `activity_recover_component` | dd1091 |
| 15 | `statistics` | `activity_statistics` | dd1098 |
| 16 | `new_file_version` | `activity_new_file_version` | dd1081 |

```
stored dd1521 misc->dd1523 item  {type:'what', key:'login', value}          (no tipo, no baked label)
widget totals.what[]             {key:'login', label:getLabels(appLang).activity_login ?? 'login', value}
raw tier-2 item                  {type:'what', key:'login', value, label:<catalog text, app lang>}
```

- **Legacy read map.** A PHP-era dd1521 row is READ through the frozen
  `LEGACY_WHAT_TIPOS` (tipo → action): its `tipo` is an id in old data, never an
  ontology lookup, and its baked `label` is ignored (the reader's lang wins).
- **Label lang = APPLICATION lang** (`currentApplicationLang()`), in all three
  tiers (saved history, merge, raw tail) — never the widget's `lang` (data lang,
  `dd_component_info`), which stays for the where/publish section terms. One
  chart, one language (the pre-change code mixed data-lang history with an
  app-lang tail).
  Old and new rows of one action fold into ONE entry. An unknown legacy tipo is
  kept under its raw key, labelled with itself — never dropped, never resolved.
- **`where` / `publish` are unchanged:** their keys are real SECTION tipos and
  keep `termByTipo`.
- An unmapped what-code is still dropped (as PHP `build_what` dropped it).

## Reason

The v7 master reuses the retired label tipos (dd660-669, dd692-699 are AI-usage
nodes now), so `termByTipo('dd696')` answers whatever node owns that tipo today
— a label resolved through the ontology is a wrong label waiting to happen. The
labels engine (`src/core/labels/`, `getLabels`) is the one source of program
strings (WC-033/WC-034), translated per catalog. The ontology term resolvers now
REFUSE a `model='label'` node (`refuseLabelNode`, the leaf
`src/core/ontology/label_node_guard.ts`): a test process or a `DEDALO_DEV_MODE`
server throws `internal.invariant`; production logs once per tipo and answers the
resolver's own "no term" value, never cached. Guarded homes (production
answer for a label node): `labelByTipo` (→ `null`) and `termByTipo` (→ the tipo;
`ontologyTermLabel` rides it) in `labels.ts`, `getTermByTipo` (→ `null`) in
`resolver.ts`, `getOntologyTermLabel` (→ `''`) in `term_label.ts`,
`resolveSectionLabel` in `section/record/create_record.ts` (→ `''`: a fresh
record's metadata `label` is empty), and diffusion `sectionLabelAtoms` in
`diffusion/resolve/resolver.ts` (→ the label node's link yields NO atom — a
PUBLISHED-OUTPUT divergence, reachable only when a locator's section tipo is a
`model='label'` node, which no real section is). The authoritative list is
`TERM_READ_LEDGER` in the guard gate, whose census also ledgers every other
term-reading `dd_ontology` SQL literal in `src/` with a statically checked basis
(`full-row` = selects `model`, the consumer trusted to dispatch on it). The
client is unaffected: the
user_activity what chart is non-clickable and renders `label` (falling back to
`key`), and `normalize_totals` already reads `tipo ?? key`.

## Gate reconciliation

- `test/parity/get_widget_data_differential.test.ts` — FIXTURE-EXEMPT
  (`describe.if(hasLivePhpOracle())`, 5 skip / 0 assertions, unchanged in
  `engineering/parity_baseline.json`). Reconciled in the gate, not the fixture:
  the PHP side pins only its fossil `what` KEY (`dd694`) and value — its label
  was a label node's term and is no longer derivable from the ontology; the TS
  side pins action keys with `getLabels('lg-spa')` text. Its scratch stats row
  keeps the legacy `{tipo:'dd700', label:'Guardar'}` item, so a live run would
  exercise the legacy read. NO re-harvest, no fixture edit.
- TS-native gates: `test/unit/widget_request_native.test.ts` (stored dd1521 what
  items are `{type, key, value}`), `test/unit/user_stats_range_native.test.ts`
  (a legacy `{tipo:'dd696', label:'Entrada'}` row folds with a v7 `{key:'login'}`
  row into ONE `login` entry labelled `getLabels(appLang).activity_login` for
  lg-spa AND lg-ita, each under a different data lang; an unknown legacy tipo
  keeps its raw key),
  `test/unit/user_stats_merge_native.test.ts` (M2/M3/M3b/M3c/M5b),
  `test/unit/user_stats_interval_native.test.ts`,
  `test/unit/user_stats_paging.test.ts`,
  `test/unit/user_stats_rebuild_atomic_native.test.ts`;
  the guard: `test/unit/term_by_tipo_label_guard.test.ts`.
