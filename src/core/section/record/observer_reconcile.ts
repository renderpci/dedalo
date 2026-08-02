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
	/** Apply recomputes that DROP entries (default false — held for review). */
	allowShrink?: boolean;
	onlyObserver?: string | null;
	onlySection?: string | null;
	onlyId?: number | null;
	/** Per-record / per-tuple report lines (CLI prints, the updater logs). */
	log?: (line: string) => void;
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
	const allowShrink = options.allowShrink === true;
	const log = options.log ?? ((): void => {});
	const summary: ReconcileSummary = {
		tuples: 0,
		candidates: 0,
		drifted: 0,
		repaired: 0,
		shrinksSkipped: 0,
		sublawRefused: 0,
		bigResultRefused: 0,
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
			// ONE call per candidate: in apply mode the shrink adjudication
			// happens INSIDE the row lock (allowShrink) — no diff-then-apply
			// TOCTOU window.
			const outcome = await recomputeExternalRelation(
				tuple.observerTipo,
				tuple.hostSection,
				id,
				SYSTEM_USER_ID,
				new Date(),
				{ write: apply, allowShrink },
			);
			if (!outcome.changed) continue;
			drifted++;
			const isShrink = outcome.after < outcome.before;
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
				// Grow-only kernel semantics: any additions HAVE been applied (in
				// apply mode); only the drop half is held for --allow-shrink.
				shrinksSkipped++;
				log(
					`  ${tuple.hostSection} §${id} ${tuple.observerTipo}: ${outcome.before} → ${outcome.after} entrie(s) [SHRINK held — grows applied, drops need --allow-shrink]`,
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
