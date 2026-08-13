# WC-2026-08-13-maintenance-ai-models-widget — the `ai_models` maintenance widget is TS-ONLY (no PHP twin)

- **Date:** 2026-08-13.
- **Shape before (PHP):** nothing. The frozen PHP engine had no local AI model
  store and no widget over one; its `get_ar_widgets` catalog can never contain
  this id.
- **Shape after (TS):** the maintenance catalog gains one more block,
  `id: 'ai_models'`, category `system`, label `AI models`, at the end of
  `CORE_WIDGET_MODULES`. Its eager catalog `value` (and the identical
  `get_widget_value` panel) is
  `{ store_path, store_available, hub_allowed, models[], usable_count, total_bytes }`,
  where each `models[]` row is `{ name, label, state, bytes }` and `state` is the
  `src/core/ai/model_store.ts` verdict
  (`ready` | `unverified` | `incomplete` | `damaged` | `missing`).
- **Reason:** in-browser transcription only works if the speech model is in THIS
  install's own store, and nothing in the administrator's interface said whether
  it was. A model whose download was killed mid-file reported itself installed
  and then failed inside the browser's ONNX runtime minutes later — the
  administrator's only diagnostic was a console line in someone else's browser.
  The store is a native TS subsystem (`src/core/ai/`, served at
  `/dedalo/ai_models/`) with no PHP peer, so this divergence is structural, not
  a shape choice.
- **DISPLAY-ONLY:** the widget registers NO `apiActions`. Download / verify /
  repair already exist as admin-gated actions in `tools/tool_transcription/server/`;
  the widget reports the truth and points the operator there rather than growing
  a second copy of the download machinery (and a second gate to keep right).
  Nothing new is therefore reachable from the wire, and
  `update_ownership_tripwire` has nothing to classify.
- **Gate reconciliation** (the WC-018 / WC-035 TS-only pattern):
  - `test/parity/widgets_differential.test.ts` — `ai_models` joins
    `TS_ONLY_WIDGET_IDS`, filtered out of the catalog byte-compare against the
    frozen PHP oracle.
  - `test/parity/dedalo_files_differential.test.ts` — the widget's CLIENT tree
    (`/dedalo/core/area_maintenance/widgets/ai_models/`) joins `isTsOnlyEntry`,
    the same normalization the error_reports (WC-018) and site_builder_status
    (WC-035) widgets use: the frozen PHP census can never contain these files,
    so they are filtered from BOTH sides of the set compare while the
    every-TS-url-resolves test still proves they serve.
  - TS ground truth pinned natively by
    `test/unit/ai_models_widget_native.test.ts`, which drives the pure
    `buildAiModelsPanel` (and asserts the absent `apiActions`) without touching
    the store or the tool catalog.
- **Fixture interaction (DEC-14b):** NO re-harvest. The gate filters the new id
  out of the TS side before diffing — the WC-018/WC-035 transform pattern — so
  the frozen PHP-side fixture is unchanged.
