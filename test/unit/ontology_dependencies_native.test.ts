/**
 * DECLARED ONTOLOGY DEPENDENCIES, server side (installer unification A5;
 * WC-2026-10-09-ontology-manifest-dependencies) — from the component an editor
 * fills on the ontology master to the field the installer reads in the manifest.
 *
 *   ddengine11 (ONTOLOGY_DEPENDENCIES, engine-owned) is materialized under the
 *   ontology-main real section's "Relations" group and RENDERS in the
 *   ontology35 edit form (the implicit edit config of the virtual section) as a
 *   portal targeting ontology35 itself
 *       → the master's editors fill it through the REAL edit path (saveComponentData)
 *       → getActiveOntologies emits `dependencies` (declared order, deduplicated,
 *         own TLD dropped, PRESENT ONLY WHEN DECLARED; an unresolvable locator
 *         is a census error line, never fatal)
 *       → activeOntologiesInfo (what updateOntologyInfo persists into
 *         ontology.json) copies it only when defined
 *       → buildOntologyUpdateInfo (the master's manifest builder) carries it
 *         verbatim, and the client parser reads it back.
 *
 * SCRATCH SURFACE (this file owns it, on the SUITE database — asserted first):
 * registry rows of the scratch TLDs zzka/zzkb/zzkc/zzkd, created by the
 * engine's own registry door (addMainSection); zzkd's row is deleted at once
 * so its id is a GUARANTEED-dangling locator target (the counter never gives
 * an id back). Swept in afterAll with their TM and activity rows, and the
 * residue asserted zero. The real section ids come from the counter — no id
 * band (test isolation is the database, not an id range).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDdOntologyRow } from '../../src/core/db/dd_ontology.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	activeOntologiesInfo,
	getActiveOntologies,
	type OntologyCensusEntry,
} from '../../src/core/ontology/data_io.ts';
import { buildOntologyUpdateInfo } from '../../src/core/ontology/data_io_import.ts';
import { loadEngineOntologyDoc } from '../../src/core/ontology/engine_ontology.ts';
import { parseOntologyManifest } from '../../src/core/ontology/ontology_manifest.ts';
import {
	DATA_NOLAN,
	HIERARCHY_TLD,
	ONTOLOGY_DEPENDENCIES,
	ONTOLOGY_MAIN_SECTION,
	RELATION_TYPE_LINK,
} from '../../src/core/ontology/ontology_tipos.ts';
import { addMainSection } from '../../src/core/ontology/ontology_write.ts';
import { getSectionRealTipo } from '../../src/core/ontology/resolver.ts';
import { buildImplicitSectionEditConfig } from '../../src/core/relations/request_config/implicit.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const DOOR = 'ontology_dependencies_native';
const SCRATCH = ['zzka', 'zzkb', 'zzkc', 'zzkd'] as const;
type ScratchTld = (typeof SCRATCH)[number];

const ids = {} as Record<ScratchTld, number>;
/** The core `dd` registry row (read, never written): a declaration names core too. */
let coreDdId = 0;

function dependencyLocator(sectionId: number): Record<string, unknown> {
	return {
		type: RELATION_TYPE_LINK,
		section_tipo: ONTOLOGY_MAIN_SECTION,
		section_id: String(sectionId),
		from_component_tipo: ONTOLOGY_DEPENDENCIES,
	};
}

async function declare(tld: ScratchTld, targets: number[]): Promise<void> {
	const saved = await saveComponentData({
		componentTipo: ONTOLOGY_DEPENDENCIES,
		sectionTipo: ONTOLOGY_MAIN_SECTION,
		sectionId: ids[tld],
		lang: DATA_NOLAN,
		changedData: [{ action: 'set_data', id: null, value: targets.map(dependencyLocator) }],
		userId: -1,
	});
	if (!saved.ok) throw new Error(`declaring ${tld}'s dependencies failed: ${saved.message}`);
}

async function registryIdOf(tld: string): Promise<number | null> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM matrix_ontology_main
		  WHERE section_tipo = $1 AND string->$2 @> $3::text::jsonb`,
		[ONTOLOGY_MAIN_SECTION, HIERARCHY_TLD, JSON.stringify([{ value: tld }])],
	)) as { section_id: number }[];
	return rows.length === 1 ? Number(rows[0]?.section_id) : null;
}

async function sweep(): Promise<number> {
	const scratchIds = JSON.stringify(Object.values(ids).map(String));
	let removed = 0;
	const del = async (query: string, params: unknown[]): Promise<void> => {
		const result = (await sql.unsafe(query, params as never[])) as unknown as { count?: number };
		removed += Number(result.count ?? 0);
	};
	await del(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = $1 AND section_id::text IN (SELECT jsonb_array_elements_text($2::text::jsonb))`,
		[ONTOLOGY_MAIN_SECTION, scratchIds],
	);
	await del(
		`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id::text IN (SELECT jsonb_array_elements_text($2::text::jsonb))`,
		[ONTOLOGY_MAIN_SECTION, scratchIds],
	);
	// Activity rows address their record in misc->'dd551' (never data->>'section_tipo').
	await del(
		`DELETE FROM matrix_activity WHERE section_tipo = 'dd542'
		    AND misc->'dd551'->0->'value'->>'section_tipo' = $1
		    AND misc->'dd551'->0->'value'->>'section_id' IN (SELECT jsonb_array_elements_text($2::text::jsonb))`,
		[ONTOLOGY_MAIN_SECTION, scratchIds],
	);
	return removed;
}

async function residue(): Promise<number> {
	const scratchIds = JSON.stringify(Object.values(ids).map(String));
	const rows = (await sql.unsafe(
		`SELECT (SELECT count(*) FROM matrix_ontology_main WHERE section_tipo = $1 AND section_id::text IN (SELECT jsonb_array_elements_text($2::text::jsonb)))
		      + (SELECT count(*) FROM matrix_time_machine WHERE section_tipo = $1 AND section_id::text IN (SELECT jsonb_array_elements_text($2::text::jsonb)))
		        AS n`,
		[ONTOLOGY_MAIN_SECTION, scratchIds],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? -1);
}

let census: Awaited<ReturnType<typeof getActiveOntologies>>;
const entry = (tld: string): OntologyCensusEntry | undefined =>
	census.ontologies.find((candidate) => candidate.tld === tld);

beforeAll(async () => {
	await assertTestDatabase(DOOR);
	for (const tld of SCRATCH) {
		if ((await registryIdOf(tld)) !== null)
			throw new Error(`a '${tld}' registry row pre-exists — sweep it first`);
		const id = await addMainSection({
			tld,
			typology_id: 15,
			name_data: [{ id: 1, lang: 'lg-spa', value: `${tld} scratch` }],
		});
		if (id === null) throw new Error(`addMainSection(${tld}) minted no record`);
		ids[tld] = id;
	}
	// zzkd's id becomes a guaranteed-dangling target: its row goes, its id never returns.
	await sql.unsafe(`DELETE FROM matrix_ontology_main WHERE section_tipo = $1 AND section_id = $2`, [
		ONTOLOGY_MAIN_SECTION,
		ids.zzkd,
	]);
	const dd = await registryIdOf('dd');
	if (dd === null) throw new Error("the suite database has no 'dd' ontology registry row");
	coreDdId = dd;

	// zzka: zzkb, itself, zzkb again, the dangling id, core dd → [zzkb, dd]
	await declare('zzka', [ids.zzkb, ids.zzka, ids.zzkb, ids.zzkd, coreDdId]);
	// zzkb: ONLY itself → nothing resolves to another TLD → NOT declared (no key)
	await declare('zzkb', [ids.zzkb]);
	// zzkc: never touched → no key
	census = await getActiveOntologies({ activeOnly: true });
}, 60_000);

afterAll(async () => {
	const removed = await sweep();
	expect(removed).toBeGreaterThan(0); // the run wrote what it claims
	expect(await residue()).toBe(0);
});

describe('the declaration component (engine-owned, in the Ontologies-main edit form)', () => {
	test('ddengine11 is materialized exactly as its engine JSON node declares it', async () => {
		const doc = await loadEngineOntologyDoc();
		const node = doc.nodes.find((candidate) => candidate.tipo === ONTOLOGY_DEPENDENCIES);
		if (node === undefined) throw new Error('the engine JSON lost the dependencies node');
		const row = await readDdOntologyRow(ONTOLOGY_DEPENDENCIES);
		expect(row).not.toBeNull();
		expect({
			parent: row?.parent,
			model: row?.model,
			order: row?.order_number,
			relations: row?.relations,
		}).toEqual({
			parent: node.parent,
			model: 'component_portal',
			order: node.order_number,
			relations: node.relations,
		});
	});

	test('it renders in the ontology35 edit form (the virtual section borrows it from its real section)', async () => {
		const real = await getSectionRealTipo(ONTOLOGY_MAIN_SECTION);
		expect(real).not.toBe(ONTOLOGY_MAIN_SECTION); // ontology35 IS virtual — else this proves nothing
		const [config] = await buildImplicitSectionEditConfig({
			ownerTipo: ONTOLOGY_MAIN_SECTION,
			ownerSectionTipo: ONTOLOGY_MAIN_SECTION,
			mode: 'edit',
			ownerIsSection: true,
		});
		const tipos = (config?.show?.ddo_map ?? []).map((ddo) => ddo.tipo);
		expect(tipos.length).toBeGreaterThan(3); // anti-vacuity: the real form
		expect(tipos).toContain(ONTOLOGY_DEPENDENCIES);
	});

	test('its own context is a portal whose records are ontology35 registry records', async () => {
		const context = (await buildStructureContext({
			tipo: ONTOLOGY_DEPENDENCIES,
			sectionTipo: ONTOLOGY_MAIN_SECTION,
			mode: 'edit',
			lang: DATA_NOLAN,
			permissions: 2,
		})) as { model?: string; request_config?: { sqo?: { section_tipo?: unknown[] } }[] } | null;
		expect(context?.model).toBe('component_portal');
		const targets = (context?.request_config?.[0]?.sqo?.section_tipo ?? []).map((item) =>
			typeof item === 'string' ? item : (item as { tipo?: string }).tipo,
		);
		expect(targets).toEqual([ONTOLOGY_MAIN_SECTION]);
	});
});

describe('the export census (getActiveOntologies → activeOntologiesInfo → manifest)', () => {
	test('declared order, deduplicated, own TLD dropped, core kept', () => {
		expect(entry('zzka')?.dependencies).toEqual(['zzkb', 'dd']);
	});

	test('NOT declared is an ABSENT key — an empty or self-only component included', () => {
		for (const tld of ['zzkb', 'zzkc']) {
			const found = entry(tld);
			expect(found, `${tld} is in the census`).toBeDefined();
			expect(Object.hasOwn(found as object, 'dependencies')).toBe(false);
		}
	});

	test('a locator that names no TLD is a census error line, never fatal', () => {
		expect(census.errors).toContain(
			`${ONTOLOGY_MAIN_SECTION}/${ids.zzka}: dependency ${ONTOLOGY_MAIN_SECTION}/${ids.zzkd} has no tld — skipped`,
		);
	});

	test('activeOntologiesInfo copies dependencies ONLY when declared', () => {
		const info = activeOntologiesInfo(census.ontologies.filter((el) => el.tld.startsWith('zzk')));
		const byTld = new Map(info.map((item) => [item.tld, item]));
		expect(byTld.get('zzka')).toMatchObject({ tld: 'zzka', dependencies: ['zzkb', 'dd'] });
		expect(Object.hasOwn(byTld.get('zzkb') as object, 'dependencies')).toBe(false);
		expect(Object.hasOwn(byTld.get('zzkc') as object, 'dependencies')).toBe(false);
	});

	test('the master manifest carries it verbatim, and the client parser reads it back', () => {
		const dir = mkdtempSync(join(tmpdir(), 'zzk_manifest_'));
		try {
			const active = activeOntologiesInfo(
				census.ontologies.filter((el) => el.tld.startsWith('zzk')),
			);
			writeFileSync(
				join(dir, 'ontology.json'),
				JSON.stringify({ version: '7.0.0', active_ontologies: active }),
			);
			for (const tld of ['zzka', 'zzkb', 'zzkc']) writeFileSync(join(dir, `${tld}.copy.gz`), '');
			const manifest = buildOntologyUpdateInfo(dir, 'https://zz.invalid/io/7.0');
			const served = (
				manifest.data.info as { active_ontologies: { tld: string; dependencies?: string[] }[] }
			).active_ontologies;
			expect(served.find((item) => item.tld === 'zzka')?.dependencies).toEqual(['zzkb', 'dd']);
			const parsed = parseOntologyManifest(manifest.data);
			if (!parsed.ok) throw new Error(parsed.reason);
			expect(parsed.ontologies.map((item) => [item.tld, item.dependencies])).toEqual([
				['zzka', ['zzkb', 'dd']],
				['zzkb', null],
				['zzkc', null],
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
