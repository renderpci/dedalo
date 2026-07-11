/**
 * Standalone-ownership gate (UPDATE_PROCESS Phase 0) — COLLAPSED AT CUTOVER.
 *
 * 2026-07-11 (PHP-freeze cutover, rewrite/CUTOVER_RUNBOOK.md §4): the PHP
 * engine is retired and this TS engine is the single writer, so the
 * coexistence question the gate answered ("does a PHP install own the
 * surfaces the update/move EXECUTEs mutate?") no longer exists. Per the
 * ledgered removal condition (rewrite/COEXISTENCE.md history, UPDATE_PROCESS
 * Phase 0 row) the gate collapses to `true`.
 *
 * What deliberately SURVIVES the collapse:
 *  - the per-action ownership CLASSIFICATION (widgets/support.ts gated() /
 *    engineDenied() marks) and its totality tripwire
 *    (test/unit/update_ownership_tripwire.test.ts) — every maintenance
 *    EXECUTE still declares what it mutates, and denied-by-design actions
 *    stay denied;
 *  - this chokepoint function: every gated EXECUTE still routes through it,
 *    so a future ownership condition (e.g. multi-instance deployments) has
 *    one place to land.
 *
 * The coexistence-era double condition (TS install seal AND the
 * DEDALO_ENGINE_OWNS_INSTALL opt-in) is deleted with the PHP engine.
 */

/** Does this TS engine own the install? Always, since the 2026-07-11 cutover. */
export function engineOwnsInstall(): boolean {
	return true;
}
