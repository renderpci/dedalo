# WC-2026-08-10-maintenance-catalog-fail-soft — one failing widget value no longer takes the whole maintenance dashboard down

- **Date:** 2026-08-10 (UNCOVERED_COVERAGE_PLAN §4.3.3 / §4.4 D1 — a defect fix,
  shipped with its gate).
- **Decision:** DEC-12 gate: `test/unit/widget_registry_failsoft_native.test.ts`
  (drives the catalog through the module-list seam with a rejecting
  `eagerValue`; the real zero-arg catalog is never built in a test — see
  §4.4 D2 / the `checkSequences` header).

### Shape before (PHP)

`area_maintenance::get_ar_widgets` (`class.area_maintenance.php:415` for
`sequences_status`, and the same pattern for the other eager blocks) computes
several widget values INLINE while assembling the catalog, with no try/catch.
A throwing computation escapes `get_ar_widgets`, so the maintenance area's
`get_data` answers an error envelope and **no dashboard is served at all** —
the failing widget takes its ~30 healthy siblings with it.

### Shape before (TS, until 2026-08-10)

Byte-identical in effect, and for the same reason. `getMaintenanceWidgets`
(`src/core/area_maintenance/widgets/registry.ts`) awaited
`module.eagerValue?.()` directly inside the catalog loop despite a docstring
that already claimed "fail-soft — a widget value failure must never break the
dashboard read". The claim was never mechanised: one rejecting `eagerValue`
rejected the whole catalog build.

### Shape after (TS)

Each eager value is computed through a per-widget try/catch. On a rejection the
widget joins the catalog with

```json
{ "id": "<widget id>", "value": null, "…": "unchanged" }
```

and every other widget — including those ORDERED AFTER the failure — keeps its
real computed value. The failure is reported once per widget on the server
(`[area_maintenance] widget eager value failed, serving null widget=<id>`,
CONVENTIONS §1: degraded, never silent).

`value: null` is deliberately NOT a new shape: it is exactly what a widget with
no `eagerValue` has always served, so the client's existing rendering path
covers it with no change. An error-object `value` WOULD have been a new wire
shape, and the panel-load `get_widget_value` door still reports the real
failure when the operator opens that widget.

### Reason

The eager values are precisely the DB-touching ones — `checkSequences`,
`lock_components`' active-lock read, `publication_api`'s diffusion scan,
`check_config`'s connection probe. The failure mode therefore arrives on a
DEGRADED installation, which is the exact moment the operator needs the
dashboard that would let them repair it. A recovery surface that disappears
when anything is wrong is not a recovery surface.

### Gate reconciliation

No parity gate moves. `test/parity/widgets_differential.test.ts` compares the
catalog on the HAPPY path (every `eagerValue` resolves), where this change is a
no-op, and no oracle fixture records a widget-failure catalog — the frozen store
never captured one, and a re-harvest is impossible by definition
(engineering/ORACLE_HARVEST.md). **No re-harvest needed.** The divergence is
confined to the failure path, and it is asserted natively by the DEC-14b gate
named above.
