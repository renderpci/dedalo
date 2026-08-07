/**
 * Observer mirror reconciliation — the shared kernel under BOTH consumers:
 * scripts/observer_reconcile.ts (CLI sweep, dry-run default) and the v6→v7
 * data-update pipeline (update/engine.ts success tail — the update writes
 * records WITHOUT the save chokepoint, so mirrors arrive stale by
 * construction; this is how dc1 §2 drifted in the first place).
 *
 * Discovery/candidates/loop semantics documented in the CLI header; the one
 * recompute law lives in ./observers.ts recomputeExternalRelation (row-locked,
 * in-lock shrink adjudication).
 */

import { incrementCounter } from '../../api/counters.ts';
import { sql } from '../../db/postgres.ts';
import { getMatrixTableFromTipo, getNode } from '../../ontology/resolver.ts';
import { entryServerBlock, getSubscriptionRegistry } from './observer_subscriptions.ts';
import { recomputeExternalRelation } from './observers.ts';

const SYSTEM_USER_ID = -1;

interface ReconcileTuple {
	observedTipo: string;
	observerTipo: string;
	hostSection: string;
	componentToSearch: string;
	sectionToSearch: string[] | 'all';
	/**
	 * Unported PHP sub-law key (`set_observed_data` / `source_overwrite`) when
	 * the observer's source carries one — the tuple is surfaced and REFUSED,
	 * never swept (Phase-0 disarm 2026-08-02): the kernel would refuse each
	 * candidate anyway (defense-in-depth), but sweeping would print one error
	 * per candidate (~9,200 for numisdata679/965) and then report the tuple as
	 * CLEAN — the false-clean that would hide the armed wipe from the operator.
	 */
	sublaw: string | null;
}

export interface ReconcileOptions {
	/** false (default) = dry run: diff + report only. */
	apply?: boolean;
	onlyObserver?: string | null;
	onlySection?: string | null;
	onlyId?: number | null;
	/** Per-record / per-tuple report lines (CLI prints, the updater logs). */
	log?: (line: string) => void;
	/** Structured per-drifted-record callback — the CENSUS channel (`--json`).
	 * Fires for every drifted record, refusals included, so a drop budget can
	 * be adjudicated by cause instead of by a single total. */
	onRecord?: (record: ReconcileRecord) => void;
}

/** One drifted record, as the census reports it. */
export interface ReconcileRecord {
	observerTipo: string;
	hostSection: string;
	sectionId: number;
	/** Stored entry count before. */
	before: number;
	/** Entry count the FULL law wants (see recomputeExternalRelation's contract). */
	after: number;
	/** Entries the law drops (0 when the record only grows). */
	dropped: number;
	/** Entries the law appends. */
	added: number;
	/** Set when the drop half was withheld — the seed was degraded. */
	seedDefects?: string[];
	/** Which kernel refusal fired, if any. */
	refusal?: 'degraded_seed' | 'big_result';
}

export interface ReconcileSummary {
	tuples: number;
	candidates: number;
	drifted: number;
	repaired: number;
	shrinksSkipped: number;
	/** Tuples refused wholesale: unported PHP sub-law (see ReconcileTuple.sublaw). */
	sublawRefused: number;
	/** Records whose persist hit the PHP >2000-reference freeze (computed, not written). */
	bigResultRefused: number;
	/** Records the law wants to shrink (drop volume's denominator). */
	droppedRecords: number;
	/** Total locators the law wants to drop across every drifted record. */
	droppedLocators: number;
	/** Records whose drop half was withheld because their seed was degraded. */
	degradedSeedRecords: number;
}

/**
 * The corpus drop budget: a dry run over the whole install must not want to
 * delete more than this. It exists so "we ran a dry run once and eyeballed it"
 * becomes a re-runnable pre-deploy check — any future change to the value law
 * that would mass-delete fails LOUDLY here instead of at the next save.
 *
 * Measured baseline 2026-08-06 (before the grow-only fail-safe was retired):
 * 22 records / 1,673 locators, every drop verified genuine (the referencing
 * records still exist but no longer point at the target).
 */
export interface ShrinkBudget {
	maxDroppedLocators: number;
	maxDroppedRecords: number;
}

/**
 * PURE budget predicate — returns the reasons the census busts its budget
 * (empty = within budget). Separated from the sweep so it is gate-testable
 * without a DB.
 */
export function exceedsShrinkBudget(summary: ReconcileSummary, budget: ShrinkBudget): string[] {
	const reasons: string[] = [];
	if (summary.droppedLocators > budget.maxDroppedLocators) {
		reasons.push(
			`droppedLocators ${summary.droppedLocators} > budget ${budget.maxDroppedLocators}`,
		);
	}
	if (summary.droppedRecords > budget.maxDroppedRecords) {
		reasons.push(`droppedRecords ${summary.droppedRecords} > budget ${budget.maxDroppedRecords}`);
	}
	// A degraded seed is never "within budget": it means the ontology is broken
	// in a way that makes the value law unanswerable for that record.
	if (summary.degradedSeedRecords > 0) {
		reasons.push(
			`${summary.degradedSeedRecords} record(s) have a DEGRADED SEED — fix the peer ontology node(s) first`,
		);
	}
	return reasons;
}

/**
 * Every (observed → observer @ host-section) tuple with the covered server
 * shape. Since Act 2 the edges come from the SUBSCRIPTION REGISTRY (the same
 * discovery the live cascade dispatches from — this used to be a third
 * hand-rolled copy of forward-only discovery): the reconciler heals exactly
 * what the cascade fires — every declared server edge, the ontology's
 * decision (reverse-only declarations included).
 */
async function discoverTuples(
	onlyObserver: string | null,
	onlySection: string | null,
): Promise<ReconcileTuple[]> {
	const registry = await getSubscriptionRegistry();
	const tuples: ReconcileTuple[] = [];
	const seen = new Set<string>();
	for (const sub of registry.edges) {
		const server = entryServerBlock(sub.entry);
		if (server === undefined) continue;
		// Only the covered server shape reconciles — anything else is the
		// cascade's ledgered-skip territory, not silently swept here.
		if (
			server.config?.use_observable_dato !== true ||
			server.perform?.function !== 'set_dato_external'
		) {
			continue;
		}
		const observerTipo = sub.observerTipo;
		// Host section from the registry's 4-step resolution (observe-entry
		// scope → forward spec → the observer's own section) — same requirement
		// as ever: no host, no tuple. But NEVER silently (never-narrow law,
		// review 2026-08-02): a covered edge with an unresolved host still
		// DISPATCHES live (its targets come from the observable data), so a
		// silent skip here would let its mirrors drift unhealed with no signal.
		// Loud + counted (the dispatch-side SQO refusal's counter); nothing
		// hits this on either current ontology — every covered edge resolves.
		const hostSection = sub.hostSection;
		if (typeof hostSection !== 'string') {
			console.error(
				`observer reconcile: covered edge '${sub.observedTipo}->${observerTipo}' has an UNRESOLVED host section — tuple skipped, mirrors NOT swept; add a section scope (section_tipo) to the observe entry`,
			);
			incrementCounter('observers_host_section_unresolved');
			continue;
		}
		if (onlyObserver !== null && observerTipo !== onlyObserver) continue;
		const key = `${observerTipo}|${hostSection}`;
		if (seen.has(key)) continue;
		const observerNode = await getNode(observerTipo);
		const properties = observerNode?.properties as {
			source?: { section_to_search?: string[]; component_to_search?: string[] | string };
		} | null;
		// Unported-sub-law detection FIRST (Phase-0 disarm 2026-08-02) so even
		// a sub-law node without component_to_search surfaces as a refused
		// tuple instead of vanishing from the report.
		const sourceValue: unknown = properties?.source;
		let sublaw: string | null = null;
		if (sourceValue !== null && typeof sourceValue === 'object') {
			for (const unportedKey of ['set_observed_data', 'source_overwrite']) {
				if (unportedKey in (sourceValue as Record<string, unknown>)) {
					sublaw = unportedKey;
					break;
				}
			}
		}
		const componentToSearchRaw = properties?.source?.component_to_search;
		const componentToSearch = Array.isArray(componentToSearchRaw)
			? componentToSearchRaw[0]
			: componentToSearchRaw;
		if (sublaw === null && typeof componentToSearch !== 'string') continue;
		seen.add(key);
		tuples.push({
			observedTipo: sub.observedTipo,
			observerTipo,
			hostSection,
			componentToSearch: typeof componentToSearch === 'string' ? componentToSearch : '',
			sectionToSearch: properties?.source?.section_to_search ?? 'all',
			sublaw,
		});
	}
	// The live cascade recomputes at WHATEVER section a saved locator targets
	// (spec.section_tipo is informational) — so host sections must come from
	// the INDEX TRUTH too, not the spec list alone (review 2026-07-24: rsc387
	// targets ~20 sections on this DB, the specs name 3; spec-only discovery
	// left the rest permanently stale). Union in every target section the
	// index knows for each tuple's component_to_search.
	//
	// This union is ALSO the intended backstop for virtual↔real section faces
	// (review 2026-08-02): a host resolved via the observer's OWN section is
	// the REAL face, while stored records may carry the VIRTUAL face
	// (numisdata282->numisdata321: host numisdata276, yet every numisdata5
	// record — all 441 — is stored under numisdata5, so the seeded tuple's
	// queries find nothing). The index rows carry the faces the records
	// actually use, so the fan-out seeds tuples at the STORED faces (measured:
	// the numisdata321 sweep discovers its tuples and drift through it). No
	// face normalization is done here on purpose — it would duplicate what the
	// index truth already supplies.
	for (const tuple of [...tuples]) {
		// Refused sub-law tuples are reported once per spec host — no index
		// fan-out (their candidates are never swept anyway).
		if (tuple.sublaw !== null) continue;
		const indexSections = (await sql.unsafe(
			'SELECT DISTINCT target_section_tipo AS s FROM matrix_relation_index WHERE from_component_tipo = $1',
			[tuple.componentToSearch],
		)) as { s: string }[];
		for (const row of indexSections) {
			const key = `${tuple.observerTipo}|${row.s}`;
			if (seen.has(key)) continue;
			seen.add(key);
			tuples.push({ ...tuple, hostSection: row.s });
		}
	}
	// --section filters LAST: a spec-listed section must still seed the union
	// (filtering inside the loops starved it — a --section tchi1 run found 0
	// tuples although tchi1 drift exists through the index truth). The match
	// is the tuple's host face VERBATIM (no virtual↔real normalization): pass
	// the face the stored records carry (e.g. numisdata5, not numisdata276).
	return onlySection === null ? tuples : tuples.filter((t) => t.hostSection === onlySection);
}

/** Referenced-target ids ∪ stored-mirror-holder ids for one tuple. */
async function candidateIds(
	tuple: ReconcileTuple,
	hostTable: string,
	onlyId: number | null,
): Promise<number[]> {
	const params: (string | number)[] = [tuple.componentToSearch, tuple.hostSection];
	let pointingFilter = '';
	if (tuple.sectionToSearch !== 'all' && Array.isArray(tuple.sectionToSearch)) {
		params.push(JSON.stringify(tuple.sectionToSearch));
		pointingFilter = ` AND section_tipo IN (SELECT jsonb_array_elements_text($${params.length}::text::jsonb))`;
	}
	const referenced = (await sql.unsafe(
		`SELECT DISTINCT target_section_id AS id FROM matrix_relation_index
		 WHERE from_component_tipo = $1 AND target_section_tipo = $2${pointingFilter}`,
		params,
	)) as { id: number }[];
	const holders = (await sql.unsafe(
		`SELECT section_id AS id FROM "${hostTable}" WHERE section_tipo = $1 AND relation ? $2`,
		[tuple.hostSection, tuple.observerTipo],
	)) as { id: number }[];
	const ids = new Set<number>();
	for (const row of [...referenced, ...holders]) ids.add(Number(row.id));
	if (onlyId !== null) {
		return ids.has(onlyId) ? [onlyId] : [];
	}
	return [...ids].sort((a, b) => a - b);
}

export async function reconcileObserverMirrors(
	options: ReconcileOptions = {},
): Promise<ReconcileSummary> {
	const apply = options.apply === true;
	const log = options.log ?? ((): void => {});
	const onRecord = options.onRecord ?? ((): void => {});
	const summary: ReconcileSummary = {
		tuples: 0,
		candidates: 0,
		drifted: 0,
		repaired: 0,
		shrinksSkipped: 0,
		sublawRefused: 0,
		bigResultRefused: 0,
		droppedRecords: 0,
		droppedLocators: 0,
		degradedSeedRecords: 0,
	};
	const tuples = await discoverTuples(options.onlyObserver ?? null, options.onlySection ?? null);
	summary.tuples = tuples.length;
	for (const tuple of tuples) {
		if (tuple.sublaw !== null) {
			// Honest reporting of the wipe-armed nodes (Phase-0 disarm
			// 2026-08-02): one REFUSED line + a summary count — never "0 drifted"
			// for a tuple whose law is not even runnable.
			summary.sublawRefused++;
			log(
				`- ${tuple.observerTipo} @ ${tuple.hostSection} (← ${tuple.observedTipo}): REFUSED — properties.source.${tuple.sublaw} is an UNPORTED PHP sub-law; candidates not swept, stored mirrors left as-is (see observers.ts Phase-0 disarm)`,
			);
			continue;
		}
		const hostTable = await getMatrixTableFromTipo(tuple.hostSection);
		if (hostTable === null) {
			log(
				`- ${tuple.observerTipo} @ ${tuple.hostSection}: SKIP (no matrix table — section not provisioned)`,
			);
			continue;
		}
		const ids = await candidateIds(tuple, hostTable, options.onlyId ?? null);
		summary.candidates += ids.length;
		let drifted = 0;
		let shrinksSkipped = 0;
		for (const id of ids) {
			// ONE call per candidate: in apply mode the adjudication happens
			// INSIDE the row lock — no diff-then-apply TOCTOU window. The kernel
			// applies the FULL law (2026-08-06); the only drop it withholds is one
			// whose seed it knows was degraded.
			const outcome = await recomputeExternalRelation(
				tuple.observerTipo,
				tuple.hostSection,
				id,
				SYSTEM_USER_ID,
				new Date(),
				{ write: apply },
			);
			if (!outcome.changed) continue;
			drifted++;
			const isShrink = outcome.after < outcome.before;
			// Census: drop volume comes from the kernel's MEMBERSHIP counts, never
			// from `before - after`. A value-law regression that drops N genuine
			// locators and appends N wrong ones has an equal length — a length
			// delta reports 0 and sails through the budget, which is precisely the
			// shape the budget exists to catch. The kernel adjudicates membership
			// (that is why a 1-drop+1-add swap commits both halves), so the census
			// must read the same numbers it did.
			const droppedHere = outcome.dropped ?? Math.max(0, outcome.before - outcome.after);
			const addedHere = outcome.added ?? Math.max(0, outcome.after - outcome.before);
			if (droppedHere > 0) {
				summary.droppedRecords++;
				summary.droppedLocators += droppedHere;
			}
			if (outcome.seedDefects !== undefined) summary.degradedSeedRecords++;
			onRecord({
				observerTipo: tuple.observerTipo,
				hostSection: tuple.hostSection,
				sectionId: id,
				before: outcome.before,
				after: outcome.after,
				dropped: droppedHere,
				added: addedHere,
				...(outcome.seedDefects !== undefined ? { seedDefects: outcome.seedDefects } : {}),
				...(outcome.refusedBigResult === true
					? ({ refusal: 'big_result' } as const)
					: outcome.skippedShrink === true
						? ({ refusal: 'degraded_seed' } as const)
						: {}),
			});
			if (outcome.refusedBigResult === true) {
				// PHP >2000-reference freeze: the kernel computed the diff but
				// persisted nothing — never count it as repaired (a refused record
				// reported clean is the sub-law lesson all over again).
				summary.bigResultRefused++;
				log(
					`  ${tuple.hostSection} §${id} ${tuple.observerTipo}: ${outcome.before} → ${outcome.after} entrie(s) [>2000-reference FREEZE — ${apply ? 'not written' : 'an apply would refuse'}]`,
				);
				continue;
			}
			if (outcome.skippedShrink === true) {
				// DEGRADED SEED — the only remaining shrink escape. Additions HAVE
				// been applied (in apply mode); the drop half is withheld because
				// this record's seed could not be built completely. Not fixable by
				// a flag: fix the ontology the defects name, then re-run.
				shrinksSkipped++;
				log(
					`  ${tuple.hostSection} §${id} ${tuple.observerTipo}: ${outcome.before} → ${outcome.after} entrie(s) [SHRINK held — DEGRADED SEED: ${(outcome.seedDefects ?? []).join(', ')}; grows applied]`,
				);
				continue;
			}
			if (apply) summary.repaired++;
			log(
				`  ${tuple.hostSection} §${id} ${tuple.observerTipo}: ${outcome.before} → ${outcome.after} entrie(s)${isShrink ? ' [shrink]' : ''}${apply ? ' [repaired]' : ''}`,
			);
		}
		summary.drifted += drifted;
		summary.shrinksSkipped += shrinksSkipped;
		log(
			`- ${tuple.observerTipo} @ ${tuple.hostSection} (← ${tuple.observedTipo}): ${ids.length} candidate(s), ${drifted} drifted${shrinksSkipped > 0 ? ` (${shrinksSkipped} shrink(s) skipped)` : ''}${apply ? ', repaired' : ''}`,
		);
	}
	return summary;
}
