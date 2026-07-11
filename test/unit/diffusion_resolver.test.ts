/**
 * Resolver gates (DIFFUSION_PLAN D3-P1) against the REAL dev DB
 * (DEDALO_DIFFUSION_DOMAIN=numisdata_mib, element numisdata29 — 37 sections).
 *
 * READ-ONLY suite: it never writes matrix tables; the publication-gate
 * subjects are DISCOVERED by querying live component_publication values.
 *
 * THE GUARANTEES under test:
 * - a real record resolves END TO END: plan compile → selection → chain walk
 *   (portals, add_parents ancestors, custom fns) → transform → lang ladder →
 *   non-empty ProjectedRows carrying exactly the plan's column set;
 * - the publication gate is honored fail-closed: a live dd64/no record yields
 *   status 'unpublish' + an unpublishIds entry and NO rows, while
 *   skipPublicationStateCheck (PHP skip_publication_state_check) publishes it;
 * - the breadth-first frontier respects the levels budget: maxLevels 0 →
 *   primaries only; maxLevels 1 → linked plan-section batches at level 0;
 *   per-run dedup — no (section_tipo, section_id) is ever emitted twice;
 * - determinism: two identical runs produce deep-equal rows/records
 *   (runStartedAt is an option, never Date.now() — resume equivalence);
 * - cursor semantics: primary batches carry their keyset checkpoint, frontier
 *   batches repeat the final primary cursor.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { compileElementPlan } from '../../src/diffusion/plan/compile.ts';
import type { PublicationPlan } from '../../src/diffusion/plan/types.ts';
import { buildVirtualDiffusionTree } from '../../src/diffusion/plan/virtual_tree.ts';
import type { VirtualDiffusionTree } from '../../src/diffusion/plan/virtual_tree.ts';
import { resolvePublication } from '../../src/diffusion/resolve/resolver.ts';
import type { ResolveOptions, ResolvedBatch } from '../../src/diffusion/resolve/resolver.ts';

/** The known-good sql element of the dev domain (diffusion_plan_compile gate). */
const ELEMENT_TIPO = 'numisdata29';
/** Primary section under test: mints — portals, add_parents, custom fns. */
const SECTION_TIPO = 'numisdata6';
/** Deterministic run timestamp (epoch seconds) — REUSED across runs. */
const RUN_STARTED_AT = 1_751_700_000;

let tree: VirtualDiffusionTree;
let plan: PublicationPlan;
let publishableId: number;
let unpublishableId: number;

/** Collect every batch of one resolution run. */
async function runResolution(overrides: Partial<ResolveOptions>): Promise<ResolvedBatch[]> {
	const batches: ResolvedBatch[] = [];
	const generator = resolvePublication(plan, {
		sectionTipo: SECTION_TIPO,
		runStartedAt: RUN_STARTED_AT,
		tree,
		...overrides,
	});
	for await (const batch of generator) batches.push(batch);
	return batches;
}

/** Options that resolve exactly ONE primary record. */
function singleRecordOptions(sectionId: number, maxLevels: number): Partial<ResolveOptions> {
	return {
		sqo: {
			section_tipo: SECTION_TIPO,
			filter_by_locators: [{ section_tipo: SECTION_TIPO, section_id: String(sectionId) }],
		},
		maxLevels,
	};
}

beforeAll(async () => {
	const built = await buildVirtualDiffusionTree();
	if (built === null) {
		throw new Error(
			'no diffusion domain — this gate needs DEDALO_DIFFUSION_DOMAIN=numisdata_mib against the dev DB',
		);
	}
	tree = built;
	plan = await compileElementPlan(ELEMENT_TIPO, { tree });

	// Discover the section's component_publication tipo (read-only), then a
	// publishable (dd64/yes) and an unpublishable record with relation data.
	const pubRows = (await sql`
		WITH RECURSIVE subtree AS (
			SELECT tipo, model FROM dd_ontology WHERE parent = ${SECTION_TIPO}
			UNION ALL
			SELECT child.tipo, child.model
			FROM dd_ontology child
			JOIN subtree ON child.parent = subtree.tipo
			WHERE subtree.model NOT IN ('section') AND subtree.model NOT LIKE 'area%'
		)
		SELECT tipo FROM subtree WHERE model = 'component_publication' ORDER BY tipo LIMIT 1
	`) as { tipo: string }[];
	const publicationTipo = pubRows[0]?.tipo;
	if (publicationTipo === undefined) {
		throw new Error(`section ${SECTION_TIPO} has no component_publication in the dev ontology`);
	}

	const yesRows = (await sql.unsafe(
		`SELECT section_id FROM matrix
		 WHERE section_tipo = $1
		   AND relation->'${publicationTipo}' @> '[{"section_id":"1","section_tipo":"dd64"}]'::jsonb
		 ORDER BY section_id LIMIT 1`,
		[SECTION_TIPO],
	)) as { section_id: number }[];
	const noRows = (await sql.unsafe(
		`SELECT section_id FROM matrix
		 WHERE section_tipo = $1
		   AND NOT COALESCE(relation->'${publicationTipo}' @> '[{"section_id":"1","section_tipo":"dd64"}]'::jsonb, false)
		 ORDER BY section_id LIMIT 1`,
		[SECTION_TIPO],
	)) as { section_id: number }[];
	if (yesRows[0] === undefined || noRows[0] === undefined) {
		throw new Error(`no publishable+unpublishable ${SECTION_TIPO} record pair in the dev DB`);
	}
	publishableId = Number(yesRows[0].section_id);
	unpublishableId = Number(noRows[0].section_id);
});

describe('end-to-end resolution of one real record', () => {
	let batches: ResolvedBatch[];

	beforeAll(async () => {
		batches = await runResolution(singleRecordOptions(publishableId, 1));
	});

	test('the primary batch resolves to non-empty ProjectedRows', () => {
		const [primary] = batches;
		if (primary === undefined) throw new Error('no batch yielded');
		expect(primary.section.sectionTipo).toBe(SECTION_TIPO);
		expect(primary.records).toHaveLength(1);
		expect(primary.records[0]?.status).toBe('publish');
		expect(primary.unpublishIds).toEqual([]);
		// one row per configured lang (dev config: single lang)
		expect(primary.rows.length).toBe(plan.langPolicy.langs.length);
		expect(primary.rows[0]?.lang).toBe(plan.langPolicy.langs[0] as string);
		expect(primary.rows[0]?.sectionId).toBe(publishableId);
	}, 120_000);

	test('rows carry EXACTLY the plan column set, with real values resolved', () => {
		const sectionPlan = plan.sections.find((section) => section.sectionTipo === SECTION_TIPO);
		if (sectionPlan === undefined) throw new Error('no mints SectionPlan');
		const expectedColumns = sectionPlan.fields
			.filter((field) => field.excludeColumn !== true)
			.map((field) => field.columnName)
			.sort();
		const row = batches[0]?.rows[0];
		if (row === undefined) throw new Error('no primary row');
		expect(Object.keys(row.columns).sort()).toEqual(expectedColumns);
		const nonNull = Object.values(row.columns).filter((value) => value !== null);
		expect(nonNull.length).toBeGreaterThanOrEqual(5);
	});

	test('the RecordIR keeps typed per-field values (stage D output)', () => {
		const record = batches[0]?.records[0];
		if (record === undefined) throw new Error('no RecordIR');
		expect(record.sectionTipo).toBe(SECTION_TIPO);
		expect(record.fields.size).toBeGreaterThan(0);
		let resolvedValues = 0;
		for (const field of record.fields.values()) resolvedValues += field.values.length;
		expect(resolvedValues).toBeGreaterThan(0);
	});

	test('field errors are COLLECTED, never silent wrong values', () => {
		// Any remaining unported ddo fn (e.g. get_geolocation_data, the v6
		// non-geojson variant) must surface as a named per-field error, and
		// the affected column stays empty. (get_geojson_data, parse_tag_to_html
		// and get_diffusion_iconography are PORTED — they no longer ledger.)
		// This shape loop is vacuous when the live plan carries no unported fn
		// (batch.errors is empty) — the NON-vacuous fail-loud coverage is the
		// unknown-fn injection test below.
		for (const batch of batches) {
			for (const error of batch.errors) {
				expect(error.fieldId.length).toBeGreaterThan(0);
				expect(error.message).toContain('ledgered');
			}
		}
	});

	test('an UNKNOWN parser fn fails LOUD: named batch error + empty column, never silent green', async () => {
		// The fn-registry contract (dd1190 v7 properties are evolvable): an
		// unknown FUTURE fn lands via the parser registry, and until it does the
		// resolve path must surface a NAMED per-field error while leaving the
		// column empty — never a silently-skipped step with a green run.
		const sectionPlan = plan.sections.find((section) => section.sectionTipo === SECTION_TIPO);
		if (sectionPlan === undefined) throw new Error('no mints SectionPlan');
		const baselineRow = batches[0]?.rows[0];
		if (baselineRow === undefined) throw new Error('no baseline primary row');
		// Victim: a column that RESOLVES a real value for this record (so the
		// transform actually runs) and whose field carries no compile warnings
		// (prepareFields recovers warned fields' steps from the ontology, which
		// would override the injection).
		const victim = sectionPlan.fields.find(
			(field) =>
				field.excludeColumn !== true &&
				baselineRow.columns[field.columnName] != null &&
				!plan.warnings.some((warning) => warning.endsWith(`@${field.id}`)),
		);
		if (victim === undefined) throw new Error('no resolvable warning-free field to inject into');

		const evilPlan = structuredClone(plan);
		const evilField = evilPlan.sections
			.find((section) => section.sectionTipo === SECTION_TIPO)
			?.fields.find((field) => field.id === victim.id);
		if (evilField === undefined) throw new Error('victim field lost in clone');
		evilField.transform = [{ fn: 'parser_future::thing', options: {} }];

		const evilBatches: ResolvedBatch[] = [];
		const generator = resolvePublication(evilPlan, {
			sectionTipo: SECTION_TIPO,
			runStartedAt: RUN_STARTED_AT,
			tree,
			...singleRecordOptions(publishableId, 0),
		});
		for await (const batch of generator) evilBatches.push(batch);

		const [primary] = evilBatches;
		if (primary === undefined) throw new Error('no batch yielded');
		// PINNED contract: the error is COLLECTED on the batch (the run itself
		// does not abort — other columns of the record still publish)…
		const named = primary.errors.filter((error) => error.fieldId === victim.id);
		expect(named.length).toBe(1);
		// …it NAMES the missing fn and the affected column…
		expect(named[0]?.message).toContain('parser_future::thing');
		expect(named[0]?.columnName).toBe(victim.columnName);
		// …and the column lands EMPTY — a value here would be a silent wrong value.
		expect(primary.rows[0]?.columns[victim.columnName] ?? null).toBeNull();
		// The record still resolved (fail-loud is per-field, not run-fatal).
		expect(primary.records[0]?.status).toBe('publish');
	}, 120_000);
});

describe('publication gate (fail-closed, PHP is_publishable semantics)', () => {
	test('a dd64/no record resolves to unpublish with NO rows', async () => {
		const batches = await runResolution(singleRecordOptions(unpublishableId, 0));
		const [primary] = batches;
		if (primary === undefined) throw new Error('no batch yielded');
		expect(primary.records[0]?.status).toBe('unpublish');
		expect(primary.unpublishIds).toEqual([unpublishableId]);
		expect(primary.rows).toEqual([]);
	}, 120_000);

	test('skipPublicationStateCheck bypasses the gate (PHP option twin)', async () => {
		const batches = await runResolution({
			...singleRecordOptions(unpublishableId, 0),
			skipPublicationStateCheck: true,
		});
		const [primary] = batches;
		expect(primary?.records[0]?.status).toBe('publish');
		expect(primary?.unpublishIds).toEqual([]);
		expect(primary?.rows.length).toBeGreaterThan(0);
	}, 120_000);
});

describe('frontier: levels budget + per-run dedup', () => {
	test('maxLevels 0 → primaries only; maxLevels 1 → linked plan sections', async () => {
		const level0 = await runResolution(singleRecordOptions(publishableId, 0));
		expect(level0).toHaveLength(1);
		expect(level0[0]?.section.sectionTipo).toBe(SECTION_TIPO);

		const level1 = await runResolution(singleRecordOptions(publishableId, 1));
		const linkedSections = new Set(level1.slice(1).map((batch) => batch.section.sectionTipo));
		expect(linkedSections.size).toBeGreaterThan(0);
		for (const batch of level1.slice(1)) {
			// every frontier batch belongs to a plan section, one level down
			expect(plan.sections.some((s) => s.sectionTipo === batch.section.sectionTipo)).toBe(true);
			expect(batch.level).toBe(0);
		}
	}, 240_000);

	test('no (section_tipo, section_id) is emitted twice in one run', async () => {
		const batches = await runResolution(singleRecordOptions(publishableId, 1));
		const seen = new Set<string>();
		for (const batch of batches) {
			for (const record of batch.records) {
				const key = `${record.sectionTipo}:${record.sectionId}`;
				expect(seen.has(key)).toBe(false);
				seen.add(key);
			}
		}
		expect(seen.size).toBeGreaterThan(1);
	}, 240_000);

	test('cursor semantics: primary checkpoint, repeated by frontier batches', async () => {
		const batches = await runResolution(singleRecordOptions(publishableId, 1));
		expect(batches[0]?.cursor).toBe(publishableId);
		for (const batch of batches.slice(1)) {
			expect(batch.cursor).toBe(publishableId);
		}
	}, 240_000);
});

describe('determinism (parity + resume both depend on it)', () => {
	test('two identical runs produce deep-equal outputs', async () => {
		const serialize = (batches: ResolvedBatch[]): unknown =>
			JSON.parse(
				JSON.stringify(
					batches.map((batch) => ({
						section: batch.section.sectionTipo,
						level: batch.level,
						cursor: batch.cursor,
						rows: batch.rows,
						unpublishIds: batch.unpublishIds,
						records: batch.records.map((record) => ({
							sectionTipo: record.sectionTipo,
							sectionId: record.sectionId,
							status: record.status,
							fields: [...record.fields.entries()],
						})),
						errors: batch.errors,
					})),
				),
			);

		const first = serialize(await runResolution(singleRecordOptions(publishableId, 1)));
		const second = serialize(await runResolution(singleRecordOptions(publishableId, 1)));
		expect(second).toEqual(first);
	}, 480_000);
});
