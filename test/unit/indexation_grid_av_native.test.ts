/**
 * Indexation-grid MEDIA + AV-format branches — TS-NATIVE half (DEC-14b), the
 * survival twin of test/parity/indexation_grid_media_av_differential.test.ts
 * (which needs the live PHP oracle and dies without it).
 *
 * The differential's MEDIA branch rode a LIVE numisdata5 corpus (mutable
 * production records — off-limits for a native golden), so here BOTH branches
 * are fully scratch-seeded (create → assert → revert, the differential's own
 * delete_children_guard pattern) and the whole grid projection is DEEP-EQUAL
 * against GOLDENS captured from the LIVE PHP ORACLE on these exact seeds
 * (2026-07-11 — the capture run also verified TS === PHP byte-for-byte on
 * both grids and [] after revert on both engines). Goldens live in
 * fixtures/indexation_grid_native/; NEVER regenerate them from TS output —
 * recapture from the PHP oracle with the same seeds.
 *
 * 1. AV branch (textAreaIndexationCell 'av' + the component_av posterframe
 *    cell): the differential's exact scratch chain — a fresh rsc167 record
 *    (tagged rsc36 transcription with TC marks + rsc35 av media files_info
 *    shape) topped by a fresh oh1 record whose oh25 portal points at it,
 *    dd96-tagged to term cu1_3 (existing term, zero live indexations).
 *    Exercises the 11-column AV layout, the TC math (in 5s / out 12.5s /
 *    duration 7.5s) and the posterframe URL.
 * 2. MEDIA branch (resolveAtoms media branch → mediaCellUrl, rsc29 thumbs):
 *    a scratch numisdata5 holder dd96-tagged to the same term (live-corpus
 *    relation shape: numisdata260) whose numisdata1100 image portal points at
 *    a scratch rsc170 record WITH stored rsc29 media — the grid renders the
 *    real thumb URL (/dedalo/media/image/thumb/<bucket>/rsc29_rsc170_<id>.jpg).
 * 3. Revert half: after sweeping the seeds the term's grid is [] again for
 *    both target sections.
 *
 * Scratch ids: rsc167/oh1/numisdata5 at 90002 and rsc170 at 90000002 — above
 * the live matrix_counter values (rsc167=474, oh1=359, numisdata5=624,
 * rsc170=440863, measured 2026-07-11) and clear of the parity gate's 90001.
 * Swept in afterAll; belt-and-braces pre-clean in beforeAll for crashed runs.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import avGolden from './fixtures/indexation_grid_native/av_grid.golden.json';
import mediaGolden from './fixtures/indexation_grid_native/media_grid.golden.json';

const SCRATCH_ID = 90002; // rsc167 + oh1 + numisdata5 twins
const SCRATCH_RSC170_ID = 90000002; // rsc170 lives among ~440k live rows
const SCRATCH_TERM = { section_tipo: 'cu1', section_id: '3' };

function adminContext(): ApiRequestContext {
	return {
		requestId: 'indexation_grid_av_native_test',
		clientIp: '127.0.0.1',
		session: {
			userId: -1,
			username: 'root',
			isGlobalAdmin: true,
			csrfToken: 'tok',
			applicationLang: null,
			dataLang: null,
		},
		csrfCandidate: 'tok',
		principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true },
	};
}

/** The exact rqo the client builds (ts_object.js show_indexations). */
function gridRqo(target: string[]): Record<string, unknown> {
	return {
		action: 'get_indexation_grid',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			section_tipo: SCRATCH_TERM.section_tipo,
			section_id: SCRATCH_TERM.section_id,
			tipo: 'hierarchy40',
			value: null,
		},
		sqo: {
			mode: 'related',
			section_tipo: target,
			total: null,
			limit: 200,
			offset: 0,
			filter_by_locators: [
				{
					section_tipo: SCRATCH_TERM.section_tipo,
					section_id: SCRATCH_TERM.section_id,
					tipo: 'hierarchy40',
				},
			],
		},
	};
}

async function tsGrid(rqo: Record<string, unknown>): Promise<{
	status: number;
	result: unknown;
}> {
	const outcome = await runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, () =>
		dispatchRqo(structuredClone(rqo) as unknown as Rqo, adminContext()),
	);
	return { status: outcome.status, result: (outcome.body as { result?: unknown }).result };
}

/** Remove every scratch row (idempotent — also pre-cleans crashed runs). */
async function sweepScratch(): Promise<void> {
	for (const [sectionTipo, sectionId] of [
		['rsc167', SCRATCH_ID],
		['oh1', SCRATCH_ID],
		['numisdata5', SCRATCH_ID],
		['rsc170', SCRATCH_RSC170_ID],
	] as [string, number][]) {
		await sql`DELETE FROM matrix WHERE section_tipo = ${sectionTipo} AND section_id = ${sectionId}`;
		await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${sectionTipo} AND section_id = ${sectionId}`;
	}
}

/**
 * AV chain — byte-identical to the differential's seedScratchChain (only the
 * scratch id differs): rsc167 twin (tagged rsc36 lg-spa transcription with TC
 * marks; rsc35 av media files_info shape — get_url never stats the disk;
 * dd96 tag → cu1_3 topped by the oh1 twin) + oh1 twin (oh25 portal → the
 * rsc167 twin, oh14 code for the head row).
 */
async function seedAvChain(): Promise<void> {
	const rsc36Value =
		'<p>[TC_00:00:05.000_TC]Antes del fragmento [index-n-77-fragmento av-data::data]texto ' +
		'[TC_00:00:08.120_TC]etiquetado &amp; validado del fragmento AV[/index-n-77-fragmento av-data::data]' +
		' despu&eacute;s[TC_00:00:12.500_TC] cola</p>';
	const rsc167String = { rsc36: [{ id: 1, lang: 'lg-spa', value: rsc36Value }] };
	const rsc167Media = {
		rsc35: [
			{
				id: 1,
				lib_data: null,
				files_info: [
					{
						quality: 'original',
						extension: 'mp4',
						file_name: `rsc35_rsc167_${SCRATCH_ID}.mp4`,
						file_path: `/av/original/rsc35_rsc167_${SCRATCH_ID}.mp4`,
						file_size: 1,
						file_exist: true,
					},
				],
			},
		],
	};
	const rsc167Relation = {
		rsc860: [
			{
				id: 1,
				type: 'dd96',
				tag_id: '77',
				section_id: SCRATCH_TERM.section_id,
				section_tipo: SCRATCH_TERM.section_tipo,
				section_top_id: String(SCRATCH_ID),
				section_top_tipo: 'oh1',
				tag_component_tipo: 'rsc36',
				from_component_tipo: 'rsc860',
			},
		],
	};
	const oh1String = { oh14: [{ id: 1, lang: 'lg-nolan', value: 'SCRATCH-AV-TWIN' }] };
	const oh1Relation = {
		oh25: [
			{
				id: 1,
				type: 'dd151',
				section_id: String(SCRATCH_ID),
				section_tipo: 'rsc167',
				from_component_tipo: 'oh25',
			},
		],
	};
	await sql`
		INSERT INTO matrix (section_id, section_tipo, string, media, relation)
		VALUES (${SCRATCH_ID}, 'rsc167',
			${JSON.stringify(rsc167String)}::text::jsonb,
			${JSON.stringify(rsc167Media)}::text::jsonb,
			${JSON.stringify(rsc167Relation)}::text::jsonb)`;
	await sql`
		INSERT INTO matrix (section_id, section_tipo, string, relation)
		VALUES (${SCRATCH_ID}, 'oh1',
			${JSON.stringify(oh1String)}::text::jsonb,
			${JSON.stringify(oh1Relation)}::text::jsonb)`;
}

/**
 * MEDIA chain: numisdata5 holder (dd96 tag → cu1_3 through numisdata260 —
 * the live-corpus relation shape; numisdata1100 image portal → the rsc170
 * twin) + rsc170 twin WITH stored rsc29 media (the media branch renders the
 * thumb URL whenever the media key is stored; no disk stat).
 */
async function seedMediaChain(): Promise<void> {
	const n5String = { numisdata203: [{ id: 1, lang: 'lg-nolan', value: 'SCRATCH-MEDIA-TWIN' }] };
	const n5Relation = {
		numisdata260: [
			{
				id: 1,
				type: 'dd96',
				section_id: SCRATCH_TERM.section_id,
				section_tipo: SCRATCH_TERM.section_tipo,
				from_component_tipo: 'numisdata260',
			},
		],
		numisdata1100: [
			{
				id: 1,
				type: 'dd151',
				section_id: String(SCRATCH_RSC170_ID),
				section_tipo: 'rsc170',
				from_component_tipo: 'numisdata1100',
			},
		],
	};
	const r170Media = {
		rsc29: [
			{
				id: 1,
				files_info: [
					{
						quality: 'thumb',
						extension: 'jpg',
						file_name: `rsc29_rsc170_${SCRATCH_RSC170_ID}.jpg`,
						file_path: `/image/thumb/90000000/rsc29_rsc170_${SCRATCH_RSC170_ID}.jpg`,
						file_size: 1,
						file_exist: true,
					},
				],
			},
		],
	};
	await sql`
		INSERT INTO matrix (section_id, section_tipo, string, relation)
		VALUES (${SCRATCH_ID}, 'numisdata5',
			${JSON.stringify(n5String)}::text::jsonb,
			${JSON.stringify(n5Relation)}::text::jsonb)`;
	await sql`
		INSERT INTO matrix (section_id, section_tipo, media)
		VALUES (${SCRATCH_RSC170_ID}, 'rsc170', ${JSON.stringify(r170Media)}::text::jsonb)`;
}

beforeAll(async () => {
	await sweepScratch(); // pre-clean a crashed prior run
	await seedAvChain();
	await seedMediaChain();
}, 60000);

afterAll(async () => {
	await sweepScratch();
});

describe('indexation grid av + media branches (TS-native, oracle-captured goldens)', () => {
	test('av-format: seeded oh1/rsc167 chain renders the 11-column layout DEEP-EQUAL to the golden', async () => {
		const { status, result } = await tsGrid(gridRqo(['rsc167']));
		expect(status).toBe(200);

		// Fixture integrity floors — every piece the ledger row named must be IN
		// the golden (guards against a truncated/regenerated fixture; the
		// engine assertion is the deep-equal below).
		const goldenJson = JSON.stringify(avGolden);
		for (const marker of [
			'button_av_player',
			'button_transcription',
			'button_download_av',
			'duration_tc',
			'"tc_in"',
			'"tc_out"',
			// TC math from the seeded marks (in 5s / out 12.5s / 7.5s)
			'00:00:05.000',
			'00:00:12.500',
			'00:00:07.500',
			'"tc_in_secs":5',
			'"tc_out_secs":12.5',
			// fragment text: marks stripped, entities decoded
			'texto etiquetado & validado del fragmento AV',
			// real tool contexts (not {})
			'"model":"tool_indexation"',
			'"model":"tool_transcription"',
			// the component_av posterframe media cell (head row)
			`/dedalo/media/av/posterframe/rsc35_rsc167_${SCRATCH_ID}.jpg`,
		]) {
			expect(goldenJson).toContain(marker);
		}

		// full projection equality (the whole grid IS the projection)
		expect(result).toEqual(avGolden as never);
	});

	test('media: seeded numisdata5/rsc170 chain renders the rsc29 thumb URL DEEP-EQUAL to the golden', async () => {
		const { status, result } = await tsGrid(gridRqo(['numisdata5']));
		expect(status).toBe(200);

		// Fixture integrity floors — the media branch's whole point is the
		// rendered thumb URL (the ledger gap was exactly this cell).
		const goldenJson = JSON.stringify(mediaGolden);
		expect(goldenJson).toContain('/dedalo/media/image/thumb/');
		expect(goldenJson).toContain(`rsc29_rsc170_${SCRATCH_RSC170_ID}.jpg`);

		expect(result).toEqual(mediaGolden as never);
	});

	test('after revert the term grid is empty again for both target sections', async () => {
		await sweepScratch();
		expect((await tsGrid(gridRqo(['rsc167']))).result).toEqual([]);
		expect((await tsGrid(gridRqo(['numisdata5']))).result).toEqual([]);
	});
});
