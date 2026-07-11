/**
 * TS_TERM_RESOLVER (PHP core/ts_object/class.ts_term_resolver.php) — resolves the
 * human-readable label of a thesaurus/ontology node from a locator.
 *
 * A "term" is not one component: a section's section_map declares (per scope) a
 * `term` key holding one OR several component tipos whose values are joined by a
 * scope-defined `fields_separator` (default ', '). This module reads those term
 * components straight off the matrix JSONB columns (no PHP component machinery —
 * TS has none) and joins them, with a per-tipo language fallback to the
 * hierarchy's main language so a term never renders empty just because the
 * requested lang has no value.
 *
 * Cache discipline (spec §4 / plan constraint): the cache is module-level and
 * keyed ONLY by CONTENT — `${section_tipo}_${section_id}_${scope}_${lang}` — never
 * by user/session. Bounded to 1000 entries; on overflow the whole cache is
 * dropped (PHP's O(1) eviction, not LRU). Registered with the ontology
 * invalidation hub so ontology writes drop it; targeted `invalidateNode` prefix
 * eviction runs after tree mutations.
 *
 * PHP anchors: get_term_data_by_locator (:95), get_term_by_locator (:188),
 * invalidate_node (:304). section_map scope resolution mirrors
 * class.section_map.php resolve_key_scope/get_term_tipos/get_fields_separator.
 */

import { config } from '../../config/config.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { createDataCache, createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { getSectionMap } from '../ontology/section_map.ts';
import { getTldFromTipo } from '../ontology/tld.ts';
import { currentDataLang } from '../resolve/request_lang.ts';

/** section_map::DEFAULT_FIELDS_SEPARATOR. */
const DEFAULT_FIELDS_SEPARATOR = ', ';
/** section_map::SCOPE_FALLBACK. */
const SCOPE_FALLBACK = ['main', 'thesaurus', 'relation_list'];

/** A locator that identifies a node (plus optional decoration keys PHP appends). */
export interface TermLocator {
	section_tipo?: string;
	section_id?: number | string;
	component_tipo?: string;
	tag_id?: number | string;
	[extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Module cache (content-keyed only). Registered with the invalidation hub AND
// the save/delete event channel: a term value comes from a RECORD's data, so
// an ordinary section save (component_input_text edit on an es1 record) must
// drop every entry built from that section — before this hook only ts_api tree
// mutations invalidated, and the tree served renamed terms stale (S2-10). The
// eviction is per-section-tipo (key prefix `${section_tipo}_`), coarser than
// invalidateNode's per-record prefix but correct and bounded by the 1000-entry
// cache. PHP needs no such hook — its twin cache is request-scoped (S3-15);
// this eviction plus the hub clear is the process-lifetime replacement.
// ---------------------------------------------------------------------------
const termByLocatorCache = createDataCache<string, string | null>((cache, sectionTipo) => {
	const prefix = `${sectionTipo}_`;
	for (const key of cache.keys()) {
		if (key.startsWith(prefix)) cache.delete(key);
	}
});

/** Full flush — worker cache_manager parity (PHP ts_term_resolver::clear). */
export function clearTermCache(): void {
	termByLocatorCache.clear();
}
registerOntologyCacheClearer(clearTermCache);

/**
 * Targeted eviction after a tree write (PHP invalidate_node :304): drop every
 * `${tipo}_${id}_…` cache entry (all langs/scopes) for the mutated node.
 */
export function invalidateNode(sectionTipo: string, sectionId: number | string): void {
	const prefix = `${sectionTipo}_${sectionId}_`;
	for (const key of termByLocatorCache.keys()) {
		if (key.startsWith(prefix)) termByLocatorCache.delete(key);
	}
}

// ---------------------------------------------------------------------------
// section_map scope resolution (per-key chain walk).
// ---------------------------------------------------------------------------

/** Name of the first scope providing `key` (PHP resolve_key_scope, non-strict). */
function resolveKeyScope(
	map: Record<string, unknown>,
	key: string,
	scope: string | null,
): string | null {
	const requested = scope ?? 'main';
	const requestedNode = map[requested];
	if (requestedNode !== null && typeof requestedNode === 'object' && key in requestedNode) {
		return requested;
	}
	for (const candidate of SCOPE_FALLBACK) {
		if (candidate === requested) continue;
		const node = map[candidate];
		if (node !== null && typeof node === 'object' && key in (node as Record<string, unknown>)) {
			return candidate;
		}
	}
	return null;
}

/** Normalized list of `term` component tipos for the scope (PHP get_term_tipos). */
export async function getTermTipos(sectionTipo: string, scope: string | null): Promise<string[]> {
	const map = await getSectionMap(sectionTipo);
	if (map === null) return [];
	const winning = resolveKeyScope(map, 'term', scope);
	if (winning === null) return [];
	const value = (map[winning] as Record<string, unknown>).term;
	if (value === null || value === undefined) return [];
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
	return typeof value === 'string' ? [value] : [];
}

/** The separator from the SAME scope that supplied `term` (PHP get_fields_separator). */
async function getFieldsSeparator(sectionTipo: string, scope: string | null): Promise<string> {
	const map = await getSectionMap(sectionTipo);
	if (map === null) return DEFAULT_FIELDS_SEPARATOR;
	const termScope = resolveKeyScope(map, 'term', scope);
	if (termScope === null) return DEFAULT_FIELDS_SEPARATOR;
	const sep = (map[termScope] as Record<string, unknown>).fields_separator;
	return typeof sep === 'string' ? sep : DEFAULT_FIELDS_SEPARATOR;
}

// ---------------------------------------------------------------------------
// main-lang fallback (PHP hierarchy::get_main_lang).
// ---------------------------------------------------------------------------
// Ontology-derived (TLD walk) AND data-derived: the main lang comes from the
// hierarchy1 registry record and the lg1 lang record's ISO code — a write to
// either section re-resolves it (S2-10 lifecycle sweep).
const mainLangCache = createDataCache<string, string>((cache, sectionTipo) => {
	if (sectionTipo === 'hierarchy1' || sectionTipo === 'lg1') cache.clear();
});
registerOntologyCacheClearer(() => mainLangCache.clear());

/**
 * The hierarchy main language of a node's TLD (PHP get_main_lang) — the fallback
 * language used when the requested lang has no value. Resolves the hierarchy1
 * record for the TLD, reads its hierarchy8 lang locator, and converts it to a
 * `lg-xxx` code via the lang record's hierarchy41 ISO-code component. The
 * hard-coded tails (es1→lg-spa, hierarchy1→default, else lg-eng) match PHP.
 */
async function getMainLang(sectionTipo: string): Promise<string> {
	if (sectionTipo === 'lg1') return 'lg-eng';
	const cached = mainLangCache.get(sectionTipo);
	if (cached !== undefined) return cached;

	let mainLang: string | null = null;
	const tld = (getTldFromTipo(sectionTipo) ?? '').toLowerCase();
	if (tld !== '') {
		// hierarchy1 record whose hierarchy6 TLD value equals the node's TLD.
		const rows = (await sql.unsafe(
			`SELECT relation#>'{hierarchy8}' AS lang_items
			 FROM matrix_hierarchy_main
			 WHERE section_tipo = 'hierarchy1'
			   AND string @? ('$.hierarchy6[*].value ? (@ like_regex "^' || $1 || '$" flag "i")')::jsonpath
			 LIMIT 1`,
			[tld],
		)) as { lang_items: { section_id?: number | string }[] | null }[];
		const langLocator = rows[0]?.lang_items?.[0];
		if (langLocator?.section_id !== undefined) {
			mainLang = await codeFromLangLocator(Number(langLocator.section_id));
		}
	}
	if (mainLang === null || mainLang === '') {
		if (sectionTipo === 'es1') mainLang = 'lg-spa';
		else if (sectionTipo === 'hierarchy1') mainLang = config.menu.dataLang;
		else mainLang = 'lg-eng';
	}
	mainLangCache.set(sectionTipo, mainLang);
	return mainLang;
}

/** lang record id → `lg-xxx` (PHP lang::get_code_from_locator; hierarchy41 ISO code). */
async function codeFromLangLocator(langSectionId: number): Promise<string | null> {
	const table = (await getMatrixTableFromTipo('lg1')) ?? 'matrix';
	const record = await readMatrixRecord(table, 'lg1', langSectionId);
	if (record === null) return null;
	const items =
		((record.columns.string as Record<string, { value?: unknown }[]> | null)?.hierarchy41 as
			| { value?: unknown }[]
			| undefined) ?? [];
	const code = items[0]?.value;
	return typeof code === 'string' && code !== '' ? `lg-${code}` : null;
}

// ---------------------------------------------------------------------------
// term reads.
// ---------------------------------------------------------------------------

/** The raw items stored for one component tipo on a record (its typed column). */
async function readComponentItems(
	sectionTipo: string,
	sectionId: number | string,
	tipo: string,
): Promise<{ lang?: string; value?: unknown }[]> {
	const model = await getModelByTipo(tipo);
	if (model === null) return [];
	const column = getColumnNameByModel(model);
	if (column === null) return [];
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return [];
	const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
	if (record === null) return [];
	const bag = record.columns[column as keyof typeof record.columns] as Record<
		string,
		{ lang?: string; value?: unknown }[]
	> | null;
	return bag?.[tipo] ?? [];
}

/** The value of one term component in `lang` with main-lang fallback. */
async function termComponentValue(
	sectionTipo: string,
	sectionId: number | string,
	tipo: string,
	lang: string,
): Promise<string> {
	const items = await readComponentItems(sectionTipo, sectionId, tipo);
	if (items.length === 0) return '';
	const translatable = await getTranslatableByTipo(tipo);
	// Non-translatable term components store their value under lg-nolan.
	const effectiveLang = translatable ? lang : 'lg-nolan';
	const pick = (target: string): string => {
		const item = items.find((entry) => (entry.lang ?? 'lg-nolan') === target);
		return typeof item?.value === 'string' ? item.value : '';
	};
	let value = pick(effectiveLang);
	if (value === '' && translatable) {
		// lang fallback (PHP get_value_with_fallback_from_data → section main lang).
		value = pick(await getMainLang(sectionTipo));
	}
	return value;
}

/**
 * The merged raw item array across every `term` tipo of the scope (PHP
 * get_term_data_by_locator :95). No cache. Null when the locator is invalid or
 * the scope resolves no term tipos.
 */
export async function getTermDataByLocator(
	locator: TermLocator,
	scope: string | null = 'thesaurus',
): Promise<{ lang?: string; value?: unknown }[] | null> {
	const sectionTipo = locator.section_tipo;
	const sectionId = locator.section_id;
	if (typeof sectionTipo !== 'string' || sectionTipo === '') return null;
	const termTipos = await getTermTipos(sectionTipo, scope);
	if (termTipos.length === 0 || sectionId === undefined || sectionId === null || sectionId === '') {
		return null;
	}
	let merged: { lang?: string; value?: unknown }[] = [];
	for (const tipo of termTipos) {
		const items = await readComponentItems(sectionTipo, sectionId, tipo);
		if (items.length > 0) merged = [...merged, ...items];
	}
	return merged;
}

/**
 * The display label for a locator in `lang` (PHP get_term_by_locator :188), with
 * the request-scope cache. When no term tipos resolve, returns the deterministic
 * locator-string fallback `${section_tipo}_${section_id}[_component_tipo[_tag_id]]`
 * so orphan locators always render something. Always writes the cache.
 */
export async function getTermByLocator(
	locator: TermLocator,
	// Per-REQUEST data lang, resolved at call time (S2-11 — a module-level
	// capture froze the install default for every session). The resolved lang
	// is baked into the cache key, so the ambient read cannot bleed (DEC-13).
	lang: string = currentDataLang(),
	fromCache = false,
	scope: string | null = 'thesaurus',
): Promise<string | null> {
	const sectionTipo = locator.section_tipo;
	if (typeof sectionTipo !== 'string') return null;
	const sectionId = locator.section_id;

	const scopeKey = scope ?? '';
	const cacheUid = `${sectionTipo}_${sectionId}_${scopeKey}_${lang}`;
	if (fromCache && termByLocatorCache.has(cacheUid)) {
		return termByLocatorCache.get(cacheUid) ?? null;
	}

	let value: string | null;
	const termTipos = await getTermTipos(sectionTipo, scope);
	if (termTipos.length === 0) {
		// legacy locator-string fallback.
		let fallback = `${sectionTipo}_${sectionId}`;
		if (locator.component_tipo !== undefined) fallback += `_${locator.component_tipo}`;
		if (locator.tag_id !== undefined) fallback += `_${locator.tag_id}`;
		value = fallback;
	} else {
		const fragments: string[] = [];
		for (const tipo of termTipos) {
			const current = await termComponentValue(sectionTipo, sectionId ?? '', tipo, lang);
			if (current !== '') fragments.push(current);
		}
		const separator = await getFieldsSeparator(sectionTipo, scope);
		value = fragments.join(separator);
	}

	if (termByLocatorCache.size >= 1000) termByLocatorCache.clear();
	termByLocatorCache.set(cacheUid, value);
	return value;
}
