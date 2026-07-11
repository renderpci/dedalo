/**
 * request_config EXPLICIT parser — how a relation component declares its target
 * resolution (spec §3.6), read from ontology properties.source.request_config.
 * PHP oracle nomenclature: explicit ≡ v6, implicit ≡ v5.
 *
 * PHP references: trait.request_config_v6.php (parse_request_config_item :158,
 * resolve_sqo_section_tipo :245, show/search/choose/hide :324-607),
 * trait.request_config_ddo.php (process_single_ddo :50-155,
 * resolve_ddo_self_references :247, resolve_ddo_mode :284),
 * request_config_utils (build_sqo_section_tipo_ddo :424).
 *
 * v0 scope (per-step ledger, no silent narrowing):
 * - api_engine / type / sqo (section_tipo resolution incl. the enriched
 *   {value, source} entries and the 'self' sentinel) / show / search /
 *   choose / hide ddo_maps with self-sentinel + mode resolution and
 *   model/label enrichment + the step-11 per-ddo permission drop
 *   (section-owned configs only — 2026-07-10, ddoIsAuthorized);
 * - DEFERRED (nulls/ledger): fields_map (step 9, external-API components),
 *   tm dataframe view (step 10), session/rqo overlay stages. User presets
 *   (dd1244 layout maps) LANDED 2026-07-10 — the STAGE-2 override lives at the
 *   build.ts chokepoint (./presets.ts), feeding this parser the preset config.
 */

import { getActiveTlds } from '../../db/dd_ontology.ts';
import { sql } from '../../db/postgres.ts';
import { createOntologyCache } from '../../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../../ontology/cache_invalidation.ts';
import { getModelByTipo, getNode } from '../../ontology/resolver.ts';
import { contextLabelOf } from '../../resolve/structure_context.ts';
import { registerSectionDataListener } from '../../section_record/save_event.ts';

/** The parsing context: who owns the config and where it lives. */
export interface RequestConfigContext {
	/** The owning element (portal/section) tipo — 'self' parent resolves here. */
	ownerTipo: string;
	/** The owning element's section tipo(s) — 'self' section resolves here. */
	ownerSectionTipo: string;
	/** The caller's render mode (section callers propagate; others force list). */
	mode: string;
	/** True when the OWNER is a section (affects ddo mode resolution). */
	ownerIsSection: boolean;
	/**
	 * The calling RECORD id when the caller knows it (edit/get_data flows).
	 * Required by fixed_filter 'component_data' resolution (PHP passes the
	 * instance section_id); absent for record-independent builds (datalist,
	 * structure context of a whole section).
	 */
	ownerSectionId?: number | string | null;
	/** Request data lang for live expansions (filter_by_list datalists). */
	lang?: string;
}

/** Source names with a dedicated case below ('section_tipo' is a live alias
 * of the default section semantics — 8 production configs use it). */
const KNOWN_SQO_SOURCES: ReadonlySet<string> = new Set([
	'self',
	'hierarchy_types',
	'ontology_sections',
	'field_value',
	'hierarchy_terms',
	'section',
	'section_tipo',
]);

/**
 * Flatten an explicit sqo.section_tipo declaration to plain tipos: entries are
 * strings, or enriched {value: [tipos], source} objects; 'self' resolves to
 * the owner's section. Cases mirror PHP get_request_config_section_tipo
 * (class.component_relation_common.php:2679-2908); the tail mirrors its
 * array_unique (:2892-95) + the trait's check_tipo_is_valid prune
 * (trait.request_config_v6.php:262-270).
 */
export async function resolveSqoSectionTipos(
	raw: unknown,
	context: RequestConfigContext,
): Promise<string[]> {
	const entries = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
	const resolved: string[] = [];
	for (const entry of entries) {
		if (typeof entry === 'string') {
			resolved.push(entry === 'self' ? context.ownerSectionTipo : entry);
			continue;
		}
		if (entry !== null && typeof entry === 'object') {
			const source = (entry as { source?: unknown }).source;
			const value = (entry as { value?: unknown }).value;
			// PHP drops object entries with NO source outright (:2718-25, ERROR
			// log) — they never reach the default branch. Zero live users.
			if (source === undefined || source === null || source === '') {
				console.warn(
					'[request_config/explicit] dropped sqo section_tipo entry without source (PHP :2718-25)',
				);
				continue;
			}
			// self source: the caller's own section, value IGNORED (PHP
			// get_request_config_section_tipo case 'self',
			// class.component_relation_common.php:2729-32 — self-referencing
			// portals like numisdata73 declare {source:'self'} with no value).
			if (source === 'self') {
				resolved.push(context.ownerSectionTipo);
				continue;
			}
			// hierarchy_types source: the values are TYPOLOGY ids — resolve to
			// the ACTIVE hierarchy sections of those typologies (PHP
			// get_hierarchy_sections_from_types).
			if (source === 'hierarchy_types') {
				const typeIds = (Array.isArray(value) ? value : []).map((id) => Number(id));
				resolved.push(...(await resolveHierarchySectionsFromTypes(typeIds)));
				continue;
			}
			// ontology_sections source: EVERY registered ontology's target section
			// (PHP ontology::get_all_ontology_sections, class.ontology.php:1509-51 —
			// all matrix_ontology_main rows' hierarchy53 value; no active filter,
			// no TLD gate, `value` ignored). Live users: ontology1's tree
			// components + dd1766 (222 targets on this install).
			if (source === 'ontology_sections') {
				resolved.push(...(await resolveOntologySections()));
				continue;
			}
			// field_value source: read the CALLER section's ACTIVE records
			// (relation carries the hierarchy4/dd64/1 active flag) and take each
			// named component's data values as target tipos, keeping only those
			// that resolve to a section model (PHP :2744-2848 — hierarchy1's
			// hierarchy45/hierarchy59 resolve the active hierarchies' targets).
			if (source === 'field_value') {
				const componentTipos = (Array.isArray(value) ? value : []).filter(
					(tipo): tipo is string => typeof tipo === 'string',
				);
				resolved.push(
					...(await resolveFieldValueSections(componentTipos, context.ownerSectionTipo)),
				);
				continue;
			}
			// hierarchy_terms source: the values are term LOCATORS — the sqo
			// target is each locator's section_tipo; `recursive`/`section_id`
			// matter only to get_fixed_filter (./filters.ts:174), not here
			// (PHP :2850-65). Zero live sqo users — parity insurance.
			if (source === 'hierarchy_terms') {
				for (const term of Array.isArray(value) ? value : []) {
					const sectionTipo = (term as { section_tipo?: unknown } | null)?.section_tipo;
					if (typeof sectionTipo === 'string') resolved.push(sectionTipo);
				}
				continue;
			}
			// section source (and default — PHP's default serves any unknown name,
			// incl. the live 'section_tipo' alias): every value tipo is gated on
			// its TLD being INSTALLED (PHP check_active_tld, case 'section'/default
			// :2867-88 — uninstalled targets are DROPPED, not emitted).
			if (typeof source === 'string' && !KNOWN_SQO_SOURCES.has(source)) {
				console.warn(
					`[request_config/explicit] unknown sqo section_tipo source '${source}' resolved with section semantics (PHP default branch)`,
				);
			}
			for (const tipo of Array.isArray(value) ? value : []) {
				if (typeof tipo === 'string') {
					if (tipo === 'self') {
						resolved.push(context.ownerSectionTipo);
					} else if (await isActiveTldTipo(tipo)) {
						resolved.push(tipo);
					}
				}
			}
		}
	}
	// PHP tail: array_unique (:2892-95), then the v6 trait prunes EVERY resolved
	// target with ontology_utils::check_tipo_is_valid (:262-270) — a tipo whose
	// ontology MODEL cannot be resolved is dropped with a warning. This is what
	// actually removes numisdata279's category1 (its 'category' TLD is installed
	// but no category1 node exists), NOT the TLD gate.
	const valid: string[] = [];
	for (const tipo of [...new Set(resolved)]) {
		if ((await getModelByTipo(tipo)) === null) {
			console.warn(
				`[request_config/explicit] dropped sqo target '${tipo}': no resolvable ontology model (PHP check_tipo_is_valid)`,
			);
			continue;
		}
		valid.push(tipo);
	}
	return valid;
}

/**
 * PHP ontology_utils::check_active_tld (class.ontology_utils.php:268-79):
 * 'section_id' always passes (SQO pseudo-tipo); otherwise the tipo's TLD
 * (leading letters, PHP get_tld_from_tipo /^[a-z]{2,}/) must be installed in
 * dd_ontology (getActiveTlds — hub-invalidated module cache).
 */
async function isActiveTldTipo(tipo: string): Promise<boolean> {
	if (tipo === 'section_id') return true;
	const tld = tipo.match(/^[a-z]{2,}/)?.[0];
	if (tld === undefined) return false;
	return (await getActiveTlds()).includes(tld);
}

/** Cache: typology ids key → active hierarchy target section tipos. */
const hierarchySectionsCache = createOntologyCache<string, string[]>();

/** The hierarchy registry section whose records the cache derives from. */
const HIERARCHY_REGISTRY_SECTION_TIPO = 'hierarchy1';

/** Drop the hierarchy-sections cache (hub/event invalidation + tests). */
export function clearHierarchySectionsCache(): void {
	hierarchySectionsCache.clear();
}
// Ontology-derived too — hub-cleared (S1-11 stopgap).
registerOntologyCacheClearer(clearHierarchySectionsCache);
// Data-derived: a write/delete of a hierarchy1 registry record (new hierarchy,
// typology or active-flag change) rebuilds the list (the durable S1-11 channel).
registerSectionDataListener((sectionTipo) => {
	if (sectionTipo === HIERARCHY_REGISTRY_SECTION_TIPO) clearHierarchySectionsCache();
});

/**
 * PHP component_relation_common::get_hierarchy_sections_from_types — the
 * ACTIVE (hierarchy4 = dd64/1) hierarchy records (hierarchy1) whose typology
 * (hierarchy9 → hierarchy13/<type id>) matches, yielding their TARGET section
 * tipo (hierarchy53 value). Exported for the cache-invalidation gates (the
 * production entry is resolveSqoSectionTipos' hierarchy_types branch).
 */
export async function resolveHierarchySectionsFromTypes(typeIds: number[]): Promise<string[]> {
	const cacheKey = typeIds.join('_');
	const cached = hierarchySectionsCache.get(cacheKey);
	if (cached !== undefined) return cached;
	if (typeIds.length === 0) return [];

	const { sql } = await import('../../db/postgres.ts');
	const typologyClauses = typeIds
		.map(
			(id) =>
				`relation->'hierarchy9' @> '[{"section_id":"${Math.floor(id)}","section_tipo":"hierarchy13"}]'::jsonb`,
		)
		.join(' OR ');
	const rows = (await sql.unsafe(
		`SELECT COALESCE(data->'hierarchy53', string->'hierarchy53')->0->>'value' AS target
		 FROM matrix_hierarchy_main
		 WHERE section_tipo = 'hierarchy1'
		   AND relation->'hierarchy4' @> '[{"section_id":"1","section_tipo":"dd64"}]'::jsonb
		   AND (${typologyClauses})
		 ORDER BY section_id`,
		[],
	)) as { target: string | null }[];
	const sections = rows
		.map((row) => row.target)
		.filter((target): target is string => typeof target === 'string' && target !== '');
	hierarchySectionsCache.set(cacheKey, sections);
	return sections;
}

/** Cache: the single all-ontologies target-section list (one key). */
const ontologySectionsCache = createOntologyCache<string, string[]>();

/** The ontology registry section whose records the cache derives from. */
const ONTOLOGY_REGISTRY_SECTION_TIPO = 'ontology35';

/** Drop the ontology-sections cache (hub/event invalidation + tests). */
export function clearOntologySectionsCache(): void {
	ontologySectionsCache.clear();
}
registerOntologyCacheClearer(clearOntologySectionsCache);
// Data-derived: a write/delete of an ontology35 registry record (new ontology,
// target change) rebuilds the list.
registerSectionDataListener((sectionTipo) => {
	if (sectionTipo === ONTOLOGY_REGISTRY_SECTION_TIPO) clearOntologySectionsCache();
});

/**
 * PHP ontology::get_all_ontology_sections (class.ontology.php:1509-51): every
 * matrix_ontology_main registry row's target section (hierarchy53 value) —
 * NO active-flag filter, NO TLD gate; rows without a target are skipped.
 * Exported for the cache-invalidation gates (production entry is
 * resolveSqoSectionTipos' ontology_sections branch). Leaner than
 * data_io.ts::getActiveOntologies (which also resolves typology names and
 * skips tld-less rows — PHP here does neither).
 */
export async function resolveOntologySections(): Promise<string[]> {
	const cached = ontologySectionsCache.get('all');
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT COALESCE(data->'hierarchy53', string->'hierarchy53')->0->>'value' AS target
		FROM matrix_ontology_main
		WHERE section_tipo = ${ONTOLOGY_REGISTRY_SECTION_TIPO}
		ORDER BY section_id
	`) as { target: string | null }[];
	const sections = rows
		.map((row) => row.target)
		.filter((target): target is string => typeof target === 'string' && target !== '');
	ontologySectionsCache.set('all', sections);
	return sections;
}

/**
 * PHP get_request_config_section_tipo case 'field_value'
 * (class.component_relation_common.php:2744-2848): over the CALLER section's
 * ACTIVE records (whole-column `relation @>` on the hierarchy4/dd64/1 flag —
 * GIN-indexable, which matters on matrix_activity_diffusion's 1.8M rows),
 * read each named component's data values; keep only values that resolve to
 * a section model (:2831-33). UNCACHED on purpose — record-data-derived with
 * no invalidation signal (same posture as filter_by_list/fixed_filter).
 * Zero matching active records short-circuits to [] (PHP :2797 — dd1763).
 */
async function resolveFieldValueSections(
	componentTipos: string[],
	callerSectionTipo: string,
): Promise<string[]> {
	const { getMatrixTableFromTipo } = await import('../../ontology/resolver.ts');
	const table = await getMatrixTableFromTipo(callerSectionTipo);
	if (table === null) return [];
	const resolved: string[] = [];
	for (const componentTipo of componentTipos) {
		// Interpolated as a jsonb key — enforce the tipo grammar strictly.
		if (!/^[a-z]{2,}[0-9]+$/.test(componentTipo)) {
			console.warn(
				`[request_config/explicit] field_value skipped malformed component tipo '${componentTipo}'`,
			);
			continue;
		}
		const rows = (await sql.unsafe(
			`SELECT elem->>'value' AS target
			 FROM "${table}" t,
			      jsonb_array_elements(
			        CASE WHEN jsonb_typeof(COALESCE(t.data->'${componentTipo}', t.string->'${componentTipo}')) = 'array'
			             THEN COALESCE(t.data->'${componentTipo}', t.string->'${componentTipo}')
			             ELSE '[]'::jsonb END
			      ) elem
			 WHERE t.section_tipo = $1
			   AND t.relation @> '{"hierarchy4":[{"section_tipo":"dd64","section_id":"1","from_component_tipo":"hierarchy4"}]}'::jsonb
			 ORDER BY t.section_id`,
			[callerSectionTipo],
		)) as { target: string | null }[];
		for (const row of rows) {
			const candidate = row.target;
			if (typeof candidate !== 'string' || candidate === '') continue;
			// PHP keeps a candidate only when it RESOLVES to a section (:2831-33).
			if ((await getModelByTipo(candidate)) === 'section') {
				resolved.push(candidate);
			} else {
				console.warn(
					`[request_config/explicit] field_value dropped non-section candidate '${candidate}' (PHP :2834-43)`,
				);
			}
		}
	}
	return resolved;
}

/** One processed ddo (enriched, self-resolved). */
export interface ProcessedDdo {
	tipo: string;
	model: string;
	/** Array for normal ddos; SCALAR for component_dataframe; ABSENT when the
	 * raw ddo declared none (PHP only rewrites the literal 'self'). */
	section_tipo?: string | string[];
	parent: string;
	mode: string;
	label: string | null;
	[extra: string]: unknown;
}

/** Process one raw ddo (PHP process_single_ddo, the 11-step pipeline — v0 subset).
 * `targetTipos` = the item's RESOLVED sqo target sections: a non-dataframe
 * ddo's section_tipo 'self' resolves to THEM (PHP resolve_ddo_self_references
 * :250-255 — the ddo describes a component AT THE TARGET, not the caller);
 * dataframes get the CALLER section (scalar); undefined stays untouched. */
async function processSingleDdo(
	rawDdo: Record<string, unknown>,
	context: RequestConfigContext,
	mapType: 'show' | 'search' | 'choose' | 'hide',
	targetTipos: string[] = [],
): Promise<ProcessedDdo | null> {
	const tipo = rawDdo.tipo;
	if (typeof tipo !== 'string' || tipo === '') return null; // step 1: drop
	const node = await getNode(tipo);
	if (node === null) return null; // step 2: invalid tipo → drop
	const model = await getModelByTipo(tipo);
	if (model === null) return null;

	// step 4: groupers dropped in show+list
	if (mapType === 'show' && context.mode === 'list' && model.startsWith('section_group')) {
		return null;
	}

	// step 6: self references (PHP resolve_ddo_self_references :250-255) —
	// 'self' resolves to the item's TARGET sections for normal ddos (the
	// child lives at the portal targets) and to the SCALAR caller section for
	// dataframes (frames live on the caller's record). An UNDEFINED
	// section_tipo stays undefined (PHP only rewrites the literal 'self');
	// the per-locator grouping treats undeclared as match-all.
	const rawSectionTipo = rawDdo.section_tipo;
	let sectionTipo: string | string[] | undefined;
	if (rawSectionTipo === 'self') {
		sectionTipo =
			model === 'component_dataframe'
				? context.ownerSectionTipo
				: targetTipos.length > 0
					? targetTipos
					: [context.ownerSectionTipo];
	} else {
		sectionTipo = rawSectionTipo as string | string[] | undefined;
	}
	const parent = rawDdo.parent === 'self' ? context.ownerTipo : ((rawDdo.parent as string) ?? '');

	// step 7: mode — unset modes: tm propagates; non-section owners force
	// 'list'; section owners inherit the caller mode (PHP resolve_ddo_mode).
	const rawMode = rawDdo.mode as string | undefined;
	const mode =
		rawMode ?? (context.mode === 'tm' ? 'tm' : context.ownerIsSection ? context.mode : 'list');

	// step 5: label enrichment when absent.
	const label = (rawDdo.label as string | undefined) ?? (await contextLabelOf(tipo));

	// step 11 (PHP process_single_ddo :146-52 → check_ddo_permissions :381-92):
	// SECTION-owned configs drop ddos the actor holds level 0 on — portals and
	// component-owned configs are NEVER gated here (PHP guards on
	// context->model==='section'). The principal comes from the request-context
	// ALS at CALL TIME (never module-hoisted); absent principal = no filter
	// (internal resolutions — the emission backstop in section/read.ts is the
	// confidentiality boundary for client-driven maps).
	if (context.ownerIsSection) {
		const { currentPrincipal } = await import('../../security/request_context.ts');
		const { ddoIsAuthorized } = await import('../../security/permissions.ts');
		const authorized = await ddoIsAuthorized(
			currentPrincipal(),
			sectionTipo ?? context.ownerSectionTipo,
			tipo,
		);
		if (!authorized) return null;
	}

	return {
		...rawDdo,
		tipo,
		model,
		section_tipo: sectionTipo,
		parent,
		mode,
		label,
		// step 8 (PHP resolve_ddo_fixed_mode): mode is resolved for every ddo by
		// this point, so every processed ddo is fixed_mode — the client keeps the
		// ddo's mode for the cell instance instead of downgrading to list.
		fixed_mode: true,
	};
}

/**
 * One ENRICHED sqo.section_tipo entry (PHP build_sqo_section_tipo_ddo,
 * trait.request_config_utils.php:424): the CLIENT consumes these — the
 * portal link/new buttons read target_section[0].tipo, the header chips read
 * label/color, the button visibility reads permissions/buttons. Field order
 * matches the PHP wire: typo, tipo, model, permissions, label, buttons,
 * color, matrix_table.
 */
export interface SqoSectionTipoDdo {
	typo: 'ddo';
	tipo: string;
	model: string;
	permissions: number;
	label: string | null;
	buttons: { model: string; permissions: number }[];
	color: string;
	matrix_table: string | null;
}

/** A parsed request_config item (v0 field subset). */
export interface ParsedRequestConfigItem {
	api_engine: string;
	type: string;
	sqo: {
		section_tipo: SqoSectionTipoDdo[];
		limit?: number;
		offset?: number;
		[extra: string]: unknown;
	};
	show: { ddo_map: ProcessedDdo[]; sqo_config?: unknown } | null;
	search: { ddo_map: ProcessedDdo[]; sqo_config?: unknown } | null;
	choose: { ddo_map: ProcessedDdo[]; sqo_config?: unknown } | null;
	hide: { ddo_map: ProcessedDdo[] } | null;
}

/**
 * Flat tipo strings of a parsed item's (enriched) sqo.section_tipo (PHP
 * extract_section_tipos_from_sqo, trait.request_config_v6.php:666) — the
 * projection every ENGINE-side consumer works with.
 */
export function extractSqoSectionTipos(item: ParsedRequestConfigItem | undefined): string[] {
	const entries = item?.sqo.section_tipo ?? [];
	// Deduped WITHIN this one config item (PHP array_unique at the end of
	// get_request_config_section_tipo, :2892-95). Cross-CONFIG duplicates are
	// preserved by the consumers that flatten multi-config elements — PHP
	// get_ar_target_section_ddo concatenates configs without dedup (:3070-77),
	// so a two-config element repeats its shared targets (e.g. numisdata560).
	return [
		...new Set(
			entries
				.map((entry) => (typeof entry === 'string' ? entry : entry?.tipo))
				.filter((tipo): tipo is string => typeof tipo === 'string' && tipo !== ''),
		),
	];
}

/** button_new/button_delete direct children of a section (virtual-aware). */
async function findSectionButtonTipo(
	sectionTipo: string,
	buttonModel: string,
): Promise<string | null> {
	const read = async (parent: string) =>
		(await sql.unsafe('SELECT tipo FROM dd_ontology WHERE parent = $1 AND model = $2 LIMIT 1', [
			parent,
			buttonModel,
		])) as { tipo: string }[];
	let rows = await read(sectionTipo);
	if (rows.length === 0) {
		const nodeRows = (await sql.unsafe('SELECT relations FROM dd_ontology WHERE tipo = $1', [
			sectionTipo,
		])) as { relations: { tipo?: unknown }[] | null }[];
		const real = nodeRows[0]?.relations?.[0]?.tipo;
		if (typeof real === 'string') rows = await read(real);
	}
	return rows[0]?.tipo ?? null;
}

/**
 * Enrich resolved target-section tipos into the client-facing ddo objects
 * (PHP build_sqo_section_tipo_ddo): app-lang label, properties color (gray
 * default), the caller's permissions, and — with edit permissions — the
 * section's button_new/button_delete descriptors. Permissions carry the v0
 * admin posture (3) like every structure-context stamp; the per-caller ACL
 * cap is the standing Phase-5 ledger item.
 */
export async function buildSqoSectionTipoDdos(tipos: string[]): Promise<SqoSectionTipoDdo[]> {
	const { getMatrixTableFromTipo } = await import('../../ontology/resolver.ts');
	const permissions = 3;
	const enriched: SqoSectionTipoDdo[] = [];
	for (const tipo of tipos) {
		const node = await getNode(tipo);
		const buttons: { model: string; permissions: number }[] = [];
		if (permissions > 1) {
			for (const buttonModel of ['button_new', 'button_delete']) {
				const buttonTipo = await findSectionButtonTipo(tipo, buttonModel);
				if (buttonTipo !== null) buttons.push({ model: buttonModel, permissions });
			}
		}
		enriched.push({
			typo: 'ddo',
			tipo,
			model: (await getModelByTipo(tipo)) ?? 'section',
			permissions,
			label: await contextLabelOf(tipo),
			buttons,
			color: (node?.properties as { color?: string } | null)?.color ?? '#b9b9b9',
			matrix_table: await getMatrixTableFromTipo(tipo),
		});
	}
	return enriched;
}

/**
 * Dynamic ddo_map from section_map columns (PHP resolve_get_ddo_map,
 * trait.request_config_ddo.php:424, model 'section_map'): for every resolved
 * target section, each column's [scope, key] path names the component
 * tipo(s) via the section's section_map (SCOPE_FALLBACK-aware). A component
 * tipo seen under several target sections merges into ONE ddo whose
 * section_tipo becomes the array of those sections. Extra column properties
 * (mode, label, …) apply to the generated ddo; 'path' is build-time only.
 */
async function resolveGetDdoMap(
	targetSections: string[],
	getDdoMap: unknown,
	context: RequestConfigContext,
): Promise<Record<string, unknown>[]> {
	if (getDdoMap === false || getDdoMap === null || getDdoMap === undefined) return [];
	const directive = getDdoMap as { model?: unknown; columns?: unknown[] };
	if (typeof directive !== 'object' || directive.model !== 'section_map') return [];
	const columns = Array.isArray(directive.columns) ? directive.columns : [];

	const { getSectionMapValue } = await import('../../ontology/section_map.ts');
	const calculated: Record<string, unknown>[] = [];
	const processedTipos = new Set<string>();
	for (const currentSection of targetSections) {
		for (const originalColumn of columns) {
			// pre-2024-08-10 compatibility: bare-array columns ARE the path.
			const column = Array.isArray(originalColumn)
				? { path: originalColumn }
				: (originalColumn as { path?: unknown[] } & Record<string, unknown>);
			const path = Array.isArray(column.path) ? column.path : [];
			if (path.length !== 2) continue;
			const value = await getSectionMapValue(currentSection, String(path[0]), String(path[1]));
			if (value === null || value === undefined || value === '') continue;
			for (const componentTipo of Array.isArray(value) ? value : [value]) {
				if (typeof componentTipo !== 'string') continue;
				if (processedTipos.has(componentTipo)) {
					// Dedup merge: extend the existing ddo's section_tipo array.
					const existing = calculated.find((ddo) => ddo.tipo === componentTipo);
					if (existing !== undefined) {
						const current = existing.section_tipo;
						existing.section_tipo = [
							...(Array.isArray(current) ? current : [current]),
							currentSection,
						];
					}
					continue;
				}
				const ddo: Record<string, unknown> = {
					tipo: componentTipo,
					section_tipo: currentSection,
					parent: context.ownerTipo,
				};
				for (const [key, extra] of Object.entries(column)) {
					if (key === 'path') continue;
					ddo[key] = extra;
				}
				processedTipos.add(componentTipo);
				calculated.push(ddo);
			}
		}
	}
	return calculated;
}

/** Parse one block (show/search/choose/hide) — ddo_map processing + passthrough. */
async function parseBlock(
	rawBlock: unknown,
	context: RequestConfigContext,
	mapType: 'show' | 'search' | 'choose' | 'hide',
	targetSections: string[] = [],
): Promise<{ ddo_map: ProcessedDdo[]; [extra: string]: unknown } | null> {
	if (rawBlock === null || rawBlock === undefined || typeof rawBlock !== 'object') return null;
	const block = rawBlock as Record<string, unknown>;
	// Resolution order (PHP parse_show_config): explicit ddo_map first, else
	// the dynamic get_ddo_map directive over the resolved target sections.
	let rawMap = Array.isArray(block.ddo_map) ? (block.ddo_map as Record<string, unknown>[]) : [];
	if (rawMap.length === 0 && block.get_ddo_map !== undefined) {
		rawMap = await resolveGetDdoMap(targetSections, block.get_ddo_map, context);
	}
	const processed: ProcessedDdo[] = [];
	for (const rawDdo of rawMap) {
		const ddo = await processSingleDdo(rawDdo, context, mapType, targetSections);
		if (ddo !== null) processed.push(ddo);
	}
	return { ...block, ddo_map: processed };
}

/**
 * Process CLIENT-rqo children ddos through the same enrichment pipeline (the
 * narrowing path — PHP get_subdatum children-injection): self-resolution,
 * mode resolution, model + label enrichment.
 */
export async function processRqoChildren(
	rqoChildren: Record<string, unknown>[],
	context: RequestConfigContext,
	targetTipos: string[] = [],
): Promise<ProcessedDdo[]> {
	const processed: ProcessedDdo[] = [];
	for (const rawDdo of rqoChildren) {
		const ddo = await processSingleDdo(rawDdo, context, 'show', targetTipos);
		if (ddo !== null) processed.push(ddo);
	}
	return processed;
}

/**
 * Parse a component's properties.source.request_config. Returns [] when
 * absent (the caller decides on the implicit fallback via ./build.ts).
 *
 * Live sqo expansions (PHP parse_request_config_item steps 2 + 8): the
 * declarative `filter_by_list` / `fixed_filter` entries resolve to their
 * live values (./filters.ts — record data, never cache a config carrying
 * them), and non-dedalo engines get the target section's `api_config`
 * attached (./external.ts).
 */
export async function buildExplicitRequestConfig(
	properties: unknown,
	context: RequestConfigContext,
): Promise<ParsedRequestConfigItem[]> {
	const rawConfig = (properties as { source?: { request_config?: unknown } } | null)?.source
		?.request_config;
	if (!Array.isArray(rawConfig)) return [];

	const parsed: ParsedRequestConfigItem[] = [];
	for (const rawItem of rawConfig) {
		if (rawItem === null || typeof rawItem !== 'object') continue; // PHP: warn+drop
		const item = rawItem as Record<string, unknown>;
		const rawSqo = (item.sqo ?? {}) as Record<string, unknown>;
		// An sqo WITHOUT section_tipo targets the CALLER's own section (PHP
		// resolve_sqo_section_tipo :256-258 — the self-targeting sqo shape of
		// relation_related configs like numisdata36/numisdata1006). The
		// resolved tipos ship ENRICHED as ddo objects (the client contract);
		// engine consumers project back via extractSqoSectionTipos.
		const targetTipos =
			rawSqo.section_tipo === undefined
				? [context.ownerSectionTipo]
				: await resolveSqoSectionTipos(rawSqo.section_tipo, context);
		const sqo: ParsedRequestConfigItem['sqo'] = {
			...rawSqo,
			section_tipo: await buildSqoSectionTipoDdos(targetTipos),
		};
		// Live filter expansions (PHP resolve_sqo_section_tipo :275-292).
		if (rawSqo.filter_by_list !== undefined) {
			const { expandFilterByList } = await import('./filters.ts');
			sqo.filter_by_list = await expandFilterByList(
				rawSqo.filter_by_list,
				context.lang ?? 'lg-spa',
			);
		}
		if (rawSqo.fixed_filter !== undefined) {
			const { expandFixedFilter } = await import('./filters.ts');
			sqo.fixed_filter = await expandFixedFilter(
				rawSqo.fixed_filter,
				context.ownerSectionTipo,
				context.ownerSectionId ?? null,
			);
		}
		const parsedItem: ParsedRequestConfigItem = {
			api_engine: (item.api_engine as string) ?? 'dedalo',
			type: (item.type as string) ?? 'main',
			sqo,
			show: await parseBlock(item.show, context, 'show', targetTipos),
			search: await parseBlock(item.search, context, 'search', targetTipos),
			choose: await parseBlock(item.choose, context, 'choose', targetTipos),
			hide: await parseBlock(item.hide, context, 'hide', targetTipos),
		};
		// PHP resolve_show_sqo_config → build_sqo_config_default: when a config
		// declares a custom page size (sqo.limit) but ships no explicit
		// show.sqo_config, synthesize one so the client paginator — which reads
		// show.sqo_config.limit (section.js:827) for subsequent pages — uses that
		// page size instead of the global 10 default. Scoped to configs WITH an
		// explicit sqo.limit (e.g. dd542 Activity's dd549 → 30) so the general
		// element wire shape is untouched; matches PHP's emitted sqo_config shape.
		if (
			parsedItem.show &&
			(parsedItem.show as { sqo_config?: unknown }).sqo_config === undefined &&
			typeof rawSqo.limit === 'number' &&
			rawSqo.limit > 0
		) {
			(parsedItem.show as { sqo_config?: unknown }).sqo_config = {
				full_count: false,
				limit: rawSqo.limit,
				offset: typeof rawSqo.offset === 'number' ? rawSqo.offset : 0,
				mode: context.mode,
				operator: '$or',
			};
		}
		// PHP parse_choose_config sqo_config tail (trait.request_config_v6.php:549-563):
		// a config WITH a choose block always ships choose.sqo_config.limit — the
		// autocomplete selection size resolved SERVER-side (single source of truth),
		// falling back choose → search.sqo_config → show.sqo_config → 25. An explicit
		// 0 is VALID (disables the picker). A choose-LESS config stays choose-less
		// (PHP early-returns; the client owns that fallback chain — common.js
		// build_rqo_search).
		if (parsedItem.choose !== null) {
			const chooseBlock = parsedItem.choose as {
				sqo_config?: { limit?: unknown; [extra: string]: unknown } | null;
			};
			if (chooseBlock.sqo_config === undefined || chooseBlock.sqo_config === null) {
				chooseBlock.sqo_config = {};
			}
			if (chooseBlock.sqo_config.limit === undefined || chooseBlock.sqo_config.limit === null) {
				const fallbackLimit = (
					(parsedItem.search as { sqo_config?: { limit?: unknown } } | null)?.sqo_config ??
					(parsedItem.show as { sqo_config?: { limit?: unknown } } | null)?.sqo_config
				)?.limit;
				chooseBlock.sqo_config.limit = typeof fallbackLimit === 'number' ? fallbackLimit : 25;
			}
		}
		// External engines carry the target section's api_config (PHP step 8).
		if (parsedItem.api_engine !== 'dedalo') {
			const { resolveExternalConfig } = await import('./external.ts');
			await resolveExternalConfig(parsedItem);
		}
		parsed.push(parsedItem);
	}
	return parsed;
}
