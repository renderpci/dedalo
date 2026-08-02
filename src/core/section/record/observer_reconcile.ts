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

import { sql } from '../../db/postgres.ts';
import { getMatrixTableFromTipo, getNode, getNodesWithProperty } from '../../ontology/resolver.ts';
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

/** Every (observed → observer @ host-section) tuple with the covered server shape. */
async function discoverTuples(
	onlyObserver: string | null,
	onlySection: string | null,
): Promise<ReconcileTuple[]> {
	const observedRows = await getNodesWithProperty('observers');
	const tuples: ReconcileTuple[] = [];
	const seen = new Set<string>();
	for (const observed of observedRows) {
		const specs = observed.properties?.observers;
		if (!Array.isArray(specs)) continue;
		for (const spec of specs as { section_tipo?: string; component_tipo?: string }[]) {
			const observerTipo = spec?.component_tipo;
			const hostSection = spec?.section_tipo;
			if (typeof observerTipo !== 'string' || typeof hostSection !== 'string') continue;
			if (onlyObserver !== null && observerTipo !== onlyObserver) continue;
			const key = `${observerTipo}|${hostSection}`;
			if (seen.has(key)) continue;
			const observerNode = await getNode(observerTipo);
			const properties = observerNode?.properties as {
				observe?: {
					component_tipo?: string;
					server?: {
						config?: { use_observable_dato?: boolean };
						perform?: { function?: string };
					};
				}[];
				source?: { section_to_search?: string[]; component_to_search?: string[] | string };
			} | null;
			const entry = (properties?.observe ?? []).find(
				(candidate) =>
					candidate?.component_tipo === observed.tipo || candidate?.component_tipo === 'all',
			);
			// Only the covered server shape reconciles — anything else is the
			// cascade's ledgered-skip territory, not silently swept here.
			if (
				entry?.server?.config?.use_observable_dato !== true ||
				entry.server.perform?.function !== 'set_dato_external'
			) {
				continue;
			}
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
				observedTipo: observed.tipo,
				observerTipo,
				hostSection,
				componentToSearch: typeof componentToSearch === 'string' ? componentToSearch : '',
				sectionToSearch: properties?.source?.section_to_search ?? 'all',
				sublaw,
			});
		}
	}
	// The live cascade recomputes at WHATEVER section a saved locator targets
	// (spec.section_tipo is informational) — so host sections must come from
	// the INDEX TRUTH too, not the spec list alone (review 2026-07-24: rsc387
	// targets ~20 sections on this DB, the specs name 3; spec-only discovery
	// left the rest permanently stale). Union in every target section the
	// index knows for each tuple's component_to_search.
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
	// tuples although tchi1 drift exists through the index truth).
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
