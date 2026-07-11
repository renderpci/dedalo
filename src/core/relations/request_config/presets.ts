/**
 * Request-config PRESETS (layout maps) — PHP oracle:
 * core/common/class.request_config_presets.php + common::resolve_preset_properties
 * (class.common.php:3156). User/admin-saved LAYOUT overrides for a section,
 * stored as records in section dd1244. When an ACTIVE preset matches the
 * (tipo, section_tipo, mode) triple for the current user — or a PUBLIC preset
 * as fallback — its request_config REPLACES the ontology-derived one, so the
 * section renders the saved component/column layout instead of the default
 * edit-form tree / section_list columns.
 *
 * This is the STAGE-2 override of buildRequestConfigForElement (build.ts):
 * SECTION owners only (PHP resolve_preset_properties gates on
 * get_called_class()==='section'). The preset's dd625 JSON becomes
 * properties.source.request_config, so the existing EXPLICIT builder parses it
 * with no per-ddo special-casing (the show ddo_map carries the preset's
 * resolved parent/section_tipo + edit-mode css/label/parent_grouper overrides,
 * preserved through processSingleDdo's `...rawDdo` spread).
 *
 * CACHE: the hydrated active-preset LIST is memoized under one key and dropped
 * BY CONSTRUCTION on any dd1244 write/delete (createDataCache, the S1-11 event
 * channel = PHP request_config_presets::clean_cache). The per-user MATCH is
 * computed LIVE from currentPrincipal() on every call and never cached — two
 * users share the list but resolve different presets, so no identity bleeds
 * (engineering/REQUEST_ISOLATION.md).
 */

import type { MatrixRecord } from '../../db/matrix.ts';
import { assertMatrixTable } from '../../db/matrix.ts';
import { sql } from '../../db/postgres.ts';
import { createDataCache } from '../../ontology/cache_factory.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../ontology/resolver.ts';
import { readComponentItems } from '../../resolve/component_data.ts';
import { currentPrincipal } from '../../security/request_context.ts';

/** Section holding the presets (PHP DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO). */
export const REQUEST_CONFIG_PRESETS_SECTION_TIPO = 'dd1244';

/**
 * Component tipos of a dd1244 preset record (PHP get_active_request_config
 * $ar_components_info, class.request_config_presets.php:153-160):
 *   dd1242 Tipo (string)          — the layout tipo being configured
 *   dd642  Section tipo (string)  — the target section tipo
 *   dd1246 Mode (string)          — display mode ('edit' | 'list')
 *   dd654  User (relation)        — the owning user's section_id, null = public
 *   dd640  Public (relation→dd64) — section_id '1' = yes = shared fallback
 *   dd1566 Active (relation→dd64) — section_id '1' = yes = honored (SQL-filtered)
 *   dd625  Request config (JSON)  — the request_config_object[] payload
 */
const PRESET_TIPO = {
	tipo: 'dd1242',
	sectionTipo: 'dd642',
	mode: 'dd1246',
	userId: 'dd654',
	public: 'dd640',
	requestConfig: 'dd625',
} as const;

/** One hydrated active preset (PHP get_active_request_config stdClass entry). */
export interface RequestConfigPreset {
	/** Layout tipo being configured (dd1242). */
	tipo: string;
	/** Target section tipo (dd642). */
	sectionTipo: string;
	/** Display mode (dd1246), e.g. 'edit' | 'list'. */
	mode: string;
	/** Owning user's section_id, or null for a user-less record (dd654). */
	userId: string | null;
	/** Whether the preset is public — a fallback for every user (dd640). */
	public: boolean;
	/** The request_config_object[] payload that replaces the ontology config. */
	data: unknown[];
}

/**
 * The active-preset list cache (one key, 'all'). Dropped by construction on any
 * write/delete to dd1244 — PHP request_config_presets::clean_cache, here the
 * S1-11 save/delete event channel. A cached empty array is a valid HIT (no
 * active presets) and is honored, exactly like PHP's file cache.
 */
const activePresetsCache = createDataCache<string, RequestConfigPreset[]>((cache, sectionTipo) => {
	if (sectionTipo === REQUEST_CONFIG_PRESETS_SECTION_TIPO) cache.clear();
});
const ACTIVE_PRESETS_KEY = 'all';

/** Drop the active-preset cache (invalidation gates + tests + PHP clean_cache twin). */
export function clearRequestConfigPresetsCache(): void {
	activePresetsCache.clear();
}

/** First stored item's `value` for a string-family component in a preset record. */
function readStringValue(record: MatrixRecord, tipo: string, model: string): string {
	const items = readComponentItems(record, tipo, model);
	const first = items?.[0] as { value?: unknown } | undefined;
	return typeof first?.value === 'string' ? first.value : '';
}

/** First stored locator's target section_id for a relation component (or null). */
function readRelationSectionId(record: MatrixRecord, tipo: string, model: string): string | null {
	const items = readComponentItems(record, tipo, model);
	const first = items?.[0] as { section_id?: unknown } | undefined;
	if (first === undefined || first.section_id === undefined || first.section_id === null) {
		return null;
	}
	return String(first.section_id);
}

/**
 * The full list of currently ACTIVE presets from section dd1244 (PHP
 * get_active_request_config). "Active" = a dd1566 relation to dd64/1 (yes);
 * the SQL `@>` containment filter excludes inactive records exactly like PHP.
 * Records missing tipo or section_tipo, or whose config payload is empty, are
 * skipped (PHP :221 / :260). Memoized; a transient DB error returns [] WITHOUT
 * caching so it does not persist a broken empty result (PHP :134).
 */
export async function getActiveRequestConfigPresets(): Promise<RequestConfigPreset[]> {
	const cached = activePresetsCache.get(ACTIVE_PRESETS_KEY);
	if (cached !== undefined) return cached;

	const table = await getMatrixTableFromTipo(REQUEST_CONFIG_PRESETS_SECTION_TIPO);
	if (table === null) return [];
	// table is an ontology-resolved matrix table name interpolated as an
	// identifier below — gate it against the allowlist (matrix.ts §7.6 pattern).
	assertMatrixTable(table);

	// Resolve each component's model → matrix column ONCE (PHP pre-calculates the
	// models/columns outside the row loop for the same reason).
	const models: Record<keyof typeof PRESET_TIPO, string | null> = {
		tipo: await getModelByTipo(PRESET_TIPO.tipo),
		sectionTipo: await getModelByTipo(PRESET_TIPO.sectionTipo),
		mode: await getModelByTipo(PRESET_TIPO.mode),
		userId: await getModelByTipo(PRESET_TIPO.userId),
		public: await getModelByTipo(PRESET_TIPO.public),
		requestConfig: await getModelByTipo(PRESET_TIPO.requestConfig),
	};

	// The typed JSONB columns each preset component stores into. Selected
	// explicitly (never `*`) so the identifier surface stays fixed.
	const columns = new Set(
		[models.tipo, models.userId, models.requestConfig]
			.map((model) => (model === null ? null : getColumnNameByModel(model)))
			.filter((column): column is string => column !== null),
	);
	// string / relation / misc are the three that dd1244's components use; select
	// them (plus any resolver drift) so readComponentItems finds every value.
	for (const column of ['string', 'relation', 'misc']) columns.add(column);
	const columnProjection = [...columns].map((column) => `"${column}"`).join(', ');

	// ACTIVE filter: dd1566 → dd64/1 (yes). Inline jsonb literal (fixed constant,
	// no injection surface) mirrors the explicit.ts containment pattern and the
	// PHP `@> '{"dd1566":[{"section_tipo":"dd64","section_id":"1"}]}'`.
	let rows: Record<string, unknown>[];
	try {
		rows = (await sql.unsafe(
			`SELECT section_id, ${columnProjection}
			 FROM "${table}"
			 WHERE section_tipo = $1
			   AND relation @> '{"dd1566":[{"section_tipo":"dd64","section_id":"1"}]}'::jsonb
			 ORDER BY section_id ASC`,
			[REQUEST_CONFIG_PRESETS_SECTION_TIPO],
		)) as Record<string, unknown>[];
	} catch (error) {
		// Never cache a failure state (PHP :134): a transient DB error must not
		// persist a broken empty result for the worker's lifetime.
		console.error('[request_config/presets] active-preset query failed (not cached):', error);
		return [];
	}

	const active: RequestConfigPreset[] = [];
	for (const row of rows) {
		const record: MatrixRecord = {
			id: 0,
			section_id: Number(row.section_id),
			section_tipo: REQUEST_CONFIG_PRESETS_SECTION_TIPO,
			columns: row as MatrixRecord['columns'],
			rawText: {},
		};

		const tipo = models.tipo === null ? '' : readStringValue(record, PRESET_TIPO.tipo, models.tipo);
		const sectionTipo =
			models.sectionTipo === null
				? ''
				: readStringValue(record, PRESET_TIPO.sectionTipo, models.sectionTipo);
		// Skip records missing either lookup key — they can never match a triple.
		if (tipo === '' || sectionTipo === '') continue;

		const mode = models.mode === null ? '' : readStringValue(record, PRESET_TIPO.mode, models.mode);
		const userId =
			models.userId === null
				? null
				: readRelationSectionId(record, PRESET_TIPO.userId, models.userId);
		const isPublic =
			models.public !== null &&
			readRelationSectionId(record, PRESET_TIPO.public, models.public) === '1';

		// dd625 (component_json) stores its config array under the first item's
		// `value`. Normalize a single object to a one-element array (PHP :228).
		const configItems =
			models.requestConfig === null
				? null
				: readComponentItems(record, PRESET_TIPO.requestConfig, models.requestConfig);
		const rawConfig = (configItems?.[0] as { value?: unknown } | undefined)?.value;
		const data = Array.isArray(rawConfig)
			? rawConfig.filter((item) => item !== null && typeof item === 'object')
			: rawConfig !== null && typeof rawConfig === 'object'
				? [rawConfig]
				: [];
		// A preset whose entire payload is invalid contributes no layout (PHP :260).
		if (data.length === 0) continue;

		active.push({ tipo, sectionTipo, mode, userId, public: isPublic, data });
	}

	activePresetsCache.set(ACTIVE_PRESETS_KEY, active);
	return active;
}

/**
 * The ACTIVE preset matching (tipo, section_tipo, mode) — PURE (no I/O), the
 * two-pass ownership selector of PHP request_config_presets::get_request_config
 * (class.request_config_presets.php:323-338):
 *
 *   Pass 1 — the caller's OWN preset wins (userId equals currentUserId; loose id
 *            compare like PHP's ==). A PRIVATE preset (public=false) is only ever
 *            reachable through this pass, so it never leaks to other users.
 *   Pass 2 — absent a personal match, any PUBLIC preset for the same triple is
 *            the shared organisation-wide fallback.
 *
 * currentUserId is undefined outside a request scope (internal builds/tests) —
 * then only the public pass can match, which is the intended default.
 */
export function selectMatchingPreset(
	presets: RequestConfigPreset[],
	tipo: string,
	sectionTipo: string,
	mode: string,
	currentUserId?: number,
): RequestConfigPreset | null {
	const matchesTriple = (preset: RequestConfigPreset): boolean =>
		preset.tipo === tipo && preset.sectionTipo === sectionTipo && preset.mode === mode;

	// Pass 1 — personal preset.
	if (currentUserId !== undefined) {
		const own = presets.find(
			(preset) =>
				matchesTriple(preset) && preset.userId !== null && preset.userId === String(currentUserId),
		);
		if (own !== undefined) return own;
	}

	// Pass 2 — public fallback.
	return presets.find((preset) => matchesTriple(preset) && preset.public === true) ?? null;
}

/**
 * The request_config_object[] of the ACTIVE preset matching (tipo, section_tipo,
 * mode) for the CURRENT user, or null when none applies (PHP
 * request_config_presets::get_request_config). The current user comes from the
 * request-context ALS at CALL TIME (never module-hoisted); the pure selector
 * above applies the two-pass ownership rule.
 */
export async function resolvePresetRequestConfig(
	tipo: string,
	sectionTipo: string,
	mode: string,
): Promise<unknown[] | null> {
	const presets = await getActiveRequestConfigPresets();
	if (presets.length === 0) return null;
	const match = selectMatchingPreset(presets, tipo, sectionTipo, mode, currentPrincipal()?.userId);
	return match?.data ?? null;
}
