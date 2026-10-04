/**
 * SEARCH DISPLAY PATHS — a relation column in a picker's search map is searched
 * through what it DISPLAYS.
 *
 * The client mints one filter_free leaf per LEAF ddo of the search map
 * (common.js build_rqo_search → get_ar_inverted_paths: a ddo with children is a
 * hop, a ddo without is a column). A relation ddo declared WITHOUT children —
 * ontology42's "Modelo" (ontology6) — therefore became a leaf, and the typed
 * word reached a column that stores locators: refused since
 * WC-2026-09-23-relation-q-is-a-locator, silently dropped before.
 *
 * Its cell, though, shows the TARGET record's values through the relation's
 * OWN list request_config. This module writes those display ddos under it, so
 * the search map spells the deep paths explicitly and the client mints
 * `[ontology6 → ontology5]`, `[ontology6 → ontology9]` like any declared nested
 * column. Nothing is rewritten behind the client's back: what the per-field
 * inputs show is what is searched, and every path still runs through the
 * search engine's multi-hop machinery and its hop ACL.
 *
 * Emitted as the item's OWN key `search_paths` (built from the declared search
 * map, else the show map — the client's own fallback order), read ONLY by the
 * client's filter_free path builder (common.js build_rqo_search). `show`,
 * `search` and `choose` are untouched, so every other reader — result columns
 * (choose → search → show), search-mode columns (get_columns_map,
 * section_record), export — sees exactly what it saw before. Items of a
 * non-dedalo engine (zenon: component_external fields searched by the external
 * engine) are never expanded; an expansion that would leave no path is not
 * emitted.
 * Rules, each mirroring what the search engine can answer:
 *  - a display child is kept when its model has a search builder (images,
 *    PDFs, info widgets… have none and would fail the whole search);
 *  - a relation display child descends: its declared children, else its own
 *    config; never through a computed relation (relations/registry.ts
 *    COMPUTED_RELATION_SEARCH_MODELS — nothing stored forward to hop) nor an
 *    unported one, never twice through the same relation (cycles, and the
 *    client resolves a parent by tipo — one occurrence per relation);
 *  - a relation that displays NOTHING searchable leaves the search paths, with
 *    a warning naming it (once per ontology state): the word could only ever be
 *    refused there.
 *
 * Ledger: engineering/wire_contract/WC-2026-10-01-relation-search-display-paths.md.
 */

import { getComponentModel, getSearchBuilderFamily } from '../../components/registry.ts';
import { createOntologyCache } from '../../ontology/cache_factory.ts';
import { getColumnNameByModel, getNode } from '../../ontology/resolver.ts';
import { flattenConfigDdoMaps } from '../config_ddo_map.ts';
import type { ParsedRequestConfigItem, ProcessedDdo } from './explicit.ts';

/** `<owner>|<relation>` pairs already warned about — re-armed by any ontology change. */
const warnedDisplayless = createOntologyCache<string, true>();

/**
 * The items with each search map's childless relation columns expanded (new
 * objects; input untouched). Section owners are returned as is: a section's
 * maps are its own list/edit columns, not a picker's search fields.
 */
export async function withSearchDisplayPaths(
	items: ParsedRequestConfigItem[],
	ownerTipo: string,
	ownerModel: string | null | undefined,
): Promise<ParsedRequestConfigItem[]> {
	if (ownerModel === 'section') return items;
	const expanded: ParsedRequestConfigItem[] = [];
	for (const item of items) expanded.push(await expandItem(item, ownerTipo));
	return expanded;
}

/** The map the client mints search paths from: the declared search map, else show. */
function effectiveSearchMap(item: ParsedRequestConfigItem): ProcessedDdo[] {
	const declared = item.search?.ddo_map ?? [];
	return declared.length > 0 ? declared : (item.show?.ddo_map ?? []);
}

async function expandItem(
	item: ParsedRequestConfigItem,
	ownerTipo: string,
): Promise<ParsedRequestConfigItem> {
	if ((item.api_engine ?? 'dedalo') !== 'dedalo') return item;
	const expanded = await expandMap(effectiveSearchMap(item), ownerTipo);
	if (expanded === null || expanded.length === 0) return item;
	return { ...item, search_paths: expanded };
}

/** The map with display paths under each childless relation column, or null when none needs them. */
async function expandMap(map: ProcessedDdo[], ownerTipo: string): Promise<ProcessedDdo[] | null> {
	const out: ProcessedDdo[] = [];
	const seen = new Set<string>([ownerTipo]);
	let changed = false;
	for (const ddo of map) {
		if (!needsDisplayPaths(ddo, map)) {
			out.push(ddo);
			continue;
		}
		changed = true;
		seen.add(ddo.tipo);
		const children = await displayPaths(ddo, null, seen);
		if (children.length === 0) {
			warnDisplayless(ownerTipo, ddo.tipo);
			continue;
		}
		out.push(ddo, ...children);
	}
	return changed ? out : null;
}

function warnDisplayless(ownerTipo: string, relationTipo: string): void {
	const key = `${ownerTipo}|${relationTipo}`;
	if (warnedDisplayless.has(key)) return;
	warnedDisplayless.set(key, true);
	console.warn(
		`[request_config/search_display_paths] ${ownerTipo}: relation column ${relationTipo} displays no searchable field — left out of the search paths (a typed word could only be refused there). Declare its display children in the search ddo_map to search it.`,
	);
}

/**
 * A relation column the client would mint as a LEAF: a relation ddo with no
 * declared children. Dataframes are not columns (own sqo; build_rqo_search
 * skips their paths) and are left alone.
 */
function needsDisplayPaths(ddo: ProcessedDdo, map: ProcessedDdo[]): boolean {
	if (ddo.model === 'component_dataframe' || !isRelationModel(ddo.model)) return false;
	return !map.some((other) => other.parent === ddo.tipo);
}

/**
 * A model stored as locators the search engine hops through. component_external
 * is relation-column but its value comes from a third-party engine (searched by
 * src/external/), never hopped.
 */
function isRelationModel(model: unknown): model is string {
	return (
		typeof model === 'string' &&
		model !== 'component_external' &&
		getColumnNameByModel(model) === 'relation'
	);
}

/** A relation the search engine can hop through: stored forward locators, a ported search. */
async function isHoppable(model: string): Promise<boolean> {
	const { COMPUTED_RELATION_SEARCH_MODELS } = await import('../registry.ts');
	if (COMPUTED_RELATION_SEARCH_MODELS.has(model)) return false;
	const descriptor = getComponentModel(model);
	return descriptor?.search?.status !== 'unported' && descriptor?.resolveData !== undefined;
}

/**
 * The searchable display ddos under `relation` (flattened, parent before child).
 * `pool` holds the declared ddos the relation may already have children in (a
 * nested own config); null = read the relation's own list config.
 */
async function displayPaths(
	relation: ProcessedDdo,
	pool: ProcessedDdo[] | null,
	seen: Set<string>,
): Promise<ProcessedDdo[]> {
	if (!(await isHoppable(relation.model))) return [];
	const source = pool ?? (await ownDisplayDdos(relation));
	const out: ProcessedDdo[] = [];
	for (const child of source) {
		if (child.parent !== relation.tipo || child.model === 'component_dataframe') continue;
		out.push(...(await displayChild(child, source, seen)));
	}
	return out;
}

/** One display child: a searchable column as is, a relation through its own display paths. */
async function displayChild(
	child: ProcessedDdo,
	source: ProcessedDdo[],
	seen: Set<string>,
): Promise<ProcessedDdo[]> {
	if (!isRelationModel(child.model)) {
		return getSearchBuilderFamily(child.model) === undefined ? [] : [child];
	}
	if (seen.has(child.tipo)) return [];
	seen.add(child.tipo);
	const declared = source.some((ddo) => ddo.parent === child.tipo);
	const nested = await displayPaths(child, declared ? source : null, seen);
	return nested.length === 0 ? [] : [child, ...nested];
}

/** The relation's own LIST config show ddos — what its cell displays. */
async function ownDisplayDdos(relation: ProcessedDdo): Promise<ProcessedDdo[]> {
	const { buildRequestConfigForElement } = await import('./build.ts');
	const node = await getNode(relation.tipo);
	const sections = Array.isArray(relation.section_tipo)
		? relation.section_tipo
		: [relation.section_tipo];
	const config = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: relation.tipo,
		ownerSectionTipo: sections[0] ?? '',
		mode: 'list',
		ownerIsSection: false,
	});
	return flattenConfigDdoMaps(config, {
		ownerTipo: relation.tipo,
		includeHideDdos: false,
	}) as ProcessedDdo[];
}
