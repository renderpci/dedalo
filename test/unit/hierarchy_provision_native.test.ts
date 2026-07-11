/**
 * DEC-14b — TS-NATIVE write-path coverage for the two ONTOLOGY-provisioning
 * differentials that are fixture-exempt (write-path gates SKIP without the live
 * PHP oracle): test/parity/generate_virtual_section_differential.test.ts and
 * test/parity/ontology_delete_differential.test.ts. Those gates stay the
 * PHP-comparison bar; THIS file pins the same shapes as literals so the
 * write-path contract still reddens on a credless machine.
 *
 * Expectations are derived from the PHP oracle source, not from what TS emits:
 *  - provisioning: PHP hierarchy::generate_virtual_section (class.hierarchy.php
 *    :228) / provision_virtual_sections (:459) — node structure, the <tld>0/1
 *    descriptor + <tld>0/2 model component-key sets, the byte pins the TS module
 *    header records as PHP-verified (descriptor ontology7 lang lg-spa vs the
 *    registration's lg-nolan; the BARE ontology15 parent locator; the
 *    hierarchy53/58 write-back items).
 *  - delete cascade: PHP ontology::delete_main (class.ontology.php:2803) →
 *    delete_ontology (:2994) steps 1 (dd_ontology nodes purged) + 3 (every
 *    matrix_ontology '<tld>0' record deleted), PLUS the registry record itself
 *    — which PHP strands (live defect, pinned in the differential); the
 *    TS-correct completion is asserted here, same as the differential's TS leg.
 *
 * ONE synthetic scratch TLD ('zznt' — no real install uses it; distinct from
 * the differentials' zzt/zzta/zztb/zzva/zzvb) is provisioned from a
 * hierarchy1-style registry record, asserted, uninstalled through the same
 * dd_core_api dispatch chokepoint the differential uses, and asserted again.
 * afterAll teardown is UNCONDITIONAL (runs the full purge even on partial
 * failure) and also runs defensively in beforeAll against a crashed prior run.
 *
 * Shared-surface note (same blast radius as the differential): provisioning
 * re-derives the ontologytype/hierarchytype/hierarchymtype grouper registrations
 * idempotently — those are canonical rows both engines rebuild the same way.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { deleteTldNodes } from '../../src/core/db/dd_ontology.ts';
import { updateMatrixKeyData } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	type GenerateVirtualSectionResponse,
	generateVirtualSection,
} from '../../src/core/ontology/hierarchy_provision.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';

const TLD = 'zznt'; // synthetic scratch TLD — swept by the zz% hygiene query
const REAL_SECTION = 'rsc167'; // model 'section' (same source the differential uses)
const NAME = `${TLD} native`;

let hierarchyId: number | undefined;
let provisioned: GenerateVirtualSectionResponse | undefined;

interface NodeShape {
	suffix: string; // tipo with the tld prefix stripped ('0' | '1' | '2')
	parent: string | null; // exact parent term-id (typology 1 groupers)
	model: string | null;
	model_tipo: string | null;
	is_model: boolean;
	is_translatable: boolean;
	is_main: boolean;
	term: Record<string, string> | null;
}

/** Same hierarchy1 registry fixture the differential seeds (typology 1). */
async function buildHierarchyFixture(): Promise<number> {
	const hid = await createSectionRecord('hierarchy1', -1);
	const w = (col: 'relation' | 'string', tipo: string, v: unknown): Promise<void> =>
		updateMatrixKeyData('matrix_hierarchy_main', 'hierarchy1', hid, col, tipo, v);
	await w('relation', 'hierarchy4', [
		{
			id: 1,
			type: 'dd151',
			section_tipo: 'dd64',
			section_id: '1',
			from_component_tipo: 'hierarchy4',
		},
	]);
	await w('string', 'hierarchy6', [{ id: 1, lang: 'lg-nolan', value: TLD }]);
	await w('string', 'hierarchy109', [{ id: 1, lang: 'lg-nolan', value: REAL_SECTION }]);
	await w('relation', 'hierarchy9', [
		{
			type: 'dd151',
			section_tipo: 'hierarchy13',
			section_id: '1',
			from_component_tipo: 'hierarchy9',
		},
	]);
	await w('string', 'hierarchy5', [{ id: 1, lang: 'lg-spa', value: NAME }]);
	return hid;
}

async function nodeShapes(): Promise<NodeShape[]> {
	const rows = (await sql.unsafe(
		'SELECT tipo, parent, model, model_tipo, is_model, is_translatable, is_main, term FROM dd_ontology WHERE tld = $1 ORDER BY tipo',
		[TLD],
	)) as {
		tipo: string;
		parent: string | null;
		model: string | null;
		model_tipo: string | null;
		is_model: boolean;
		is_translatable: boolean;
		is_main: boolean;
		term: Record<string, string> | null;
	}[];
	return rows.map((row) => ({
		suffix: row.tipo.slice(TLD.length),
		parent: row.parent,
		model: row.model,
		model_tipo: row.model_tipo,
		is_model: row.is_model,
		is_translatable: row.is_translatable,
		is_main: row.is_main,
		term: row.term,
	}));
}

async function nodeRecordCols(sectionId: number): Promise<{
	relation: Record<string, unknown> | null;
	string: Record<string, unknown> | null;
}> {
	const rows = (await sql.unsafe(
		'SELECT relation, string FROM matrix_ontology WHERE section_tipo = $1 AND section_id = $2',
		[`${TLD}0`, sectionId],
	)) as { relation: Record<string, unknown> | null; string: Record<string, unknown> | null }[];
	return rows[0] ?? { relation: null, string: null };
}

/** Only the ONTOLOGY component keys — the audit keys (dd199/dd200/…) are create-path metadata. */
function ontologyKeys(obj: Record<string, unknown> | null): string[] {
	return Object.keys(obj ?? {})
		.filter((key) => key.startsWith('ontology'))
		.sort();
}

/** Unconditional purge of every surface this file can touch (also run pre-flight). */
async function purgeScratch(): Promise<void> {
	await deleteTldNodes(TLD);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [`${TLD}0`]);
	await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
	);
	// Registry rows of the scratch TLD (also catches strays from a crashed run).
	const registry = (await sql.unsafe(
		`SELECT section_id FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
	)) as { section_id: number }[];
	const registryIds = new Set(registry.map((row) => Number(row.section_id)));
	if (hierarchyId !== undefined) registryIds.add(hierarchyId);
	for (const rid of registryIds) {
		await sql.unsafe(
			`DELETE FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[rid],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[rid],
		);
	}
	// TM snapshots of the scratch node records (delete pipeline writes them).
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [`${TLD}0`]);
	// The scratch section's counter row (PHP resets it in delete_ontology step 4).
	await sql.unsafe('DELETE FROM matrix_counter WHERE tipo = $1', [`${TLD}0`]);
	await clearOntologyDerivedCaches();
}

beforeAll(async () => {
	await purgeScratch(); // defensive: a crashed earlier run must not skew the pins
	hierarchyId = await buildHierarchyFixture();
	provisioned = await generateVirtualSection({
		section_id: hierarchyId,
		section_tipo: 'hierarchy1',
		userId: -1,
	});
}, 120000);

afterAll(async () => {
	await purgeScratch();
});

describe('generate_virtual_section — TS-native provisioning of a scratch TLD', () => {
	test('provisioning succeeds; the only error is the ledgered non-fatal permission grant', () => {
		expect(provisioned?.result).toBe(true);
		expect(provisioned?.errors.length).toBe(1);
		expect(provisioned?.errors[0]).toContain('set_section_permissions');
	});

	test('dd_ontology node structure (root + descriptor + model twin, typology-1 groupers)', async () => {
		// PHP provision_virtual_sections: <tld>0 root (model 'section'/dd6, is_main,
		// parent = ontologytype grouper), <tld>1 descriptor (parent hierarchytype
		// grouper, is_model false), <tld>2 model twin (parent hierarchymtype
		// grouper, is_model true). model = dd6.term['lg-spa'] = 'section'.
		expect(await nodeShapes()).toEqual([
			{
				suffix: '0',
				parent: 'ontologytype1',
				model: 'section',
				model_tipo: 'dd6',
				is_model: false,
				is_translatable: false,
				is_main: true,
				term: { 'lg-spa': NAME },
			},
			{
				suffix: '1',
				parent: 'hierarchytype1',
				model: 'section',
				model_tipo: 'dd6',
				is_model: false,
				is_translatable: false, // ontology8 written as si/no NO
				is_main: false,
				term: { 'lg-spa': NAME },
			},
			{
				suffix: '2',
				parent: 'hierarchymtype1',
				model: 'section',
				model_tipo: 'dd6',
				is_model: true, // ontology30 → dd64/1 flipped on the model twin only
				is_translatable: false,
				is_main: false,
				term: { 'lg-spa': NAME },
			},
		]);
	});

	test('root node carries the PHP-pinned relations + properties', async () => {
		// PHP create_dd_ontology_ontology_section_node (:1042).
		const rows = (await sql.unsafe(
			'SELECT relations, properties FROM dd_ontology WHERE tipo = $1',
			[`${TLD}0`],
		)) as { relations: unknown; properties: unknown }[];
		expect(rows[0]?.relations).toEqual([{ tipo: 'ontology1' }, { tipo: 'dd1201' }]);
		expect(rows[0]?.properties).toEqual({ main_tld: TLD, color: '#2d8894' });
	});

	test('descriptor <tld>0/1 component-key sets (the shapes the differential derives live)', async () => {
		const rec1 = await nodeRecordCols(1);
		expect(ontologyKeys(rec1.relation)).toEqual([
			'ontology10', // connected-to → the real source section
			'ontology15', // parent (hierarchytype grouper)
			'ontology3', // publication yes
			'ontology4', // is_descriptor yes
			'ontology6', // model → dd0/6
			'ontology8', // translatable no
		]);
		expect(ontologyKeys(rec1.string)).toEqual(['ontology5', 'ontology7']);
	});

	test('model <tld>0/2 component-key sets = descriptor set + ontology30', async () => {
		const rec2 = await nodeRecordCols(2);
		expect(ontologyKeys(rec2.relation)).toEqual([
			'ontology10',
			'ontology15',
			'ontology3',
			'ontology30', // is_model — the ONLY key the model twin adds
			'ontology4',
			'ontology6',
			'ontology8',
		]);
		expect(ontologyKeys(rec2.string)).toEqual(['ontology5', 'ontology7']);
	});

	test('byte pins: descriptor tld item is lg-spa; ontology15 parent locators are BARE', async () => {
		const rec1 = await nodeRecordCols(1);
		const rec2 = await nodeRecordCols(2);
		// ontology7 lang lg-spa (DEDALO_DATA_LANG) — DIFFERS from the registration's lg-nolan.
		expect(rec1.string?.ontology7).toEqual([{ id: 1, lang: 'lg-spa', value: TLD }]);
		// BARE {section_tipo, section_id} — no type / from_component_tipo (PHP-pinned).
		expect(rec1.relation?.ontology15).toEqual([
			{ section_tipo: 'hierarchytype0', section_id: '1' },
		]);
		expect(rec2.relation?.ontology15).toEqual([
			{ section_tipo: 'hierarchymtype0', section_id: '1' },
		]);
		// The is_model flip is a full link locator to dd64/1.
		expect(rec2.relation?.ontology30).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_id: '1',
				section_tipo: 'dd64',
				from_component_tipo: 'ontology30',
			},
		]);
	});

	test('hierarchy53/58 target-section pointers written back on the registry record', async () => {
		const rows = (await sql.unsafe(
			`SELECT string->'hierarchy53' AS h53, string->'hierarchy58' AS h58
			 FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[hierarchyId ?? -1],
		)) as { h53: unknown; h58: unknown }[];
		expect(rows[0]?.h53).toEqual([{ id: 1, lang: 'lg-nolan', value: `${TLD}1` }]);
		expect(rows[0]?.h58).toEqual([{ id: 1, lang: 'lg-nolan', value: `${TLD}2` }]);
	});

	test('ontology35 registration row exists and its tld item is lg-nolan', async () => {
		// addMainSection (PHP add_main_section :809) — hierarchy6 uses lg-nolan,
		// the counterpart of the descriptor's lg-spa pin above.
		const rows = (await sql.unsafe(
			`SELECT string->'hierarchy6' AS h6 FROM matrix_ontology_main
			 WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
			[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
		)) as { h6: unknown }[];
		expect(rows.length).toBe(1);
		expect(rows[0]?.h6).toEqual([{ id: 1, lang: 'lg-nolan', value: TLD }]);
	});
});

describe('ontology_delete — TS-native cascade through the dispatch chokepoint', () => {
	test('deleting the registry record uninstalls the TLD (nodes + node records + registry row)', async () => {
		expect(hierarchyId).toBeDefined();

		// Same dispatch-chokepoint path the differential drives.
		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const result = await dispatchRqo(
			{
				action: 'delete',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					model: 'section',
					tipo: 'hierarchy1',
					section_tipo: 'hierarchy1',
					section_id: String(hierarchyId),
					action: 'delete',
					delete_mode: 'delete_record',
				},
			} as never,
			{
				requestId: 't',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			} as never,
		);
		expect(result.status).toBe(200);

		// Step 1 — every dd_ontology row of the tld is gone.
		const nodes = (await sql.unsafe('SELECT COUNT(*) AS n FROM dd_ontology WHERE tld = $1', [
			TLD,
		])) as { n: string }[];
		expect(Number(nodes[0]?.n)).toBe(0);

		// The registry matrix row is gone (PHP strands it — live defect pinned in
		// the differential; this is the TS-correct completed uninstall).
		const main = (await sql.unsafe(
			`SELECT 1 FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' AND section_id = $1`,
			[hierarchyId ?? -1],
		)) as unknown[];
		expect(main.length).toBe(0);

		// Step 3 — every matrix_ontology record of the '<tld>0' section is gone
		// (PHP delete_ontology :2994 deletes all node records via the sections
		// delete pipeline).
		const records = (await sql.unsafe(
			'SELECT COUNT(*) AS n FROM matrix_ontology WHERE section_tipo = $1',
			[`${TLD}0`],
		)) as { n: string }[];
		expect(Number(records[0]?.n)).toBe(0);
	}, 60000);
});
