/**
 * Request-scoped TIME MACHINE READ SCOPE — that a dd15 read is in progress, and
 * which caller section's history it is scoped to
 * (`WC-2026-08-14-tm-permission-floor`, `WC-2026-08-14-tm-ddo-mode-retired`).
 *
 * WHY THIS EXISTS — two consumers, one fact.
 *
 * 1. THE PERMISSION FLOOR. dd15's columns resolve through the ordinary per-ddo
 *    authz loop, but `getPermissions(principal, parentTipo, tipo)` is given only
 *    the OWNING section (dd15) — it cannot see whose history is being read. The
 *    §7.4 grant is per CALLER SECTION (`time_machine_list` on oh1, oh25, rsc36
 *    …), and there is no parameter on the permission API to carry it.
 *
 * 2. THE `data_source === 'tm'` SIGNAL. Retiring the ddo display mode `'tm'`
 *    (every dd15 cell now emits `mode:'list'`) removes the flag that a handful
 *    of sites legitimately branched on. Most were synonyms of `'list'` and just
 *    go away, but `relations/relation_core.ts` genuinely needs to know it is
 *    rendering a Time Machine cell: the TM cell emits the flat term subdatum
 *    with NO `component_autocomplete_hi` ddinfo breadcrumb, unlike the edit
 *    widget. Threading a boolean down through the relation options to reach one
 *    `if` would touch every layer between; the fact is request-scoped, so it
 *    lives here.
 *
 * It is deliberately a SCOPE and not a module-level value: Bun is a long-lived
 * process, so "the TM read in progress" can never live at module scope without
 * bleeding into a concurrent request — the same request-isolation invariant that
 * puts the principal and the request languages in AsyncLocalStorage
 * (security/request_context.ts, resolve/request_lang.ts).
 *
 * SCOPE PRESENT vs SECTION PRESENT are different questions, and both matter:
 *   - present, section null  → the UNSCOPED bare browse. It is a TM read (so the
 *     ddinfo suppression applies), but no per-section grant can authorize a view
 *     of every section's history at once, so the floor stays global-admin only.
 *   - absent                 → not a TM read at all.
 *
 * LEAF MODULE ON PURPOSE — it imports nothing. `security/permissions.ts` and
 * `relations/relation_core.ts` read it; `section/read.ts` sets it. A shared leaf
 * is what keeps that from being an import cycle.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** What a Time Machine read publishes about itself. */
interface TimeMachineReadScope {
	/** The caller section whose history is read; null for the unscoped browse. */
	readonly callerSectionTipo: string | null;
}

const tmScopeStore = new AsyncLocalStorage<TimeMachineReadScope>();

/**
 * Run `fn` as a Time Machine read scoped to `callerSectionTipo` (null = the
 * unscoped bare browse). Always opened for a `sqo.mode === 'tm'` read, including
 * the browse — see the SCOPE PRESENT vs SECTION PRESENT note above.
 */
export function runWithTimeMachineScope<T>(callerSectionTipo: string | null, fn: () => T): T {
	return tmScopeStore.run({ callerSectionTipo }, fn);
}

/**
 * The caller section the current dd15 read is scoped to, or undefined when the
 * read is unscoped (the bare browse) or this is not a TM read at all. Both of
 * those are "no per-section grant applies", which is what the floor needs.
 */
export function currentTimeMachineScopeSection(): string | undefined {
	return tmScopeStore.getStore()?.callerSectionTipo ?? undefined;
}

/**
 * Whether a Time Machine read is in progress — the replacement for the retired
 * `mode === 'tm'` check on rendering paths (`data_source === 'tm'` in wire
 * terms). True for the bare browse too.
 */
export function isTimeMachineRead(): boolean {
	return tmScopeStore.getStore() !== undefined;
}
