# WC-2026-09-03-maintenance-reconcile-status-widget — the `reconcile_status` maintenance widget is TS-ONLY (no PHP twin)

- **Date:** 2026-09-03, with the S-10 remediation of the 2026-08-26 deep audit
  (every cross-store reconcile registered in ONE registry, `src/core/reconcile/`).
- **Decision:** DEC-12 (the registry is tripwired: `reconcile_registry_tripwire`
  derives the census of reconcile-shaped modules; `reconcile_registry_native`
  drives every definition on the suite DB). The widget is the maintenance
  door onto that registry; this entry records that the door is a catalog
  divergence from the oracle, in the WC-018 / WC-035 /
  WC-2026-08-13-maintenance-ai-models-widget TS-only pattern.
- **Shape before (PHP):** nothing. The frozen PHP engine had no reconcile
  registry — each repair lived in its own tool or script (`tool_update_cache`,
  the media repair scripts, the observer sweep) — so its `get_ar_widgets`
  catalog can never contain this id.
- **Shape after (TS):** the maintenance catalog gains one block,
  `id: 'reconcile_status'`, category `integrity`, label `Reconcile`
  (literal, the `counters_status` precedent), registered in
  `src/core/area_maintenance/widgets/registry.ts`. Its eager `value` is
  `{ reconciles: [...] }`, one row per registered `ReconcileDefinition`:
  `{ name, description, stores: [a, b], schedule, auto_apply, scope_label,
  last_run }` where `last_run` is the registry's outcome record or `null`.
  ONE API action, `run_reconcile({ name, apply?: boolean, scope?: string[] })`,
  dry by default: it returns `{ data: true, msg, extend: { report, record,
  reconciles } }` or `{ data: false, msg }` for an unknown name (nothing is
  run). Classified `ENGINE_NATIVE` in `update_ownership_tripwire`.
- **Reason:** the audit found the engine's reconciles scattered across five
  shapes with no place that listed them, so an operator could not know which
  pair of stores had been checked and which never had. The registry is a
  native TS subsystem with no PHP peer; the widget is its only interactive
  door (the CLI `scripts/reconcile.ts` and the `reconcile` ops gauge are the
  other two), so the divergence is structural, not a shape choice.
- **Gate reconciliation** (the WC-018 / WC-035 / ai_models TS-only pattern):
  - `test/parity/widgets_differential.test.ts` — `reconcile_status` joins
    `TS_ONLY_WIDGET_IDS`, filtered out of the catalog byte-compare against the
    frozen PHP oracle. No re-harvest needed and none is possible.
  - `test/parity/dedalo_files_differential.test.ts` — the widget's CLIENT tree
    (`/dedalo/core/area_maintenance/widgets/reconcile_status/`) joins
    `isTsOnlyEntry`, filtered from both sides of the set compare while the
    every-TS-url-resolves test still proves it serves.
  - TS ground truth: `test/unit/reconcile_registry_native.test.ts` (the widget
    lists exactly the registry, refuses an unknown name with `data: false`
    without running; `media_index` APPLY through the registry heals) and
    `test/unit/reconcile_registry_tripwire.test.ts` (the widget is registered
    with only `run_reconcile`, dry by default).
