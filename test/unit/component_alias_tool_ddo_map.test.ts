/**
 * A component_alias INSIDE a section_tool's `tool_config.ddo_map` (WC-020).
 *
 * The alias exists so a tool-configured component has ONE source of truth: the
 * `ddo_map` entry names the ALIAS tipo and carries NO inline `properties`, and
 * the enrichment the client receives resolves the alias — model through the
 * hop to the target, label from the alias's OWN term. Before the alias landed
 * the same configuration lived twice: a copy inline in the tool_config and a
 * component elsewhere, and the two drifted.
 *
 * WHY IT IS ITS OWN FILE. `component_alias.test.ts` owns the alias contract
 * (resolution, the fail-loud violations, the wholesale property merge, the
 * structure-context identity and the read/save round-trip). What is only here
 * is the TOOL surface: `enrichToolConfig` is a different door, on a different
 * flow (menu + `start`), and it reaches the ontology through
 * `getModelByTipo`/`getTranslatableByTipo`/`getOntologyTermLabel` rather than
 * through the alias module — so an alias-blind regression there is invisible
 * to every gate in that file.
 *
 * TS-GOLDEN: the alias feature is TS-native, so no oracle is involved BY DESIGN.
 *
 * Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules). The
 * gate used to read ONE install's migrated `numisdata203` node and skipped
 * wholesale when that install's one-shot migration had not run — a statement
 * about a database, not about the engine. It now BUILDS the situation on a
 * scratch `zzaliastool` TLD, so it asserts the same mechanism everywhere and
 * can never skip. (The frozen parity fixtures still carry the `numisdata203`
 * alias token; that is a fixture fact, not a binding of this test.)
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { clearAliasCaches } from '../../src/core/ontology/alias.ts';
import { getPropertiesByTipo } from '../../src/core/ontology/resolver.ts';
import { enrichToolConfig } from '../../src/core/tools/section_tool_context.ts';

const TLD = 'zzaliastool';
const SECTION = `${TLD}1`;
/** The real component: a portal with the source/limit configuration. */
const TARGET = `${TLD}2`;
/** Its alias face — the tipo the tool_config names. */
const ALIAS = `${TLD}3`;
/** The section_tool node carrying the tool_config. */
const SECTION_TOOL = `${TLD}4`;

const TOOL_NAME = 'tool_zz_alias_probe';
const TARGET_TERM = 'Target portal';
const ALIAS_TERM = 'Coins (alias face)';

const TARGET_PROPERTIES = {
	view: 'line',
	source: {
		mode: 'external',
		request_config: [
			{
				sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] },
				show: { ddo_map: [], sqo_config: { limit: 9 } },
			},
		],
	},
};

/** The alias carries the tool's look; the target keeps the plumbing. */
const ALIAS_PROPERTIES = {
	alias_of: TARGET,
	view: 'mosaic',
	css: { '.wrapper_component': { style: { height: '28rem' } } },
};

/**
 * The tool_config exactly as the ontology authors it after the alias lands:
 * the role points at the ALIAS and declares NO inline properties.
 */
const TOOL_CONFIG = {
	[TOOL_NAME]: {
		ddo_map: [
			{ role: 'coins', tipo: ALIAS, mode: 'edit' },
			// The control: the SAME target reached directly, so "the alias
			// enriches like a component" is measured against something.
			{ role: 'coins_direct', tipo: TARGET, mode: 'edit' },
		],
	},
};

beforeAll(async () => {
	await deleteTldNodes(TLD);
	await upsertDdOntologyNode({
		tipo: SECTION,
		model: 'section',
		tld: TLD,
		term: { 'lg-eng': 'Alias tool gate section' },
	});
	await upsertDdOntologyNode({
		tipo: TARGET,
		model: 'component_portal',
		parent: SECTION,
		tld: TLD,
		is_translatable: false,
		term: { 'lg-eng': TARGET_TERM },
		properties: TARGET_PROPERTIES,
	});
	await upsertDdOntologyNode({
		tipo: ALIAS,
		model: 'component_alias',
		parent: SECTION,
		tld: TLD,
		is_translatable: false,
		term: { 'lg-eng': ALIAS_TERM },
		properties: ALIAS_PROPERTIES,
	});
	await upsertDdOntologyNode({
		tipo: SECTION_TOOL,
		model: 'section_tool',
		parent: SECTION,
		tld: TLD,
		term: { 'lg-eng': 'Alias tool' },
		properties: { tool_config: TOOL_CONFIG },
	});
	clearAliasCaches();
});

afterAll(async () => {
	await deleteTldNodes(TLD); // fires the hub — leaves no scratch cache state
	clearAliasCaches();
});

type DdoEntry = Record<string, unknown>;

async function rawDdoMap(): Promise<DdoEntry[]> {
	const properties = (await getPropertiesByTipo(SECTION_TOOL)) as {
		tool_config?: Record<string, { ddo_map?: DdoEntry[] }>;
	} | null;
	const map = properties?.tool_config?.[TOOL_NAME]?.ddo_map;
	expect(Array.isArray(map)).toBe(true);
	return map as DdoEntry[];
}

async function enrichedDdoMap(): Promise<DdoEntry[]> {
	const properties = (await getPropertiesByTipo(SECTION_TOOL)) as {
		tool_config?: Record<string, unknown>;
	} | null;
	const enriched = (await enrichToolConfig(properties?.tool_config?.[TOOL_NAME])) as {
		ddo_map: DdoEntry[];
	} | null;
	expect(enriched).not.toBeNull();
	return (enriched as { ddo_map: DdoEntry[] }).ddo_map;
}

const byRole = (map: DdoEntry[], role: string): DdoEntry => {
	const entry = map.find((item) => item.role === role);
	if (entry === undefined) throw new Error(`no ddo_map entry with role '${role}'`);
	return entry;
};

describe('the authored ddo_map: the alias is the single source of truth', () => {
	test('the role names the ALIAS tipo and carries NO inline properties', async () => {
		const coins = byRole(await rawDdoMap(), 'coins');
		expect(coins.tipo).toBe(ALIAS);
		// The whole point of the re-point: the configuration lives on the alias
		// node, never a second time inline on the tool.
		expect(coins.properties).toBeUndefined();
		expect(coins.view).toBeUndefined();
		expect(coins.source).toBeUndefined();
	});

	test('the configuration it replaced is on the ALIAS node itself', async () => {
		const properties = (await getPropertiesByTipo(ALIAS)) as Record<string, unknown> | null;
		expect(properties?.alias_of).toBe(TARGET);
		expect(properties?.view).toBe('mosaic');
	});
});

describe('enrichToolConfig resolves the alias for the client', () => {
	test('model hops to the TARGET; label stays the ALIAS own term', async () => {
		const coins = byRole(await enrichedDdoMap(), 'coins');
		// The client builds the component from `model` — an alias-blind lookup
		// would answer 'component_alias' (or null) and nothing would render.
		expect(coins.model).toBe('component_portal');
		// …but the face the user reads is the alias's own term, not the target's.
		expect(coins.label).toBe(ALIAS_TERM);
		expect(coins.label).not.toBe(TARGET_TERM);
		expect(coins.translatable).toBe(false);
		// The raw entry's own keys survive enrichment untouched.
		expect(coins.tipo).toBe(ALIAS);
		expect(coins.mode).toBe('edit');
	});

	test('the direct-target control enriches to the same model, its own label', async () => {
		const direct = byRole(await enrichedDdoMap(), 'coins_direct');
		expect(direct.model).toBe('component_portal');
		expect(direct.label).toBe(TARGET_TERM);
	});

	test('enrichment never mutates the stored ontology properties', async () => {
		await enrichedDdoMap();
		const coins = byRole(await rawDdoMap(), 'coins');
		// enrichToolConfig deep-clones; a mutation here would poison the
		// ontology cache for every later request in the process.
		expect(coins.model).toBeUndefined();
		expect(coins.label).toBeUndefined();
		expect(coins.translatable).toBeUndefined();
	});
});
