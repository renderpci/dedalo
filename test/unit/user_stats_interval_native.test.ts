/**
 * getIntervalRawActivityData — the user-activity widget's TIER-2 producer
 * (src/core/area_maintenance/user_stats.ts:491). Verticalizes one actor's raw
 * matrix_activity rows over [dateIn, dateOut) into the flat
 * {type, tipo|hour, value} item list that mergeRawIntoCanonical folds on top of
 * the saved history.
 *
 * WHY THIS GATE EXISTS (2026-08-10, plan §4.2.2). The function was 0%: its only
 * mechanical gate was test/parity/get_widget_data_differential.test.ts, which is
 * describe.if(hasLivePhpOracle()) and reports 5 skip / 0 pass post-cutover.
 * aggregateActivity and foldTallies underneath it are covered by
 * user_stats_paging.test.ts; what was NOT covered is the EMISSION layer — the
 * four-block order, the label asymmetry, the raw hour key, the interval bound
 * and the empty-window return.
 *
 * PAIRING WITH 4.1.1 (mergeRawIntoCanonical / user_stats_merge_native.test.ts)
 * — MUTUALLY LOAD-BEARING, and the pairing HOLDS (verified 2026-08-10, both
 * directions):
 *
 *   - merge M2 ("a raw `label` WINS over the ontology term") is only reachable
 *     in production because THIS producer attaches a label to `what` items.
 *     Held up here by: `every emitted what item carries a label` in the
 *     "four-dimension emission" test (and by the exact-array toEqual, which
 *     pins the label VALUE).
 *   - merge M3 ("no raw label FALLS BACK to the ontology term") is only
 *     reachable because THIS producer emits `where` / `publish` items WITHOUT a
 *     label. Held up here by: `no where/publish item has a label key` in the
 *     same test — asserted on an item count proved non-zero first.
 *   - merge's hour handling (M1 densification / M8 slot placement) assumes the
 *     raw STRING hour key; held up here by the `typeof hour === 'string'`
 *     assertion. Number()-ing at emission would create duplicate slots after
 *     merge.
 *
 * If the asymmetry silently disappears here, M2/M3 there keep passing while
 * gating a branch nothing reaches — and vice versa. Neither file is sufficient
 * alone.
 *
 * ALS, NOT AN ARGUMENT. The `what` label is resolved at
 * `currentApplicationLang()` read from the request-lang AsyncLocalStorage, so
 * the language case below runs INSIDE runWithRequestLangs and asserts a term
 * that differs from the ambient installation default — otherwise a mutation
 * that hardcodes the default is invisible.
 *
 * Scratch hygiene: synthetic dd128 user 933001 (band 933000-933999, distinct
 * from 424262/424263 in user_stats_paging.test.ts so the two files stay
 * independent), matrix_activity rows only, swept fail-loud in afterAll. This
 * function only READS — it writes no matrix_stats and no matrix_time_machine.
 *
 * @twin-of      test/parity/get_widget_data_differential.test.ts
 * @twin-status  supplement
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getIntervalRawActivityData } from '../../src/core/area_maintenance/user_stats.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { termByTipo } from '../../src/core/ontology/labels.ts';
import {
	currentApplicationLang,
	runWithRequestLangs,
} from '../../src/core/resolve/request_lang.ts';

/** Synthetic actor — never a real user. Band 933000-933999. */
const UID = 933001;

const DAY_IN = '2019-05-01';
/** The EXCLUSIVE upper bound: rows stamped on this day must not appear. */
const DAY_OUT = '2019-05-02';

/** Ontology tipos the WHAT_MAP routes to (5 = save, 6 = edit, 1 = login). */
const TIPO_SAVE = 'dd700';
const TIPO_EDIT = 'dd694';
const TIPO_LOGIN = 'dd696';

const activityIds: number[] = [];

/** One synthetic matrix_activity row, mirroring user_stats_paging's shape. */
async function insertActivity(options: {
	day: string;
	time: string;
	/** dd545 locator section_id — the action code. */
	code: string;
	/** dd546 where key. */
	where: string;
	/** dd547 start.hour, as jsonb source text. */
	hour: string;
	/** dd551 message object, as jsonb source text; omitted writes no misc. */
	message?: string;
}): Promise<void> {
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_activity (section_tipo, relation, string, date, misc, timestamp)
		 VALUES ('dd542', $1::text::jsonb, $2::text::jsonb, $3::text::jsonb, $4::text::jsonb, $5)
		 RETURNING id`,
		[
			JSON.stringify({
				dd543: [
					{
						id: 1,
						type: 'dd151',
						section_id: String(UID),
						section_tipo: 'dd128',
						from_component_tipo: 'dd543',
					},
				],
				dd545: [
					{
						id: 1,
						type: 'dd151',
						section_id: options.code,
						section_tipo: 'dd552',
						from_component_tipo: 'dd545',
					},
				],
			}),
			`{"dd546":[{"id":1,"lang":"lg-nolan","value":"${options.where}"}]}`,
			`{"dd547":[{"id":1,"start":{"hour":${options.hour}}}]}`,
			options.message === undefined
				? '{}'
				: `{"dd551":[{"id":1,"lang":"lg-nolan","value":${options.message}}]}`,
			`${options.day} ${options.time}`,
		],
	)) as { id: number }[];
	activityIds.push(Number(rows[0]?.id));
}

describe('getIntervalRawActivityData', () => {
	beforeAll(async () => {
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND relation @> $1::text::jsonb`,
			[JSON.stringify({ dd543: [{ section_tipo: 'dd128', section_id: String(UID) }] })],
		);

		// IN WINDOW — day 2019-05-01. Ids ascend with insertion, which is the
		// first-encounter order the emission must preserve.
		// save / zzint1 / hour 9
		await insertActivity({ day: DAY_IN, time: '09:00:00', code: '5', where: 'zzint1', hour: '9' });
		// edit / zzint2 / hour 9  → second key in BOTH `what` and `where`
		await insertActivity({ day: DAY_IN, time: '09:30:00', code: '6', where: 'zzint2', hour: '9' });
		// save / zzint1 / hour 10 → repeats both keys (values must SUM)
		await insertActivity({ day: DAY_IN, time: '10:00:00', code: '5', where: 'zzint1', hour: '10' });
		// save / dd1223 → routed to PUBLISH, never to `where`
		await insertActivity({
			day: DAY_IN,
			time: '10:15:00',
			code: '5',
			where: 'dd1223',
			hour: '10',
			message: '{"top_tipo":"zzintpub","section_tipo":"zzintsec"}',
		});

		// AT THE EXCLUSIVE BOUND — 2019-05-02 00:00:00, i.e. the bound INSTANT,
		// not merely the bound day: the predicate is `timestamp < date(dateOut)`,
		// so a `<` → `<=` flip is only observable on a row stamped at midnight.
		// Its keys are unique so their absence is attributable, and the widened
		// call below proves the row exists.
		await insertActivity({
			day: DAY_OUT,
			time: '00:00:00',
			code: '1',
			where: 'zzintout',
			hour: '0',
		});
	});

	afterAll(async () => {
		const leaked: string[] = [];
		for (const id of activityIds) {
			const deleted = (await sql.unsafe(
				`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND id = $1 RETURNING id`,
				[id],
			)) as unknown[];
			if (deleted.length === 0) leaked.push(`matrix_activity id ${id}`);
		}
		if (leaked.length > 0) throw new Error(`cleanup leaked tracked rows: ${leaked.join(', ')}`);
	});

	test('emits what → where → when → publish, with the LABEL ASYMMETRY 4.1.1 depends on', async () => {
		const items = (await getIntervalRawActivityData(UID, DAY_IN, DAY_OUT)) ?? [];

		// FLOOR FIRST. Every assertion below is of the form "these items have (or
		// lack) a property"; on an empty result they would all pass vacuously. So
		// pin the per-dimension COUNT before looking at any item.
		const of = (type: string): typeof items => items.filter((item) => item.type === type);
		expect(of('what').length).toBe(2);
		expect(of('where').length).toBe(2);
		expect(of('when').length).toBe(2);
		expect(of('publish').length).toBe(1);
		expect(items.length).toBe(7);

		// The BLOCK ORDER is the pinned wire order: merge appends in arrival order.
		expect(items.map((item) => item.type)).toEqual([
			'what',
			'what',
			'where',
			'where',
			'when',
			'when',
			'publish',
		]);

		// The whole payload, exactly — keys, values, first-encounter order within
		// each block, and the label VALUE (which is what merge M2 shadows).
		const lang = currentApplicationLang();
		expect(items).toEqual([
			{ type: 'what', tipo: TIPO_SAVE, value: 3, label: await termByTipo(TIPO_SAVE, lang) },
			{ type: 'what', tipo: TIPO_EDIT, value: 1, label: await termByTipo(TIPO_EDIT, lang) },
			{ type: 'where', tipo: 'zzint1', value: 2 },
			{ type: 'where', tipo: 'zzint2', value: 1 },
			{ type: 'when', hour: '9', value: 2 },
			{ type: 'when', hour: '10', value: 2 },
			{ type: 'publish', tipo: 'zzintpub', value: 1 },
		]);

		// The asymmetry, asserted on PRESENCE OF THE KEY (toEqual above tolerates
		// an explicit `undefined`), because 4.1.1's M2/M3 hang off exactly this:
		// `what` carries a label → M2's "raw label wins" arm is live;
		// `where`/`publish` do not → M3's "fall back to the ontology term" arm is.
		for (const item of of('what')) {
			expect(Object.keys(item)).toContain('label');
			expect(typeof (item as { label: unknown }).label).toBe('string');
		}
		for (const item of [...of('where'), ...of('publish')]) {
			expect(Object.keys(item)).not.toContain('label');
		}

		// The hour is the RAW aggregate key, a string — Number()-ing it here would
		// make merge place '9' and 9 in different slots.
		for (const item of of('when')) {
			const hour = (item as { hour: unknown }).hour;
			expect(typeof hour).toBe('string');
		}
	}, 60000);

	test('the `what` label is resolved at the ALS application lang, not a hardcoded default', async () => {
		// Precondition: the two langs must really differ for this tipo, or a
		// mutation that ignores the ALS is invisible.
		const ambient = await termByTipo(TIPO_SAVE, currentApplicationLang());
		const italian = await termByTipo(TIPO_SAVE, 'lg-ita');
		expect(italian).not.toBe(ambient);

		const items = await runWithRequestLangs({ applicationLang: 'lg-ita', dataLang: 'lg-ita' }, () =>
			getIntervalRawActivityData(UID, DAY_IN, DAY_OUT),
		);
		const what = (items ?? []).filter((item) => item.type === 'what');
		expect(what.length).toBe(2);
		expect((what[0] as { label: unknown }).label).toBe(italian);
	}, 60000);

	test('dateOut is EXCLUSIVE — with a positive control on both sides', async () => {
		const inWindow = (await getIntervalRawActivityData(UID, DAY_IN, DAY_OUT)) ?? [];
		const keys = (list: typeof inWindow): string[] =>
			list.map((item) => {
				const shape = item as { tipo?: string; hour?: string | number };
				return String(shape.tipo ?? shape.hour);
			});

		// positive control INSIDE the window: the day's own rows are there
		expect(keys(inWindow)).toContain('zzint1');
		// the row stamped exactly at dateOut is NOT
		expect(keys(inWindow)).not.toContain('zzintout');
		expect(keys(inWindow)).not.toContain(TIPO_LOGIN);

		// positive control on the EXCLUDED row: widen by one day and it appears —
		// so "absent above" is exclusivity, not a missing fixture.
		const widened = (await getIntervalRawActivityData(UID, DAY_IN, '2019-05-03')) ?? [];
		expect(keys(widened)).toContain('zzintout');
		expect(keys(widened)).toContain(TIPO_LOGIN);
		// exactly the excluded row's three dimensions (what / where / when — it
		// carries no dd1223 publish), so nothing else moved either.
		expect(widened.length).toBe(inWindow.length + 3);
	}, 60000);

	test('an empty window returns [] — never null (merge iterates it unguarded)', async () => {
		const items = await getIntervalRawActivityData(UID, '2018-01-01', '2018-01-02');
		expect(items).not.toBeNull();
		expect(items).toEqual([]);
	}, 60000);
});
