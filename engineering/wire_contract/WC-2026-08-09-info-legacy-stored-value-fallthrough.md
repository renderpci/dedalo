# WC-2026-08-09-info-legacy-stored-value-fallthrough — a stored `component_info` array that is ENTIRELY v5 state residue is EMPTY

- **Date:** 2026-08-09 (audit `audits/2026-08_oh1_beta/REPORT.md` finding **L1**,
  the largest live-data defect of the target install).
- **Decision:** none specific; taken under the AGENTS.md hard rule that the
  server must satisfy the client's contract — the same rule and the same widget
  family as WC-026 and WC-2026-08-03-state-widget-total-source-count.
- **Shape before (PHP):** `component_info::get_db_data()`
  (`core/component_info/class.component_info.php:256`) is
  `$data = parent::get_data(); if (empty($data)) $data = $this->get_data();`,
  and `common::get_json()` sets `use_db_data = true` for every `component_info`
  in the section render path (`core/common/class.common.php:2589`). So ANY
  non-empty stored array won the emission, including the v5-era residue still
  sitting in `misc` on ~690 records of the reference install — 84 of 98
  `rsc167`, 596 of 1,026 `rsc170`, 7 of 76 `oh1`, 1 `rsc176` (census run
  read-only against `dedalo7_mht`, 2026-08-09):

      {"id":1,
       "state":{"lg-spa":{"dd203_1":[100,0],"dd203_2":[100,0]}},
       "value":null,
       "section_id":"44","section_tipo":"oh1","component_tipo":"oh23"}

  No `widget`, no `key`, no `column`, no `type`, no `widget_id`.
- **Shape after (TS):** the emit hook
  (`src/core/components/component_info/emit.ts`) keeps PHP's `empty($data)`
  verbatim for `null` and `[]`. The ONE divergence: a stored array is ALSO
  treated as empty when **every** entry is a positively identified v5 state
  blob (`isLegacyStateResidue`, `widgets/widget_common.ts`), in which case the
  read falls through to the LIVE widget compute and emits the ordinary
  `{widget,key,widget_id,value,…}` shape. Every other stored array — including
  one this engine cannot classify — is served exactly as before (WC-026
  dualisation included). The discarded value is counted as
  `component_info_legacy_stored_value` on `GET /api/v1/counters`.

  **Null case:** the live compute returns `null` when the ddo declares no
  widgets (`properties.widgets` absent/empty). A legacy-blob record on such a
  component therefore serves `entries: null` where PHP served the
  (unrenderable) blob. That is the intended end state — an unreadable shape is
  replaced by an honest absence, not by a different unreadable shape — and it
  is pinned by the `legacyEmptySource` case of the gate below.
- **The rule is a POSITIVE test for the legacy shape, not a negative test for
  the modern one** — this is the load-bearing design decision. `isLegacyStateEntry`
  requires all four discriminators: (1) none of `widget`/`key`/`widget_id`,
  the keys every client renderer selects on; (2) `value` present and `null`;
  (3) `state` a non-empty object whose every key is an `lg-` language code;
  (4) the `id`/`section_id`/`section_tipo`/`component_tipo` quartet, typed as
  the archive holds it.

  The obvious alternative — "no entry carries a `widget` tag" — was implemented
  first and is **wrong**, in the never-narrow direction: that predicate is true
  of every stored shape the engine has not enumerated, so an unclassifiable
  array would be discarded and recomputed on the strength of an absence. The
  census found exactly such a class already living in the same `misc` column
  (20 `dd477`→`dd596` arrays, `{id,value:{…}}`); they are out of reach of this
  hook only because `dd596` is `component_json`, which is an accident of the
  ontology, not an invariant. It is also true of an empty-ish or malformed
  array. A positive rule fails in the safe direction: an unrecognised variant
  of the legacy blob keeps PHP's behaviour (stored data wins) instead of being
  thrown away.

  The `tags` widget is honoured by the same rule without a special case: its
  output LEADS with the raw text-area items of its source component, which
  carry no `widget` key (`widgets/oh/tags.ts`, the PHP `$data`-reuse quirk that
  WC-026 already records) — but they carry a real `value` and no `state` map,
  so they are not legacy entries and the array is served.

  **Census basis (read-only, `dedalo7_mht`, 2026-08-09):** across every
  non-empty array under `misc` for the `component_info`/`component_state`
  columns (`rsc19`, `oh28`), all 1365 entries of the 688 untagged arrays have
  EXACTLY the key set `{component_tipo,id,section_id,section_tipo,state,value}`
  with `id` number, `value` null, the other three strings and exactly one
  `lg-` key — one shape, no variants, zero mixed arrays, and the 8 tagged
  `rsc167` arrays match none of it. So on today's archive the positive and the
  negative rule select the identical 688 arrays; the positive one additionally
  refuses to touch anything else, ever.
- **Reason:** the client selects widget items by `key`, `widget` and
  `widget_id` (`client/dedalo/core/widgets/state/js/render_list_state.js:114`
  `self.value.filter(el => el.key===i)`, then `:185` / `:355`
  `data.find(item => item.widget_id === output_item.id)`). The legacy entry
  matches none of those, so on those ~690 records the Estado/Finished component
  drew an empty or all-zero pill — the transcription / indexation / translation
  progress an oral-history archive is actually run from. The live compute for
  the same record is correct and cheap (it is the fallback PHP itself uses when
  the row is empty), and the row self-heals to the modern shape on its next
  save. **Nothing is rewritten:** this is a read-time reclassification, not a
  migration, so no curator's stored values are ever at risk — and the engine
  already never writes the live `misc` column for a `component_info`
  (`section/record/observers.ts` `recomputeInfoObserver` writes only a
  matrix_time_machine row).
- **Gate reconciliation:** TS-native gate
  `test/unit/component_info_legacy_state_native.test.ts` — real archive shapes
  (the legacy blob from `oh1`/44 + `rsc167`/1, the modern entry from
  `rsc167`/3, the untagged non-legacy array from the `dd477`→`dd596` rows) on
  scratch `rsc2` rows 900351..900356, driving the real read through
  `dispatchRqo` in both `list` and `edit` mode: legacy → live compute
  (byte-equal to a no-`misc` control record, and the blob absent from the
  wire), modern → stored value honoured, partially-modern (`tags`) → stored
  value honoured, **unclassifiable → stored value honoured**, plus the counter
  and the rule predicate itself.

  The gate is deliberately two-sided, and both sides were verified RED by
  reintroducing the defect in a detached worktree: restoring
  `value.length > 0` (the original bug) fails 4 of 8 tests with the raw blob
  visible on the wire; restoring the negative `!hasWidgetEntry` rule fails 3 of
  8, including the end-to-end unclassifiable case.

  **No re-harvest needed and none is possible**
  (`engineering/ORACLE_HARVEST.md`): the frozen store holds no
  legacy-`misc` fixture, so no replayed response changes. The read-path twin of
  this component under DEC-14b is `test/unit/info_widget_native.test.ts` (the
  differential `test/parity/info_widget_differential.test.ts` was retired to it
  — `engineering/ORACLE_HARVEST.md`); its stored case, `numisdata3`/900313,
  carries fully tagged entries and is untouched by this rule.
