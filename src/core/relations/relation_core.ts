/**
 * RELATION CORE — the shared engine of the relation family
 * (RELATIONS_SPEC.md §2/§5): stored-locator paging, per-locator target
 * expansion through the child ddos, nested recursion, dataframe slot
 * emission, and the outer-subdatum re-stamp bookkeeping. Every model
 * resolver (relations/models/*) builds its particularity on these. The
 * emission protocol (items array + nested-stamp ledger) is the EXPLICIT
 * per-read EmissionContext (resolve/component_data.ts, S2-29) — no module
 * state.
 *
 * PHP references: component_portal_json.php + common::get_subdatum
 * (class.common.php:2254, child re-stamp :2792-2799), dataframe branch +
 * frame json (trait.dataframe_common.php:395).
 *
 * The code here is the strangler-fig extraction of section/read.ts'
 * expandPortal/emitDataframeItem — semantics unchanged, dispatch inverted:
 * child recursion goes through the `emitDdo` callback (the generic emission
 * path) handed in by the caller, so this module never imports read_rows.
 */

import type { Ddo } from '../concepts/ddo.ts';
import { dataframeEntryMatches } from '../concepts/subdatum.ts';
import type { MatrixRecord } from '../db/matrix.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import { getMatrixTableFromTipo, getModelByTipo, getNode } from '../ontology/resolver.ts';
import { type DataItem, type EmissionContext, buildDataItem } from '../resolve/component_data.ts';
import type { EmitDdoFn } from './registry.ts';

/** List-cell locator page size (PHP portal list mode paginates the cell to 1). */
export const PORTAL_LIST_LIMIT = 1;

/** Options steering one portal expansion (see call sites for the flow rules). */
export interface ExpandPortalOptions {
	childRowFromTarget?: boolean;
	/** resolve_data only: stamp parent_section_id on entry-carrying children. */
	stampParentSectionId?: boolean;
	/** Full config ddo map for RECURSIVE descendant resolution. */
	descendantsMap?: Ddo[];
	/** The REQUEST lang for translatable children (portals are nolan). */
	childrenLang?: string;
	/** Effective list-config page limit (show.sqo_config.limit ?? sqo.limit). */
	cellLimit?: number | null;
	/** Children came from the component's OWN config (not the client map). */
	ownConfig?: boolean;
	/** Nesting depth (cycle guard for list-cell recursion). */
	depth?: number;
	/** Page offset (the get_data pagination rqo's sqo.offset). */
	offset?: number;
	/**
	 * Component get_data / save-echo ddinfo shape (PHP component get_json):
	 * bare {tipo,section_id,section_tipo,value,parent} — no row stamps, chain
	 * ends at the root term (no trailing hierarchy label). Byte-diffed vs the
	 * oracle on rsc92/fr1 (2026-07-09).
	 */
	ddinfoBare?: boolean;
}

/**
 * Portal subdatum expansion (PHP component_portal_json.php + get_subdatum):
 * emit the portal's own item (paginated locator slice + pagination stamp),
 * then expand each paginated locator's target record through the child ddos.
 * Child items are stamped row_section_id = locator.section_id and
 * parent_tipo = the portal tipo (class.common.php :2792-2799).
 */
export async function expandPortal(
	record: MatrixRecord,
	portalDdo: Ddo,
	model: string,
	childDdos: Ddo[],
	portalMode: string,
	portalLang: string,
	row: { section_tipo: string; section_id: number },
	callerTipo: string,
	emission: EmissionContext,
	emitDdo: EmitDdoFn,
	options: ExpandPortalOptions = {},
): Promise<void> {
	// component_alias data key (WC-020): an alias's locators live in the
	// TARGET's relation slot; its stored model + effective config come from
	// the alias module (merged properties).
	const { resolveDataTipo, getEffectivePropertiesByTipo, getTargetStoredModel } = await import(
		'../ontology/alias.ts'
	);
	const portalDataTipo = await resolveDataTipo(portalDdo.tipo);
	const locators =
		((record.columns.relation as Record<string, unknown[]> | null)?.[portalDataTipo] as Record<
			string,
			unknown
		>[]) ?? [];

	// EMPTY relation components emit NO data item at all (PHP portal_json:
	// the item push sits inside the `if data_value non-empty` guard :163).
	if (locators.length === 0) return;

	// LIST/TM cell page size: the ddo-declared limit (rsc139→5 in rsc368's
	// map) wins, then the component's EFFECTIVE list-config limit
	// (numisdata161→15, rsc860→1000, numisdata20→30, section_list-substituted
	// numisdata163→1), then the 1-locator cell (autocomplete_hi with no config
	// shows all its locators inline). Edit uses the ddo limit or default 10.
	const storedModel = (await getTargetStoredModel(portalDdo.tipo)) ?? model;
	const effectiveProperties = await getEffectivePropertiesByTipo(portalDdo.tipo);
	// EDIT limit chain (PHP calculate_default_limit + sync_pagination_from_config):
	// ddo/rqo limit → own request_config sqo.limit ?? show.sqo_config.limit
	// (LAST config item wins) → the component+edit heuristic default 10.
	const ownEditLimit = (): number | undefined => {
		const rawConfig = (
			effectiveProperties as {
				source?: {
					request_config?: {
						sqo?: { limit?: unknown };
						show?: { sqo_config?: { limit?: unknown } };
					}[];
				};
			} | null
		)?.source?.request_config;
		if (!Array.isArray(rawConfig)) return undefined;
		let resolved: number | undefined;
		for (const item of rawConfig) {
			const candidate = item?.sqo?.limit ?? item?.show?.sqo_config?.limit;
			if (typeof candidate === 'number') resolved = candidate;
		}
		return resolved;
	};
	const limit =
		portalMode === 'list' || portalMode === 'tm'
			? (portalDdo.limit ??
				options.cellLimit ??
				(storedModel === 'component_autocomplete_hi' ? locators.length : PORTAL_LIST_LIMIT))
			: (portalDdo.limit ?? ownEditLimit() ?? 10);
	// PHP get_data_paginated stamps paginated_key = index + offset on each item;
	// the get_data pagination rqo pages with sqo.offset.
	const pageOffset = options.offset ?? 0;
	const page: Record<string, unknown>[] = locators
		.slice(pageOffset, limit > 0 ? pageOffset + limit : undefined)
		.map((locator, index) => ({ ...locator, paginated_key: index + pageOffset }));

	// The portal's own data item: paginated locators + pagination info.
	// PHP re-stamps portal-descendant items in the OUTER section subdatum
	// (class.common.php :2792-2799 runs on the portal's whole element_json):
	// parent_tipo = the SECTION tipo and row_section_id = the outer record.
	const portalItem = buildDataItem(
		portalDdo.tipo,
		row.section_tipo,
		row.section_id,
		portalMode,
		'lg-nolan', // relation components are not translatable
		page,
	);
	portalItem.pagination = { total: locators.length, limit, offset: pageOffset };
	portalItem.parent_tipo = callerTipo;
	portalItem.parent_section_id = row.section_id;
	portalItem.row_section_id = row.section_id;
	emission.items.push(portalItem);

	// Expand each paginated locator through the child ddos (record-major).
	for (const locator of page) {
		const targetSectionTipo = locator.section_tipo as string;
		// PHP keeps the locator's raw section_id type (often a string).
		const targetSectionId = locator.section_id as number | string;
		const targetTable = await getMatrixTableFromTipo(targetSectionTipo);
		if (targetTable === null) continue;
		const targetRecord = await readMatrixRecord(
			targetTable,
			targetSectionTipo,
			Number(targetSectionId),
		);
		if (targetRecord === null) continue;

		// Resolve each child through the SHARED emission path (full model-family
		// logic — relations/media/selects inside a portal render correctly). The
		// items are collected here so the outer-subdatum re-stamp (PHP
		// :2792-2799) can rewrite from_component_tipo/parent_tipo/row_section_id.
		const before = emission.items.length;
		// Keep the locator's RAW id type — components instantiated from a
		// locator inherit its string form (PHP get_subdatum passes it as-is;
		// the dd560 frame's section_id "17976" is the pinned case).
		const targetRow = {
			section_tipo: targetSectionTipo,
			section_id: targetSectionId as number,
		};
		const descendantsMap = options.descendantsMap ?? childDdos;
		// LIST-cell subdatum recurses into nested portals' OWN configs (PHP goes
		// bibliography → reference → author, three levels); get_data/resolve_data
		// stay one level (their gates pinned the PHP depth). Cycle-guarded.
		const depth = options.depth ?? 0;
		// PHP recursion is STRUCTURAL: nested portals re-enter portal_json in
		// EVERY mode. LIST/TM keep the ownConfig gate (their effective config
		// is the substituted section_list map); EDIT portals always recurse —
		// a nested portal with declared grandchildren uses the parent-map
		// slice (childDdos filtering), otherwise its OWN config (PHP injected
		// request_config precedence, class.common.php:2603-2681). depth<4 is
		// the pragmatic cycle guard.
		const allowNestedOwnConfig =
			depth < 4 &&
			(portalMode === 'edit' ||
				((portalMode === 'list' || portalMode === 'tm') && options.ownConfig === true));
		for (const childDdo of childDdos) {
			// PHP get_subdatum groups child ddos BY section_tipo and expands only
			// the ones compatible with the current locator's target (numisdata97
			// declares numisdata33 → skipped at an object1 target). 'self' and
			// undeclared section_tipos pass (they resolve to the portal targets).
			const declaredSection = childDdo.section_tipo;
			if (
				declaredSection !== undefined &&
				declaredSection !== 'self' &&
				(Array.isArray(declaredSection)
					? !declaredSection.includes(targetSectionTipo)
					: declaredSection !== targetSectionTipo) &&
				(await getModelByTipo(childDdo.tipo)) !== 'component_dataframe'
			) {
				continue;
			}
			// component_dataframe ddos pair with the MAIN record (never the
			// locator target): route to the frame emitter (PHP get_subdatum's
			// dataframe branch — section_id = the caller's record, id_key = the
			// locator's item id).
			if ((await getModelByTipo(childDdo.tipo)) === 'component_dataframe') {
				await emitDataframeItem(
					childDdo,
					record,
					portalDdo.tipo,
					(locator.id as number | string | undefined) ?? (locator.section_id as number | string),
					childDdo.mode ?? portalMode,
					row,
					options.childrenLang ?? portalLang,
					callerTipo,
					emission,
					depth,
					emitDdo,
				);
				continue;
			}
			await emitDdo(
				childDdo,
				descendantsMap, // full map → grandchildren resolve by parent chain
				targetRecord,
				targetRow,
				'list',
				options.childrenLang ?? portalLang,
				callerTipo,
				emission,
				allowNestedOwnConfig,
				depth + 1,
			);
		}
		// ddinfo: the HIERARCHY widget (component_autocomplete_hi) appends each
		// thesaurus target's ancestor-breadcrumb item after the term children
		// (PHP dd_info — parent chain + hierarchy label). Plain autocompletes
		// with thesaurus targets (numisdata34 → object1) do NOT emit it.
		// The TM record-snapshot list renders the flat term subdatum only — PHP's
		// service_time_machine cell emits no ddinfo breadcrumb (verified against
		// the live oracle), unlike the edit widget.
		if (
			options.ownConfig === true &&
			storedModel === 'component_autocomplete_hi' &&
			portalMode !== 'tm'
		) {
			const { buildDdInfoChain, isThesaurusTarget } = await import('../resolve/dd_info.ts');
			if (await isThesaurusTarget(targetSectionTipo)) {
				// ddinfoBare (the component get_data / save-echo surface, PHP
				// component get_json → get_subdatum → get_ddinfo_parents): the item
				// carries ONLY {tipo, section_id, section_tipo, value, parent} — no
				// row stamps — and the chain ends at the ROOT TERM (no trailing
				// hierarchy label). Byte-diffed vs the oracle on rsc92/fr1
				// (2026-07-09). The section-read portal cell keeps the stamped,
				// label-terminated shape.
				const ddInfoItem = {
					tipo: 'ddinfo',
					section_id: targetSectionId,
					section_tipo: targetSectionTipo,
					value: await buildDdInfoChain(
						targetSectionTipo,
						targetSectionId,
						options.childrenLang ?? portalLang,
						options.ddinfoBare !== true,
					),
					parent: portalDdo.tipo,
				} as unknown as DataItem;
				if (options.ddinfoBare !== true) {
					(ddInfoItem as Record<string, unknown>).row_section_id = row.section_id;
					(ddInfoItem as Record<string, unknown>).parent_tipo = callerTipo;
				}
				emission.markStamped(ddInfoItem);
				emission.items.push(ddInfoItem);
			}
		}
		for (let i = before; i < emission.items.length; i++) {
			const childItem = emission.items[i] as DataItem;
			if (emission.isStamped(childItem)) {
				// The BARE ddinfo (component get_data / save echo) carries no row
				// stamps at all — PHP get_ddinfo_parents emits exactly
				// {tipo, section_id, section_tipo, value, parent} (byte-diffed
				// 2026-07-09); skip the anchor/parent rewrite entirely.
				if (options.ddinfoBare === true && childItem.tipo === 'ddinfo') {
					continue;
				}
				// A deeper expansion already fixed this item's identity — PHP keeps
				// the NESTED creating portal's from_component_tipo; only the row
				// anchor and outward parent rewrite.
				childItem.row_section_id = options.childRowFromTarget
					? childItem.row_section_id
					: row.section_id;
				childItem.parent_tipo = callerTipo;
				continue;
			}
			childItem.from_component_tipo = portalDdo.tipo; // the CREATING portal (PHP :2684)
			childItem.section_id = targetSectionId; // keep the locator's raw type
			// get_data children belong to the OUTER record; resolve_data children
			// (injected locators, no outer record) belong to their TARGET.
			childItem.row_section_id = options.childRowFromTarget ? targetSectionId : row.section_id;
			// parent_section_id on children is FLOW-specific (both pinned live):
			// resolve_data (search chips) stamps it on ENTRY-CARRYING children —
			// PHP's !empty($value) test, i.e. a non-empty entries array (since
			// WC-001 unified empty entries on [], a null check would stamp
			// every child); get_data does NOT — there it is portal-item
			// decoration only (nested portal items carry it from their OWN
			// expansion). The authentic-capture replay + resolve_data gates pin
			// both sides.
			if (
				options.stampParentSectionId === true &&
				Array.isArray(childItem.entries) &&
				childItem.entries.length > 0
			) {
				childItem.parent_section_id = targetSectionId;
			}
			childItem.parent_tipo = callerTipo;
			emission.markStamped(childItem);
		}
	}
}

/**
 * component_dataframe slot (PHP get_subdatum's dataframe branch + the frame's
 * own json): the frame pairs with the MAIN record — entries are the main
 * record's relation[frameTipo] dd490 locators matching this main component
 * and the paired item id (id_key), paged by the frame's OWN config limit.
 * Emitted even when empty (entries [], total 0 — numisdata1447). The frame's
 * config children (rsc1246 mode edit) resolve at each paired entry's target,
 * stamped from_component_tipo = the frame.
 */
export async function emitDataframeItem(
	frameDdo: Ddo,
	mainRecord: MatrixRecord,
	mainComponentTipo: string,
	pairId: number | string,
	frameModeIn: string,
	row: { section_tipo: string; section_id: number },
	requestLang: string,
	callerTipo: string,
	emission: EmissionContext,
	depth: number,
	emitDdo: EmitDdoFn,
): Promise<void> {
	const { resolveFrameConfig } = await import('../section/list_definitions/section_list.ts');
	const frame = await resolveFrameConfig(frameDdo.tipo);
	// The frame bag lives on the record of the ddo's DECLARED section_tipo
	// (PHP builds the component_dataframe instance with the ddo's scalar
	// section_tipo + the caller's section_id). Components shared across
	// sections may anchor their frames on a SIBLING record: numisdata75 in a
	// numisdata3 read stores its numisdata1531/1532 frames on the numisdata4
	// record with the SAME section_id. 'self'/undeclared reads the main record.
	let bagRecord: MatrixRecord | null = mainRecord;
	const declaredFrameSection = Array.isArray(frameDdo.section_tipo)
		? frameDdo.section_tipo[0]
		: frameDdo.section_tipo;
	if (
		typeof declaredFrameSection === 'string' &&
		declaredFrameSection !== 'self' &&
		declaredFrameSection !== mainRecord.section_tipo
	) {
		const frameTable = await getMatrixTableFromTipo(declaredFrameSection);
		bagRecord =
			frameTable === null
				? null
				: await readMatrixRecord(frameTable, declaredFrameSection, Number(row.section_id));
	}
	// component_alias data key (WC-020) — uniformity; no live alias targets a frame.
	const { resolveDataTipo: resolveFrameDataTipo } = await import('../ontology/alias.ts');
	const bag =
		((bagRecord?.columns.relation as Record<string, unknown[]> | null)?.[
			await resolveFrameDataTipo(frameDdo.tipo)
		] as
			| {
					id_key?: number | string;
					main_component_tipo?: string;
					section_tipo?: string;
					section_id?: number | string;
			  }[]
			| undefined) ?? [];
	const matched = bag.filter((entry) => dataframeEntryMatches(entry, mainComponentTipo, pairId));
	const page = matched.slice(0, frame.limit).map((entry, index) => ({
		...entry,
		paginated_key: index,
	}));

	const item = buildDataItem(
		frameDdo.tipo,
		// Frame ddos are caller-scoped: a single declared section (never a
		// multi-target array) or the host row's section.
		(Array.isArray(frameDdo.section_tipo) ? frameDdo.section_tipo[0] : frameDdo.section_tipo) ??
			row.section_tipo,
		row.section_id,
		frameModeIn,
		'lg-nolan',
		page, // [] when empty — the frame item ALWAYS emits
	);
	item.pagination = { total: matched.length, limit: frame.limit, offset: 0 };
	item.from_component_tipo = mainComponentTipo;
	// The pairing context rides ON the frame item (PHP: the caller-aware
	// component_dataframe instance stamps its dataframe_caller onto the data
	// item — id_key as INT + the main component; the resolve_data empty-slot
	// items pinned the same shape).
	item.id_key = Number(pairId);
	item.main_component_tipo = mainComponentTipo;
	item.row_section_id = row.section_id;
	item.parent_tipo = callerTipo;
	emission.markStamped(item);
	emission.items.push(item);

	// Frame children at each paired target (frame config modes AS DECLARED).
	for (const entry of page) {
		const targetSection = entry.section_tipo;
		const targetId = entry.section_id;
		if (typeof targetSection !== 'string' || targetId === undefined) continue;
		const table = await getMatrixTableFromTipo(targetSection);
		if (table === null) continue;
		const targetRecord = await readMatrixRecord(table, targetSection, Number(targetId));
		if (targetRecord === null) continue;
		for (const child of frame.ddos) {
			// Frame config children default to LIST mode (dd1715); declared modes
			// pass through (rsc1246 edit).
			const childMode = child.mode ?? 'list';
			const before = emission.items.length;
			await emitDdo(
				{
					tipo: child.tipo,
					section_tipo: targetSection,
					parent: frameDdo.tipo,
					mode: childMode,
					lang: child.lang,
				} as Ddo,
				[],
				targetRecord,
				{ section_tipo: targetSection, section_id: Number(targetId) },
				childMode,
				requestLang,
				callerTipo,
				emission,
				false,
				depth + 1,
			);
			for (let i = before; i < emission.items.length; i++) {
				const childItem = emission.items[i] as DataItem;
				childItem.from_component_tipo = frameDdo.tipo;
				childItem.section_id = targetId; // keep the entry's raw id type
				childItem.row_section_id = row.section_id;
				childItem.parent_tipo = callerTipo;
				(childItem as DataItem & { parent?: string }).parent = frameDdo.tipo;
				emission.markStamped(childItem);
			}
		}
	}
}
