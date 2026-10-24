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

## Addendum 2026-10-21 — four more rows; who may APPLY is on the row; a refused APPLY is never `perm.*`

- **Rows.** The registry grew (publication-host phases 4–6, ontology identifiers): the
  listing now carries `ontology_identifiers`, `publication_apis`, `media_copy` and
  `publication_probe` too — still exactly `REGISTERED_NAMES`, in its order.
- **Shape after (TS).** Every row gains three keys, derived by the registry
  (`src/core/reconcile/registry.ts` `applyPolicyOf` / `applyPolicyReason`) and computed
  for the requesting principal:
  `apply: 'admin' | 'root' | 'refused'` (`'root'` = the definition declares
  `applyRootOnly` — `media_copy`; `'refused'` = it declares `applyRefused` —
  `publication_apis`, whose code push has its own root-only door),
  `apply_reason: string | null` (the declared reason; null for `'admin'`) and
  `can_apply: boolean` (THIS viewer may apply it through the widget). The client renders
  APPLY only when `can_apply` is true; otherwise a disabled APPLY whose title says why.
- **`run_reconcile` outcomes** (besides `{data:true,…}` / `{data:false,msg}`):
  an APPLY of an `applyRefused` definition fails `request.invalid` (public message:
  `The '<name>' reconcile cannot be applied here: <reason>`), for every principal, root
  included, before anything runs and with no run recorded; an APPLY of an `applyRootOnly`
  definition by a non-root principal still fails `perm.denied` — a request no rendered
  button sends any more (the row said `can_apply: false`). Before, `publication_apis`
  answered `perm.denied` from inside its run, and both reached the client's
  `no_access_page` policy from a button the listing offered.
- **Reason.** A refusal at the level of one button must not take the maintenance page
  away (CORE_POLICY: `perm.*` → no-access page), and a button that can never succeed
  must not be offered. Where the policy is declared (the definition) is now where every
  door reads it.
- **Gate reconciliation.** TS-only widget (no oracle shape; no re-harvest).
  `test/unit/reconcile_apply_policy_native.test.ts` (P1–P5: the facet contract, the
  derivation, the registry refusal before `run`, the row keys per viewer, root's
  refused APPLY = `request.invalid`); `reconcile_registry_tripwire` (only
  `publication_apis` declares `applyRefused`); `publication_host_api_reconcile` (the
  direct call refuses `request.invalid`).
