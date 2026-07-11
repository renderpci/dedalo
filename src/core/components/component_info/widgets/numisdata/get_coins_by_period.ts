/**
 * get_coins_by_period widget (PHP core/widgets/numisdata/get_coins_by_period).
 *
 * Grouped coin count per chronological period. The thesaurus target_sections
 * load whole; roots come from the hierarchy1 registry records pointing at
 * them; terms flatten depth-first with parent locator stamps; each qualifying
 * coin routes its period locator to the matching term (strict === on both
 * section_tipo and section_id, so a string/number type mismatch lands in the
 * '?' catch-all — PHP behavior). use_parent rolls counts up to the ancestor
 * whose hierarchy27 model is a NON-ARRAY object with the target section_id
 * (array-stored models never match — faithful to PHP is_object()).
 *
 * PHP array_filter KEY-PRESERVATION quirk: the emitted 'period' value is a
 * JSON OBJECT keyed by original index when the surviving terms are not a
 * 0-based contiguous prefix, an ARRAY otherwise. Replicated verbatim.
 */

import { sql } from '../../../../db/postgres.ts';
import { getMatrixTableFromTipo } from '../../../../ontology/resolver.ts';
import {
	type InfoWidgetDescriptor,
	type TypedInput,
	type WidgetContext,
	type WidgetItem,
	findTyped,
	readWidgetComponentData,
} from '../widget_common.ts';

interface HierarchyEntry {
	section_id: unknown;
	section_tipo: unknown;
	parent: { section_tipo?: unknown; section_id?: unknown } | null;
	label: string | null;
	count: number | null;
	model_section_id: unknown;
}

const HIERARCHY_SECTION = 'hierarchy1';
const HIERARCHY_TARGET_SECTION = 'hierarchy53';
const HIERARCHY_CHILDREN = 'hierarchy45';
const TS_CHILDREN = 'hierarchy49';
const TS_MODEL = 'hierarchy27';

async function computeGetCoinsByPeriod(
	ipo: unknown[],
	context: WidgetContext,
): Promise<WidgetItem[]> {
	const data: WidgetItem[] = [];
	for (const [key, entry] of ipo.entries()) {
		const block = entry as { input?: unknown[]; output?: { id?: string }[] };
		const input = Array.isArray(block.input) ? block.input : [];
		const output = Array.isArray(block.output) ? block.output : [];

		const source = findTyped(input, 'source');
		const period = findTyped(input, 'period') as
			| (TypedInput & {
					target_sections?: string[];
					target_model_section_id?: number | string;
					use_parent?: boolean;
			  })
			| undefined;
		const duplicated = findTyped(input, 'duplicated');
		if (duplicated === undefined || source === undefined || period === undefined) continue;
		const targetSections = period.target_sections ?? [];
		const targetModelSectionId = period.target_model_section_id ?? 0;
		const useParent = period.use_parent === true;

		// thesaurus rows (all records of every target section)
		const tsRows: {
			section_id: unknown;
			section_tipo: string;
			relation: Record<string, unknown[]> | null;
			parent?: { section_tipo?: unknown; section_id?: unknown } | null;
		}[] = [];
		for (const tsSection of targetSections) {
			const table = await getMatrixTableFromTipo(tsSection);
			if (table === null) continue;
			// (!) section_id::text — PHP's pg driver returns row values as STRINGS,
			// and the locator matching below is STRICT ===; the stored locators
			// carry string section_ids, so the rows must too.
			const rows = (await sql.unsafe(
				`SELECT section_id::text AS section_id, section_tipo, relation FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id`,
				[tsSection],
			)) as {
				section_id: unknown;
				section_tipo: string;
				relation: Record<string, unknown[]> | null;
			}[];
			tsRows.push(...rows);
		}

		// hierarchy roots: registry records whose hierarchy53 references a target section
		const orderedHierarchy: typeof tsRows = [];
		for (const tsSection of targetSections) {
			const roots = (await sql.unsafe(
				`SELECT relation->$2 AS children FROM matrix_hierarchy_main
				 WHERE section_tipo = $1
				   AND COALESCE(data->$3, string->$3)->0->>'value' = $4`,
				[HIERARCHY_SECTION, HIERARCHY_CHILDREN, HIERARCHY_TARGET_SECTION, tsSection],
			)) as { children: { section_tipo?: unknown; section_id?: unknown }[] | null }[];
			for (const root of roots) {
				for (const locator of root.children ?? []) {
					expandHierarchyChildren(tsRows, locator, null, orderedHierarchy);
				}
			}
		}

		// project to hierarchy entries with label + model
		const { buildDdInfoChain } = await import('../../../../resolve/dd_info.ts');
		void buildDdInfoChain; // (term resolution below is section_map-free: thesaurus term slice)
		const arHierarchies: HierarchyEntry[] = [];
		for (const section of orderedHierarchy) {
			const model = section.relation?.[TS_MODEL];
			const isObjectModel = model !== null && typeof model === 'object' && !Array.isArray(model);
			arHierarchies.push({
				section_id: section.section_id,
				section_tipo: section.section_tipo,
				parent: section.parent ?? null,
				label: await resolveThesaurusTerm(section.section_tipo, section.section_id, context.lang),
				count: null,
				model_section_id: isObjectModel
					? (model as { section_id?: unknown }).section_id
					: Number(targetModelSectionId) + 1,
			});
		}

		// source portal → coin id list → bulk rows
		if (source.component_tipo === undefined) continue;
		const portalData = (await readWidgetComponentData(
			source.section_tipo ?? context.sectionTipo,
			context.sectionId,
			source.component_tipo,
		)) as { section_id?: unknown }[];
		if (portalData.length === 0) return [];

		const targetComponentSectionId = findTyped(input, 'target_component_section_id');
		const coinSection = targetComponentSectionId?.section_tipo ?? '';
		const coinTable = (await getMatrixTableFromTipo(coinSection)) ?? 'matrix';
		const idList = portalData
			.map((item) => Number(item.section_id))
			.filter((id) => Number.isFinite(id));
		const coinRows = (await sql.unsafe(
			`SELECT section_id, relation FROM "${coinTable}"
			 WHERE section_tipo = $1 AND section_id = ANY($2::int[])
			 ORDER BY section_id`,
			[coinSection, `{${idList.join(',')}}`],
		)) as { section_id: unknown; relation: Record<string, unknown[]> | null }[];

		// route each coin
		let emptyPeriodCount: number | null = null;
		const periodTipo = period.component_tipo ?? '';
		const duplicatedTipo = duplicated.component_tipo ?? '';
		for (const row of coinRows) {
			const duplicatedData = (row.relation?.[duplicatedTipo] ?? []) as {
				section_id?: unknown;
			}[];
			const duplicatedFirst = duplicatedData[0];
			// PHP LOOSE == '2' here (unlike get_archive_weights' strict ===)
			if (
				duplicatedFirst !== undefined &&
				duplicatedFirst !== null &&
				String(duplicatedFirst.section_id) === '2'
			) {
				continue;
			}

			const periodData = (row.relation?.[periodTipo] ?? []) as {
				section_tipo?: unknown;
				section_id?: unknown;
			}[];
			if (periodData.length === 0) {
				emptyPeriodCount = (emptyPeriodCount ?? 0) + 1;
				continue;
			}
			for (const currentPeriod of periodData) {
				// strict === on BOTH fields (type-mismatched ids fall to catch-all)
				const tsTerm = arHierarchies.find(
					(el) =>
						el.section_tipo === currentPeriod.section_tipo &&
						el.section_id === currentPeriod.section_id,
				);
				if (tsTerm === undefined) {
					emptyPeriodCount = (emptyPeriodCount ?? 0) + 1;
					continue;
				}
				if (useParent) {
					const areaTerm = findParentWithModel(arHierarchies, tsTerm, targetModelSectionId);
					if (areaTerm === null) {
						emptyPeriodCount = (emptyPeriodCount ?? 0) + 1;
					} else {
						areaTerm.count = (areaTerm.count ?? 0) + 1;
					}
				} else {
					tsTerm.count = (tsTerm.count ?? 0) + 1;
				}
			}
		}

		// array_filter preserves keys → object when non-contiguous
		const surviving: [number, HierarchyEntry][] = [];
		arHierarchies.forEach((el, index) => {
			if (el.count !== null) surviving.push([index, el]);
		});
		const sentinel =
			emptyPeriodCount !== null
				? {
						section_id: null,
						section_tipo: null,
						parent: null,
						label: '?',
						count: emptyPeriodCount,
					}
				: null;
		let periodValue: unknown;
		const contiguous = surviving.every(([index], position) => index === position);
		if (contiguous) {
			periodValue = sentinel
				? [...surviving.map(([, el]) => el), sentinel]
				: surviving.map(([, el]) => el);
		} else {
			const asObject: Record<string, unknown> = {};
			for (const [index, el] of surviving) asObject[String(index)] = el;
			if (sentinel) {
				const nextKey = surviving.length > 0 ? Math.max(...surviving.map(([i]) => i)) + 1 : 0;
				asObject[String(nextKey)] = sentinel;
			}
			periodValue = asObject;
		}

		const computed: Record<string, unknown> = { period: periodValue };
		for (const dataMap of output) {
			const id = dataMap.id ?? '';
			data.push({
				widget: 'get_coins_by_period',
				key,
				widget_id: id,
				value: computed[id] ?? null,
			});
		}
	}
	return data;
}

/** Depth-first flatten of one locator's subtree, stamping direct parents. */
function expandHierarchyChildren(
	tsRows: {
		section_id: unknown;
		section_tipo: string;
		relation: Record<string, unknown[]> | null;
		parent?: { section_tipo?: unknown; section_id?: unknown } | null;
	}[],
	locator: { section_tipo?: unknown; section_id?: unknown },
	parent: { section_tipo?: unknown; section_id?: unknown } | null,
	out: typeof tsRows,
): void {
	const row = tsRows.find(
		(el) => el.section_tipo === locator.section_tipo && el.section_id === locator.section_id,
	);
	if (row === undefined) return;
	row.parent = parent;
	out.push(row);
	const children = (row.relation?.[TS_CHILDREN] ?? []) as {
		section_tipo?: unknown;
		section_id?: unknown;
	}[];
	for (const child of children) {
		expandHierarchyChildren(tsRows, child, locator, out);
	}
}

/** Ancestor whose model_section_id matches (int-cast compare), else null. */
function findParentWithModel(
	arHierarchies: HierarchyEntry[],
	term: HierarchyEntry,
	targetModelSectionId: number | string,
): HierarchyEntry | null {
	if (Number(term.model_section_id) === Number(targetModelSectionId)) return term;
	const parent = term.parent;
	if (parent === null || parent === undefined) return null;
	const parentTerm = arHierarchies.find(
		(el) => el.section_tipo === parent.section_tipo && el.section_id === parent.section_id,
	);
	if (parentTerm === undefined) return null;
	return findParentWithModel(arHierarchies, parentTerm, targetModelSectionId);
}

/** Thesaurus term label (PHP ts_object::get_term_by_locator): section_map term slice. */
async function resolveThesaurusTerm(
	sectionTipo: unknown,
	sectionId: unknown,
	lang: string,
): Promise<string | null> {
	const table = await getMatrixTableFromTipo(String(sectionTipo));
	if (table === null) return null;
	// Canonical (virtual-aware, cached) section_map accessor — S2-27: a raw
	// `WHERE parent = tipo` query returns nothing for a VIRTUAL thesaurus
	// section, silently falling back to hierarchy25 (wrong/empty term).
	const { getSectionMap } = await import('../../../../ontology/section_map.ts');
	const sectionMap = (await getSectionMap(String(sectionTipo))) as {
		thesaurus?: { term?: string | string[] };
	} | null;
	const declared = sectionMap?.thesaurus?.term;
	const termComponents =
		declared === undefined || declared === null
			? ['hierarchy25']
			: Array.isArray(declared)
				? declared
				: [declared];
	const rows = (await sql.unsafe(
		`SELECT string, data FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[String(sectionTipo), Number(sectionId)],
	)) as { string: Record<string, unknown[]> | null; data: Record<string, unknown[]> | null }[];
	const record = rows[0];
	if (record === undefined) return null;
	for (const component of termComponents) {
		const items = (record.string?.[component] ?? record.data?.[component] ?? []) as {
			lang?: string;
			value?: string;
		}[];
		const match = items.find((item) => item.lang === lang) ?? items[0];
		if (match?.value !== undefined && match.value !== '') return match.value;
	}
	return null;
}

export const get_coins_by_period: InfoWidgetDescriptor = {
	name: 'get_coins_by_period',
	path: '/numisdata/get_coins_by_period',
	computeData: computeGetCoinsByPeriod,
};
