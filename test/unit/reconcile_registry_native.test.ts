/**
 * RECONCILE REGISTRY — the behavioural gate (audit 2026-08-26 S-10).
 *
 * The census tripwire (reconcile_registry_tripwire.test.ts) proves every
 * two-store reconcile is REGISTERED. This gate proves each registered
 * definition actually MEASURES its pair through the registry door: on a
 * situation this file builds and owns, a dry run reports drift 0; after this
 * file PLANTS one disagreement between the two stores, a dry run reports
 * drift > 0, a second dry run reports the same (a dry run writes nothing), and
 * the `reconcile` ops gauge carries that verdict. One planter per registered
 * name — PLANTERS' keys must equal the live registry, so a definition cannot
 * be registered without its behavioural proof.
 *
 * Nothing here changes what a reconcile computes: every leg goes through
 * `runReconcile(name, {apply:false, scope})` — the same call the widget, the
 * CLI and the scheduler make.
 *
 * THE SITUATIONS (suite database + suite media root only; torn down):
 *   - `zzrc` TLD: zzrc1 section (matrix_test) + zzrc2 component_image — the
 *     files_info and counters↔media pairs; zzrc3 section + zzrc4 section_map
 *     with a `rag.embed` group + zzrc5 text — the RAG presence pair.
 *   - `zzro` TLD: two ontology source records projected by rebuildOntology.
 *   - `zzrh` TLD: one hierarchy1 registry row provisioned by ensureHierarchy.
 *   - the shared `zzot` observer situation (test/helpers/observer_term_seed.ts).
 *   - the suite media root's `.publication/pub` marker store.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	deleteRecord as deleteRagRecord,
	ragSql,
	upsertEmbeddingRows,
} from '../../src/ai/rag/vector_store.ts';
import { config } from '../../src/config/config.ts';
import { widget as reconcileStatusWidget } from '../../src/core/area_maintenance/widgets/reconcile_status.ts';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { insertMatrixRecordWithCounter } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildMediaLocation } from '../../src/core/media/path.ts';
import { resolveMediaToolContext } from '../../src/core/media/tool_support.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { ensureHierarchy } from '../../src/core/ontology/hierarchy_state.ts';
import { deleteOntologyByTld } from '../../src/core/ontology/ontology_delete.ts';
import { rebuildOntology } from '../../src/core/ontology/ontology_state.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { registerAllReconciles } from '../../src/core/reconcile/catalog.ts';
import {
	REGISTERED_NAMES,
	type ReconcileReport,
	reconcileGauge,
	runReconcile,
} from '../../src/core/reconcile/registry.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	dropObserverTerm,
	ensureObserverTerm,
	INDEXER,
	REF_SECTION,
	SEED_TERM,
	TERM_SECTION,
} from '../helpers/observer_term_seed.ts';
import { cleanScratchTipo } from '../helpers/test_data.ts';

/* ------------------------------------------------------------ situations */

const TLD = 'zzrc';
const MEDIA_SECTION = `${TLD}1`;
const IMAGE = `${TLD}2`;
const RAG_SECTION = `${TLD}3`;
const RAG_MAP = `${TLD}4`;
const RAG_TEXT = `${TLD}5`;
const TABLE = 'matrix_test';
/** dd_ontology node of model 'matrix_table' whose term is `matrix_test`. */
const MATRIX_TEST_RELATION = 'test24';

const ONTO_TLD = 'zzro';
const ONTO_SECTION = `${ONTO_TLD}0`;

const HIER_TLD = 'zzrh';
const HIER_SECTION = 'hierarchy1';
const HIER_TABLE = 'matrix_hierarchy_main';
const HIER_ID = 900031;
const USER_ID = -1;

const RAG_MODEL = `zzrcmodel${process.pid}`;

/** Scratch files planted in the SUITE media root, removed by path. */
const planted: string[] = [];
let OBSERVER_REF_TABLE = TABLE;
/** The observer scratch referencer this file inserts (its own id, swept). */
const OBSERVER_REFERENCER_ID = 91091;

function mediaRoot(): string {
	const root = config.media.rootPath;
	if (root === null) throw new Error('suite media root not configured');
	return root;
}

async function seedOntologyRecord(sectionId: number, term: string): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, string)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[
			sectionId,
			ONTO_SECTION,
			JSON.stringify({
				ontology7: [{ id: 1, lang: 'lg-spa', value: ONTO_TLD }],
				ontology5: [{ id: 1, lang: 'lg-eng', value: term }],
			}),
		],
	);
}

async function sweepOntologySituation(): Promise<void> {
	await deleteTldNodes(ONTO_TLD);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [ONTO_SECTION]);
	await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: ONTO_TLD }] })],
	);
	await clearOntologyDerivedCaches();
}

async function seedHierarchyRegistry(): Promise<void> {
	await sql.unsafe(
		`INSERT INTO "${HIER_TABLE}" (section_id, section_tipo, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			HIER_ID,
			HIER_SECTION,
			JSON.stringify({
				hierarchy5: [{ id: 1, lang: 'lg-eng', value: 'ZZRH reconcile scratch' }],
				hierarchy6: [{ id: 1, lang: 'lg-nolan', value: HIER_TLD.toUpperCase() }],
			}),
			JSON.stringify({
				hierarchy9: [
					{
						id: 1,
						type: 'dd151',
						section_id: '2',
						section_tipo: 'hierarchy13',
						from_component_tipo: 'hierarchy9',
					},
				],
			}),
		],
	);
	await clearOntologyDerivedCaches();
}

async function sweepHierarchySituation(): Promise<void> {
	await deleteOntologyByTld(HIER_TLD, (st, sid) => deleteSectionRecord(st, sid, USER_ID));
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [HIER_TLD]);
	await sql.unsafe(`DELETE FROM "${HIER_TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
		HIER_SECTION,
		HIER_ID,
	]);
	await sql.unsafe('DELETE FROM matrix_hierarchy WHERE section_tipo IN ($1, $2)', [
		`${HIER_TLD}1`,
		`${HIER_TLD}2`,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo IN ($1, $2, $3)
		   OR (section_tipo = $4 AND section_id = $5)`,
		[`${HIER_TLD}0`, `${HIER_TLD}1`, `${HIER_TLD}2`, HIER_SECTION, HIER_ID],
	);
	await clearOntologyDerivedCaches();
}

async function sweepMediaSituation(): Promise<void> {
	await cleanScratchTipo(MEDIA_SECTION, TABLE);
	await cleanScratchTipo(RAG_SECTION, TABLE);
	await deleteTldNodes(TLD);
	await clearOntologyDerivedCaches();
	for (const path of planted.splice(0)) rmSync(path, { force: true });
}

async function sweepObserverScratch(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${OBSERVER_REF_TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[REF_SECTION, OBSERVER_REFERENCER_ID],
	);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		REF_SECTION,
		OBSERVER_REFERENCER_ID,
	]);
}

beforeAll(async () => {
	await registerAllReconciles();
	await sweepMediaSituation();
	await sweepOntologySituation();
	await sweepHierarchySituation();

	// zzrc: the media pair + the RAG pair.
	await upsertDdOntologyNode({
		tipo: MEDIA_SECTION,
		model: 'section',
		tld: TLD,
		term: { 'lg-eng': 'Reconcile media scratch section' },
		properties: {},
		relations: [{ tipo: MATRIX_TEST_RELATION }],
	});
	await upsertDdOntologyNode({
		tipo: IMAGE,
		parent: MEDIA_SECTION,
		model: 'component_image',
		tld: TLD,
		term: { 'lg-eng': 'Image' },
		properties: {},
	});
	await upsertDdOntologyNode({
		tipo: RAG_SECTION,
		model: 'section',
		tld: TLD,
		term: { 'lg-eng': 'Reconcile RAG scratch section' },
		properties: {},
		relations: [{ tipo: MATRIX_TEST_RELATION }],
	});
	await upsertDdOntologyNode({
		tipo: RAG_TEXT,
		parent: RAG_SECTION,
		model: 'component_text_area',
		tld: TLD,
		term: { 'lg-eng': 'Body' },
		properties: {},
	});
	await upsertDdOntologyNode({
		tipo: RAG_MAP,
		parent: RAG_SECTION,
		model: 'section_map',
		tld: TLD,
		term: { 'lg-eng': 'Section map' },
		properties: {
			rag: {
				embed: [{ id: 'body', ddo_map: [{ tipo: RAG_TEXT, section_tipo: 'self', mode: 'list' }] }],
			},
		},
	});
	await clearOntologyDerivedCaches();

	// zzro: two source records, projected once → in sync.
	await seedOntologyRecord(1, 'First');
	await seedOntologyRecord(2, 'Second');
	await clearOntologyDerivedCaches();
	const projected = await rebuildOntology(ONTO_TLD, USER_ID);
	expect(projected.state.inSync).toBe(true);

	// zzrh: a registry row, provisioned once → usable.
	await seedHierarchyRegistry();
	const ensured = await ensureHierarchy(HIER_ID, USER_ID);
	expect(ensured.state.usable).toBe(true);

	// zzot: the shared observer situation, converged by ONE apply through the
	// registry so the clean baseline is this file's own, not another gate's residue.
	await ensureObserverTerm();
	OBSERVER_REF_TABLE = (await getMatrixTableFromTipo(REF_SECTION)) ?? TABLE;
	await sweepObserverScratch();
	await runReconcile('observer_mirrors', { apply: true, scope: [TERM_SECTION] });
}, 120000);

afterAll(async () => {
	await sweepObserverScratch();
	await dropObserverTerm();
	await deleteRagRecord({ sectionTipo: RAG_SECTION, sectionId: 7 }).catch(() => {});
	await ragSql.unsafe(`DROP TABLE IF EXISTS "rag_embeddings_${RAG_MODEL}"`).catch(() => {});
	await sweepMediaSituation();
	await sweepOntologySituation();
	await sweepHierarchySituation();
	rmSync(join(mediaRoot(), '.publication', 'pub', `${MEDIA_SECTION}_999999`), { force: true });
}, 120000);

/* --------------------------------------------------------------- planters */

interface Planter {
	scope?: string[];
	/** Put the two stores in disagreement; return the expected drift (> 0). */
	plant(): Promise<number>;
	/** Undo the plant (the dry runs must not have). */
	unplant(): Promise<void>;
}

/** One planter PER REGISTERED NAME — the keys are asserted against the registry. */
const PLANTERS: Record<string, Planter> = {
	counters_media: {
		async plant() {
			// A file naming an id the allocator has never minted: counter + 5.
			const rows = (await sql`SELECT value FROM matrix_counter WHERE tipo = ${MEDIA_SECTION}`) as {
				value: number;
			}[];
			const orphanId = Number(rows[0]?.value ?? 0) + 5;
			const dir = join(mediaRoot(), 'zz_reconcile_scratch');
			mkdirSync(dir, { recursive: true });
			const file = join(dir, `${IMAGE}_${MEDIA_SECTION}_${orphanId}.jpg`);
			writeFileSync(file, 'not really an image');
			planted.push(file);
			return 1;
		},
		async unplant() {
			for (const path of planted.splice(0)) rmSync(path, { force: true });
			rmSync(join(mediaRoot(), 'zz_reconcile_scratch'), { recursive: true, force: true });
		},
	},
	files_info: {
		scope: [MEDIA_SECTION],
		async plant() {
			// A record whose stored index says "no files" while the original is on disk.
			const sectionId = await insertMatrixRecordWithCounter(TABLE, MEDIA_SECTION, {
				media: { [IMAGE]: [{ id: 1, files_info: [] }] },
			});
			const { spec, identity, pathOpts } = await resolveMediaToolContext({
				tipo: IMAGE,
				section_tipo: MEDIA_SECTION,
				section_id: sectionId,
			});
			const location = buildMediaLocation(
				spec,
				identity,
				spec.originalQuality,
				spec.defaultExtension,
				pathOpts,
			);
			mkdirSync(dirname(location.absolutePath), { recursive: true });
			if (existsSync(location.absolutePath)) {
				throw new Error(`refusing to overwrite an existing media file: ${location.absolutePath}`);
			}
			writeFileSync(location.absolutePath, 'scratch');
			planted.push(location.absolutePath);
			return 1;
		},
		async unplant() {
			for (const path of planted.splice(0)) rmSync(path, { force: true });
			await cleanScratchTipo(MEDIA_SECTION, TABLE);
		},
	},
	observer_mirrors: {
		scope: [TERM_SECTION],
		async plant() {
			// The bypass write the sweep heals: a raw referencer INSERT the cascade never saw.
			await sql.unsafe(
				`INSERT INTO "${OBSERVER_REF_TABLE}" (section_id, section_tipo, relation) VALUES ($1, $3, $2::text::jsonb)`,
				[
					OBSERVER_REFERENCER_ID,
					JSON.stringify({
						[INDEXER]: [
							{
								id: 1,
								type: 'dd96',
								section_id: String(SEED_TERM.section_id),
								section_tipo: SEED_TERM.section_tipo,
								from_component_tipo: INDEXER,
							},
						],
					}),
					REF_SECTION,
				],
			);
			return 1;
		},
		async unplant() {
			await sweepObserverScratch();
		},
	},
	media_index: {
		async plant() {
			// A pub/ marker no dbs/ truth owns — a crash between unpublish and marker unlink.
			const pubDir = join(mediaRoot(), '.publication', 'pub');
			mkdirSync(pubDir, { recursive: true });
			const stray = join(pubDir, `${MEDIA_SECTION}_999999`);
			writeFileSync(stray, '');
			planted.push(stray);
			return 1;
		},
		async unplant() {
			for (const path of planted.splice(0)) rmSync(path, { force: true });
		},
	},
	rag_index: {
		scope: [RAG_SECTION],
		async plant() {
			// An orphan vector: a record the matrix does not hold (a delete that never reached the store).
			await upsertEmbeddingRows([
				{
					sectionTipo: RAG_SECTION,
					sectionId: 7,
					componentTipo: RAG_TEXT,
					lang: 'lg-eng',
					chunkIndex: 0,
					provider: 'deterministic-test',
					model: RAG_MODEL,
					dimension: 4,
					embedding: [1, 0, 0, 0],
					sourceHash: 'orphan',
					sourceText: 'orphan vector',
					tokenCount: 2,
					parentKey: null,
					chunkMeta: null,
				},
			]);
			return 1;
		},
		async unplant() {
			await deleteRagRecord({ sectionTipo: RAG_SECTION, sectionId: 7 });
		},
	},
	ontology: {
		scope: [ONTO_TLD],
		async plant() {
			// A projected node no source record produces (the record was deleted).
			await upsertDdOntologyNode({
				tipo: `${ONTO_TLD}9`,
				parent: null,
				term: { 'lg-eng': 'ghost' },
				model: 'section',
				tld: ONTO_TLD,
				properties: null,
			});
			await clearOntologyDerivedCaches();
			return 1;
		},
		async unplant() {
			await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1', [`${ONTO_TLD}9`]);
			await clearOntologyDerivedCaches();
		},
	},
	hierarchy: {
		scope: [String(HIER_ID)],
		async plant() {
			// The provisioned root term vanishes: the ACTIVE registry row now dangles.
			await sql.unsafe('DELETE FROM matrix_hierarchy WHERE section_tipo = $1', [`${HIER_TLD}1`]);
			await clearOntologyDerivedCaches();
			return 1;
		},
		async unplant() {
			// Re-provision through the single writer; the registry row is the same.
			const ensured = await ensureHierarchy(HIER_ID, USER_ID);
			expect(ensured.state.usable).toBe(true);
		},
	},
};

async function dry(name: string): Promise<ReconcileReport> {
	const planter = PLANTERS[name] as Planter;
	const { report } = await runReconcile(name, {
		apply: false,
		...(planter.scope === undefined ? {} : { scope: planter.scope }),
	});
	return report;
}

/* ------------------------------------------------------------------ gates */

describe('reconcile registry — every definition measures its pair (S-10)', () => {
	test('PLANTERS cover the live registry exactly (a definition without its proof is red)', () => {
		expect(Object.keys(PLANTERS).sort()).toEqual([...REGISTERED_NAMES].sort());
		expect(REGISTERED_NAMES.length).toBeGreaterThanOrEqual(6);
	});

	for (const name of REGISTERED_NAMES) {
		test(`${name}: dry 0 on the clean situation, > 0 once drift is planted, byte-equal twice, gauge agrees`, async () => {
			const planter = PLANTERS[name] as Planter;
			const clean = await dry(name);
			expect(
				clean.drift,
				`${name}: the clean situation drifts: ${JSON.stringify(clean.detail).slice(0, 800)}`,
			).toBe(0);
			expect(clean.applied).toBe(0);

			const expected = await planter.plant();
			try {
				const first = await dry(name);
				expect(first.drift).toBeGreaterThanOrEqual(expected);
				expect(first.applied).toBe(0);
				// A dry run writes nothing: the same disagreement is measured again.
				const second = await dry(name);
				expect(JSON.stringify(second)).toBe(JSON.stringify(first));
				// The ops gauge carries the last verdict.
				const gauge = reconcileGauge() as Record<
					string,
					{ last_drift: number; last_apply: boolean; last_error: string | null }
				>;
				expect(gauge[name]?.last_drift).toBe(first.drift);
				expect(gauge[name]?.last_apply).toBe(false);
				expect(gauge[name]?.last_error).toBeNull();
			} finally {
				await planter.unplant();
			}
			const restored = await dry(name);
			expect(restored.drift).toBe(0);
		}, 120000);
	}

	test('media_index APPLY through the registry heals the planted stray marker, and the gauge records the apply', async () => {
		const planter = PLANTERS.media_index as Planter;
		await planter.plant();
		const { report } = await runReconcile('media_index', { apply: true });
		expect(report.drift).toBe(1);
		expect(report.applied).toBe(1);
		expect(existsSync(join(mediaRoot(), '.publication', 'pub', `${MEDIA_SECTION}_999999`))).toBe(
			false,
		);
		planted.splice(0);
		expect((await dry('media_index')).drift).toBe(0);
		const gauge = reconcileGauge() as Record<string, { last_apply: boolean }>;
		expect(gauge.media_index?.last_apply).toBe(false); // the dry above ran last
	});

	test('the widget door lists every registered reconcile and refuses an unknown name without running anything', async () => {
		const listing = (await reconcileStatusWidget.getValue?.({}, {
			isGlobalAdmin: true,
		} as unknown as Principal)) as {
			data: { reconciles: { name: string; stores: [string, string]; last_run: unknown }[] };
		};
		expect(listing.data.reconciles.map((row) => row.name)).toEqual([...REGISTERED_NAMES]);
		for (const row of listing.data.reconciles) expect(row.stores[0]).not.toBe(row.stores[1]);
		const unknown = await reconcileStatusWidget.apiActions?.run_reconcile?.(
			{ name: 'no_such_reconcile' },
			{ isGlobalAdmin: true } as unknown as Principal,
		);
		expect(unknown?.data).toBe(false);
	});

	test('the widget door is DRY unless apply is the boolean true: a planted drift is reported, not repaired', async () => {
		const planter = PLANTERS.media_index as Planter;
		const stray = join(mediaRoot(), '.publication', 'pub', `${MEDIA_SECTION}_999999`);
		await planter.plant();
		try {
			type Outcome = { data: boolean; msg: string; extend?: { report: ReconcileReport } };
			const run = (options: Record<string, unknown>) =>
				reconcileStatusWidget.apiActions?.run_reconcile?.(options, {
					isGlobalAdmin: true,
				} as unknown as Principal) as Promise<Outcome>;
			// No apply, a string "true", a number: every non-boolean spelling is a dry run.
			for (const options of [
				{ name: 'media_index' },
				{ name: 'media_index', apply: 'true' },
				{ name: 'media_index', apply: 1 },
			]) {
				const dryRun = await run(options);
				expect(dryRun.data).toBe(true);
				expect(dryRun.extend?.report.drift).toBe(1);
				expect(dryRun.extend?.report.applied).toBe(0);
				expect(dryRun.msg).toContain('dry run');
				expect(existsSync(stray)).toBe(true); // the store is untouched
			}
			// The boolean true repairs through the same door.
			const applied = await run({ name: 'media_index', apply: true });
			expect(applied.extend?.report.applied).toBe(1);
			expect(existsSync(stray)).toBe(false);
		} finally {
			await planter.unplant();
		}
		expect((await dry('media_index')).drift).toBe(0);
	});
});
