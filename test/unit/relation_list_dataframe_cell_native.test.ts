/**
 * `resolveDataframeFlatValue` (src/core/resolve/relation_list.ts:244) — the
 * paired-FRAME half of the relation_list / export cell, plus its wiring
 * through `resolveRelationTargetValues`'s isDataframe branch.
 *
 * THE FIXTURE IS THE ITEM. Frames pair on the OWNER record's relation[frameTipo]
 * slot through `dataframeEntryMatches`, which compares FOUR things:
 *   1. `type === 'dd490'`            (the positive frame marker),
 *   2. `from_component_tipo === frameTipo`,
 *   3. `main_component_tipo === <the main component>`,
 *   4. INT(`id_key`) === INT(the main locator's stored `id`).
 * A frame missing `from_component_tipo` pairs with NOTHING — so a suite built
 * on such frames would see `null` everywhere and every negative case would
 * "pass" against a completely broken predicate. This file therefore proves the
 * POSITIVE pairing in `beforeAll` (BASELINE, asserted non-empty, the suite
 * refuses to run without it) and every negative is a single-field DELTA from
 * that proven baseline.
 *
 * Scratch surfaces (this item's namespace):
 *   - dd_ontology node `zzr925` — a component_portal whose config declares TWO
 *     children, a plain literal (test52) and a DATAFRAME (dd560). No shipped
 *     test3 portal declares a dataframe child, and mutating one would be a
 *     shared-fixture edit; this gate mints its own orphan node (parent
 *     `zzr925x`, which does not exist, so no section walk can reach it) and
 *     DELETES it in afterAll, clearing the ontology-derived caches on both
 *     edges — dd_ontology writes are not healed by the preload.
 *   - matrix_test test3 / 925101-925107, created and deleted here.
 * Also covered: the `iri` family's OWN dd560 frame branch in resolveCellValue,
 * which is a SEPARATE code path (it pairs on main_component_tipo + id_key only,
 * bypassing dataframeEntryMatches) — the divergence is pinned in place.
 * dd560 / dd1715 / dd490 are shipped ONTOLOGY (no mutation): dd560 is the
 * label dataframe whose one config child is the dd1715 input_text.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	componentFieldsSeparator,
	resolveCellValue,
	resolveDataframeFlatValue,
	resolveRelationTargetValues,
} from '../../src/core/resolve/relation_list.ts';

const SECTION = 'test3';
/** The scratch portal: main component of every pairing in this file. */
const PORTAL = 'zzr925';
/** The shipped label dataframe (config child: dd1715). */
const FRAME = 'dd560';
/** A shipped dataframe with NO config children at all. */
const CHILDLESS_FRAME = 'test60';
/** The main locator's stored `id` — the value `id_key` must equal. */
const PAIR_ID = 7;

const IDS = {
	/** relation: PORTAL → [portalTarget] and a dd560 frame with id_key 7. */
	owner: 925101,
	/** the portal target: string.test52 = 'Target Alpha'. */
	portalTarget: 925102,
	/** frame target: string.dd1715 = 'Frame Note'. */
	frameTarget: 925103,
	/** second frame target: string.dd1715 = 'Frame Two'. */
	frameTarget2: 925104,
	/** a record with NO dd1715 data (the "frame resolves to nothing" fixture). */
	emptyTarget: 925105,
	/** same as owner but the frame's id_key does NOT match (the delta owner). */
	ownerUnpaired: 925106,
	/** iri.test140 + a dd560 label frame — the resolveCellValue 'iri' family. */
	iriOwner: 925107,
};
const SCRATCH_IDS = Object.values(IDS);

/** The proven-good frame, parameterised only by id_key and target. */
function frame(idKey: number | string, targetId: number): Record<string, unknown> {
	return {
		id: 1,
		type: 'dd490',
		id_key: idKey,
		section_id: String(targetId),
		section_tipo: SECTION,
		from_component_tipo: FRAME,
		main_component_tipo: PORTAL,
	};
}
/** An in-memory owner record carrying exactly these frames in the dd560 slot. */
function ownerRecord(frames: unknown[], slot: string = FRAME): { columns: { relation: unknown } } {
	return { columns: { relation: { [slot]: frames } } };
}
type FrameRecordArg = Parameters<typeof resolveDataframeFlatValue>[0];

let ontologyCreated = false;

async function sweepRecords(): Promise<number> {
	let deleted = 0;
	for (const id of SCRATCH_IDS) {
		const rows = (await sql.unsafe(
			'DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2 RETURNING section_id',
			[SECTION, id],
		)) as unknown[];
		deleted += rows.length;
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
	}
	return deleted;
}

beforeAll(async () => {
	await sweepRecords(); // pre-clean a crashed prior run

	// PRECONDITIONS: never write over anything this gate did not create.
	for (const id of SCRATCH_IDS) {
		const rows = (await sql.unsafe(
			'SELECT section_id FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		)) as unknown[];
		if (rows.length > 0) {
			throw new Error(
				`dataframe cell gate: ${SECTION}/${id} is occupied after the sweep — refusing to write over a record this gate did not create.`,
			);
		}
	}
	const existing = (await sql.unsafe('SELECT tipo FROM dd_ontology WHERE tipo = $1', [
		PORTAL,
	])) as unknown[];
	if (existing.length > 0) {
		throw new Error(
			`dataframe cell gate: ontology tipo '${PORTAL}' already exists — this gate creates and then DELETES it, so it will not touch a node it did not make.`,
		);
	}

	// The scratch portal. fields_separator is deliberately ' ~ ' (not the ', '
	// default) so the join can be attributed to THIS component's config.
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, term, tld, is_model, is_translatable, is_main, order_number, properties)
		 VALUES ($1, 'zzr925x', 'component_portal', '{"lg-spa":"scratch portal (relation_list dataframe gate)"}'::jsonb, 'zzr', false, false, false, 99, $2::text::jsonb)`,
		[
			PORTAL,
			JSON.stringify({
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] },
							show: {
								fields_separator: ' ~ ',
								ddo_map: [
									{ tipo: 'test52', parent: 'self', section_tipo: 'self' },
									{ tipo: FRAME, parent: 'self', section_tipo: SECTION },
								],
							},
						},
					],
				},
			}),
		],
	);
	ontologyCreated = true;
	// dd_ontology mutated ⇒ every ontology-derived cache is stale.
	await clearOntologyDerivedCaches();

	const seedString = async (id: number, tipo: string, value: string): Promise<void> => {
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, string)
			 VALUES ($1, $2, jsonb_build_object($3::text, $4::text::jsonb))`,
			[id, SECTION, tipo, JSON.stringify([{ id: 1, lang: 'lg-eng', value }])],
		);
	};
	await seedString(IDS.portalTarget, 'test52', 'Target Alpha');
	await seedString(IDS.frameTarget, 'dd1715', 'Frame Note');
	await seedString(IDS.frameTarget2, 'dd1715', 'Frame Two');
	await sql.unsafe(`INSERT INTO matrix_test (section_id, section_tipo) VALUES ($1, $2)`, [
		IDS.emptyTarget,
		SECTION,
	]);

	const portalLocator = {
		id: PAIR_ID,
		type: 'dd151',
		section_id: String(IDS.portalTarget),
		section_tipo: SECTION,
		from_component_tipo: PORTAL,
	};
	const seedOwner = async (id: number, frames: unknown[]): Promise<void> => {
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, relation)
			 VALUES ($1, $2, jsonb_build_object($3::text, $4::text::jsonb, $5::text, $6::text::jsonb))`,
			[id, SECTION, PORTAL, JSON.stringify([portalLocator]), FRAME, JSON.stringify(frames)],
		);
	};
	await seedOwner(IDS.owner, [frame(PAIR_ID, IDS.frameTarget)]);
	// The DELTA owner: byte-identical except the frame's id_key.
	await seedOwner(IDS.ownerUnpaired, [frame(PAIR_ID + 1, IDS.frameTarget)]);

	// The iri family's OWN frame branch (a SEPARATE code path from
	// resolveDataframeFlatValue): an iri item plus a dd560 frame keyed to it.
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, iri, relation)
		 VALUES ($1, $2, jsonb_build_object('test140', $3::text::jsonb), jsonb_build_object($4::text, $5::text::jsonb))`,
		[
			IDS.iriOwner,
			SECTION,
			JSON.stringify([
				{ id: 1, lang: 'lg-nolan', iri: 'http://elraspa.com', title: 'Title or IRI' },
			]),
			FRAME,
			JSON.stringify([
				// ORDER IS LOAD-BEARING: the foreign-main frame is stored FIRST and
				// carries the SAME id_key as the good one, so a `find` that pairs on
				// id_key alone (i.e. one that drops the main_component_tipo conjunct)
				// returns THIS entry and renders 'Frame Two'. Seeding the correct
				// frame first would make the negative assertion vacuous.
				{ ...frame(1, IDS.frameTarget2), main_component_tipo: 'zzr_other_main' },
				{ ...frame(1, IDS.frameTarget), main_component_tipo: 'test140' },
			]),
		],
	);

	// BASELINE — the suite refuses to run on an unproven pairing.
	const baseline = await resolveDataframeFlatValue(
		ownerRecord([frame(PAIR_ID, IDS.frameTarget)]) as FrameRecordArg,
		FRAME,
		PORTAL,
		PAIR_ID,
		'lg-eng',
		[],
	);
	if (baseline === null || baseline === '') {
		throw new Error(
			`dataframe cell gate: the POSITIVE pairing produced ${JSON.stringify(baseline)} — the fixture does not pair (check type dd490 / from_component_tipo / main_component_tipo / id_key). Every negative case below would be vacuous, so the suite refuses to run.`,
		);
	}
}, 60000);

afterAll(async () => {
	const deleted = await sweepRecords();
	let ontologyDeleted = 0;
	if (ontologyCreated) {
		ontologyDeleted = (
			(await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1 RETURNING tipo', [
				PORTAL,
			])) as unknown[]
		).length;
		ontologyCreated = false;
	}
	// The ontology row is gone ⇒ drop every cache that may still hold it.
	await clearOntologyDerivedCaches();
	if (deleted !== SCRATCH_IDS.length) {
		throw new Error(
			`dataframe cell gate cleanup deleted ${deleted} of ${SCRATCH_IDS.length} scratch rows in matrix_test — a seeded row vanished mid-run or was never created.`,
		);
	}
	if (ontologyDeleted !== 1) {
		throw new Error(
			`dataframe cell gate cleanup deleted ${ontologyDeleted} dd_ontology rows for '${PORTAL}' — the scratch ontology node must not survive the run.`,
		);
	}
});

describe('resolveDataframeFlatValue — the proven pairing', () => {
	test('BASELINE: a fully-formed frame resolves its child value at the FRAME target', async () => {
		const unresolved: string[] = [];
		const value = await resolveDataframeFlatValue(
			ownerRecord([frame(PAIR_ID, IDS.frameTarget)]) as FrameRecordArg,
			FRAME,
			PORTAL,
			PAIR_ID,
			'lg-eng',
			unresolved,
		);
		// dd560's one config child is dd1715, resolved at test3/frameTarget.
		expect(value).toBe('Frame Note');
		expect(unresolved).toEqual([]);
	});

	test('id_key compares as an INT: a numeric-STRING pairId still pairs', async () => {
		const value = await resolveDataframeFlatValue(
			ownerRecord([frame(PAIR_ID, IDS.frameTarget)]) as FrameRecordArg,
			FRAME,
			PORTAL,
			String(PAIR_ID),
			'lg-eng',
			[],
		);
		expect(value).toBe('Frame Note');
		// …and symmetrically, a stored string id_key against a numeric pairId.
		expect(
			await resolveDataframeFlatValue(
				ownerRecord([frame(String(PAIR_ID), IDS.frameTarget)]) as FrameRecordArg,
				FRAME,
				PORTAL,
				PAIR_ID,
				'lg-eng',
				[],
			),
		).toBe('Frame Note');
	});

	test('TWO frames on the same id_key join in STORED order with the FRAME separator', async () => {
		const separator = await componentFieldsSeparator(FRAME);
		expect(separator).toBe(', '); // dd560 declares none ⇒ the PHP default
		const value = await resolveDataframeFlatValue(
			ownerRecord([
				frame(PAIR_ID, IDS.frameTarget2),
				frame(PAIR_ID, IDS.frameTarget),
			]) as FrameRecordArg,
			FRAME,
			PORTAL,
			PAIR_ID,
			'lg-eng',
			[],
		);
		expect(value).toBe(`Frame Two${separator}Frame Note`);
	});
});

describe('resolveDataframeFlatValue — one-field deltas from the baseline', () => {
	/** Each case mutates exactly ONE field of the proven-good frame. */
	const deltas: [string, Record<string, unknown>][] = [
		['id_key does not match the main locator id', { id_key: PAIR_ID + 1 }],
		["type is not the dd490 frame marker (isDataframeEntry's single source)", { type: 'dd151' }],
		['from_component_tipo names another slot', { from_component_tipo: 'zzr_other_frame' }],
		['main_component_tipo names another main component', { main_component_tipo: 'zzr_other_main' }],
		['id_key is absent', { id_key: undefined }],
		['id_key is null', { id_key: null }],
	];
	for (const [label, patch] of deltas) {
		test(`no pairing when ${label}`, async () => {
			const value = await resolveDataframeFlatValue(
				ownerRecord([{ ...frame(PAIR_ID, IDS.frameTarget), ...patch }]) as FrameRecordArg,
				FRAME,
				PORTAL,
				PAIR_ID,
				'lg-eng',
				[],
			);
			expect(value).toBeNull();
		});
	}

	test('a null/undefined pairId short-circuits before the slot is even read', async () => {
		for (const pairId of [undefined, null as unknown as undefined]) {
			expect(
				await resolveDataframeFlatValue(
					ownerRecord([frame(PAIR_ID, IDS.frameTarget)]) as FrameRecordArg,
					FRAME,
					PORTAL,
					pairId,
					'lg-eng',
					[],
				),
			).toBeNull();
		}
	});

	test('an empty slot, a missing slot and a null relation column all yield null', async () => {
		for (const record of [
			ownerRecord([]),
			ownerRecord([frame(PAIR_ID, IDS.frameTarget)], 'zzr_some_other_slot'),
			{ columns: { relation: null } },
		]) {
			expect(
				await resolveDataframeFlatValue(
					record as FrameRecordArg,
					FRAME,
					PORTAL,
					PAIR_ID,
					'lg-eng',
					[],
				),
			).toBeNull();
		}
	});

	test('a PAIRED frame whose target holds no child value contributes nothing', async () => {
		// The pairing succeeds; the frame target simply has no dd1715 data.
		const value = await resolveDataframeFlatValue(
			ownerRecord([frame(PAIR_ID, IDS.emptyTarget)]) as FrameRecordArg,
			FRAME,
			PORTAL,
			PAIR_ID,
			'lg-eng',
			[],
		);
		expect(value).toBeNull();
	});

	test('a PAIRED frame with no section_tipo is skipped, and a sibling still resolves', async () => {
		const broken = { ...frame(PAIR_ID, IDS.frameTarget), section_tipo: undefined };
		expect(
			await resolveDataframeFlatValue(
				ownerRecord([broken]) as FrameRecordArg,
				FRAME,
				PORTAL,
				PAIR_ID,
				'lg-eng',
				[],
			),
		).toBeNull();
		// Paired with a good sibling: only the good one contributes — proving
		// the skip is a `continue`, not an abort.
		expect(
			await resolveDataframeFlatValue(
				ownerRecord([broken, frame(PAIR_ID, IDS.frameTarget)]) as FrameRecordArg,
				FRAME,
				PORTAL,
				PAIR_ID,
				'lg-eng',
				[],
			),
		).toBe('Frame Note');
	});

	test('a frame component with NO config children yields null even when it pairs', async () => {
		// test60 is a shipped component_dataframe with neither a ddo_map nor
		// component implicit relations — nothing to flatten.
		const paired = {
			...frame(PAIR_ID, IDS.frameTarget),
			from_component_tipo: CHILDLESS_FRAME,
		};
		const value = await resolveDataframeFlatValue(
			ownerRecord([paired], CHILDLESS_FRAME) as FrameRecordArg,
			CHILDLESS_FRAME,
			PORTAL,
			PAIR_ID,
			'lg-eng',
			[],
		);
		expect(value).toBeNull();
	});
});

describe("the iri family's own dd560 frame branch (a separate code path)", () => {
	test('the label frame is appended to the iri, joined with ", "', async () => {
		const unresolved: string[] = [];
		const value = await resolveCellValue(SECTION, IDS.iriOwner, 'test140', 'lg-nolan', unresolved);
		// The dd1715 label of the frame TARGET — never the stored `title`, and
		// never the foreign-main frame's label.
		expect(value).toBe('http://elraspa.com, Frame Note');
		expect(value).not.toContain('Title or IRI');
		expect(value).not.toContain('Frame Two');
		expect(unresolved).toEqual([]);
	});

	test('the iri frame pairs on main_component_tipo + id_key ONLY', async () => {
		// DIVERGENCE, pinned deliberately: unlike resolveDataframeFlatValue this
		// branch does NOT go through dataframeEntryMatches — it neither requires
		// `type === dd490` nor checks `from_component_tipo`. A frame stripped of
		// both still resolves here. If the branch is ever routed through the
		// shared predicate, this assertion must flip to `'http://elraspa.com'`.
		await sql.unsafe(
			`UPDATE matrix_test SET relation = jsonb_set(relation, '{${FRAME}}', $2::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = $3`,
			[
				SECTION,
				JSON.stringify([
					{
						id: 1,
						id_key: 1,
						section_id: String(IDS.frameTarget),
						section_tipo: SECTION,
						main_component_tipo: 'test140',
					},
				]),
				IDS.iriOwner,
			],
		);
		expect(await resolveCellValue(SECTION, IDS.iriOwner, 'test140', 'lg-nolan', [])).toBe(
			'http://elraspa.com, Frame Note',
		);

		// …and the id_key IS load-bearing: point it elsewhere and the label goes.
		await sql.unsafe(
			`UPDATE matrix_test SET relation = jsonb_set(relation, '{${FRAME}}', $2::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = $3`,
			[
				SECTION,
				JSON.stringify([{ ...frame(99, IDS.frameTarget), main_component_tipo: 'test140' }]),
				IDS.iriOwner,
			],
		);
		expect(await resolveCellValue(SECTION, IDS.iriOwner, 'test140', 'lg-nolan', [])).toBe(
			'http://elraspa.com',
		);
	});

	test('main_component_tipo is load-bearing: a foreign-main frame on the SAME id_key contributes nothing', async () => {
		// The ONLY frame in the bag matches the iri item's id but belongs to
		// another main component. Pairing on id_key alone would append its label.
		await sql.unsafe(
			`UPDATE matrix_test SET relation = jsonb_set(relation, '{${FRAME}}', $2::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = $3`,
			[
				SECTION,
				JSON.stringify([{ ...frame(1, IDS.frameTarget2), main_component_tipo: 'zzr_other_main' }]),
				IDS.iriOwner,
			],
		);
		const value = await resolveCellValue(SECTION, IDS.iriOwner, 'test140', 'lg-nolan', []);
		expect(value).toBe('http://elraspa.com');
		expect(value).not.toContain('Frame Two');
	});
});

describe('the isDataframe branch of resolveRelationTargetValues', () => {
	test('the frame part follows the target’s own fields, joined by the MAIN separator', async () => {
		const unresolved: string[] = [];
		const targets = await resolveRelationTargetValues(
			SECTION,
			IDS.owner,
			PORTAL,
			'lg-eng',
			unresolved,
		);
		// ONE target, whose flat part is the literal child + the frame value in
		// ddo order, joined by the PORTAL's declared fields_separator.
		expect(await componentFieldsSeparator(PORTAL)).toBe(' ~ ');
		expect(targets).toEqual([
			{
				index: 0,
				sectionTipo: SECTION,
				sectionId: String(IDS.portalTarget),
				parts: ['Target Alpha ~ Frame Note'],
			},
		]);
		expect(unresolved).toEqual([]);
		// …and the whole cell, through resolveCellValue's datalist family.
		expect(await resolveCellValue(SECTION, IDS.owner, PORTAL, 'lg-eng', unresolved)).toBe(
			'Target Alpha ~ Frame Note',
		);
	});

	test('an UNPAIRED frame leaves the target value alone — no trailing separator', async () => {
		// The delta owner is byte-identical except the frame's id_key, so the
		// difference below is attributable to the pairing and nothing else.
		const unresolved: string[] = [];
		const value = await resolveCellValue(SECTION, IDS.ownerUnpaired, PORTAL, 'lg-eng', unresolved);
		expect(value).toBe('Target Alpha');
		expect(value).not.toContain('~');
		expect(unresolved).toEqual([]);
	});

	test('the frame pairs against the LOCATOR id, not the array position', async () => {
		// Rewrite the portal slot so the single locator sits at position 0 with
		// a stored id that is NOT its index and NOT the frame's id_key.
		await sql.unsafe(
			`UPDATE matrix_test SET relation = jsonb_set(relation, '{${PORTAL}}', $2::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = $3`,
			[
				SECTION,
				JSON.stringify([
					{
						id: PAIR_ID + 100,
						type: 'dd151',
						section_id: String(IDS.portalTarget),
						section_tipo: SECTION,
						from_component_tipo: PORTAL,
					},
				]),
				IDS.owner,
			],
		);
		try {
			const value = await resolveCellValue(SECTION, IDS.owner, PORTAL, 'lg-eng', []);
			expect(value).toBe('Target Alpha');
		} finally {
			await sql.unsafe(
				`UPDATE matrix_test SET relation = jsonb_set(relation, '{${PORTAL}}', $2::text::jsonb)
				 WHERE section_tipo = $1 AND section_id = $3`,
				[
					SECTION,
					JSON.stringify([
						{
							id: PAIR_ID,
							type: 'dd151',
							section_id: String(IDS.portalTarget),
							section_tipo: SECTION,
							from_component_tipo: PORTAL,
						},
					]),
					IDS.owner,
				],
			);
		}
		// The restore must bring the pairing back — proof the fixture is intact
		// for anything that runs after this case.
		expect(await resolveCellValue(SECTION, IDS.owner, PORTAL, 'lg-eng', [])).toBe(
			'Target Alpha ~ Frame Note',
		);
	});
});
