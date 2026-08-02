# WC-2026-08-03-state-widget-total-source-count — the state widget's `total` item carries `items`

- **Date:** 2026-08-03 (state widget edit-mode restyle; the breakdown panel
  disagreed with its own cell on a multi-resource record).
- **Decision:** none specific; taken under the AGENTS.md hard rule that the
  server must satisfy the client's contract (the WC-026 precedent — the same
  widget family, the same failure mode: a payload the client cannot render
  truthfully).
- **Shape before (PHP):** `class.state.php` emits one `total` item per column
  per output id:
  `{widget:'state', key, widget_id, lang:'lg-nolan', value, column, type:'total'}`.
  The value is `round((sum / n) / count($ar_locator), 2)` — `n` = project-lang
  count for a translatable leaf, else 1. **The divisor is not emitted.**
- **Shape after (TS):** the same item plus a trailing `items` key holding that
  source-locator count (`arLocator.length`), i.e.
  `{…, type:'total', items:2}`. `detail` items are untouched. Emitter:
  `src/core/components/component_info/widgets/state/state.ts` (the output
  assembly loop).
- **Reason:** a source record with nothing saved contributes 0 to the average
  but emits NO detail item, so the client saw one detail of 50% under a total of
  25% with nothing in the payload to reconcile them. Verified on `oh1`/74 and
  `oh1`/3 (2026-08-03): record 3 has two audiovisuals, one transcribed at
  `dd501/2` (50%) — the widget rendered `Indexación · estado de validación 25%`
  whose hover panel said `total : 50%`, two different numbers both labelled
  total. With `items` the client pads the breakdown to one row per source
  record, so the missing resource shows as its own `0%` row and the average is
  self-evident (`client/dedalo/core/widgets/state/js/render_edit_state.js`
  `build_detail_container`). Additive only: every existing key keeps its value
  and its position, so a consumer that ignores `items` is unaffected.
- **Gate reconciliation:** `test/parity/get_widget_data_differential.test.ts`
  strips `items` from the TS `total` items before diffing the envelope triple
  (the WC-001 pattern — transform, do not re-harvest). **No re-harvest needed**,
  and none is possible (`engineering/ORACLE_HARVEST.md`): the frozen fixture
  keeps the PHP shape, and the gate's own normalizer absorbs the divergence.
  The strip is TS-side only and asserts the key exists on at least one total
  item, so the field cannot silently disappear.
