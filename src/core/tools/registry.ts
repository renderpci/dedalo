/**
 * Tools registry reader + user_tools resolver (PHP tool_common::
 * get_all_registered_tools → get_user_tools → create_tool_simple_context,
 * exposed via dd_tools_api::user_tools, and the section/component tool FILTER
 * common::get_tools).
 *
 * WHAT IT IS
 * Dédalo "tools" are ontology-registered mini-applications (export, import,
 * time machine, diffusion, …). Their registry is NOT a bespoke table: each tool
 * is a record in the tools register section (dd1324) stored in matrix_tools with
 * the same typed-JSONB column contract as any other section. A tool is ACTIVE
 * when its dd1354 radio_button relation points at dd64/1.
 *
 * WHAT THIS RESOLVES
 * - The SUPERUSER user_tools list: every active tool as a "simple context" DDO.
 * - The AUTHORIZED user_tools of a specific (non-admin) user, via their profile.
 * - The section/component tool FILTER (common::get_tools): affected_models /
 *   affected_tipos / all_components / in_properties matching plus per-tool
 *   is_available().
 *
 * The per-tool `is_available()` for tools that HAVE a server module is answered
 * by that module's hook (see loader/dispatch, Phase 3+). Until each of the two
 * legacy endpoints moves, the availability of tool_time_machine / tool_diffusion
 * is answered here as a core fallback so parity tests stay pinned.
 *
 * LEDGERED (not implemented here):
 * - tool_config ddo_map `self` resolution (used when a tool is opened against a
 *   specific record) — that is the get_element_context tool branch (Phase 6).
 */

import { sql } from '../db/postgres.ts';
import { currentApplicationLang } from '../resolve/request_lang.ts';
import {
	AFFECTED_MODELS_SECTION_TIPO,
	MODEL_NAME_COMPONENT,
	PROFILE_SECTION_TIPO,
	PROFILE_TOOLS_COMPONENT,
	TIPO,
	TOOLS_REGISTER_SECTION_TIPO,
} from './ontology_map.ts';
import { getToolUrl } from './paths.ts';
import type { ElementToolsResult, ElementToolsTarget, ToolSimpleContext } from './types.ts';

export type { ElementToolsResult, ElementToolsTarget, ToolSimpleContext } from './types.ts';
/** Re-exported for callers that still reference the register section by name. */
export const TOOLS_SECTION_TIPO = TOOLS_REGISTER_SECTION_TIPO;

/**
 * Tools whose availability the section-tools filter cannot yet decide because
 * their PHP `is_available()` depends on a not-yet-ported subsystem. They are
 * omitted from the filtered result and reported separately (never silently
 * included/excluded).
 */
const AVAILABILITY_LEDGERED_TOOLS: ReadonlySet<string> = new Set<string>([]);

/**
 * Component models that override get_tools() to return [] (PHP
 * component_section_id / component_info): they never show a toolbar, whatever
 * the registry would otherwise match.
 */
const NO_TOOLS_MODELS: ReadonlySet<string> = new Set(['component_section_id', 'component_info']);

/** Shape of the typed columns we read from a matrix_tools record. */
interface ToolRow {
	string: Record<string, { lang?: string; value?: string }[] | undefined> | null;
	misc: Record<string, { value?: unknown }[] | undefined> | null;
	relation: Record<string, { section_id?: string | number }[] | undefined> | null;
}

/**
 * A radio_button flag is "yes" when its first locator targets dd64/1 (PHP
 * create_simple_tool_object: `$data[0]->section_id == '1'`).
 */
function radioIsYes(relation: ToolRow['relation'], componentTipo: string): boolean {
	const first = relation?.[componentTipo]?.[0];
	return first !== undefined && String(first.section_id) === '1';
}

/** Resolve the tool label in the application language (PHP fallback: first, then name). */
function resolveToolLabel(
	labelItems: { lang?: string; value?: string }[] | undefined,
	name: string,
): string {
	if (labelItems === undefined || labelItems.length === 0) return name;
	const appLang = currentApplicationLang();
	const match = labelItems.find((item) => item.lang === appLang);
	const label = match?.value ?? labelItems[0]?.value;
	return label !== undefined && label !== '' ? label : name;
}

/**
 * The SUPERUSER user_tools list: every ACTIVE tool as a simple-context DDO,
 * ordered by section_id (the registry's stable order).
 */
export async function getSuperuserUserTools(): Promise<ToolSimpleContext[]> {
	const rows = await fetchActiveToolRows();
	const tools: ToolSimpleContext[] = [];
	for (const row of rows) {
		const tool = buildToolSimpleContext(row);
		if (tool !== null) tools.push(tool);
	}
	return tools;
}

/**
 * The AUTHORIZED tools of one user (PHP tool_common::get_user_tools).
 * Superusers/global admins receive every active tool; anyone else receives
 * the tools their PROFILE record grants (dd234's dd1067 locators → tool
 * registry section_ids) plus tools flagged always_active. A user without a
 * profile gets only the always_active set (fail-closed).
 */
export async function getUserTools(
	userId: number,
	isGlobalAdmin: boolean,
): Promise<ToolSimpleContext[]> {
	if (isGlobalAdmin) return getSuperuserUserTools();

	// The profile's authorized tool record ids (dd1067 locators → dd1324 rows).
	const allowedIds = new Set<number>();
	const profileRows = (await sql.unsafe(
		`SELECT p.relation->'${PROFILE_TOOLS_COMPONENT}' AS grants
		 FROM matrix_profiles p
		 WHERE p.section_tipo = '${PROFILE_SECTION_TIPO}' AND p.section_id = (
			SELECT (u.relation->'dd1725'->0->>'section_id')::int
			FROM matrix_users u WHERE u.section_id = $1
		 )`,
		[userId],
	)) as { grants: { section_id?: string | number; section_tipo?: string }[] | null }[];
	for (const locator of profileRows[0]?.grants ?? []) {
		if (locator?.section_tipo === TOOLS_REGISTER_SECTION_TIPO && locator.section_id !== undefined) {
			allowedIds.add(Number(locator.section_id));
		}
	}

	const rows = await fetchActiveToolRows();
	const tools: ToolSimpleContext[] = [];
	for (const row of rows) {
		const alwaysActive = radioIsYes(row.relation, TIPO.ALWAYS_ACTIVE);
		if (!alwaysActive && !allowedIds.has(row.section_id)) continue;
		const tool = buildToolSimpleContext(row);
		if (tool !== null) tools.push(tool);
	}
	return tools;
}

/** Active registry rows (dd1354 dd64/1), in stable section_id order. */
async function fetchActiveToolRows(): Promise<(ToolRow & { section_id: number })[]> {
	return (await sql`
		SELECT section_id, string, misc, relation
		FROM matrix_tools
		WHERE section_tipo = ${TOOLS_REGISTER_SECTION_TIPO}
		  AND relation->${TIPO.ACTIVE} @> '[{"section_id":"1","section_tipo":"dd64"}]'
		ORDER BY section_id
	`) as (ToolRow & { section_id: number })[];
}

/** One registry row → the simple-context DDO (null for a malformed record). */
function buildToolSimpleContext(row: ToolRow): ToolSimpleContext | null {
	const name = row.string?.[TIPO.NAME]?.[0]?.value;
	if (name === undefined || name === '') return null;

	const baseUrl = getToolUrl(name);
	const properties = row.misc?.[TIPO.PROPERTIES]?.[0]?.value ?? null;
	// PHP dd_object drops a null `properties` key entirely and keeps it in
	// declaration position (between model and label) when present — the
	// conditional spread reproduces both, so the DDO is byte-identical.
	return {
		typo: 'ddo',
		type: 'tool',
		section_tipo: TOOLS_REGISTER_SECTION_TIPO,
		mode: 'edit',
		model: name,
		...(properties !== null ? { properties } : {}),
		label: resolveToolLabel(row.string?.[TIPO.LABEL], name),
		css: { url: `${baseUrl}/css/${name}.css` },
		name,
		icon: `${baseUrl}/img/icon.svg`,
		show_in_inspector: radioIsYes(row.relation, TIPO.SHOW_IN_INSPECTOR),
		show_in_component: radioIsYes(row.relation, TIPO.SHOW_IN_COMPONENT),
	};
}

/**
 * A registered tool's lang-INDEPENDENT row data plus the fields the
 * section-context filter needs. The simple-context DDO is NOT stored here: its
 * label depends on the per-request application lang, so getElementTools builds
 * it fresh per call (PHP-shaped — PHP's tool file cache stores the label as a
 * lang-wrapped array resolved per request).
 */
interface RegisteredTool {
	name: string;
	/** Raw dd799 lang-wrapped label items; resolved per call via resolveToolLabel. */
	labelItems: { lang?: string; value?: string }[] | undefined;
	/** Parsed dd1348 properties value, or null (dd_object drops a null key). */
	properties: unknown;
	showInInspector: boolean;
	showInComponent: boolean;
	/** Resolved model names the tool affects (dd1330 → dd1342 names). */
	affectedModels: string[];
	/** Tipos/patterns the tool restricts to (dd1350 misc value), or []. */
	affectedTipos: string[];
	requirementTranslatable: boolean;
}

/**
 * tipo membership test (PHP tipo_in_array): a value matches when it is a
 * wildcard sharing the tipo's TLD (`numisdata*`), a `/…/` regex the tipo
 * matches, or an exact string. Empty list → no restriction (caller checks).
 */
function tipoInArray(tipo: string, values: string[]): boolean {
	const tld = (candidate: string): string => candidate.replace(/[0-9].*$/, '');
	for (const value of values) {
		if (typeof value !== 'string') continue;
		if (value.includes('*')) {
			if (tld(tipo) === tld(value)) return true;
		}
		if (value.includes('/')) {
			// PHP-style `/pattern/flags` delimited regex → JS RegExp.
			const match = value.match(/^\/(.*)\/([a-z]*)$/);
			if (match) {
				try {
					if (new RegExp(match[1] as string, match[2]).test(tipo)) return true;
				} catch {
					// malformed pattern — ignore, mirrors PHP's failed preg_match
				}
			}
		}
	}
	return values.includes(tipo);
}

/**
 * Availability check (PHP is_available). A tool that ships a server module owns
 * this decision via the module's isAvailable hook; tools without a module yet
 * fall back to the core rules below. Returns null when the decision is ledgered
 * (caller omits + reports the tool).
 */
async function toolIsAvailable(
	name: string,
	context: { calledClass: string; tipo: string; isComponent: boolean },
): Promise<boolean | null> {
	if (AVAILABILITY_LEDGERED_TOOLS.has(name)) return null;

	// Prefer the tool's own server-module hook (PHP is_available).
	const { getLoadedTool } = await import('./loader.ts');
	const loaded = await getLoadedTool(name);
	if (loaded?.module.isAvailable !== undefined) {
		return loaded.module.isAvailable({
			callerModel: context.calledClass,
			tipo: context.tipo,
			sectionTipo: context.tipo,
			isComponent: context.isComponent,
			mode: '',
		});
	}

	// Core fallbacks for tools that have not yet moved to a server module.
	if (name === 'tool_diffusion') {
		// PHP tool_diffusion::is_available — sections only, and the section
		// must appear in the diffusion section-map (virtual-tree walk).
		if (context.isComponent) return false;
		const { haveSectionDiffusion } = await import('../diffusion_bridge/diffusion_map.ts');
		return haveSectionDiffusion(context.tipo);
	}
	return true; // tools without an is_available() are always available
}

/** Batch-resolve dd1342 record ids → their model-name strings. */
async function getAffectedModelNameMap(): Promise<Map<string, string>> {
	const table = 'matrix_dd';
	const rows = (await sql.unsafe(
		`SELECT section_id, string->'${MODEL_NAME_COMPONENT}'->0->>'value' AS model_name
		 FROM ${table} WHERE section_tipo = $1`,
		[AFFECTED_MODELS_SECTION_TIPO],
	)) as { section_id: number; model_name: string | null }[];
	const map = new Map<string, string>();
	for (const row of rows) {
		if (row.model_name !== null) map.set(String(row.section_id), row.model_name);
	}
	return map;
}

/**
 * Registry cache (PHP caches this in a static + file). It holds ONLY
 * lang-independent row data (see RegisteredTool) — anything derived from the
 * per-request application lang (the simple-context label) is resolved per call
 * in getElementTools, never cached here. Clear it when the tools ontology
 * changes (import_tools) via invalidateAllToolCaches() in ./cache.ts.
 *
 * Single-writer semantics (2026-07-11 cutover, PHP engine retired): every
 * dd1324 write goes through this engine's write path, which invalidates via
 * the save_event channel — invalidation-only, no staleness window. (The
 * coexistence-era S2-09 TTL that bounded PHP-side-write staleness is deleted;
 * rewrite/COEXISTENCE.md history.)
 */
let registeredToolsCache: RegisteredTool[] | null = null;

/** Reset the registry reader cache. Prefer invalidateAllToolCaches() (./cache.ts). */
export function resetRegistryCache(): void {
	registeredToolsCache = null;
}

/** Read every active tool with the extra fields the section filter needs. */
async function getRegisteredTools(): Promise<RegisteredTool[]> {
	if (registeredToolsCache !== null) {
		return registeredToolsCache;
	}
	const modelNames = await getAffectedModelNameMap();
	const rows = (await sql`
		SELECT string, misc, relation
		FROM matrix_tools
		WHERE section_tipo = ${TOOLS_REGISTER_SECTION_TIPO}
		  AND relation->${TIPO.ACTIVE} @> '[{"section_id":"1","section_tipo":"dd64"}]'
		ORDER BY section_id
	`) as (ToolRow & {
		relation: Record<string, { section_id?: string | number }[] | undefined> | null;
	})[];

	const registered: RegisteredTool[] = [];
	for (const row of rows) {
		const name = row.string?.[TIPO.NAME]?.[0]?.value;
		if (name === undefined || name === '') continue;

		// affected_models: each dd1330 locator → its dd1342 model name.
		const affectedModels: string[] = [];
		for (const locator of row.relation?.[TIPO.AFFECTED_MODELS] ?? []) {
			const modelName = modelNames.get(String(locator.section_id));
			if (modelName !== undefined) affectedModels.push(modelName);
		}
		// affected_tipos: misc value array (tipos/patterns), or [].
		const affectedTiposRaw = (row.misc?.[TIPO.AFFECTED_TIPOS]?.[0] as { value?: unknown })?.value;
		const affectedTipos = Array.isArray(affectedTiposRaw) ? affectedTiposRaw.map(String) : [];

		registered.push({
			name,
			labelItems: row.string?.[TIPO.LABEL],
			properties: row.misc?.[TIPO.PROPERTIES]?.[0]?.value ?? null,
			showInInspector: radioIsYes(row.relation, TIPO.SHOW_IN_INSPECTOR),
			showInComponent: radioIsYes(row.relation, TIPO.SHOW_IN_COMPONENT),
			affectedModels,
			affectedTipos,
			requirementTranslatable: radioIsYes(row.relation, TIPO.REQUIRE_TRANSLATABLE),
		});
	}
	registeredToolsCache = registered;
	return registered;
}

/**
 * The tools shown for ONE element (PHP common::get_tools, superuser user_tools).
 * A tool applies when the element model is in affected_models, OR the tipo
 * matches affected_tipos, OR (component) 'all_components' is in affected_models,
 * OR the element declares it in properties.tool_config; then any non-empty
 * affected_tipos must match the tipo, requirement_translatable must agree with
 * the element's effective translatable, and is_available() must pass.
 * Availability-ledgered tools are reported, not guessed.
 */
export async function getElementTools(target: ElementToolsTarget): Promise<ElementToolsResult> {
	// Models that hard-override get_tools() to [] never show a toolbar.
	if (NO_TOOLS_MODELS.has(target.model)) return { tools: [], ledgered: [] };

	const registered = await getRegisteredTools();
	const inPropertyTools = new Set(target.toolConfigKeys);
	const context = {
		calledClass: target.model,
		tipo: target.tipo,
		isComponent: target.isComponent,
	};
	// PHP effective translatable: a section is never translatable; a component is
	// translatable unless it is both non-translatable AND has no lang versions.
	// (with_lang_versions is a rare component flag, deferred — defaults false.)
	const effectiveTranslatable = target.isComponent ? target.translatable : false;

	const tools: ToolSimpleContext[] = [];
	const ledgered: string[] = [];
	for (const tool of registered) {
		const applies =
			tool.affectedModels.includes(target.model) ||
			tipoInArray(target.tipo, tool.affectedTipos) ||
			(target.isComponent && tool.affectedModels.includes('all_components')) ||
			inPropertyTools.has(tool.name);
		if (!applies) continue;

		// affected_tipos[0] restriction: when set, the tipo must match.
		if (tool.affectedTipos.length > 0 && !tipoInArray(target.tipo, tool.affectedTipos)) {
			continue;
		}
		// requirement_translatable: a tool requiring translatability is shown only
		// when the element is (effectively) translatable (PHP requirement === translatable).
		if (tool.requirementTranslatable && !effectiveTranslatable) continue;

		const available = await toolIsAvailable(tool.name, context);
		if (available === null) {
			ledgered.push(tool.name);
			continue;
		}
		if (available === false) continue;

		// FRESH simple-context DDO per call: the label resolves against THIS
		// request's application lang, and no caller ever receives (or can
		// mutate) a cache-owned object.
		const baseUrl = getToolUrl(tool.name);
		const simpleContext: ToolSimpleContext = {
			typo: 'ddo',
			type: 'tool',
			section_tipo: TOOLS_REGISTER_SECTION_TIPO,
			mode: 'edit',
			model: tool.name,
			label: resolveToolLabel(tool.labelItems, tool.name),
			css: { url: `${baseUrl}/css/${tool.name}.css` },
			name: tool.name,
			icon: `${baseUrl}/img/icon.svg`,
			show_in_inspector: tool.showInInspector,
			show_in_component: tool.showInComponent,
		};
		if (tool.properties !== null) simpleContext.properties = structuredClone(tool.properties);
		tools.push(simpleContext);
	}
	return { tools, ledgered };
}

/**
 * The FULL tool element context (PHP dd_core_api::get_element_context tool
 * branch), served when the client's open_tool receives a tool NAME string
 * instead of a full context object (source:{model:'tool_x'}, no tipo). Richer
 * than the toolbar simple context: it also carries tipo/lang/labels(dd1372)/
 * description(dd612)/developer(dd1644). Returns null for an unknown tool.
 */
export async function buildToolElementContext(
	name: string,
): Promise<Record<string, unknown> | null> {
	const rows = (await sql`
		SELECT string, misc, relation
		FROM matrix_tools
		WHERE section_tipo = ${TOOLS_REGISTER_SECTION_TIPO}
		  AND string->${TIPO.NAME}->0->>'value' = ${name}
		LIMIT 1
	`) as ToolRow[];
	const row = rows[0];
	if (row === undefined) return null;

	const appLang = currentApplicationLang();
	const baseUrl = getToolUrl(name);
	const properties = row.misc?.[TIPO.PROPERTIES]?.[0]?.value ?? null;
	// Labels (dd1372) are stored for every lang but PHP exposes only the
	// application-lang entries in the tool context.
	const allLabels = (row.misc?.[TIPO.LABELS]?.[0] as { value?: unknown })?.value;
	const labels = Array.isArray(allLabels)
		? allLabels.filter((item) => (item as { lang?: string }).lang === appLang)
		: null;
	const developer = row.string?.[TIPO.DEVELOPER]?.[0]?.value ?? null;
	const description = resolveLangValue(row.string?.[TIPO.DESCRIPTION], appLang);

	// Field order mirrors PHP create_tool_simple_context (dd_object drops null
	// keys); consumers compare structurally so order is not load-bearing.
	const context: Record<string, unknown> = {
		typo: 'ddo',
		type: 'tool',
		tipo: TOOLS_REGISTER_SECTION_TIPO,
		section_tipo: TOOLS_REGISTER_SECTION_TIPO,
		lang: appLang,
		mode: 'edit',
		model: name,
		...(properties !== null ? { properties } : {}),
		label: resolveToolLabel(row.string?.[TIPO.LABEL], name),
		...(labels !== null ? { labels } : {}),
		css: { url: `${baseUrl}/css/${name}.css` },
		name,
		...(description !== null ? { description } : {}),
		icon: `${baseUrl}/img/icon.svg`,
		...(developer !== null && developer !== '' ? { developer } : {}),
		show_in_inspector: radioIsYes(row.relation, TIPO.SHOW_IN_INSPECTOR),
		show_in_component: radioIsYes(row.relation, TIPO.SHOW_IN_COMPONENT),
	};
	// Client-visible config (dd999/dd1633 client:true props): PHP appends a
	// `config` key when the tool has any, carrying the full prop definitions.
	const { getToolClientConfigRaw } = await import('./config.ts');
	const clientConfig = await getToolClientConfigRaw(name);
	if (Object.keys(clientConfig).length > 0) context.config = clientConfig;
	return context;
}

/** Resolve a lang-array component to the app-lang value (fallback: first non-empty). */
function resolveLangValue(
	items: { lang?: string; value?: string }[] | undefined,
	appLang: string,
): string | null {
	if (items === undefined || items.length === 0) return null;
	const match = items.find((item) => item.lang === appLang);
	const value = match?.value ?? items.find((item) => item.value !== '')?.value;
	return value !== undefined && value !== '' ? value : null;
}

/** Backwards-compatible section-tools helper (model 'section', non-component). */
export async function getSectionTools(
	sectionTipo: string,
	sectionToolConfigKeys: string[] = [],
): Promise<ElementToolsResult> {
	return getElementTools({
		model: 'section',
		tipo: sectionTipo,
		isComponent: false,
		translatable: false,
		toolConfigKeys: sectionToolConfigKeys,
	});
}
