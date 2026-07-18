/**
 * SECTION READ pipeline — the TS re-expression of dd_core_api::build_json_rows'
 * 'search' action for SECTION reads (spec §3.2 read flow).
 *
 * PHP references: class.dd_core_api.php build_json_rows (:2022-2641),
 * sections_json.php (row builder + envelope), section_json.php,
 * common::get_subdatum (:2254).
 *
 * CONTRACT (header re-dated 2026-07-07, S2-45 — coverage-state lists live in
 * rewrite/STATUS.md, never here):
 * - readSection returns the FULL {context[], data[]} pair (PHP
 *   build_json_rows shape): structure context (section entry first, then one
 *   per resolved ddo, deduplicated by context_key) + record-major /
 *   ddo-minor data items stamped with row_section_id + parent_tipo;
 *   data[0] is the sections envelope
 *   {typo:'sections', tipo, section_tipo:[], entries:[locators]}.
 * - the request's own show.ddo_map drives resolution when present (the PHP
 *   stage-1 build_request_config_from_rqo short-circuit); otherwise the
 *   ontology-driven default request_config (explicit/implicit builders,
 *   relations/request_config/) supplies it.
 * - permissions: the caller's Principal is threaded through — the projects
 *   filter scopes the record search per-record (ACL) and the structure
 *   context is permission-stamped per element. No global-admin assumption.
 * - sources may OWN the read (the dd15 Time Machine source builds its own
 *   context/rows) — dispatched by sqo.mode via readSource.
 */

import { config as dedaloConfig } from '../../config/config.ts';
import { type EmitHookContext, getEmitHook } from '../components/emit_hooks.ts';
import { getComponentModel } from '../components/registry.ts';
import type { Ddo } from '../concepts/ddo.ts';
import type { Rqo } from '../concepts/rqo.ts';
import { isConsultationOnlySection } from '../concepts/section.ts';
import { mergeSessionSqo, sanitizeClientSqo } from '../concepts/sqo.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../ontology/resolver.ts';
import { emitDataframeItem, expandPortal } from '../relations/relation_core.ts';
import {
	type DataItem,
	EmissionContext,
	type SectionsEnvelope,
	buildDataItem,
	resolveComponentValue,
} from '../resolve/component_data.ts';
import { currentDataLang } from '../resolve/request_lang.ts';
import {
	type StructureContextEntry,
	buildStructureContext,
	contextKey,
} from '../resolve/structure_context.ts';
import {
	type Principal,
	ddoIsAuthorized,
	getPermissions,
	getSectionPermissions,
	inheritSubdatumPermission,
	resolveComponentContextPermission,
} from '../security/permissions.ts';
import { pickReadSource } from './read_source.ts';

/**
 * Execute a section 'search' read and build the PHP-shaped data[] array.
 *
 * `principal` scopes the record search to the user's projects (per-record ACL,
 * §7.4). The dispatch read handler ALWAYS passes it for user requests so a
 * non-admin cannot over-see records on a project-gated section; global admins
 * pass through unfiltered.
 */
/** A full read result: parallel context[] + data[] (PHP build_json_rows shape). */
export interface ReadResult {
	context: StructureContextEntry[];
	data: (SectionsEnvelope | DataItem)[];
}

/**
 * Full read: context[] + data[]. Context entries: the section first, then one
 * per resolved component ddo, deduplicated by context_key (tipo+section+mode,
 * first occurrence wins — PHP merge_unique_context).
 */
export async function readSection(rqo: Rqo, principal?: Principal): Promise<ReadResult> {
	const data = await readSectionRows(rqo, principal);
	const source = rqo.source ?? {};
	const callerTipo = source.tipo as string;
	// Same 'search'→'list' normalization as readSectionRows (the context half
	// must match the data half for the search-panel picker read).
	const mode = source.mode === 'search' ? 'list' : (source.mode ?? 'list');
	// Request-scoped data lang, never a hardcoded install default (S2-28): an
	// RQO that omits lang resolves the session's active data language.
	const lang = source.lang ?? currentDataLang();
	// PER-ELEMENT permissions stamp (PHP build_json_rows: each element's context
	// carries get_permissions(section, tipo) — the client renders <1 hidden,
	// ===1 read-only, >1 editable from exactly this field). An undefined
	// principal (internal calls, parity fixture replays) stamps 3; everyone
	// else — global admins included, PHP has no admin bypass — resolves through
	// the matrix (the superuser short-circuits to 3 inside getPermissions).
	// CONSULTATION-ONLY read: when the READ TARGET is a read-only section
	// (Activity dd542, Time Machine dd15, …) cap the whole emitted tree at read
	// (1) AT THE SOURCE — not just the section's own columns (buildStructureContext
	// handles those by section_tipo), but also the cross-section subdatum children
	// a portal pulls in (e.g. the 'Who' column's username dd132, whose own
	// section_tipo is dd128/Users and would otherwise escape the cap and render
	// editable). appendDerivedItemContexts threads the same cap.
	const readTargetSection = source.section_tipo ?? callerTipo;
	const capForReadTarget = (level: number): number =>
		level > 1 && isConsultationOnlySection(readTargetSection) ? 1 : level;
	const elementPermissions = async (elementSection: string, elementTipo: string): Promise<number> =>
		capForReadTarget(
			principal === undefined ? 3 : await getPermissions(principal, elementSection, elementTipo),
		);

	// Sources may OWN the structure-context (the dd15 TM source does — its columns
	// are client-driven, not ontology-derived). When present, skip the generic
	// context building below. The source is keyed by sqo.mode (the TM signal),
	// not source.mode (which stays 'list'/'edit').
	const readSource = await pickReadSource((rqo.sqo as { mode?: string } | undefined)?.mode);
	if (readSource.buildContext !== undefined) {
		const ctxPrincipal: Principal = principal ?? {
			userId: -1,
			isGlobalAdmin: true,
			isDeveloper: false,
		};
		const ownContext = await readSource.buildContext(rqo, ctxPrincipal);
		// The source owns the section + column contexts; the SUBDATUM child
		// contexts (e.g. the dd132 username under the dd578 user column) still come
		// from the emitted data items, same as the generic path — without them the
		// client can't render the subdatum rows (PHP get_subdatum merge).
		const ownSeen = new Set(ownContext.map(contextKey));
		await appendDerivedItemContexts(
			ownContext,
			ownSeen,
			data.filter((item): item is DataItem => (item as { typo?: string }).typo !== 'sections'),
			{ sectionTipo: source.section_tipo ?? callerTipo, lang, principal, capForReadTarget },
		);
		return { context: ownContext, data };
	}

	const context: StructureContextEntry[] = [];
	const seen = new Set<string>();
	const sectionEntry = await buildStructureContext({
		tipo: callerTipo,
		sectionTipo: source.section_tipo ?? callerTipo,
		mode,
		lang,
		// Section-level ACL (PHP section::get_section_permissions — includes the
		// consultation-only cap); the handler's Gate A/B guarantee ≥ 1 here.
		permissions:
			principal === undefined
				? capForReadTarget(3)
				: capForReadTarget(await getSectionPermissions(principal, readTargetSection)),
		// Thread the principal so the section button context uses the real
		// per-button ACL (SECTION_SPEC §9) instead of the caller-permission cap.
		principal,
	});
	if (sectionEntry !== null) {
		context.push(sectionEntry);
		seen.add(contextKey(sectionEntry));
	}
	const rqoDdoMap =
		rqo.show?.ddo_map && rqo.show.ddo_map.length > 0
			? rqo.show.ddo_map
			: await deriveSectionDdoMap(callerTipo, source.section_tipo ?? callerTipo, mode);
	for (const ddo of rqoDdoMap) {
		const ddoSectionTipo =
			ddo.section_tipo === undefined || ddo.section_tipo === 'self'
				? (source.section_tipo ?? callerTipo)
				: // multi-target client ddos contextualize against the FIRST target
					// (structure context is per-element, not per-target)
					Array.isArray(ddo.section_tipo)
					? (ddo.section_tipo[0] ?? source.section_tipo ?? callerTipo)
					: ddo.section_tipo;
		// Per-component READ gate (PHP check_ddo_permissions / STEP 5
		// filter_authorized_related): a denied component contributes NO context
		// entry. This is the confidentiality boundary for CLIENT-SENT maps —
		// the client can name any tipo in show.ddo_map, and the config-build
		// gates only shape the server-derived default.
		if (!(await ddoIsAuthorized(principal, ddoSectionTipo, ddo.tipo))) continue;
		// The element's descendants in the caller's map narrow its show config
		// (PHP get_subdatum children-injection).
		const rqoChildren = collectCallerDescendants(rqoDdoMap, ddo.tipo);
		const resolvedParent = ddo.parent === 'self' ? callerTipo : (ddo.parent ?? null);
		// A NESTED ddo (parent is a component, not the section) is a subdatum: its
		// sort join must start at the LISTED section, so hand its parent-portal to
		// buildOrderPath for the prepend (PHP get_order_path from_component/from_section).
		const orderPathFrom =
			resolvedParent !== null && resolvedParent !== callerTipo
				? {
						componentTipo: resolvedParent,
						sectionTipo:
							context.find((existing) => existing.tipo === resolvedParent)?.section_tipo ??
							source.section_tipo ??
							callerTipo,
					}
				: undefined;
		const entry = await buildStructureContext({
			tipo: ddo.tipo,
			sectionTipo: ddoSectionTipo,
			mode: ddo.mode ?? mode,
			lang: ddo.lang ?? lang,
			// Per-element matrix level (the ddoIsAuthorized drop above guarantees
			// ≥ 1 for defined principals — the client renders 1 read-only, ≥2 edit).
			permissions: await elementPermissions(ddoSectionTipo, ddo.tipo),
			parent: resolvedParent,
			view: ddo.view ?? null,
			rqoChildrenDdos: rqoChildren as unknown as Record<string, unknown>[],
			orderPathFrom,
		});
		if (entry !== null && !seen.has(contextKey(entry))) {
			seen.add(contextKey(entry));
			context.push(entry);
		}
	}

	// SUBDATUM CHILD contexts (PHP get_subdatum merges every element's
	// subcontext into the response): one entry per UNIQUE (tipo, section,
	// mode) among the emitted child items, parented to its generating
	// component. Without these the client's portal/autocomplete rows have no
	// component structure to render (the empty-chips bug of 2026-07-03).
	await appendDerivedItemContexts(
		context,
		seen,
		data.filter((item): item is DataItem => (item as { typo?: string }).typo !== 'sections'),
		{ sectionTipo: source.section_tipo ?? callerTipo, lang, principal, capForReadTarget },
	);
	return { context, data };
}

/**
 * An element's descendants in the caller's ddo_map — RECURSIVE, child then its
 * own descendants, order-preserving (PHP get_subdatum $get_children_recursive,
 * class.common.php:2297-2310): a grandchild declared in the caller's map lands
 * in the SAME flat injected show.ddo_map as its parent. The seen-set guards a
 * malformed self-/cyclic-parent map (PHP would recurse forever there too — the
 * ontology never declares one, but a client-sent map could).
 */
export function collectCallerDescendants(callerDdoMap: Ddo[], elementTipo: string): Ddo[] {
	const collect = (parentTipo: string, seenTipos: Set<string>): Ddo[] => {
		const descendants: Ddo[] = [];
		for (const candidate of callerDdoMap) {
			if (candidate.parent !== parentTipo || seenTipos.has(candidate.tipo)) continue;
			seenTipos.add(candidate.tipo);
			descendants.push(candidate, ...collect(candidate.tipo, seenTipos));
		}
		return descendants;
	};
	return collect(elementTipo, new Set([elementTipo]));
}

/**
 * Derive context entries from ACTUALLY-EMITTED data items (the get_data
 * derivation generalized): each unique (tipo, section_tipo, mode) gets one
 * entry, parented to its generating component (from_component_tipo), with
 * the ddo view looked up in the parent's own edit config. Deduplicates
 * against — and appends to — the caller's entries/seen set.
 */
async function appendDerivedItemContexts(
	entries: StructureContextEntry[],
	seen: Set<string>,
	items: DataItem[],
	defaults: {
		sectionTipo: string;
		lang: string;
		principal?: Principal;
		capForReadTarget: (level: number) => number;
	},
): Promise<void> {
	// per-parent ddo-view lookup: a child's context `view` comes from the
	// GENERATING component's config ddo (e.g. numisdata158 declares 'line' in
	// numisdata77's show.ddo_map).
	const ownerSectionOf = new Map<string, string>();
	const viewCache = new Map<string, Map<string, string | null>>();
	const ddoViewOf = async (parentTipo: string, childTipo: string): Promise<string | null> => {
		let views = viewCache.get(parentTipo);
		if (views === undefined) {
			views = new Map<string, string | null>();
			const { getEffectivePropertiesByTipo } = await import('../ontology/alias.ts');
			const { buildRequestConfigForElement } = await import('../relations/request_config/build.ts');
			// component_alias (WC-020): a child's view may be declared in an ALIAS
			// parent's merged show map.
			const parentConfig = await buildRequestConfigForElement(
				(await getEffectivePropertiesByTipo(parentTipo)) ?? null,
				{
					ownerTipo: parentTipo,
					ownerSectionTipo: ownerSectionOf.get(parentTipo) ?? defaults.sectionTipo,
					mode: 'edit',
					ownerIsSection: false,
				},
			);
			for (const ddo of parentConfig[0]?.show?.ddo_map ?? []) {
				views.set(ddo.tipo, (ddo as { view?: string }).view ?? null);
			}
			viewCache.set(parentTipo, views);
		}
		return views.get(childTipo) ?? null;
	};

	for (const item of items) {
		const itemTipo = String(item.tipo);
		const parentTipo = String(item.from_component_tipo ?? itemTipo);
		if (parentTipo === itemTipo) continue; // own items — already covered
		if (!ownerSectionOf.has(itemTipo)) {
			ownerSectionOf.set(itemTipo, String(item.section_tipo));
		}
		// A subdatum's sort join must start at the LISTED section (PHP
		// get_order_path from_component/from_section prepend): the parent portal's
		// own section is where it hangs (already-built context entry), else the
		// listed section for a direct child.
		const parentEntry = entries.find((existing) => existing.tipo === parentTipo);
		const parentSection = parentEntry?.section_tipo ?? defaults.sectionTipo;
		// Subdatum permission inheritance (PHP get_subdatum, class.common.php
		// :2567-2575): the child's own matrix level, floored to read through the
		// authorized generating component (portal targets stay visible without a
		// target-section grant) and capped at read under a read-only caller —
		// then the read-target consultation-only cap.
		const permissions =
			defaults.principal === undefined
				? defaults.capForReadTarget(3)
				: defaults.capForReadTarget(
						inheritSubdatumPermission(
							await getPermissions(defaults.principal, String(item.section_tipo), itemTipo),
							parentEntry?.permissions ?? 3,
						),
					);
		const entry = await buildStructureContext({
			tipo: itemTipo,
			sectionTipo: String(item.section_tipo),
			mode: String(item.mode),
			lang: String(item.lang),
			permissions,
			parent: parentTipo,
			view: await ddoViewOf(parentTipo, itemTipo),
			orderPathFrom: { componentTipo: parentTipo, sectionTipo: parentSection },
		});
		if (entry !== null && !seen.has(contextKey(entry))) {
			seen.add(contextKey(entry));
			entries.push(entry);
		}
	}
}

/**
 * Component `get_data` read (PHP dd_core_api build_json_rows action='get_data'):
 * resolve ONE relation component (portal/autocomplete) directly — its own item
 * (paginated by the rqo sqo) plus each paged locator expanded through the
 * component's OWN request_config (edit-mode child tree). This is the "show
 * more" / portal-pagination path the runtime client uses.
 *
 * Returns data[] only (context is Phase 4 continuation for this action).
 */
export async function readComponentData(rqo: Rqo): Promise<DataItem[]> {
	const source = rqo.source ?? {};
	const tipo = source.tipo;
	const sectionTipo = source.section_tipo;
	const sectionId = source.section_id;
	if (
		tipo === undefined ||
		sectionTipo === undefined ||
		sectionId === undefined ||
		sectionId === null
	) {
		throw new Error('readComponentData: source.tipo/section_tipo/section_id are required');
	}
	const model = await getModelByTipo(tipo);
	if (model === null) {
		throw new Error(`readComponentData: unknown component tipo '${tipo}'`);
	}
	// Request-scoped data lang, never a hardcoded install default (S2-28): an
	// RQO that omits lang resolves the session's active data language.
	const lang = source.lang ?? currentDataLang();

	// A synthetic search-filter id ('search_<n>', search.js get_section_id)
	// addresses NO matrix record — its Number() is NaN. Resolve it to a null
	// record WITHOUT touching the DB, so the search branches below build a
	// record-independent widget (PHP get_data serves the datalist/empty item).
	// This also spares VIRTUAL sections whose matrix "table" is not a readable
	// record store: dd15 Time Machine → matrix_time_machine, which readMatrixRecord
	// rejects via the identifier allowlist. Without this guard, dragging any dd15
	// field into the search panel threw and every filter rendered "Invalid
	// component". A real numeric id (incl. 0 and root -1) still reads normally.
	const numericSectionId = Number(sectionId);
	const hasRecordId = !Number.isNaN(numericSectionId);

	// Time Machine preview override (PHP component_common::get_data data_source
	// ='tm' branch, dd_core_api :2372-2383): the tool_time_machine preview pane
	// loads this component's value from a SPECIFIC matrix_time_machine row
	// (matrix_id), not the live record. Resolve that snapshot once here and graft
	// it over whatever record the branches below read — the section context /
	// datalist stay live (real section_tipo/section_id), only the value changes.
	// Without this, every preview shows the live value regardless of the row the
	// user picked (the "always the last value" bug).
	let tmOverride: unknown | null = null;
	if (source.data_source === 'tm' && source.matrix_id !== null && source.matrix_id !== undefined) {
		const { readTimeMachineRow } = await import('../db/time_machine.ts');
		const { stripDataframeFramesFromTmMain } = await import('../tm_record/tm_record.ts');
		const tmRow = await readTimeMachineRow(Number(source.matrix_id));
		// PHP get_data returns null (empty) when the TM row is absent.
		if (tmRow === null) return [];
		tmOverride = stripDataframeFramesFromTmMain(model, tmRow.data);
	}

	// NON-relation components: PHP dd_core_api serves get_data for ANY
	// component (the autocomplete_hi edit-in-place widget refreshes the chosen
	// term's `component_input_text` value this way) — resolve the single ddo
	// through the generic emission path against the target record.
	if (getColumnNameByModel(model) !== 'relation') {
		const literalTable = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';
		let literalRecord = hasRecordId
			? await readMatrixRecord(literalTable, sectionTipo, numericSectionId)
			: null;
		if (literalRecord === null) {
			// TM preview of a component whose live record is gone (restored-from-
			// deletion history): PHP still plays back the snapshot, so materialize an
			// empty virtual record to carry the override. No override ⇒ PHP empty shell.
			if (tmOverride === null) return [];
			const { makeVirtualRecord } = await import('../section_record/virtual_record.ts');
			literalRecord = makeVirtualRecord(sectionTipo, Number(sectionId));
		}
		if (tmOverride !== null) {
			const { cloneRecord, injectComponentData } = await import('../section_record/index.ts');
			literalRecord = cloneRecord(literalRecord);
			injectComponentData(literalRecord, tipo, model, tmOverride);
		}
		const literalEmission = new EmissionContext();
		const literalData = literalEmission.items;
		const literalMode = source.mode ?? 'edit';
		await emitDdoData(
			{ tipo, section_tipo: sectionTipo, mode: literalMode, lang } as Ddo,
			[],
			literalRecord,
			{ section_tipo: sectionTipo, section_id: Number(sectionId) },
			literalMode,
			lang,
			tipo,
			literalEmission,
		);

		// component_security_access DIRECT get_data: the datalist / changes_files /
		// parent locator are attached in the shared emitDdoData literal branch
		// above. get_data-specific tweaks vs the section read (PHP get_data_item):
		// the response SUBJECT is not a subdatum row, so it drops row_section_id,
		// and its section_id / parent_section_id are the RAW string ids.
		if (model === 'component_security_access') {
			const item = literalData.find(
				(entry): entry is DataItem => (entry as DataItem).tipo === tipo,
			);
			if (item !== undefined) {
				// biome-ignore lint/performance/noDelete: PHP parity — row_section_id must be ABSENT here
				delete (item as { row_section_id?: unknown }).row_section_id;
				item.section_id = String(sectionId);
				item.parent_section_id = String(sectionId);
			}
		}
		return literalData as DataItem[];
	}
	// Client-managed paging: the paginator rqo carries sqo.limit/offset, and
	// PHP sanitize_client_sqo CLAMPS the limit — 0/'all'/out-of-range → the
	// client ceiling (show-all becomes limit 1000 in the response pagination).
	// A NULL limit is NOT show-all: the real client sends sqo.limit:null on
	// every tool-component read meaning "server decides" (common.js "force to
	// generate default limit from server") — PHP answers with the component's
	// config limit (wire-pinned 2026-07-10: the epigraphy coins read with
	// limit:null pages at the override's 1, not 1000). Treating null as 0
	// clamped every tool portal to the full list — the 34-coins bug.
	const { CLIENT_MAX_LIMIT } = await import('../concepts/sqo.ts');
	const rawLimit = rqo.sqo?.limit;
	const parsedLimit =
		typeof rawLimit === 'number'
			? rawLimit
			: rawLimit == null
				? dedaloConfig.features.maxRowsPerPage
				: 0;
	const limit =
		!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit > CLIENT_MAX_LIMIT
			? CLIENT_MAX_LIMIT
			: parsedLimit;
	const sqoOffset = typeof rqo.sqo?.offset === 'number' ? rqo.sqo.offset : 0;

	// relation_index: COMPUTED inverse page (offset-aware) + pool-accumulated
	// related_list children — its own flow, no stored locators to expand.
	if (model === 'component_relation_index') {
		const offset = typeof rqo.sqo?.offset === 'number' ? rqo.sqo.offset : 0;
		const { readRelationIndexData } = await import('../relations/models/relation_index.ts');
		// related_list children resolve in the CURRENT data lang (PHP
		// DEDALO_DATA_LANG, seeded from the session), independent of the rqo lang
		// (a lg-nolan get_data still renders translatable pointing-section values
		// in the active data language).
		const { currentDataLang } = await import('../resolve/request_lang.ts');
		return readRelationIndexData(
			tipo,
			sectionTipo,
			String(sectionId),
			limit,
			offset,
			currentDataLang(),
			emitDdoData,
			source.mode ?? 'edit',
		);
	}

	// SELECT / FILTER family flag — reused by BOTH the null-record search path
	// (synthetic filter-row ids) and the datalist dispatch below: these models
	// resolve to option lists (get_list_of_values), never paginated portals.
	const { SELECT_FAMILY_MODELS } = await import('../relations/models/select_family.ts');
	const isSelectOrFilterFamily =
		SELECT_FAMILY_MODELS.has(model) ||
		model === 'component_filter' ||
		model === 'component_filter_master';

	const table = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';
	let record = hasRecordId ? await readMatrixRecord(table, sectionTipo, numericSectionId) : null;
	if (record === null && tmOverride !== null) {
		// TM preview of a component whose live record is gone: play back the
		// snapshot against an empty virtual record (PHP get_data still renders it).
		const { makeVirtualRecord } = await import('../section_record/virtual_record.ts');
		record = makeVirtualRecord(sectionTipo, Number(sectionId));
	}
	if (record === null) {
		// CHILDREN always answer with their (empty) own item — PHP instantiates
		// the component regardless of record resolution (the dz1 §503 pin:
		// data-driven tipos resolve no table/record through this generic path).
		if (model === 'component_relation_children') {
			const emptyItem = buildDataItem(
				tipo,
				sectionTipo,
				sectionId,
				source.mode ?? 'edit',
				'lg-nolan',
				[],
			);
			emptyItem.pagination = { total: 0, limit, offset: sqoOffset };
			emptyItem.parent_tipo = tipo;
			emptyItem.parent_section_id = Number(sectionId);
			return [emptyItem];
		}
		// SELECT / FILTER family in SEARCH mode against a SYNTHETIC filter-row id:
		// the search panel builds each filter component with a client-minted
		// section_id ('search_<n>', search.js get_section_id) that resolves NO
		// matrix record. PHP still emits the option datalist here (get_list_of_values
		// lists the target section's records — yes/no, projects… — independent of
		// any stored value), so component_publication renders its radio buttons and
		// component_select its options. Materialize an EMPTY virtual record and fall
		// through to the SELECT/FILTER datalist dispatch below (entries:[]) — instead
		// of the bare, datalist-less item the generic search branch returns, which
		// left the filter blank (render_search_component_publication iterates
		// data.datalist).
		if ((source.mode ?? 'edit') === 'search' && isSelectOrFilterFamily) {
			const { makeVirtualRecord } = await import('../section_record/virtual_record.ts');
			record = makeVirtualRecord(sectionTipo, 0);
		} else {
			// SEARCH mode builds a blank search form independent of any stored record —
			// PHP get_data returns the component's own item with empty entries so the
			// search widget renders even when the source points at a record that does
			// not exist (e.g. component_external's zenon fixture on a DB without that
			// record). The client's search renders read self.data.entries directly and
			// the external one is unguarded (render_search_component_external :178
			// data.entries[0]), so a null record must still answer an item with
			// entries:[] rather than nothing. section_id is echoed VERBATIM (leading
			// zeros kept) so String(el.section_id)===String(self.section_id) matches.
			if ((source.mode ?? 'edit') === 'search') {
				return [buildDataItem(tipo, sectionTipo, sectionId, 'search', lang, [])];
			}
			return [];
		}
	}

	// TM preview: graft the snapshot over the (live or virtual) record so the
	// SELECT-family and portal paths below page/resolve it exactly like a stored
	// value. This REPLACES the live value and short-circuits the relation_children
	// computation (the snapshot already holds what changed).
	if (tmOverride !== null) {
		const { cloneRecord, injectComponentData } = await import('../section_record/index.ts');
		record = cloneRecord(record);
		injectComponentData(record, tipo, model, tmOverride);
	} else if (model === 'component_relation_children') {
		// relation_children: COMPUTED locators (inverse dd47 — the component owns
		// no rows). Grafted into a CLONE of the record (never the shared original)
		// via the substitution API, so the shared portal expansion pages and
		// resolves child ddos exactly like a stored relation (PHP get_data :113
		// computes, then the json controller runs the standard pipeline).
		const { getChildren } = await import('../relations/children.ts');
		const { cloneRecord, injectComponentData } = await import('../section_record/index.ts');
		const computed = await getChildren(sectionId, sectionTipo, tipo);
		record = cloneRecord(record);
		injectComponentData(record, tipo, model, computed);
	}

	// SELECT / FILTER family get_data: the PHP json controllers of these models
	// (component_publication_json / component_select_lang_json / component_filter_json,
	// etc.) switch on mode — list/tm → label strings (get_list_value), edit →
	// stored locators + the option datalist (get_list_of_values) — and NEVER run
	// the portal pagination/child-expansion path. Dispatch through the SAME
	// registry resolver the section-read uses (emitDdoData → getRelationResolver),
	// honoring source.mode, so the direct get_data endpoint and the section read
	// produce identical output. Portal/dataframe/parent/external keep the
	// pagination path below.
	if (isSelectOrFilterFamily) {
		const mode = source.mode ?? 'edit';
		const familyEmission = new EmissionContext();
		const familyData = familyEmission.items;
		// Echo a non-numeric synthetic id (the search filter's 'search_<n>')
		// VERBATIM so the client build matches the instance by String() equality;
		// real numeric ids stay numeric (unchanged output for stored records).
		const emitSectionId = Number.isNaN(Number(sectionId)) ? sectionId : Number(sectionId);
		await emitDdoData(
			{ tipo, section_tipo: sectionTipo, mode, lang } as Ddo,
			[],
			record,
			{ section_tipo: sectionTipo, section_id: emitSectionId as number },
			mode,
			lang,
			tipo,
			familyEmission,
		);
		// The direct get_data item is the response SUBJECT, not a subdatum row —
		// PHP get_data_item carries no row_section_id (that stamp belongs to
		// get_subdatum rows only, as the portal get_data path also strips below).
		for (const item of familyData) {
			if ((item as DataItem).tipo === tipo)
				// biome-ignore lint/performance/noDelete: PHP parity — row_section_id must be ABSENT here
				delete (item as { row_section_id?: unknown }).row_section_id;
		}
		return familyData as DataItem[];
	}

	// The component's OWN request_config (edit mode → the full child tree).
	// An rqo source.properties OVERRIDE replaces the ontology properties (PHP
	// dd_core_api read :2305-2308, $element->set_properties): TOOL component
	// instances read with their ddo_map-declared properties (client
	// create_source), so the child map, the external sqo and the page size all
	// derive from the override — the epigraphy coins portal pages by the
	// override's sqo_config.limit 1, not the ontology's 9 (wire-pinned
	// 2026-07-10, section_tool_component_read_differential).
	// component_alias (WC-020): the EFFECTIVE properties accessor returns the
	// alias-merged config for alias tipos and the plain node properties
	// otherwise — the rqo override still wins on top (precedence chain:
	// override → alias merge → target).
	const { getEffectivePropertiesByTipo } = await import('../ontology/alias.ts');
	const { buildRequestConfigForElement } = await import('../relations/request_config/build.ts');
	const propertiesOverride = source.properties ?? undefined;
	const config = await buildRequestConfigForElement(
		propertiesOverride ?? (await getEffectivePropertiesByTipo(tipo)) ?? null,
		{
			ownerTipo: tipo,
			ownerSectionTipo: sectionTipo,
			mode: 'edit',
			ownerIsSection: false,
			ownerSectionId: sectionId,
			lang,
		},
	);

	// PHP page-size precedence (calculate_default_limit + the element's
	// pagination sync, wire-pinned 2026-07-10): the client's sqo.limit wins;
	// else the component's EFFECTIVE config limit (sqo.limit ??
	// show.sqo_config.limit, LAST config item wins — same chain as
	// relation_core's ownEditLimit); else the clamped mode default above.
	let effectiveLimit = limit;
	if (rawLimit == null) {
		let configured: number | undefined;
		for (const item of config) {
			const candidate =
				(item.sqo as { limit?: unknown } | undefined)?.limit ??
				((item.show?.sqo_config as { limit?: unknown } | undefined)?.limit as unknown);
			if (typeof candidate === 'number' && candidate > 0) configured = candidate;
		}
		if (configured !== undefined) effectiveLimit = configured;
	}
	const childDdos: Ddo[] = (config[0]?.show?.ddo_map ?? []).map(
		(ddo) =>
			({
				tipo: ddo.tipo,
				// Keep the DECLARED section list INTACT (same rule as the section-read
				// twin, relations/models/portal.ts): a multi-target component's child
				// spans EVERY target section and the per-locator grouping picks the
				// matching one. Flattening to [0] skipped every non-first target —
				// rsc92's hierarchy25 spans [es1,fr1,…], so a picked fr1 term emitted
				// NO subdatum in the save echo and the chip stayed blank until reload
				// (found live 2026-07-09).
				section_tipo: ddo.section_tipo,
				parent: ddo.parent,
				mode: ddo.mode,
				lang: (ddo as { lang?: string }).lang,
			}) as Ddo,
	);

	// Portal ddo: paginate the locators by the rqo sqo (get_data pages fully).
	const emission = new EmissionContext();
	const data = emission.items;
	const portalDdo: Ddo = {
		tipo,
		section_tipo: sectionTipo,
		parent: 'self',
		mode: 'edit',
		limit: effectiveLimit,
	} as Ddo;
	await expandPortal(
		record,
		portalDdo,
		model,
		childDdos,
		'edit',
		lang,
		{ section_tipo: sectionTipo, section_id: Number(sectionId) },
		tipo, // caller is the component itself
		emission,
		emitDdoData,
		// get_data subdatum rows anchor on the LOCATOR TARGET (PHP get_subdatum
		// row_section_id = $current_locator->section_id) — unlike the section
		// read, where the outer record re-stamp applies. ownConfig: the children
		// above came from the component's OWN config, which also enables the
		// autocomplete_hi ddinfo breadcrumb in its BARE get_data shape (the save
		// echo depends on it — the picked chip renders its thesaurus chain
		// without a reload; byte-diffed vs the oracle, 2026-07-09).
		{ offset: sqoOffset, childRowFromTarget: true, ownConfig: true, ddinfoBare: true },
	);
	// The portal's OWN item in a direct get_data carries NO row_section_id —
	// that stamp belongs to SUBDATUM rows (PHP get_subdatum :2792); the item
	// here is the top-level response subject, not a row of a parent.
	const portalItem = data[0] as DataItem | undefined;
	if (portalItem !== undefined && portalItem.tipo === tipo) {
		// biome-ignore lint/performance/noDelete: PHP parity — row_section_id must be ABSENT here
		delete portalItem.row_section_id;
	}
	// CHILDREN particularities (PHP component_relation_children get_data):
	// computed locators carry NO paginated_key, the own item echoes the
	// source's RAW (string) section_id, and the item emits even when the
	// computed set is EMPTY (entries [], total 0 — the dz1 §503 pin).
	if (model === 'component_relation_children') {
		if (portalItem !== undefined && portalItem.tipo === tipo) {
			portalItem.section_id = sectionId;
			portalItem.entries = (portalItem.entries ?? []).map((entry) => {
				const clean = { ...(entry as Record<string, unknown>) };
				// biome-ignore lint/performance/noDelete: PHP children locators never carry the key
				delete clean.paginated_key;
				return clean;
			});
		} else {
			const emptyItem = buildDataItem(tipo, sectionTipo, sectionId, 'edit', 'lg-nolan', []);
			emptyItem.pagination = { total: 0, limit: effectiveLimit, offset: sqoOffset };
			emptyItem.parent_tipo = tipo;
			emptyItem.parent_section_id = Number(sectionId);
			data.unshift(emptyItem);
		}
	}
	return data as DataItem[];
}

/**
 * resolve_data (PHP dd_core_api read case 'resolve_data'): a component in
 * SEARCH mode resolves INJECTED locators (rqo.source.value) instead of a
 * stored record value — the portal filter chips. The main item carries the
 * injected entries (id-stamped, mode 'search', null record identity) and the
 * children resolve each locator's TARGET record through the component's own
 * child ddos, stamped with the target's raw section_id.
 */
export async function resolveSearchData(rqo: Rqo, principal?: Principal): Promise<DataItem[]> {
	const source = rqo.source ?? {};
	const tipo = source.tipo;
	const sectionTipo = source.section_tipo;
	if (tipo === undefined || sectionTipo === undefined) {
		throw new Error('resolveSearchData: source.tipo/section_tipo are required');
	}
	const model = await getModelByTipo(tipo);
	if (model === null || getColumnNameByModel(model) !== 'relation') {
		throw new Error(`resolveSearchData: only relation components supported, got '${model}'`);
	}
	// Request-scoped data lang, never a hardcoded install default (S2-28): an
	// RQO that omits lang resolves the session's active data language.
	const lang = source.lang ?? currentDataLang();
	const limit =
		typeof rqo.sqo?.limit === 'number' ? rqo.sqo.limit : dedaloConfig.features.maxRowsPerPage;
	let injected = Array.isArray((source as { value?: unknown }).value)
		? ((source as { value?: unknown }).value as Record<string, unknown>[])
		: [];
	// §7.4 per-record projects (tenant) ACL on the client-injected target locators
	// (foundation audit AUTHZ-02): a non-admin must not resolve the child values of
	// a record outside their projects filter by injecting its locator as a search
	// chip. Drop out-of-scope targets; locators with no (section_tipo, section_id)
	// identity carry nothing to scope and pass through. Global admins are unscoped.
	if (principal !== undefined && !principal.isGlobalAdmin && injected.length > 0) {
		const { isRecordInScope } = await import('../security/record_scope.ts');
		const scoped: Record<string, unknown>[] = [];
		for (const locator of injected) {
			const locSectionTipo = locator.section_tipo;
			const locSectionId = locator.section_id;
			if (
				typeof locSectionTipo !== 'string' ||
				locSectionId === undefined ||
				locSectionId === null
			) {
				scoped.push(locator);
				continue;
			}
			// The root user locator (dd128/-1) resolves to a LABEL only, and PHP
			// resolves it for any caller with section-level permission (resolve_data
			// reaches -1 by design — activity "who" chips must render). Record
			// access stays blocked by the assembler's section_id > 0 filter and
			// principalCanAccessRecord; without this allow, isRecordInScope would
			// now silently drop the chip for non-admins.
			if (locSectionTipo === dedaloConfig.usersSectionTipo && Number(locSectionId) === -1) {
				scoped.push(locator);
				continue;
			}
			if (await isRecordInScope(locSectionTipo, Number(locSectionId), principal)) {
				scoped.push(locator);
			}
		}
		injected = scoped;
	}

	// PHP locator parity (class.locator.php set_section_id :338): the echoed
	// locators carry section_id AS STRING. The client feeds these entries back
	// verbatim as the search q (component_portal get_search_value), and the
	// stored relation column's locators hold string section_id — a verbatim
	// NUMERIC echo (the datalist publishes the envelope's numeric section_id)
	// silently misses the @> containment and the search returns 0 rows.
	injected = injected.map((locator) =>
		locator !== null &&
		typeof locator === 'object' &&
		locator.section_id !== undefined &&
		locator.section_id !== null
			? { ...locator, section_id: String(locator.section_id) }
			: locator,
	);

	// The component's child ddos — the RAW config entries so section_tipo
	// stays AS DECLARED ('self' = match-all in the per-locator grouping).
	// component_alias (WC-020): the effective accessor merges an alias's config.
	const { getTranslatableByTipo, getModelByTipo: modelOf } = await import(
		'../ontology/resolver.ts'
	);
	const { getEffectivePropertiesByTipo: effectivePropsOf } = await import('../ontology/alias.ts');
	// The child ddos (the target's DISPLAY components — e.g. dd132 Username for the
	// dd543 Who portal) come from the RELATIONS-driven request_config builder, the
	// same one buildGetDataContext uses for the edit-mode child tree. Reading the
	// component's OWN `source.request_config` misses them for a section component
	// whose target display is section/relation-defined (dd543 carries only
	// `show_interface`), so the picked chip resolved NO subdatum and rendered blank
	// (reported 2026-07-17: Activity "Who" search chip had no username).
	const { buildRequestConfigForElement } = await import('../relations/request_config/build.ts');
	const searchConfig = await buildRequestConfigForElement((await effectivePropsOf(tipo)) ?? null, {
		ownerTipo: tipo,
		ownerSectionTipo: sectionTipo,
		mode: 'search',
		ownerIsSection: false,
		lang,
	});
	const allDdos = searchConfig.flatMap((rc) => rc?.show?.ddo_map ?? []) as {
		tipo: string;
		parent?: string;
		section_tipo?: string | string[];
		mode?: string;
		lang?: string;
	}[];
	// Dataframe ddos are NOT per-target children — they pair with the MAIN
	// item's entries (id_key) and are emitted separately below.
	const dataframeDdos: typeof allDdos = [];
	const childDdos: Ddo[] = [];
	for (const ddo of allDdos) {
		if (typeof ddo?.tipo !== 'string') continue;
		if ((await modelOf(ddo.tipo)) === 'component_dataframe') {
			dataframeDdos.push(ddo);
			continue;
		}
		// PHP instantiates each child with its INSTANCE lang: the request lang
		// for translatable components, lg-nolan otherwise.
		const childLang = (await getTranslatableByTipo(ddo.tipo)) ? lang : 'lg-nolan';
		childDdos.push({
			tipo: ddo.tipo,
			section_tipo: ddo.section_tipo,
			parent: ddo.parent === 'self' || ddo.parent === undefined ? tipo : ddo.parent,
			mode: ddo.mode,
			lang: ddo.lang ?? childLang,
		} as Ddo);
	}

	// Synthetic record carrying ONLY the injected locators (via the substitution
	// API — the model routes to its column and the byte twin is voided).
	const { makeVirtualRecord, injectComponentData } = await import('../section_record/index.ts');
	const syntheticRecord = makeVirtualRecord(sectionTipo, 0);
	injectComponentData(syntheticRecord, tipo, model, injected);

	const searchEmission = new EmissionContext();
	const data = searchEmission.items;
	await expandPortal(
		syntheticRecord,
		{ tipo, section_tipo: sectionTipo, parent: 'self', mode: 'search', limit } as Ddo,
		model,
		childDdos,
		'search',
		lang,
		{ section_tipo: sectionTipo, section_id: null as unknown as number },
		tipo,
		searchEmission,
		emitDdoData,
		{ childRowFromTarget: true, stampParentSectionId: true },
	);

	// Main-item fixups (PHP set_data on the element): injected entries are
	// id-stamped 1..n, WITHOUT the paginated_key of the stored-value path.
	const mainItem = data.find((item) => (item as DataItem).tipo === tipo) as DataItem | undefined;
	if (mainItem !== undefined) {
		mainItem.entries = injected.map((locator, index) => ({ ...locator, id: index + 1 }));
		(mainItem as Record<string, unknown>).row_section_id = undefined;
	}

	// Dataframe slot items: one per injected entry per paired dataframe ddo,
	// EMPTY (no stored record ⇒ no frames), keyed by id_key = the entry id
	// (PHP emits them even when empty; row_section_id carries the id_key).
	for (const dataframeDdo of dataframeDdos) {
		for (let index = 0; index < Math.max(injected.length, 0); index++) {
			const idKey = index + 1;
			data.push({
				section_id: null,
				section_tipo: sectionTipo,
				tipo: dataframeDdo.tipo,
				mode: 'list',
				lang: 'lg-nolan',
				from_component_tipo: tipo,
				entries: [],
				parent_tipo: tipo,
				parent_section_id: null,
				pagination: { total: 0, limit: 1, offset: 0 },
				id_key: idKey,
				main_component_tipo: tipo,
				row_section_id: String(idKey),
			} as unknown as DataItem);
		}
	}
	return data as DataItem[];
}

/**
 * Derive a section's default ddo_map from its ontology request_config when the
 * client sends no explicit show (PHP build_request_config for a section:
 * list mode → section_list columns; edit mode → the full component tree).
 */
export async function deriveSectionDdoMap(
	sectionTipo: string,
	ownerSectionTipo: string,
	mode: string,
): Promise<Ddo[]> {
	const { getNode } = await import('../ontology/resolver.ts');
	const { buildRequestConfigForElement } = await import('../relations/request_config/build.ts');
	const node = await getNode(sectionTipo);
	const config = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: sectionTipo,
		ownerSectionTipo,
		mode,
		ownerIsSection: true,
	});
	const showDdos = config[0]?.show?.ddo_map ?? [];
	return showDdos.map(
		(ddo) =>
			({
				tipo: ddo.tipo,
				// The read loop resolves direct children against each row's
				// section; keep the ddo's own section_tipo for cross-section ddos.
				section_tipo: Array.isArray(ddo.section_tipo) ? ddo.section_tipo[0] : ddo.section_tipo,
				parent: ddo.parent,
				mode: ddo.mode,
				lang: (ddo as { lang?: string }).lang,
				// view drives the client's per-cell renderer choice (e.g. the
				// publication toggle needs view 'line') — must survive derivation.
				view: (ddo as { view?: string }).view,
			}) as Ddo,
	);
}

/**
 * A section's list default page size + sort, read from its resolved
 * request_config sqo (list mode → the section_list child's
 * properties.source.request_config[dedalo].sqo — e.g. dd542 Activity's dd549
 * carries limit 30 + order [section_id DESC]). PHP resolves the same values
 * (resolve_pagination_defaults + the request_config sqo.order) and applies them
 * to the search when the client omits them; readSectionRows mirrors that.
 * Returns an empty object when the section declares neither — the global
 * maxRowsPerPage / section_id-ASC defaults then stand. `order` is passed through
 * verbatim (the search assembler's buildOrderClauses shape).
 */
export async function deriveSectionListSqoDefaults(
	sectionTipo: string,
	ownerSectionTipo: string,
	mode: string,
): Promise<{ limit?: number; order?: unknown }> {
	const { getNode } = await import('../ontology/resolver.ts');
	const { buildRequestConfigForElement } = await import('../relations/request_config/build.ts');
	const node = await getNode(sectionTipo);
	const config = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: sectionTipo,
		ownerSectionTipo,
		mode,
		ownerIsSection: true,
	});
	const sqo = config[0]?.sqo as { limit?: unknown; order?: unknown } | undefined;
	const limit = typeof sqo?.limit === 'number' && sqo.limit > 0 ? sqo.limit : undefined;
	// `order` may be authored as an array OR a single {path,direction} object
	// (PHP tolerates both); pass either through — buildOrderClauses normalizes it.
	const rawOrder = sqo?.order;
	const order =
		Array.isArray(rawOrder) && rawOrder.length > 0
			? rawOrder
			: rawOrder !== null && typeof rawOrder === 'object'
				? rawOrder
				: undefined;
	return { limit, order };
}

export async function readSectionRows(
	rqo: Rqo,
	principal?: Principal,
): Promise<(SectionsEnvelope | DataItem)[]> {
	const source = rqo.source ?? {};
	const callerTipo = source.tipo;
	if (callerTipo === undefined) {
		throw new Error('readSectionRows: rqo.source.tipo is required');
	}
	// A search-panel component read (the service_autocomplete picker, the
	// input_text find_equal probe) stamps the COMPONENT's own mode ('search')
	// on the source (client create_source). PHP serves it as a plain read
	// regardless (dd_core_api.php:2256 case 'search' → sections::get_instance
	// with the given mode; row acquisition is mode-agnostic there). Normalize
	// to 'list': 'search' is a UI mode, not a row-read mode — the emission
	// path is the frozen BUG-0 picker contract (autocomplete_search_differential).
	const mode = source.mode === 'search' ? 'list' : (source.mode ?? 'list');
	// Request-scoped data lang, never a hardcoded install default (S2-28): an
	// RQO that omits lang resolves the session's active data language.
	const lang = source.lang ?? currentDataLang();
	// 'tm' is served by the Time Machine read source (dd15) through this same
	// generic path; 'list'/'edit' by the default matrix source.
	if (mode !== 'list' && mode !== 'edit' && mode !== 'tm') {
		throw new Error(
			`readSectionRows: mode '${mode}' not implemented yet (covered: 'list', 'edit', 'tm')`,
		);
	}
	// The client's show.ddo_map wins; when absent (the real client's section
	// read), derive it from the section's ontology request_config (PHP
	// build_request_config → the section_list/implicit columns).
	let ddoMap: Ddo[] = rqo.show?.ddo_map ?? [];
	if (ddoMap.length === 0) {
		ddoMap = await deriveSectionDdoMap(callerTipo, source.section_tipo ?? callerTipo, mode);
	}
	// Per-component READ gate on the DATA side (PHP check_ddo_permissions +
	// STEP 5 filter_authorized_related): a component the actor holds level 0 on
	// never reaches emitDdoData — client-sent maps included (the config-build
	// gates only shape the server-derived default map). Admin-flagged users go
	// through the matrix too (PHP parity); superuser passes via getPermissions.
	if (principal !== undefined) {
		const authorized: Ddo[] = [];
		for (const ddo of ddoMap) {
			const gateSection =
				ddo.section_tipo === undefined || ddo.section_tipo === 'self'
					? (source.section_tipo ?? callerTipo)
					: ddo.section_tipo;
			if (await ddoIsAuthorized(principal, gateSection, ddo.tipo)) authorized.push(ddo);
		}
		ddoMap = authorized;
	}
	if (rqo.sqo === undefined) {
		throw new Error(
			'readSectionRows: rqo.sqo is required (PHP "non received case" dd_core_api :2201-2251 uncovered)',
		);
	}

	// Session navigation read-back (PHP dd_core_api :2159-2199): with session
	// navigation on, navigation properties the client did NOT send are filled
	// from the session's stored SQO for this section — a plain secondary
	// window (page/?tipo=X) inherits the filter its opener stored, tools
	// re-enter the user's navigation. Runs BEFORE the limit/order capture
	// below so a merged session value counts as client-sent (PHP passes the
	// merged sqo straight to sections). ALS session read at call time.
	const sessionSave = (source as { session_save?: boolean }).session_save ?? true;
	if (sessionSave) {
		const { currentRequestContext } = await import('../security/request_context.ts');
		const storedSqo = currentRequestContext()?.session?.sqoSession?.[callerTipo];
		if (storedSqo !== undefined) {
			mergeSessionSqo(rqo.sqo as Record<string, unknown>, storedSqo);
		}
	}

	// --- run the search (Phase 3 engine) -----------------------------------
	// Mode default page size: the client sends a NULL/absent limit when it has
	// no explicit pagination yet — by design it defers the default to the server
	// ("force to generate default limit from server", client common.js
	// build_rqo_show:1723; the client-side default at section.js:827 only lands
	// on the NEXT request, after the first list load has already gone out). If we
	// let sanitizeClientSqo see that missing limit it clamps to the 1000 security
	// CEILING — so the first list load would show 1000 rows. Apply the mode
	// default here instead: edit → 1 record, list → 10 rows (PHP section.js:827).
	// A genuine oversized/invalid client limit still hits the ceiling in sanitize.
	const clientLimit = (rqo.sqo as { limit?: unknown }).limit;
	const clientLimitMissing = clientLimit === undefined || clientLimit === null;
	const clientOrder = (rqo.sqo as { order?: unknown }).order;
	const clientOrderMissing =
		clientOrder === undefined ||
		clientOrder === null ||
		(Array.isArray(clientOrder) && clientOrder.length === 0);
	// A section's LIST defaults (page size + sort) live on its request_config
	// sqo (properties.source.request_config[dedalo].sqo of the section_list
	// child). The byte-identical client's first list load fires BEFORE it derives
	// any client-side pagination (build_autoload sends the pre-context rqo), so it
	// sends neither limit nor order — PHP resolves both from the request_config
	// and applies them to the search SERVER-SIDE (which is why live PHP returns
	// dd542 Activity's 30-row/newest-first list on first paint). Mirror that:
	// resolve the config once and apply each default only when the client omitted
	// it. Only fetched when a default is actually needed.
	const needsSqoDefaults = mode !== 'edit' && (clientLimitMissing || clientOrderMissing);
	const sqoDefaults = needsSqoDefaults
		? await deriveSectionListSqoDefaults(callerTipo, source.section_tipo ?? callerTipo, mode)
		: {};
	const sqo = sanitizeClientSqo(structuredClone(rqo.sqo) as Record<string, unknown>);
	if (mode === 'edit') {
		if (clientLimitMissing) {
			// Mode default: one record (client section.js:827 defers to the server).
			sqo.limit = 1;
		} else {
			// PHP's edit clamp is SECTION-only (dd_core_api.php:2259-61:
			// model==='section' && limit missing-or->1 → 1). Component-source edit
			// searches (the input_text find_equal probe) keep their explicit limit.
			const callerModel = source.model ?? (await getModelByTipo(callerTipo));
			if (callerModel === 'section' && Number(clientLimit) > 1) {
				sqo.limit = 1;
			}
		}
	} else if (clientLimitMissing) {
		// Configured page size (PHP calculate_default_limit) → else the global
		// DEDALO_MAX_ROWS_PER_PAGE default.
		sqo.limit = sqoDefaults.limit ?? dedaloConfig.features.maxRowsPerPage;
	}
	// Default sort: the section's configured order (PHP applies request_config
	// sqo.order server-side; the client never emits a config-default order on
	// first load). A client-sent order always wins.
	if (clientOrderMissing && sqoDefaults.order !== undefined) {
		(sqo as { order?: unknown }).order = sqoDefaults.order;
	}
	// Session navigation SQO (PHP dd_core_api :2276-98/:2339): SECTION reads in
	// list/edit persist their resolved sqo per session unless the caller opts
	// out (source.session_save=false — secondary windows). Tools re-read it
	// (tool_export record preservation, section_tool navigation) and the section
	// context stamps it back as `sqo_session`. The ALS session is read at call
	// time; requests without one (harnesses, background) skip.
	if (sessionSave && (mode === 'list' || mode === 'edit')) {
		const callerModel = source.model ?? (await getModelByTipo(callerTipo));
		if (callerModel === 'section') {
			const { currentRequestContext } = await import('../security/request_context.ts');
			const requestSession = currentRequestContext()?.session ?? null;
			if (requestSession !== null) {
				const { setSessionSqo } = await import('../security/session_store.ts');
				setSessionSqo(requestSession, callerTipo, structuredClone(sqo));
			}
		}
	}
	// The read STRATEGY: the default matrix source (buildSearchSql → rows,
	// readMatrixRecord → record, direct-child ddo loop), or the virtual dd15
	// Time Machine source — same generic envelope/context/count, only row
	// acquisition + per-row cell policy differ (PHP search_tm parity). The TM
	// signal is sqo.mode (the SOURCE mode stays 'list'/'edit' — PHP mirrors this:
	// sqo->mode 'tm' picks search_tm while the read action is still 'search').
	const readSource = await pickReadSource((sqo as { mode?: string }).mode);
	const rows = await readSource.getRows(sqo, principal);

	// --- envelope (PHP sections_json.php :136) ------------------------------
	// Each entry is {section_tipo, section_id, paginated_key} plus any
	// source-specific extras (the TM source adds matrix_id/timestamp/caller_*/…).
	const offset = typeof sqo.offset === 'number' ? sqo.offset : 0;
	const envelope: SectionsEnvelope = {
		typo: 'sections',
		tipo: callerTipo,
		section_tipo: [],
		entries: rows.map((row, index) => ({
			section_tipo: row.section_tipo,
			section_id: row.section_id,
			paginated_key: index + offset,
			...(row.envelopeExtra ?? {}),
		})),
	};

	// --- subdatum: record-major, ddo-minor (PHP get_subdatum loop order) ----
	// The source owns per-row emission (matrix: record + direct-child ddo loop;
	// tm: who/when/where/what + snapshot cell policy). emitDdoData is passed in
	// so the source can resolve generic components without an import cycle.
	const emission = new EmissionContext([envelope]);
	for (const row of rows) {
		await readSource.emitRow({
			row,
			ddoMap,
			mode,
			lang,
			callerTipo,
			emission,
			emitDdo: emitDdoData,
		});
	}
	return emission.items;
}

/**
 * Resolve one ddo against one record and push its data item(s) — the single
 * per-component emission path shared by the section read and portal
 * expansion. Splits by model family (relation label/portal/media/literal)
 * exactly as PHP's component get_json controllers do.
 */
export async function emitDdoData(
	ddo: Ddo,
	ddoMap: Ddo[],
	record: NonNullable<Awaited<ReturnType<typeof readMatrixRecord>>>,
	row: { section_tipo: string; section_id: number },
	defaultMode: string,
	defaultLang: string,
	callerTipo: string,
	emission: EmissionContext,
	allowOwnConfigChildren = true,
	depth = 0,
): Promise<void> {
	const model = await getModelByTipo(ddo.tipo);
	if (model === null) {
		throw new Error(`emitDdoData: unknown ddo tipo '${ddo.tipo}'`);
	}
	if (!model.startsWith('component_')) {
		return; // groupers etc. contribute context only (deferred)
	}

	// Activity 'where' (dd546): the stored value is an ontology tipo — PHP
	// renders "«term» [tipo]" (same transform as the TM dd577 column).
	if (ddo.tipo === 'dd546') {
		const stored =
			((record.columns.string as Record<string, unknown[]> | null)?.[ddo.tipo] as {
				lang?: string;
				value?: string;
			}[]) ?? [];
		const { termByTipo } = await import('../ontology/labels.ts');
		const entries: unknown[] = [];
		for (const item of stored) {
			const raw = String(item?.value ?? '');
			const resolved = /^[a-z]+[0-9]+$/.test(raw)
				? `${await termByTipo(raw, defaultLang)} [${raw}]`
				: raw;
			entries.push({ ...item, value: resolved });
		}
		const whereItem = buildDataItem(
			ddo.tipo,
			row.section_tipo,
			row.section_id,
			ddo.mode ?? defaultMode,
			'lg-nolan',
			entries.length > 0 ? entries : null,
		);
		whereItem.fallback_value = null;
		whereItem.row_section_id = row.section_id;
		whereItem.parent_tipo = callerTipo;
		emission.items.push(whereItem);
		return;
	}
	const ddoMode = ddo.mode ?? defaultMode;
	// Instance lang: non-translatable components are nolan-forced at
	// instantiation (PHP get_element_lang) when the ddo carries no lang.
	const { getTranslatableByTipo: isTranslatable } = await import('../ontology/resolver.ts');
	const ddoLang = ddo.lang ?? ((await isTranslatable(ddo.tipo)) ? defaultLang : 'lg-nolan');

	// Per-model emit hook (audit S2-24): the descriptor names it as DATA
	// (emitHook), components/emit_hooks.ts maps it to its implementation in the
	// model's home. REPLACE hooks (media, section_id) fully own the emission;
	// value/decoration hooks ride the generic literal path below.
	const emitHook = getEmitHook(model);

	// component_alias scope guard (WC-020 v1): the alias-wired emissions are
	// the PORTAL family (expandPortal keys by dataTipo) and the generic
	// LITERAL path (resolveComponentValue hops internally). Any other face —
	// children/parent/related/index/select-family datalists, REPLACE emit
	// hooks (media/section_id) — reads data by the ddo's own tipo and would
	// silently serve the alias's EMPTY slot: refuse loudly instead
	// (rewrite/LEDGER.md known-open gaps).
	const { resolveDataTipo } = await import('../ontology/alias.ts');
	const dataTipo = await resolveDataTipo(ddo.tipo);
	if (dataTipo !== ddo.tipo) {
		const aliasWired =
			getColumnNameByModel(model) === 'relation'
				? model === 'component_portal'
				: emitHook?.emitItem === undefined;
		if (!aliasWired) {
			throw new Error(
				`component_alias '${ddo.tipo}': target model '${model}' is not alias-wired yet (WC-020 v1)`,
			);
		}
	}
	const hookContext: EmitHookContext = {
		ddo,
		record,
		row,
		model,
		ddoMode,
		ddoLang,
		defaultMode,
		defaultLang,
		callerTipo,
		emission,
	};
	if (emitHook?.emitItem !== undefined) {
		await emitHook.emitItem(hookContext);
		return;
	}

	if (getColumnNameByModel(model) === 'relation') {
		// Relation family: dispatch to the registered model resolver
		// (relations/registry.ts). The per-model particularities live there;
		// child recursion re-enters THIS function via the emitDdo callback.
		const { getRelationResolver } = await import('../relations/registry.ts');
		await getRelationResolver(model).emitDdoItems({
			ddo,
			ddoMap,
			record,
			row,
			model,
			dataTipo,
			ddoMode,
			ddoLang,
			defaultMode,
			defaultLang,
			callerTipo,
			emission,
			allowOwnConfigChildren,
			depth,
			emitDdo: emitDdoData,
		});
		return;
	}

	// LITERAL components: resolve the lang-sliced value, run the model's value
	// hook (info live-compute, text_area list truncation), build + decorate.
	let { value, fallbackValue } = await resolveComponentValue(record, ddo.tipo, model, ddoLang);
	if (emitHook?.transformValue !== undefined) {
		value = await emitHook.transformValue(value, hookContext);
	}

	const item = buildDataItem(ddo.tipo, row.section_tipo, row.section_id, ddoMode, ddoLang, value);
	// text_area ALWAYS carries the fallback_value key (PHP
	// component_text_area_json attaches it unconditionally — explicit null
	// when the value is present or no cross-lang fallback exists); other
	// literals attach it only when a fallback resolved.
	if (fallbackValue !== null || model === 'component_text_area') {
		item.fallback_value = fallbackValue;
	}
	// component_filter_records (misc column): the client search render reads
	// self.data.datalist and iterates it (render_search_component_filter_records
	// :165 datalist.length). Without the key the render throws
	// "Cannot read properties of undefined (reading 'length')" and the instance
	// never reaches 'rendered'. Attach an array so the render completes; the full
	// filter-field datalist is uncovered scope (the dedicated suite's content
	// asserts stay deferred), but this unblocks the component sweeps.
	if (model === 'component_filter_records') {
		item.datalist = Array.isArray((item as { datalist?: unknown }).datalist)
			? (item as { datalist?: unknown }).datalist
			: [];
	}
	item.row_section_id = row.section_id;
	item.parent_tipo = callerTipo;

	// LITERAL mains pair with their dataframe slots too (the user-confirmed
	// contract: any component — input_text, date, iri… — can declare frames):
	//   - component_iri ALWAYS pairs with its dd560 label dataframe (PHP
	//     component_iri_json, hardcoded DEDALO_COMPONENT_IRI_LABEL_DATAFRAME);
	//   - other literals require properties.has_dataframe === true (PHP
	//     build_dataframe_subdatum) and pair with their ontology dataframe
	//     children.
	// One frame per stored item id; the empty case uses the next provisional
	// id (counter+1) so the editor can render a blank slot. The frame node's
	// own properties.mode ('edit') is the item mode. Frames emit BEFORE the
	// literal's own item (PHP merges the subdatum first).
	if (ddoMode !== 'search') {
		const { resolveFrameConfig, getDataframeChildTipos } = await import(
			'../section/list_definitions/section_list.ts'
		);
		// Fixed frames are descriptor DATA (component_iri's dd560 — the PHP
		// hardcoded DEDALO_COMPONENT_IRI_LABEL_DATAFRAME); other literals pair
		// via the generic properties.has_dataframe ontology walk.
		const fixedFrames = getComponentModel(model)?.fixedDataframeTipos;
		let frameTipos: string[] = fixedFrames !== undefined ? [...fixedFrames] : [];
		if (frameTipos.length === 0) {
			const { getNode } = await import('../ontology/resolver.ts');
			const hasDataframe =
				((await getNode(ddo.tipo))?.properties as { has_dataframe?: boolean } | null)
					?.has_dataframe === true;
			if (hasDataframe) {
				frameTipos = await getDataframeChildTipos(ddo.tipo);
			}
		}
		if (frameTipos.length > 0) {
			// has_dataframe literals carry the frame item-id counter (PHP
			// get_counter — data.counters[tipo], 0 when never assigned).
			const counters = (record.columns.data as { counters?: Record<string, number> } | null)
				?.counters;
			item.counter = Number(counters?.[ddo.tipo] ?? 0);
			const storedIds = (Array.isArray(value) ? value : [])
				.map((valueItem) => (valueItem as { id?: number | string } | null)?.id)
				.filter((id): id is number | string => id !== undefined && id !== null);
			const pairIds = storedIds.length > 0 ? storedIds : [1];
			for (const frameTipo of frameTipos) {
				// Frame item mode: the frame NODE's own properties.mode (dd560 →
				// 'edit') else LIST (the generic literal default, oracle-pinned).
				const frameNodeMode = (await resolveFrameConfig(frameTipo)).nodeMode ?? 'list';
				for (const pairId of pairIds) {
					await emitDataframeItem(
						{ tipo: frameTipo, section_tipo: row.section_tipo } as Ddo,
						record,
						ddo.tipo,
						pairId,
						frameNodeMode,
						row,
						defaultLang,
						callerTipo,
						emission,
						depth,
						emitDdoData,
					);
				}
			}
		}
	}

	// Per-model item decoration (filter_records datalist backstop,
	// security_access ACL payload, text_area's unconditional fallback key).
	if (emitHook?.decorateItem !== undefined) {
		await emitHook.decorateItem(item, hookContext);
	}
	emission.items.push(item);
}

/**
 * The CONTEXT of a get_data response (PHP: each recursive get_json merges its
 * structure context, deduped by context_key). Faithful derivation: one entry
 * for the component itself, then one per UNIQUE (tipo, section_tipo, mode)
 * among the emitted subdatum items in first-emission order — the context
 * mirrors the children ACTUALLY resolved (per-locator section grouping
 * included), each parented to its generating component
 * (from_component_tipo).
 */
export async function buildGetDataContext(
	rqo: Rqo,
	items: DataItem[],
	principal?: Principal,
): Promise<StructureContextEntry[]> {
	const source = rqo.source ?? {};
	const tipo = String(source.tipo ?? '');
	const sectionTipo = String(source.section_tipo ?? '');
	const mode = source.mode ?? 'edit';
	// Request-scoped data lang, never a hardcoded install default (S2-28): an
	// RQO that omits lang resolves the session's active data language.
	const lang = source.lang ?? currentDataLang();

	// per-parent ddo-view lookup: a child's context `view` comes from the
	// GENERATING component's config ddo (e.g. numisdata158 declares 'line' in
	// numisdata77's show.ddo_map).
	const ownerSectionOf = new Map<string, string>([[tipo, sectionTipo]]);
	const viewCache = new Map<string, Map<string, string | null>>();
	const ddoViewOf = async (parentTipo: string, childTipo: string): Promise<string | null> => {
		let views = viewCache.get(parentTipo);
		if (views === undefined) {
			views = new Map<string, string | null>();
			const { getEffectivePropertiesByTipo } = await import('../ontology/alias.ts');
			const { buildRequestConfigForElement } = await import('../relations/request_config/build.ts');
			// component_alias (WC-020): a child's view may be declared in an ALIAS
			// parent's merged show map.
			const parentConfig = await buildRequestConfigForElement(
				(await getEffectivePropertiesByTipo(parentTipo)) ?? null,
				{
					ownerTipo: parentTipo,
					ownerSectionTipo: ownerSectionOf.get(parentTipo) ?? sectionTipo,
					mode: 'edit',
					ownerIsSection: false,
				},
			);
			for (const ddo of parentConfig[0]?.show?.ddo_map ?? []) {
				views.set(ddo.tipo, (ddo as { view?: string }).view ?? null);
			}
			viewCache.set(parentTipo, views);
		}
		return views.get(childTipo) ?? null;
	};

	// MAIN element permission: the matrix level with PHP's search-mode special
	// grants (thesaurus / metadata tipos / synthetic 'search_<n>' ids → 2). An
	// undefined principal (internal calls, harnesses) stamps 3. The handler's
	// Gate A already denied level 0 for the non-search path.
	const mainLevel =
		principal === undefined
			? 3
			: await resolveComponentContextPermission(
					principal,
					sectionTipo,
					tipo,
					source.section_id as number | string | null | undefined,
					String(mode),
				);

	const entries: StructureContextEntry[] = [];
	const seen = new Set<string>();
	const push = async (entry: {
		tipo: string;
		sectionTipo: string;
		mode: string;
		lang: string;
		permissions: number;
		parent: string | null;
		view: string | null;
		propertiesOverride?: Record<string, unknown>;
	}): Promise<StructureContextEntry | null> => {
		const built = await buildStructureContext({
			tipo: entry.tipo,
			sectionTipo: entry.sectionTipo,
			mode: entry.mode,
			lang: entry.lang,
			permissions: entry.permissions,
			parent: entry.parent,
			view: entry.view,
			propertiesOverride: entry.propertiesOverride,
		});
		if (built === null) return null;
		const key = contextKey(built);
		if (seen.has(key)) return null;
		seen.add(key);
		entries.push(built);
		return built;
	};

	// The MAIN component's context carries the REQUESTED view (source.view) — a
	// get_data for a ?view=viewer deep link must ship view:'viewer' so the client
	// instance adopts it (self.view is a getter over context.view) and mounts the
	// dedicated view (e.g. component_image view_viewer_image) instead of the edit
	// view. Hardcoding null here left the viewer window rendering the edit UI.
	const requestedView = typeof source.view === 'string' && source.view !== '' ? source.view : null;
	// The MAIN entry emits from the EFFECTIVE properties: an rqo
	// source.properties override replaces the ontology's (PHP set_properties,
	// dd_core_api read :2305-2308) — properties echo, css, view and
	// request_config all follow the override.
	const mainEntry = await push({
		tipo,
		sectionTipo,
		mode,
		lang,
		permissions: mainLevel,
		parent: sectionTipo,
		view: requestedView,
		propertiesOverride: source.properties ?? undefined,
	});
	// The get_data context mirrors the element's RUNTIME pagination (PHP
	// syncs the element's sqo before emitting it): the dedalo request_config
	// item's sqo carries the limit the data actually paged with — 9 (ontology
	// sqo_config) / 1 (tool override) / the client-sent value; sqo.offset is
	// NOT stamped (wire-pinned 2026-07-10).
	if (mainEntry !== null && Array.isArray(mainEntry.request_config)) {
		const mainItem = items.find(
			(item) =>
				item.tipo === tipo &&
				typeof (item as { pagination?: { limit?: unknown } }).pagination?.limit === 'number',
		);
		if (mainItem !== undefined) {
			const dedaloItem = (
				mainEntry.request_config as { api_engine?: string; sqo?: Record<string, unknown> }[]
			).find((item) => item.api_engine === 'dedalo');
			if (dedaloItem?.sqo !== undefined) {
				dedaloItem.sqo.limit = (
					mainItem as unknown as { pagination: { limit: number } }
				).pagination.limit;
			}
		}
	}
	// component_iri label dataframe (dd560): the list/text render resolves the title
	// frame via get_dataframe, which requires the dataframe's OWN structure context in
	// datum.context (dataframe.js:249 returns null — then a null.render() crash —
	// without it). No dd560 DATA item exists to derive it from, so emit it explicitly,
	// mirroring the request_config slot synthesized in buildStructureContext (PHP
	// class.component_iri::get_properties dd560 injection).
	if ((await getModelByTipo(tipo)) === 'component_iri') {
		// The dd560 label frame is system-managed and always writable through its
		// IRI (PHP component_iri injection carries the caller's edit rights).
		await push({
			tipo: 'dd560',
			sectionTipo,
			mode: 'edit',
			lang,
			permissions: Math.max(mainLevel, 2),
			parent: tipo,
			view: 'line',
		});
	}
	for (const item of items) {
		if (item.tipo === tipo && String(item.section_id) === String(source.section_id ?? '')) {
			continue; // the component's own item
		}
		const itemTipo = String(item.tipo);
		const parentTipo = String(item.from_component_tipo ?? tipo);
		if (!ownerSectionOf.has(itemTipo)) {
			ownerSectionOf.set(itemTipo, String(item.section_tipo));
		}
		await push({
			tipo: itemTipo,
			sectionTipo: String(item.section_tipo),
			mode: String(item.mode),
			lang: String(item.lang),
			// Subdatum inheritance off the MAIN element (PHP get_subdatum
			// :2567-2575): floor-1 through the authorized caller, cap-1 under a
			// read-only caller.
			permissions:
				principal === undefined
					? 3
					: inheritSubdatumPermission(
							await getPermissions(principal, String(item.section_tipo), itemTipo),
							mainLevel,
						),
			parent: parentTipo,
			view: await ddoViewOf(parentTipo, itemTipo),
		});
	}
	return entries;
}
