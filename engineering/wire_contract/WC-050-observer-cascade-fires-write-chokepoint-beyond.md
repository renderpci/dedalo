# WC-050 — Observer cascade fires at the WRITE CHOKEPOINT (beyond-oracle broadening) (2026-07-24)

PHP fired `propagate_to_observers` only from the interactive component-save
controller. TS fires the same recompute law (`section/record/observers.ts`,
oracle-pinned byte shape) from `saveComponentData` POST-COMMIT — so EVERY
save door propagates (dispatch, `dedalo_data`/CSV import, MCP write tools,
transcription) — plus two doors that bypass the chokepoint: portal
`delete_locator` (recomputes the REMOVED locators' targets) and record
duplicate (recomputes the copied locators' targets AND the copy's own
observer-mirror slots). Deliberate divergences, all ADDITIVE (mirrors that
PHP left stale converge; no served byte shape changes): the per-write mirror
value equals what a PHP interactive re-save would have produced. Doors still
outside the cascade (`tool_propagate_component_data`, `delete_data` wipe,
`update/transform/portalize.ts`) heal via `scripts/observer_reconcile.ts`
(dry-run default; `--apply`; shrink-guarded inside the row lock).

### Gate

`test/unit/observer_native.test.ts` (dispatch door + both bypass doors,
oracle-captured mirror/relation_search goldens; suite-DB seeding via
`test/helpers/observer_term_seed.ts`) ·
`test/unit/observer_reconcile_native.test.ts` (bypass-drift dry-run/repair/
idempotence/shrink; planted-seed-gated so a live snapshot is never written).
