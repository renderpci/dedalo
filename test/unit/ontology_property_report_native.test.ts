/**
 * ONTOLOGY PROPERTY REPORT — the BEHAVIOURAL half of P2-27 / DEAD-08, on the
 * suite database.
 *
 * The hermetic census (`ontology_property_census_tripwire`) can only see what
 * the repo SHIPS. An install's own authored nodes are the other half of the
 * defect — a cataloguer sets `properties.multi_value` on a node this repo has
 * never seen and the engine ignores it in silence. Two paths close that half,
 * and this file drives both against a REAL dd_ontology:
 *
 *   1. `scripts/ontology_property_report.ts` — the read-only install report:
 *      `listNodesWithProperties()` (the resolver's whole-table scan) →
 *      `buildPropertyCensusReport` → one line per (node, key) naming the node,
 *      the key and the replacement, RETIRED and UNKNOWN separable by flag.
 *   2. The resolver TRIPLINE — every node passes `getNode`'s cache miss once,
 *      and a retired key gets one loud line there. Its `reportedAtUse`
 *      exception (target_mode, whose own consumer reports it with the concrete
 *      replacement sqo) is asserted to stay quiet, so an install never gets the
 *      same news twice.
 *
 * THE SITUATION IS BUILT, never borrowed: a reserved `zzprp` scratch TLD whose
 * four nodes carry, between them, a retired key, an unknown key, an honoured
 * key, an author-parked key and a reportedAtUse key — the five verdicts the
 * classifier must tell apart on live rows. Torn down whole.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { formatReport, selectVerdicts } from '../../scripts/ontology_property_report.ts';
import {
	buildPropertyCensusReport,
	type PropertyCensusEntry,
} from '../../src/core/ontology/property_census.ts';
import {
	clearOntologyCaches,
	getNode,
	listNodesWithProperties,
} from '../../src/core/ontology/resolver.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** The scratch section every component below hangs from. */
const SECTION = 'zzprp1';
/** Carries a RETIRED key (image_tag) beside an honoured one (css). */
const RETIRED_NODE = 'zzprp2';
/** Carries a key this repo has never heard of, plus an author-parked one. */
const UNKNOWN_NODE = 'zzprp3';
/** Carries a reportedAtUse key — its own consumer reports it, not the tripline. */
const REPORTED_AT_USE_NODE = 'zzprp4';

const SITUATION = situation({
	tld: 'zzprp',
	name: 'ontology property census — retired, unknown and parked keys on live nodes',
	nodes: [
		{ tipo: SECTION, model: 'section', parent: 'dd14' },
		{
			tipo: RETIRED_NODE,
			model: 'component_input_text',
			parent: SECTION,
			properties: { css: { width: '100%' }, image_tag: true, multi_value: true },
		},
		{
			tipo: UNKNOWN_NODE,
			model: 'component_input_text',
			parent: SECTION,
			properties: { zz_planted_dead_key: true, view_DES: 'parked', _info: 'a note' },
		},
		{
			tipo: REPORTED_AT_USE_NODE,
			model: 'component_input_text',
			parent: SECTION,
			properties: { target_mode: 'free', target_values: ['zzprp1'] },
		},
	],
});

/** The report lines for THIS situation's nodes only (the install's own rows are not ours to judge). */
function scratchEntries(entries: readonly PropertyCensusEntry[]): PropertyCensusEntry[] {
	return entries.filter((entry) => entry.tipo.startsWith('zzprp'));
}

beforeAll(async () => {
	await ensureSituation(SITUATION);
	clearOntologyCaches();
});

afterAll(async () => {
	await dropSituation(SITUATION);
	clearOntologyCaches();
});

describe('the install report over a real dd_ontology', () => {
	test('the whole-table scan sees the scratch nodes and the install’s own', async () => {
		const nodes = await listNodesWithProperties();
		expect(nodes.length).toBeGreaterThan(100);
		const scratch = nodes.filter((node) => node.tipo.startsWith('zzprp'));
		expect(scratch.map((node) => node.tipo).sort()).toEqual([
			RETIRED_NODE,
			UNKNOWN_NODE,
			REPORTED_AT_USE_NODE,
		]);
		expect((scratch[0]?.properties as Record<string, unknown>).image_tag).toBe(true);
	});

	test('every inert key is reported with its node, verdict and replacement — and nothing else is', async () => {
		const entries = scratchEntries(buildPropertyCensusReport(await listNodesWithProperties()));
		expect(entries.map((entry) => `${entry.verdict}:${entry.tipo}:${entry.key}`)).toEqual([
			`retired:${RETIRED_NODE}:image_tag`,
			`retired:${RETIRED_NODE}:multi_value`,
			`retired:${REPORTED_AT_USE_NODE}:target_mode`,
			`retired:${REPORTED_AT_USE_NODE}:target_values`,
			`unknown:${UNKNOWN_NODE}:zz_planted_dead_key`,
		]);
		const imageTag = entries.find((entry) => entry.key === 'image_tag');
		expect(imageTag?.replacement).toBeNull();
		expect(imageTag?.reason.length).toBeGreaterThan(40);
		const multiValue = entries.find((entry) => entry.key === 'multi_value');
		expect(multiValue?.replacement).toContain('single-value facet');
	});

	test('the script’s flags split the two verdicts, and the human report names node + key', async () => {
		const entries = scratchEntries(buildPropertyCensusReport(await listNodesWithProperties()));
		expect(
			selectVerdicts(entries, { retired: true, unknown: false })
				.map((entry) => entry.key)
				.sort(),
		).toEqual(['image_tag', 'multi_value', 'target_mode', 'target_values']);
		expect(
			selectVerdicts(entries, { retired: false, unknown: true }).map((entry) => entry.key),
		).toEqual(['zz_planted_dead_key']);
		expect(selectVerdicts(entries, { retired: false, unknown: false }).length).toBe(entries.length);

		const report = formatReport(entries);
		expect(report).toContain(`RETIRED  ${RETIRED_NODE}`);
		expect(report).toContain('properties.image_tag');
		expect(report).toContain('single-value facet');
		expect(report).toContain(`UNKNOWN  ${UNKNOWN_NODE}`);
		expect(report).toContain('TOTAL: 5 (node, key) pair(s) nothing reads');
		expect(formatReport([])).toContain('no retired or unknown property keys');
	});
});

describe('the resolver tripline', () => {
	test('a node with a retired key gets ONE loud line naming node, key and replacement', async () => {
		clearOntologyCaches();
		const captured: string[] = [];
		const errors = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			captured.push(String(args[0]));
		});
		try {
			await getNode(RETIRED_NODE);
			await getNode(RETIRED_NODE); // cached: the cache is the dedupe
		} finally {
			errors.mockRestore();
		}
		const lines = captured.filter((line) => line.includes(RETIRED_NODE));
		expect(lines.length).toBe(2); // image_tag + multi_value, once each
		expect(lines.join('\n')).toContain('properties.image_tag');
		expect(lines.join('\n')).toContain('no v7 replacement');
		expect(lines.join('\n')).toContain('single-value facet');
		expect(lines.every((line) => line.startsWith('[ontology/resolver]'))).toBe(true);
	});

	test('an honoured-only node is silent, and a reportedAtUse key is left to its own consumer', async () => {
		clearOntologyCaches();
		const lines: string[] = [];
		const errors = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			lines.push(String(args[0]));
		});
		try {
			await getNode(SECTION);
			await getNode(UNKNOWN_NODE);
			await getNode(REPORTED_AT_USE_NODE);
		} finally {
			errors.mockRestore();
		}
		expect(lines.filter((line) => line.includes(SECTION)).length).toBe(0);
		expect(lines.filter((line) => line.includes(UNKNOWN_NODE)).length).toBe(0);
		expect(lines.filter((line) => line.includes(REPORTED_AT_USE_NODE)).length).toBe(0);
	});
});
