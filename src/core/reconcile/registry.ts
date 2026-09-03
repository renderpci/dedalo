/**
 * RECONCILE REGISTRY — the ONE shape every cross-store reconcile takes
 * (audit 2026-08-26 S-10).
 *
 * THE DEFECT THIS CLOSES. Dédalo keeps several derived or paired stores next to
 * the matrix: the media tree, the `files_info` disk cache inside the media
 * column, observer mirror slots, the RAG vector index, the publication marker
 * store, the `dd_ontology` projection of its source records, the hierarchy
 * registry's provisioning. Each pair can drift (a restore, a bypass write, a
 * crash between two commits), and each had grown its OWN reconcile — a widget
 * action here, a CLI there, a boot fire-and-forget, an injected callback —
 * with no common way to LIST them, RUN them dry, or SEE their last verdict.
 * An operator on restore day had to know seven doors.
 *
 * WHAT THIS IS. A registry of `ReconcileDefinition`s. Each owner module keeps
 * its logic untouched and exports ONE definition: what it compares, how it is
 * scheduled, and a `run({apply})` that reports drift without writing (the
 * default) or repairs it. The registry remembers the last run per name and
 * publishes them as ONE ops gauge (`reconcile` on GET /api/v1/counters). The
 * doors are then generic: the `reconcile_status` maintenance widget,
 * `scripts/reconcile.ts`, and the boot/interval scheduler (scheduler.ts).
 *
 * The census gate (test/unit/reconcile_registry_tripwire.test.ts) derives every
 * reconcile-shaped module in the tree and demands it be registered here with
 * every facet, or sit in a shrink-only exemption with a reason — so an eighth
 * reconcile cannot land as an eighth shape.
 *
 * SHRINK-ONLY: `REGISTERED_NAMES` below is the closed set the assembly
 * (catalog.ts) must produce; `registerReconcile` refuses a name outside it, so a
 * new reconcile is a deliberate edit here AND a catalog entry, never a drive-by.
 */

import { registerOpsGauge } from '../api/counters.ts';
import { DedaloError } from '../errors/dedalo_error.ts';

/**
 * When a reconcile runs by itself.
 *  - `operator`: only when an operator asks (widget/CLI). The default for
 *    anything that walks a large store or repairs destructively.
 *  - `boot`: once, after the server listens (cheap hygiene).
 *  - `{ everyMs }`: on an interval while the server lives.
 */
export type ReconcileSchedule = 'operator' | 'boot' | { everyMs: number };

/** The scope a run may be narrowed to — per definition (see `scopeLabel`). */
export type ReconcileScope = readonly string[];

export interface ReconcileRunOptions {
	/** false (default everywhere) = dry run: report drift, write nothing. */
	apply: boolean;
	/** Narrow the run (definition-specific; `scopeLabel` says what a value is). */
	scope?: ReconcileScope;
}

export interface ReconcileReport {
	/** Units of disagreement found between the two stores (0 = in sync). */
	drift: number;
	/** Units repaired by THIS run (always 0 on a dry run). */
	applied: number;
	/** The owner's own report — whatever its consumers already read. */
	detail: Record<string, unknown>;
}

export interface ReconcileDefinition {
	/** Stable identifier — the widget/CLI/gauge key. */
	name: string;
	/** The two stores compared, in the owner's words. Must differ. */
	stores: readonly [string, string];
	/** One operator sentence: what drift means here and what apply does. */
	description: string;
	/** What a `scope` entry is (a section tipo, a TLD, …); null when unscopable. */
	scopeLabel: string | null;
	schedule: ReconcileSchedule;
	/**
	 * A SCHEDULED run applies rather than reports. Only for a repair that is
	 * pure hygiene (idempotent, non-destructive) — say why.
	 */
	autoApply?: { reason: string };
	/** The repo-relative modules this definition wraps (owner + shells) — the census maps hits through it. */
	sources: readonly string[];
	run(options: ReconcileRunOptions): Promise<ReconcileReport>;
}

/** The last outcome the registry saw for one definition. */
export interface ReconcileRunRecord {
	name: string;
	apply: boolean;
	scope: ReconcileScope | null;
	ranAt: string;
	durationMs: number;
	drift: number;
	applied: number;
	/**
	 * Set when the run threw: the DedaloError CODE (or `internal.unexpected`
	 * for an untyped throw) — never the exception text, which goes to the log.
	 * drift/applied are then 0 and meaningless.
	 */
	error: string | null;
}

/**
 * The CLOSED set of registered reconciles (shrink/grow deliberately, with the
 * catalog). Order = the widget/CLI listing order.
 */
export const REGISTERED_NAMES: readonly string[] = [
	'counters_media',
	'files_info',
	'observer_mirrors',
	'media_index',
	'rag_index',
	'ontology',
	'hierarchy',
];

// Process-lifetime registry state (module_state_tripwire allowlisted): the
// definitions are boot-stable wiring, the run records are ops visibility — the
// same lifecycle as core/api/counters.ts gaugeProviders.
const definitions = new Map<string, ReconcileDefinition>();
const lastRuns = new Map<string, ReconcileRunRecord>();

/** Register one definition. Idempotent per name (same object re-registered = no-op). */
export function registerReconcile(definition: ReconcileDefinition): void {
	validateDefinition(definition);
	const existing = definitions.get(definition.name);
	if (existing !== undefined && existing !== definition) {
		throw new DedaloError('internal.invariant', {
			message: `reconcile '${definition.name}' registered twice with different definitions`,
		});
	}
	definitions.set(definition.name, definition);
	ensureGauge();
}

/** The facet contract, enforced at registration so a half definition cannot hide. */
export function validateDefinition(definition: ReconcileDefinition): void {
	const problems: string[] = [];
	if (!REGISTERED_NAMES.includes(definition.name)) {
		problems.push(`name '${definition.name}' is not in REGISTERED_NAMES (registry.ts)`);
	}
	if (definition.stores.length !== 2 || definition.stores[0] === definition.stores[1]) {
		problems.push('stores must name two DIFFERENT stores');
	}
	if (definition.description.trim() === '') problems.push('description is empty');
	if (definition.sources.length === 0) problems.push('sources is empty');
	if (typeof definition.run !== 'function') problems.push('run is not a function');
	const schedule = definition.schedule;
	if (
		schedule !== 'operator' &&
		schedule !== 'boot' &&
		!(typeof schedule === 'object' && Number.isFinite(schedule.everyMs) && schedule.everyMs > 0)
	) {
		problems.push('schedule must be operator | boot | {everyMs > 0}');
	}
	if (definition.autoApply !== undefined && definition.autoApply.reason.trim() === '') {
		problems.push('autoApply needs a reason');
	}
	if (problems.length > 0) {
		throw new DedaloError('internal.invariant', {
			message: `reconcile definition '${definition.name}' is incomplete: ${problems.join('; ')}`,
		});
	}
}

/** Every registered definition, in REGISTERED_NAMES order. */
export function listReconciles(): ReconcileDefinition[] {
	return REGISTERED_NAMES.flatMap((name) => {
		const definition = definitions.get(name);
		return definition === undefined ? [] : [definition];
	});
}

export function getReconcile(name: string): ReconcileDefinition | null {
	return definitions.get(name) ?? null;
}

/** The last run record per name (null when it never ran in this process). */
export function lastReconcileRun(name: string): ReconcileRunRecord | null {
	return lastRuns.get(name) ?? null;
}

/**
 * Run one reconcile through the registry, so the outcome (or the failure) is
 * remembered and published. Rethrows after recording — a caller must still
 * see its error.
 */
export async function runReconcile(
	name: string,
	options: ReconcileRunOptions,
): Promise<{ report: ReconcileReport; record: ReconcileRunRecord }> {
	const definition = definitions.get(name);
	if (definition === undefined) {
		throw new DedaloError('resource.not_found', {
			message: `reconcile '${name}' is not registered`,
			coordinates: { reconcile: name },
		});
	}
	const startedAt = Date.now();
	const base = {
		name,
		apply: options.apply,
		scope: options.scope ?? null,
		ranAt: new Date(startedAt).toISOString(),
	};
	try {
		const report = await definition.run(options);
		const record: ReconcileRunRecord = {
			...base,
			durationMs: Date.now() - startedAt,
			drift: report.drift,
			applied: report.applied,
			error: null,
		};
		lastRuns.set(name, record);
		return { report, record };
	} catch (error) {
		// The gauge is a wire surface: record the CODE, log the text.
		console.error(`[reconcile] ${name} (${options.apply ? 'apply' : 'dry'}) failed:`, error);
		lastRuns.set(name, {
			...base,
			durationMs: Date.now() - startedAt,
			drift: 0,
			applied: 0,
			error: error instanceof DedaloError ? error.code : 'internal.unexpected',
		});
		throw error;
	}
}

/** The gauge payload: per registered name, its schedule and last run. */
export function reconcileGauge(): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const definition of listReconciles()) {
		const last = lastRuns.get(definition.name) ?? null;
		out[definition.name] = {
			schedule: definition.schedule,
			auto_apply: definition.autoApply !== undefined,
			last_run_at: last?.ranAt ?? null,
			last_apply: last?.apply ?? null,
			last_drift: last?.drift ?? null,
			last_applied: last?.applied ?? null,
			last_error: last?.error ?? null,
		};
	}
	return out;
}

let gaugeRegistered = false;
function ensureGauge(): void {
	if (gaugeRegistered) return;
	gaugeRegistered = true;
	registerOpsGauge('reconcile', reconcileGauge);
}

/** Tests only: forget run records (definitions stay — they are wiring). */
export function resetReconcileRunsForTests(): void {
	lastRuns.clear();
}
