/**
 * Server-side observers (PHP component_common::propagate_to_observers →
 * update_observer_data): when an OBSERVED component saves, its declared
 * observers recompute. Coverage (measured on this ontology):
 *   - 58/66 observer configs are CLIENT-only (no `server` key) → nothing to
 *     do on the server;
 *   - the dominant server config is {config:{use_observable_dato}, perform:
 *     set_dato_external} — the hierarchy93 ← rsc387 family: the observer
 *     component AT EACH TARGET of the saved data recomputes its EXTERNAL
 *     value = every record referencing the target through
 *     properties.source.component_to_search, order-preserved (existing
 *     entries kept in place, new ones appended with the next item id —
 *     PHP-oracle-verified byte shape);
 *   - component_info observers (incl. the component_state/calculation
 *     aliases) — 2026-07-10, oracle-verified on scratch twins: BOTH server
 *     shapes recompute the widgets. `filter:{SQO}` (numisdata595/oh87 — the
 *     observed component lives on ANOTHER section) fills every clause's q
 *     with the saved record's locator (+ from_component_tipo from the
 *     clause's last path step) and searches the observer's section for the
 *     referencing records; `filter:false` (rsc19/test180/numisdata1125 —
 *     same-record observers) targets the saved record itself. Per target
 *     PHP writes ONE matrix_time_machine row (lg-nolan, the computed live
 *     shape) and — measured, deliberate — does NOT touch the live misc
 *     column (stored misc values are LEGACY; live reads fall back to live
 *     compute). Targets equal to the saved record additionally ride the
 *     save response's data array (mode 'list', the client refresh);
 *   - other `server.filter` + perform shapes remain LEDGERED (logged skip,
 *     never guessed).
 */

import { sql } from '../../db/postgres.ts';
import { recordTimeMachine } from '../../db/time_machine.ts';
import { getMatrixTableFromTipo, getNode } from '../../ontology/resolver.ts';
import {
	auditDateItem,
	auditUserLocator,
	dbTimestamp,
} from '../../section/record/create_record.ts';

interface ObserverSpec {
	section_tipo?: string;
	component_tipo?: string;
}

interface ObserveEntry {
	component_tipo?: string;
	server?: {
		filter?: unknown;
		config?: { use_observable_dato?: boolean; use_self_section?: boolean };
		perform?: { function?: string; params?: Record<string, unknown> };
	};
}

interface StoredLocator {
	id?: number;
	type?: string;
	section_id?: number | string;
	section_tipo?: string;
	from_component_tipo?: string;
	[key: string]: unknown;
}

/**
 * Fires the server-side observers of a just-saved component. Never throws.
 * Returns the recomputed observer DATA ITEMS whose target IS the saved
 * record (PHP observers_data — merged into the save response so the
 * actively-edited record's info widget refreshes client-side).
 */
export async function propagateToObservers(
	observedTipo: string,
	sectionTipo: string,
	sectionId: number,
	savedItems: unknown[],
	userId: number,
	now: Date = new Date(),
): Promise<unknown[]> {
	const observersData: unknown[] = [];
	try {
		const observedNode = await getNode(observedTipo);
		const specs = (observedNode?.properties as { observers?: ObserverSpec[] } | null)?.observers;
		if (!Array.isArray(specs) || specs.length === 0) return observersData;

		// The saved data's target locators (the observable data).
		const targets = (savedItems as StoredLocator[]).filter(
			(item) =>
				item !== null &&
				typeof item === 'object' &&
				typeof item.section_tipo === 'string' &&
				item.section_id !== undefined,
		);

		const done = new Set<string>(); // observerTipo|targetKey dedup across specs
		for (const spec of specs) {
			const observerTipo = spec.component_tipo;
			if (typeof observerTipo !== 'string') continue;
			const observerNode = await getNode(observerTipo);
			const observeEntries = (observerNode?.properties as { observe?: ObserveEntry[] } | null)
				?.observe;
			const entry = (observeEntries ?? []).find(
				(candidate) =>
					candidate?.component_tipo === observedTipo || candidate?.component_tipo === 'all',
			);
			const server = entry?.server;
			if (server === undefined) continue; // client-only observer (most of them)

			const performFunction = server.perform?.function;
			const useObservable = server.config?.use_observable_dato === true;

			// component_info observers (incl. the state/calculation aliases):
			// recompute the widgets per target + TM row; same-record targets
			// ride the save response (see header — oracle-verified 2026-07-10).
			const { getModelByTipo } = await import('../../ontology/resolver.ts');
			const { getComponentModel } = await import('../../components/registry.ts');
			const observerModel = await getModelByTipo(observerTipo);
			const isInfoObserver =
				observerModel !== null &&
				(observerModel === 'component_info' ||
					getComponentModel(observerModel)?.alias === 'component_info');
			if (isInfoObserver && performFunction === undefined) {
				observersData.push(
					...(await recomputeInfoObserver(
						observerTipo,
						spec.section_tipo,
						server,
						sectionTipo,
						sectionId,
						userId,
						now,
					)),
				);
				continue;
			}

			// DEFAULT branch, filter:false → PHP re-saves the observer on the
			// changed record. ORACLE-VERIFIED NO-OP for the hi family on this
			// install (an rsc36 save leaves rsc860's relation_search untouched —
			// pinned in the observer differential), so TS matches the no-op.
			if (performFunction === undefined && server.filter === false) {
				continue;
			}

			if (!useObservable || performFunction !== 'set_dato_external') {
				console.error(
					`observer '${observerTipo}' ← '${observedTipo}': server shape not covered (ledgered)`,
					{ perform: performFunction, hasFilter: server.filter !== undefined },
				);
				continue;
			}
			const observableTargets = [...targets];
			if (server.config?.use_self_section === true) {
				observableTargets.push({ section_tipo: sectionTipo, section_id: sectionId });
			}
			for (const target of observableTargets) {
				const key = `${observerTipo}|${target.section_tipo}|${target.section_id}`;
				if (done.has(key)) continue;
				done.add(key);
				await recomputeExternalRelation(
					observerTipo,
					String(target.section_tipo),
					Number(target.section_id),
					userId,
					now,
				);
			}
		}
	} catch (error) {
		console.error('observer propagation failed (swallowed):', error);
	}
	return observersData;
}

/**
 * component_info observer recompute (PHP update_observer_data for a
 * use_db_data=false compute component — oracle-verified on scratch twins
 * 2026-07-10): resolve the target records, recompute the widgets per target,
 * write ONE matrix_time_machine row each (lg-nolan, the computed live
 * shape), NEVER touch the live misc column, and return the response data
 * item for targets equal to the saved record.
 */
async function recomputeInfoObserver(
	observerTipo: string,
	specSectionTipo: string | undefined,
	server: NonNullable<ObserveEntry['server']>,
	savedSectionTipo: string,
	savedSectionId: number,
	userId: number,
	now: Date,
): Promise<unknown[]> {
	// targets
	const targets: { sectionTipo: string; sectionId: number }[] = [];
	const filter = server.filter;
	if (filter !== undefined && filter !== false && typeof filter === 'object' && filter !== null) {
		// PHP: every clause's q := the saved record's locator, with
		// from_component_tipo taken from the FIRST clause's last path step (the
		// portal/relation the observer's section references the record through).
		const mutated = structuredClone(filter) as Record<
			string,
			{ q?: unknown; path?: { component_tipo?: string }[] }[]
		>;
		const firstKey = Object.keys(mutated)[0];
		const clauses = firstKey !== undefined ? mutated[firstKey] : undefined;
		if (!Array.isArray(clauses) || clauses.length === 0 || clauses[0] === undefined) {
			console.error(`observer '${observerTipo}': no elements in server.filter (PHP parity skip)`);
			return [];
		}
		const firstPath = clauses[0].path;
		const fromComponentTipo = Array.isArray(firstPath)
			? firstPath[firstPath.length - 1]?.component_tipo
			: undefined;
		const qLocator: Record<string, unknown> = {
			section_tipo: savedSectionTipo,
			section_id: String(savedSectionId),
		};
		if (fromComponentTipo !== undefined) qLocator.from_component_tipo = fromComponentTipo;
		for (const clause of clauses) {
			clause.q = qLocator;
		}
		const searchSection = specSectionTipo ?? savedSectionTipo;
		const { sanitizeClientSqo } = await import('../../concepts/sqo.ts');
		const { buildSearchSql } = await import('../../search/sql_assembler.ts');
		const sqo = sanitizeClientSqo({
			section_tipo: [searchSection],
			filter: mutated,
			limit: 1,
		});
		sqo.limit = 'all'; // PHP set_limit(0) = every referencing record
		const query = await buildSearchSql(sqo);
		const rows = (await sql.unsafe(query.sql, query.params as (string | number | null)[])) as ({
			section_tipo: string;
			section_id: number;
		} & Record<string, unknown>)[];
		for (const row of rows) {
			targets.push({ sectionTipo: row.section_tipo, sectionId: Number(row.section_id) });
		}
	} else {
		// filter:false — the observer lives on the SAME record that changed
		targets.push({ sectionTipo: savedSectionTipo, sectionId: savedSectionId });
	}

	const { computeInfoWidgets } = await import(
		'../../components/component_info/widgets/registry.ts'
	);
	const { normalizeWidgetEntryKeys } = await import(
		'../../components/component_info/widgets/widget_common.ts'
	);
	const { currentDataLang } = await import('../../resolve/request_lang.ts');
	const { currentPrincipal } = await import('../../security/request_context.ts');
	const principal = currentPrincipal();

	const responseItems: unknown[] = [];
	for (const target of targets) {
		const items = await computeInfoWidgets(observerTipo, {
			sectionTipo: target.sectionTipo,
			sectionId: target.sectionId,
			mode: 'list',
			lang: currentDataLang(),
			userId: principal?.userId ?? userId,
			isAdmin: principal?.isGlobalAdmin,
		});
		// TM row — the computed live shape (lg-nolan; PHP writes one per save;
		// the live misc column is deliberately NOT touched, matching PHP).
		await recordTimeMachine(
			{
				sectionTipo: target.sectionTipo,
				sectionId: target.sectionId,
				componentTipo: observerTipo,
				lang: 'lg-nolan',
				userId,
				data: items !== null && items.length > 0 ? items : null,
			},
			dbTimestamp(now),
		);
		// same-record target → the save response carries the recomputed item
		// (PHP observers_data; section_id STRING as PHP emits it here)
		if (target.sectionTipo === savedSectionTipo && target.sectionId === savedSectionId) {
			responseItems.push({
				section_id: String(target.sectionId),
				section_tipo: target.sectionTipo,
				tipo: observerTipo,
				mode: 'list',
				lang: 'lg-nolan',
				from_component_tipo: observerTipo,
				entries: normalizeWidgetEntryKeys(items ?? []),
			});
		}
	}
	return responseItems;
}

/**
 * set_dato_external's default path: the component's data := every record
 * referencing (targetSection, targetId) through source.component_to_search,
 * limited to source.section_to_search — existing entries kept in stored
 * order, new references appended with the next item id.
 */
async function recomputeExternalRelation(
	observerTipo: string,
	targetSection: string,
	targetId: number,
	userId: number,
	now: Date,
): Promise<void> {
	const node = await getNode(observerTipo);
	const source = (
		node?.properties as {
			source?: { section_to_search?: string[]; component_to_search?: string[] | string };
		} | null
	)?.source;
	const sectionToSearch = source?.section_to_search ?? 'all';
	const componentToSearchRaw = source?.component_to_search;
	const componentToSearch = Array.isArray(componentToSearchRaw)
		? componentToSearchRaw[0]
		: componentToSearchRaw;
	if (typeof componentToSearch !== 'string') return;

	const table = await getMatrixTableFromTipo(targetSection);
	if (table === null) return;
	const rows = (await sql.unsafe(
		`SELECT relation->$3 AS bag FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[targetSection, targetId, observerTipo],
	)) as { bag: StoredLocator[] | null }[];
	if (rows.length === 0) return; // target record does not exist
	const existing = rows[0]?.bag ?? [];

	const { findInverseReferences } = await import('../../search/search_related.ts');
	const references = await findInverseReferences(
		[
			{
				section_tipo: targetSection,
				section_id: targetId,
				from_component_tipo: componentToSearch,
			},
		],
		{ sectionTipos: sectionToSearch as string[] | 'all', limit: false, order: 'section_id' },
	);

	const referenceKeys = new Set(
		references.map((row) => `${row.section_tipo}|${String(row.section_id)}`),
	);
	// Keep existing entries still referenced, in stored order.
	const finalData: StoredLocator[] = existing.filter((entry) =>
		referenceKeys.has(`${entry.section_tipo}|${String(entry.section_id)}`),
	);
	const presentKeys = new Set(
		finalData.map((entry) => `${entry.section_tipo}|${String(entry.section_id)}`),
	);
	// Append new references with the next item ids (PHP save id assignment).
	let nextId = existing.reduce((max, entry) => Math.max(max, Number(entry?.id ?? 0)), 0) + 1;
	for (const reference of references) {
		const key = `${reference.section_tipo}|${String(reference.section_id)}`;
		if (presentKeys.has(key)) continue;
		presentKeys.add(key);
		finalData.push({
			id: nextId++,
			type: 'dd151',
			section_id: String(reference.section_id),
			section_tipo: reference.section_tipo,
			from_component_tipo: observerTipo,
		});
	}

	// No change → no write (PHP re-saves anyway; we skip the no-op to avoid
	// TM noise — the stored VALUE converges either way).
	if (JSON.stringify(finalData) === JSON.stringify(existing)) return;

	const { persistRecordKeys } = await import('../../section_record/index.ts');
	const stamp = dbTimestamp(now);
	const history = (await sql.unsafe(
		`SELECT 1 FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND lang = 'lg-nolan' LIMIT 1`,
		[targetSection, targetId, observerTipo],
	)) as unknown[];
	if (history.length === 0) {
		await recordTimeMachine(
			{
				sectionTipo: targetSection,
				sectionId: targetId,
				componentTipo: observerTipo,
				lang: 'lg-nolan',
				userId,
				data: existing.length > 0 ? existing : null,
			},
			dbTimestamp(new Date(now.getTime() - 60_000)),
		);
	}
	await recordTimeMachine(
		{
			sectionTipo: targetSection,
			sectionId: targetId,
			componentTipo: observerTipo,
			lang: 'lg-nolan',
			userId,
			data: finalData.length > 0 ? finalData : null,
		},
		stamp,
	);
	// Chokepoint write: observer value + the owner's modified stamps (dd197/
	// dd201) in ONE update, like every PHP component save.
	await persistRecordKeys(
		{ table, sectionTipo: targetSection, sectionId: targetId },
		[{ column: 'relation', key: observerTipo, value: finalData.length > 0 ? finalData : [] }],
		{ userId, now },
	);
}
