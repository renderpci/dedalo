/**
 * THE SUBDATUM READ FLOOR OF A SEARCH (closure Step 3, SEC-1;
 * WC-2026-09-30-search-root-step-acl).
 *
 * WHAT IT IS. PHP `common::get_subdatum` floors every component reached THROUGH
 * a component the caller is authorized on to read (1), even when the profile
 * holds 0 on it (`inheritSubdatumPermission`): a portal / autocomplete must
 * show its resolved values and let the user pick, whatever the grant on the
 * target section's own components. The search path's ROOT key
 * (search/conform.ts) would otherwise refuse exactly those searches — an
 * autocomplete that looks a term up by a component its user holds 0 on would
 * answer nothing. The floor is the set of `${section}_${component}` pairs such a
 * search may FILTER and SORT on:
 *
 *   - every ddo of the source component's request_config maps (show / search /
 *     choose / hide), at every section it resolves to;
 *   - every path step its `fixed_filter` names (the pre-applied SQO clauses);
 *   - every `filter_by_list` field (the autocomplete's pre-filter checkboxes).
 *
 * VERIFIED, NEVER TRUSTED. The source arrives in the client's `rqo.source`; it
 * yields a floor ONLY when this module itself finds the caller holding >= 1 on
 * (source.section_tipo, source.tipo) — the read handler's Gate A predicate,
 * re-asked here so a caller that skipped Gate A cannot mint a floor. The pairs
 * are read off the ONTOLOGY (the source's own request_config), never off the
 * client payload and never off ALS. A section source (tipo === section_tipo, a
 * plain list) has no subdatum and no floor.
 *
 * CACHED per (section, component) as an ontology fact: the pair set depends on
 * the node definitions only (the principal is consulted for the grant, never
 * for the pairs), so it lives in an ontology cache the dd_ontology write hub
 * clears.
 */

import { createOntologyCache } from '../ontology/cache_factory.ts';
import { getModelByTipo } from '../ontology/resolver.ts';
import { getPermissions, type Principal } from './permissions.ts';

/** The client-declared read source, as far as the floor cares. */
export interface ReadFloorSource {
	readonly section_tipo?: unknown;
	readonly tipo?: unknown;
}

/**
 * The floor for one search read, or undefined when there is none: no principal
 * (internal read — nothing is keyed), no component source, or a source the
 * caller holds no read grant on.
 */
export async function subdatumReadFloor(
	principal: Principal | undefined,
	source: ReadFloorSource | undefined,
): Promise<ReadonlySet<string> | undefined> {
	if (principal === undefined) return undefined;
	const coordinates = componentSource(source);
	if (coordinates === null) return undefined;
	if (!(await isComponentTipo(coordinates.tipo))) return undefined;
	const level = await getPermissions(principal, coordinates.sectionTipo, coordinates.tipo);
	if (level < 1) return undefined;
	return floorPairsOf(coordinates.sectionTipo, coordinates.tipo);
}

/** (section, component) of a component source, or null for anything else. */
function componentSource(
	source: ReadFloorSource | undefined,
): { sectionTipo: string; tipo: string } | null {
	const sectionTipo = source?.section_tipo;
	const tipo = source?.tipo;
	if (typeof sectionTipo !== 'string' || sectionTipo === '') return null;
	if (typeof tipo !== 'string' || tipo === '' || tipo === sectionTipo) return null;
	return { sectionTipo, tipo };
}

async function isComponentTipo(tipo: string): Promise<boolean> {
	const model = await getModelByTipo(tipo);
	return typeof model === 'string' && model.startsWith('component_');
}

const floorCache = createOntologyCache<string, ReadonlySet<string>>();

/** The ontology-derived pair set of one component source (cached). */
async function floorPairsOf(sectionTipo: string, tipo: string): Promise<ReadonlySet<string>> {
	const key = `${sectionTipo}|${tipo}`;
	const cached = floorCache.get(key);
	if (cached !== undefined) return cached;
	const pairs = new Set<string>();
	const { getEffectivePropertiesByTipo } = await import('../ontology/alias.ts');
	const properties = await getEffectivePropertiesByTipo(tipo);
	const { buildRequestConfigForElement } = await import('../relations/request_config/build.ts');
	const items = await buildRequestConfigForElement(properties ?? null, {
		ownerTipo: tipo,
		ownerSectionTipo: sectionTipo,
		mode: 'edit',
		ownerIsSection: false,
	});
	for (const item of items) addItemDdoPairs(pairs, item);
	addDeclaredFilterPairs(pairs, properties);
	const frozen: ReadonlySet<string> = pairs;
	floorCache.set(key, frozen);
	return frozen;
}

type ConfigItem = Awaited<
	ReturnType<typeof import('../relations/request_config/build.ts').buildRequestConfigForElement>
>[number];

const DDO_MAPS = ['show', 'search', 'choose', 'hide'] as const;

/** Every ddo of one config item's maps, at every section it resolves to. */
function addItemDdoPairs(pairs: Set<string>, item: ConfigItem): void {
	const targets = itemTargets(item);
	for (const mapName of DDO_MAPS) {
		const ddos = item[mapName]?.ddo_map;
		if (!Array.isArray(ddos)) continue;
		for (const ddo of ddos) addDdoPairs(pairs, ddo, targets);
	}
}

/** The item's resolved sqo target sections (flat tipos). */
function itemTargets(item: ConfigItem): string[] {
	return (item.sqo.section_tipo ?? [])
		.map((entry) => (typeof entry === 'string' ? entry : entry?.tipo))
		.filter((tipo): tipo is string => typeof tipo === 'string' && tipo !== '');
}

function addDdoPairs(
	pairs: Set<string>,
	ddo: { tipo?: unknown; section_tipo?: unknown },
	targets: readonly string[],
): void {
	if (typeof ddo.tipo !== 'string' || ddo.tipo === '') return;
	for (const sectionTipo of ddoSections(ddo.section_tipo, targets)) {
		pairs.add(`${sectionTipo}_${ddo.tipo}`);
	}
}

/** A ddo's sections: its declared string / list; absent or 'self' = the item's targets. */
function ddoSections(declared: unknown, targets: readonly string[]): readonly string[] {
	if (typeof declared === 'string') return declared === 'self' ? targets : [declared];
	if (Array.isArray(declared)) {
		return declared.filter((tipo): tipo is string => typeof tipo === 'string' && tipo !== '');
	}
	return targets;
}

/**
 * The `fixed_filter` path steps and `filter_by_list` fields, read off the RAW
 * declaration: the expanded forms depend on record data (a component_data
 * fixed_filter resolves nothing without its caller record), the declared paths
 * do not.
 */
function addDeclaredFilterPairs(pairs: Set<string>, properties: unknown): void {
	for (const sqo of declaredSqos(properties)) {
		collectPathPairs(pairs, (sqo as { fixed_filter?: unknown }).fixed_filter);
		collectFieldPairs(pairs, (sqo as { filter_by_list?: unknown }).filter_by_list);
	}
}

/** The raw `source.request_config[].sqo` objects of a node's properties. */
function declaredSqos(properties: unknown): object[] {
	const config = (properties as { source?: { request_config?: unknown } } | null)?.source
		?.request_config;
	if (!Array.isArray(config)) return [];
	return config
		.map((item) => (item as { sqo?: unknown } | null)?.sqo)
		.filter((sqo): sqo is object => sqo !== null && typeof sqo === 'object');
}

/** Every `{section_tipo, component_tipo}` step of every `path` array under `value`. */
function collectPathPairs(pairs: Set<string>, value: unknown): void {
	if (value === null || typeof value !== 'object') return;
	const entries = Array.isArray(value)
		? value.map((entry) => ['', entry] as const)
		: Object.entries(value);
	for (const [key, entry] of entries) collectEntryPairs(pairs, key, entry);
}

/** One key/value of a declaration: a `path` list is harvested, anything else walked. */
function collectEntryPairs(pairs: Set<string>, key: string, entry: unknown): void {
	if (key === 'path' && Array.isArray(entry)) collectFieldPairs(pairs, entry);
	else collectPathPairs(pairs, entry);
}

/** `{section_tipo, component_tipo}` entries of a list. */
function collectFieldPairs(pairs: Set<string>, list: unknown): void {
	if (!Array.isArray(list)) return;
	for (const step of list) {
		const { section_tipo: sectionTipo, component_tipo: componentTipo } = (step ?? {}) as {
			section_tipo?: unknown;
			component_tipo?: unknown;
		};
		if (typeof sectionTipo === 'string' && typeof componentTipo === 'string') {
			pairs.add(`${sectionTipo}_${componentTipo}`);
		}
	}
}
