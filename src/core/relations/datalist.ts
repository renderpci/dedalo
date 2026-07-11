/**
 * Relation LIST VALUES — the label strings a selection component shows in
 * list mode (PHP component_relation_common::get_list_value, backed by the
 * canonical datalist resolver component_common::get_list_of_values).
 *
 * Contract (per the datalist-resolution conventions):
 * - the DATALIST is every option of the component's target section(s):
 *   each record → {locator, label}, label = EVERY component show-ddo value
 *   joined with ' | ' (PHP implode), strnatcmp-sorted (or properties.sort_by);
 * - the LIST VALUE is the labels of the datalist entries whose locator
 *   appears in the component's stored data (matched on
 *   section_id+section_tipo) — datalist order.
 *
 * fixed_filter narrowing (PHP get_list_of_values :2860): when the built
 * request_config sqo carries fixed_filter, its FIRST group becomes the
 * option search's filter (bad format → ignored with an error log, PHP
 * parity) — the state widget's vocabulary leaves (rsc80 family) are the
 * live users. Ledgered: datalist `hide` ddo values (TS emits []);
 * properties filtered_by_search / filtered_by_search_dynamic narrowing (the
 * PHP elseif branch — no live datalist component on this install carries
 * them).
 */

import { type Locator, compareLocators } from '../concepts/locator.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../ontology/resolver.ts';
import { resolveComponentValue } from '../resolve/component_data.ts';
import { registerSectionDataListener } from '../section_record/save_event.ts';
import { buildRequestConfigForElement } from './request_config/build.ts';
import { type RequestConfigContext, extractSqoSectionTipos } from './request_config/explicit.ts';

/** One datalist option (PHP get_list_of_values result item). */
export interface DatalistItem {
	/** The option locator — PHP stores section_id as a STRING here. */
	value: { section_tipo: string; section_id: string };
	label: string;
	/** STRING too — PHP passes the pg driver's raw row value through. */
	section_id: string;
	/** ddo_map hide config per option (empty in v0 — no hide rules on these lists). */
	hide: string[];
}

/**
 * Growth bound (S3-22): each entry pins a full target-section option list per
 * (component, lang), so an unbounded Map grows with every component×lang pair
 * ever requested. On overflow BOTH maps are dropped together (the O(1) wipe of
 * the term-resolver precedent, not LRU) — clearing the list cache without its
 * section index would leave unreachable keys behind.
 */
const MAX_DATALIST_CACHE_ENTRIES = 500;

/** Per-component datalist cache (keyed tipo_lang — target lists are small + shared). */
const datalistCache = createOntologyCache<string, DatalistItem[]>();

/**
 * Populate-time index: target section tipo → the datalist cache keys built
 * from its records (S1-11). The cache key is `componentTipo_lang`, so without
 * this index a record write to a TARGET section could not be mapped back to
 * the cached option lists it staled.
 */
const datalistKeysBySection = createOntologyCache<string, Set<string>>();

export function clearDatalistCache(): void {
	datalistCache.clear();
	datalistKeysBySection.clear();
}
// Ontology-derived too (request_config/ddo resolution) — hub-cleared (S1-11 stopgap).
registerOntologyCacheClearer(clearDatalistCache);
// Data-derived: a write/delete of a TARGET section record evicts every option
// list built from that section (the durable S1-11 channel).
registerSectionDataListener((sectionTipo) => {
	const staleKeys = datalistKeysBySection.get(sectionTipo);
	if (staleKeys === undefined) return;
	for (const key of staleKeys) {
		datalistCache.delete(key);
	}
	datalistKeysBySection.delete(sectionTipo);
});

/**
 * PHP strnatcmp — the DEFAULT datalist ordering (get_list_of_values
 * "Alphabetic ascendant label"). Faithful port of the C natsort algorithm
 * (Martin Pool's strnatcmp.c, which PHP embeds): WHITESPACE IS SKIPPED
 * before each comparison step ("Petit-Aledón" sorts before "Petit 1981"),
 * digit runs compare numerically (longer run wins; leading zeros compare
 * fractionally), everything else is byte-ordered and case-SENSITIVE.
 */
export function strnatcmp(a: string, b: string): number {
	const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
	const isSpace = (ch: string): boolean => ch === ' ' || (ch >= '\t' && ch <= '\r');

	// Both runs start on digits: integer comparison — the run with MORE
	// digits is larger; equal lengths remember the first digit difference.
	const compareRight = (): number => {
		let bias = 0;
		for (; ; indexA++, indexB++) {
			const digitA = indexA < a.length && isDigit(a[indexA] as string);
			const digitB = indexB < b.length && isDigit(b[indexB] as string);
			if (!digitA && !digitB) return bias;
			if (!digitA) return -1;
			if (!digitB) return 1;
			const charA = a[indexA] as string;
			const charB = b[indexB] as string;
			if (charA < charB) {
				if (bias === 0) bias = -1;
			} else if (charA > charB) {
				if (bias === 0) bias = 1;
			}
		}
	};

	// Leading zeros: fractional comparison — first difference decides.
	const compareLeft = (): number => {
		for (; ; indexA++, indexB++) {
			const digitA = indexA < a.length && isDigit(a[indexA] as string);
			const digitB = indexB < b.length && isDigit(b[indexB] as string);
			if (!digitA && !digitB) return 0;
			if (!digitA) return -1;
			if (!digitB) return 1;
			const charA = a[indexA] as string;
			const charB = b[indexB] as string;
			if (charA < charB) return -1;
			if (charA > charB) return 1;
		}
	};

	let indexA = 0;
	let indexB = 0;
	for (;;) {
		while (indexA < a.length && isSpace(a[indexA] as string)) indexA++;
		while (indexB < b.length && isSpace(b[indexB] as string)) indexB++;
		const charA = indexA < a.length ? (a[indexA] as string) : '';
		const charB = indexB < b.length ? (b[indexB] as string) : '';

		if (charA !== '' && charB !== '' && isDigit(charA) && isDigit(charB)) {
			const result = charA === '0' || charB === '0' ? compareLeft() : compareRight();
			if (result !== 0) return result;
			continue;
		}
		if (charA === '' && charB === '') return 0;
		if (charA < charB) return -1;
		if (charA > charB) return 1;
		indexA++;
		indexB++;
	}
}

/**
 * Resolve one show-ddo's display value on a record (the datalist label atom).
 */
async function resolveDdoLabel(
	record: NonNullable<Awaited<ReturnType<typeof readMatrixRecord>>>,
	ddoTipo: string,
	lang: string,
): Promise<string> {
	const model = await getModelByTipo(ddoTipo);
	if (model === null) return '';
	const { value, fallbackValue } = await resolveComponentValue(record, ddoTipo, model, lang);
	const first = (value ?? fallbackValue)?.[0] as { value?: unknown } | undefined;
	return typeof first?.value === 'string' ? first.value : '';
}

/**
 * Build the datalist for a selection component: all records of its
 * request_config target section(s), each labeled with EVERY show-ddo value
 * joined by ' | ' (PHP get_list_of_values `implode(' | ', $ar_label)`),
 * strnatcmp-sorted by label — or by the component's `properties.sort_by`
 * custom rule when declared (path + direction, numeric-aware).
 */
export async function getDatalist(
	componentTipo: string,
	componentProperties: unknown,
	ownerSectionTipo: string,
	lang: string,
): Promise<DatalistItem[]> {
	const cacheKey = `${componentTipo}_${lang}`;
	const cached = datalistCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const context: RequestConfigContext = {
		ownerTipo: componentTipo,
		ownerSectionTipo,
		mode: 'edit', // options come from the component's EDIT config (full ddos)
		ownerIsSection: false,
		lang,
	};
	const config = await buildRequestConfigForElement(componentProperties, context);
	const mainItem = config[0];
	const targetSections = extractSqoSectionTipos(mainItem);
	// Every COMPONENT-model show ddo contributes to the label (PHP skips
	// non-component ddos with an error log).
	const labelDdos = (mainItem?.show?.ddo_map ?? []).filter(
		(ddo) => typeof ddo.model === 'string' && ddo.model.startsWith('component_'),
	);
	const items: DatalistItem[] = [];

	// PHP get_list_of_values (:2860): the FIRST fixed_filter group becomes the
	// option search's filter; a non-object entry is ignored with an error log.
	const fixedFilter = (mainItem?.sqo as { fixed_filter?: unknown[] } | undefined)?.fixed_filter;
	let filterGroup: Record<string, unknown> | undefined;
	if (Array.isArray(fixedFilter) && fixedFilter.length > 0) {
		const first = fixedFilter[0];
		if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
			filterGroup = first as Record<string, unknown>;
		} else {
			console.error(`getDatalist '${componentTipo}': ignored fixed filter, bad format`);
		}
	}

	for (const targetSection of targetSections) {
		const table = await getMatrixTableFromTipo(targetSection);
		if (table === null) continue;
		let rows: { section_id: number }[];
		if (filterGroup !== undefined) {
			// The filtered enumeration runs the REAL option search (PHP sqo
			// limit 0 = all; no principal here → projects filter skipped, the
			// resolver's standing posture).
			const { sanitizeClientSqo } = await import('../concepts/sqo.ts');
			const { buildSearchSql } = await import('../search/sql_assembler.ts');
			const sqo = sanitizeClientSqo({
				section_tipo: [targetSection],
				filter: filterGroup,
				limit: 1,
			});
			sqo.limit = 'all';
			const query = await buildSearchSql(sqo);
			const found = (await sql.unsafe(query.sql, query.params as (string | number | null)[])) as ({
				section_id: number;
			} & Record<string, unknown>)[];
			rows = found
				.map((row) => ({ section_id: row.section_id }))
				.sort((a, b) => a.section_id - b.section_id);
		} else {
			rows = (await sql.unsafe(
				`SELECT section_id FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id`,
				[targetSection],
			)) as { section_id: number }[];
		}
		for (const row of rows) {
			const labelParts: string[] = [];
			if (labelDdos.length > 0) {
				const record = await readMatrixRecord(table, targetSection, row.section_id);
				if (record !== null) {
					for (const ddo of labelDdos) {
						labelParts.push(await resolveDdoLabel(record, ddo.tipo, lang));
					}
				}
			}
			items.push({
				value: { section_tipo: targetSection, section_id: String(row.section_id) },
				label: labelParts.join(' | '),
				section_id: String(row.section_id),
				hide: [],
			});
		}
	}

	// Sort (PHP get_list_of_values): properties.sort_by custom rule when
	// declared, else natural-ascending label.
	const sortBy = (
		componentProperties as { sort_by?: { path?: string; direction?: string }[] } | null
	)?.sort_by;
	const customSort = Array.isArray(sortBy) ? sortBy[0] : undefined;
	if (customSort !== undefined) {
		const path = String(customSort.path ?? 'label');
		const descending = customSort.direction === 'DESC';
		items.sort((a, b) => {
			const valueA = (a as unknown as Record<string, unknown>)[path] ?? 0;
			const valueB = (b as unknown as Record<string, unknown>)[path] ?? 0;
			const numericA = typeof valueA === 'number' || /^\d+(\.\d+)?$/.test(String(valueA));
			const numericB = typeof valueB === 'number' || /^\d+(\.\d+)?$/.test(String(valueB));
			const diff =
				numericA && numericB
					? Number(valueA) - Number(valueB)
					: strnatcmp(String(valueA), String(valueB));
			return descending ? -diff : diff;
		});
	} else {
		items.sort((a, b) => strnatcmp(a.label, b.label));
	}
	// Store + index in ONE synchronous block (no await in between): an eviction
	// event landing mid-populate must never leave a cached list the section
	// index cannot reach (see datalistKeysBySection).
	if (datalistCache.size >= MAX_DATALIST_CACHE_ENTRIES) clearDatalistCache();
	datalistCache.set(cacheKey, items);
	for (const targetSection of targetSections) {
		let keysOfSection = datalistKeysBySection.get(targetSection);
		if (keysOfSection === undefined) {
			keysOfSection = new Set<string>();
			datalistKeysBySection.set(targetSection, keysOfSection);
		}
		keysOfSection.add(cacheKey);
	}
	return items;
}

/**
 * Resolve the label of EACH stored locator DIRECTLY (read the target
 * record's label component) — O(locators) instead of materializing the full
 * datalist (which enumerates every target-section record; unbounded
 * hierarchies reach 200K+ rows). Labels return in alphabetical order,
 * matching the datalist-ordered output of get_list_value.
 */
export async function resolveLocatorLabels(
	componentTipo: string,
	componentProperties: unknown,
	ownerSectionTipo: string,
	lang: string,
	storedLocators: { section_tipo?: unknown; section_id?: unknown }[],
): Promise<string[]> {
	if (storedLocators.length === 0) return [];
	const context: RequestConfigContext = {
		ownerTipo: componentTipo,
		ownerSectionTipo,
		mode: 'edit',
		ownerIsSection: false,
	};
	const config = await buildRequestConfigForElement(componentProperties, context);
	const labelDdo = config[0]?.show?.ddo_map[0];
	if (labelDdo === undefined) return [];
	const labelModel = await getModelByTipo(labelDdo.tipo);
	if (labelModel === null) return [];

	const labels: string[] = [];
	for (const locator of storedLocators) {
		const targetSection = String(locator.section_tipo ?? '');
		const targetId = Number(locator.section_id ?? 0);
		if (targetSection === '' || !Number.isFinite(targetId)) continue;
		const table = await getMatrixTableFromTipo(targetSection);
		if (table === null) continue;
		const record = await readMatrixRecord(table, targetSection, targetId);
		if (record === null) continue;
		const { value, fallbackValue } = await resolveComponentValue(
			record,
			labelDdo.tipo,
			labelModel,
			lang,
		);
		const first = (value ?? fallbackValue)?.[0] as { value?: unknown } | undefined;
		if (typeof first?.value === 'string' && first.value !== '') labels.push(first.value);
	}
	labels.sort(strnatcmp);
	return labels;
}

/**
 * The label strings for a component's STORED locators (PHP get_list_value):
 * datalist entries matching the stored locators, in datalist (label) order.
 */
export async function getRelationListValue(
	componentTipo: string,
	componentProperties: unknown,
	ownerSectionTipo: string,
	lang: string,
	storedLocators: { section_tipo?: unknown; section_id?: unknown }[],
): Promise<string[]> {
	const datalist = await getDatalist(componentTipo, componentProperties, ownerSectionTipo, lang);
	const labels: string[] = [];
	for (const option of datalist) {
		// Locator law (DEC-21): value-based section_tipo+section_id match via
		// compareLocators (loose section_id: 5 == '5', same as the Number()
		// coercion this replaced).
		const matched = storedLocators.some((locator) =>
			compareLocators(locator as Locator, option.value, ['section_tipo', 'section_id']),
		);
		if (matched) labels.push(option.label);
	}
	return labels;
}
