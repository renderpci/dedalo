/**
 * component_info LEGACY-STORED-VALUE fall-through (audit 2026-08 finding L1) —
 * TS-native gate for WC-2026-08-09-info-legacy-stored-value-fallthrough.
 *
 * ~690 records of the target install (84 rsc167, 596 rsc170, 7 oh1, 1 rsc176 —
 * census run read-only against dedalo7_mht 2026-08-09) hold a v5-era blob in
 * their `misc` column instead of widget entries:
 *
 *   {"id":1,"value":null,"state":{"lg-spa":{"dd203_1":[100,0]}},
 *    "section_id":"44","section_tipo":"oh1","component_tipo":"oh23"}
 *
 * PHP's get_db_data only falls back on `empty($data)`, so that blob won the
 * emission and reached the client, whose state renderer selects on `key` and
 * `widget_id` (render_list_state.js:114/185) and therefore drew nothing.
 *
 * THE RULE UNDER TEST (isLegacyStateResidue — see widgets/widget_common.ts):
 * a stored array falls through to the live compute IFF EVERY entry is a
 * POSITIVELY identified v5 blob — no widget/key/widget_id, value null, a
 * non-empty `lg-`-keyed `state` map, and the id/section_id/section_tipo/
 * component_tipo quartet. Every other stored array keeps PHP's behaviour.
 *
 * This gate is two-sided on purpose, because the rule has two failure modes
 * and each has already been shipped once:
 *  - too LOOSE (`value.length > 0`, the original defect): the blob wins and
 *    reaches the wire → the fall-through tests below go red.
 *  - too STRICT (`!hasWidgetEntry`, a negative test for the modern shape):
 *    every stored array we cannot classify is discarded as well → the
 *    "unclassifiable" test below goes red. That direction is the never-narrow
 *    violation, and it is the one a reader is most likely to "simplify" back
 *    into the code, so it is pinned explicitly.
 *
 * Fixtures are REAL shapes lifted from the live archive: the legacy blob from
 * oh1/44 + rsc167/1, the modern entry from rsc167/3, and the untagged
 * NON-legacy array from the dd477→dd596 rows (20 of them) that the census
 * found sharing the `misc` column.
 *
 * Scratch ids 900351..900356 on rsc2 (clear of info_widget_native's
 * 900311..900314); swept in afterAll with the loud 0-row guard.
 */
// BINDS INSTALL TLDs: oh, rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getCounters, resetCountersForTests } from '../../src/core/api/counters.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import { isLegacyStateResidue } from '../../src/core/components/component_info/widgets/widget_common.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';

const ID = {
	legacy: 900351, // misc holds ONLY the v5 blob → must fall through
	modern: 900352, // misc holds modern widget entries → stored wins
	mixed: 900353, // raw non-widget item + one modern entry (the tags shape) → stored wins
	control: 900354, // no misc at all → live compute (the fall-through target)
	legacyEmptySource: 900355, // v5 blob on a record with NOTHING to compute from
	unclassifiable: 900356, // untagged but NOT legacy → stored MUST still win
};

/**
 * The v5 blob, verbatim from the live archive (oh1/44 misc->oh28[0], and the
 * identical shape under rsc167/1 misc->rsc19). No `widget`, no `key`, no
 * `column`, no `type` — nothing the client's state renderer selects on.
 */
const LEGACY_ENTRY = {
	id: 1,
	state: { 'lg-spa': { dd203_1: [100, 0], dd203_2: [100, 0] } },
	value: null,
	section_id: '44',
	section_tipo: 'oh1',
	component_tipo: 'oh23',
};

/** The modern stored shape, verbatim from the live archive (rsc167/3 misc->rsc19). */
const MODERN_ENTRIES = [
	{
		id: 'digitization',
		key: 0,
		lang: 'lg-nolan',
		type: 'detail',
		value: 0,
		column: 'situation',
		widget: 'state',
		locator: null,
	},
	{
		id: 'digitization',
		key: 0,
		lang: 'lg-nolan',
		type: 'total',
		value: 0,
		column: 'situation',
		widget: 'state',
	},
];

/**
 * The tags widget's own output shape: raw component items LEAD (no `widget`
 * key — widgets/oh/tags.ts reproduces the PHP $data-reuse quirk), then the
 * stat items. A stored array of this shape is NOT legacy.
 */
const MIXED_ENTRIES = [
	{ id: 1, lang: 'lg-spa', value: '<p>raw transcription text</p>' },
	{ widget: 'tags', key: 0, widget_id: 'total_missing_tags', value: 2 },
];

/**
 * An UNTAGGED, NON-legacy stored array — the shape the census found under
 * dd477→dd596 (20 rows) sitting in the same `misc` column. It carries no
 * `widget`/`key`/`widget_id`, so the retired negative rule would have
 * discarded it; it is not a v5 state blob (real `value`, no `state` map), so
 * the engine must NOT classify it and must serve it exactly as PHP did.
 */
const UNCLASSIFIABLE_ENTRIES = [
	{ id: 1, value: { id: 'map', table: 'ts_web', detail: [{ type: 'title', colname: 'titulo' }] } },
];

const locatorOf = (sectionTipo: string, sectionId: number | string, from: string, id = 1) => ({
	id,
	type: 'dd151',
	section_id: String(sectionId),
	section_tipo: sectionTipo,
	from_component_tipo: from,
});

/** rsc156 → dd501/2, rsc80 → dd174/1: the REAL install vocabularies the state widget reads. */
const STATE_RELATIONS = {
	rsc156: [locatorOf('dd501', 2, 'rsc156')],
	rsc80: [locatorOf('dd174', 1, 'rsc80')],
};

const SCRATCH_IDS = Object.values(ID);

async function insertRow(sectionId: number, columns: Record<string, unknown>): Promise<void> {
	const names = Object.keys(columns);
	const columnSql = names.length > 0 ? `, ${names.join(', ')}` : '';
	const valueSql = names.map((_, index) => `, $${index + 3}::text::jsonb`).join('');
	await sql.unsafe(
		`INSERT INTO matrix (section_id, section_tipo${columnSql}) VALUES ($1, $2${valueSql})`,
		[sectionId, 'rsc2', ...names.map((name) => JSON.stringify(columns[name]))],
	);
}

async function sweepScratch(): Promise<Map<number, number>> {
	const counts = new Map<number, number>();
	for (const sectionId of SCRATCH_IDS) {
		const deleted = (await sql.unsafe(
			`DELETE FROM matrix WHERE section_tipo = 'rsc2' AND section_id = $1 RETURNING id`,
			[sectionId],
		)) as unknown[];
		counts.set(sectionId, deleted.length);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'rsc2' AND section_id = $1`,
			[sectionId],
		);
	}
	return counts;
}

let tsContext: ApiRequestContext;

function readRqo(sectionId: number, mode: string): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: 'rsc2',
			section_tipo: 'rsc2',
			action: 'search',
			mode,
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['rsc2'],
			limit: 1,
			offset: 0,
			filter_by_locators: [{ section_tipo: 'rsc2', section_id: String(sectionId) }],
		},
		show: {
			ddo_map: [{ tipo: 'rsc19', section_tipo: 'rsc2', parent: 'rsc2', mode }],
		},
	};
}

async function entriesOf(sectionId: number, mode = 'list'): Promise<unknown[]> {
	const response = (
		await dispatchRqo(structuredClone(readRqo(sectionId, mode)) as never, tsContext as never)
	).body as { data?: { data?: unknown[] } };
	const items = (response.data?.data ?? []).slice(1) as { entries?: unknown }[];
	return (items[0]?.entries ?? null) as unknown[];
}

beforeAll(async () => {
	await sweepScratch(); // pre-clean a crashed prior run
	await insertRow(ID.legacy, { relation: STATE_RELATIONS, misc: { rsc19: [LEGACY_ENTRY] } });
	await insertRow(ID.modern, { relation: STATE_RELATIONS, misc: { rsc19: MODERN_ENTRIES } });
	await insertRow(ID.mixed, { relation: STATE_RELATIONS, misc: { rsc19: MIXED_ENTRIES } });
	await insertRow(ID.control, { relation: STATE_RELATIONS });
	await insertRow(ID.legacyEmptySource, { misc: { rsc19: [LEGACY_ENTRY] } });
	await insertRow(ID.unclassifiable, {
		relation: STATE_RELATIONS,
		misc: { rsc19: UNCLASSIFIABLE_ENTRIES },
	});
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as ApiRequestContext;
}, 60000);

afterAll(async () => {
	const counts = await sweepScratch();
	const missing = [...counts.entries()].filter(([, count]) => count === 0).map(([key]) => key);
	if (missing.length > 0) {
		throw new Error(
			`Scratch cleanup deleted 0 rows for rsc2/${missing.join(', rsc2/')} — seed vanished mid-run.`,
		);
	}
});

describe('component_info legacy stored-value fall-through (L1)', () => {
	test('the RULE: only a positively identified, wholly-v5 array is residue', () => {
		// the live corpus shape (all 1365 entries of the 688 affected arrays)
		expect(isLegacyStateResidue([LEGACY_ENTRY])).toBe(true);
		expect(isLegacyStateResidue([LEGACY_ENTRY, { ...LEGACY_ENTRY, id: 2 }])).toBe(true);
		expect(isLegacyStateResidue([{ ...LEGACY_ENTRY, section_id: 44 }])).toBe(true);

		// EMPTY is not residue — PHP's own empty($data) already handles it, so it
		// is not a divergence and must not be counted as one.
		expect(isLegacyStateResidue([])).toBe(false);

		// modern entries and the tags shape are data
		expect(isLegacyStateResidue(MODERN_ENTRIES)).toBe(false);
		expect(isLegacyStateResidue(MIXED_ENTRIES)).toBe(false);
		// EVERY entry, not any: one non-legacy entry makes the array data
		expect(isLegacyStateResidue([LEGACY_ENTRY, MODERN_ENTRIES[0]])).toBe(false);

		// THE ANTI-NARROWING CASES — untagged, yet NOT legacy. A negative rule
		// ("no entry carries `widget`") calls every one of these residue and
		// discards it; the positive rule keeps PHP's generic behaviour.
		expect(isLegacyStateResidue(UNCLASSIFIABLE_ENTRIES)).toBe(false);
		expect(isLegacyStateResidue([null, 'x', 42, [], { widget: 1 }, { widget: null }])).toBe(false);
		expect(isLegacyStateResidue([{ id: 1, value: 'plain' }])).toBe(false);

		// each discriminator is load-bearing: drop any one and it is not residue
		expect(isLegacyStateResidue([{ ...LEGACY_ENTRY, value: 0 }])).toBe(false);
		expect(isLegacyStateResidue([{ ...LEGACY_ENTRY, state: { spa: {} } }])).toBe(false);
		expect(isLegacyStateResidue([{ ...LEGACY_ENTRY, state: {} }])).toBe(false);
		expect(isLegacyStateResidue([{ ...LEGACY_ENTRY, state: [] }])).toBe(false);
		expect(isLegacyStateResidue([{ ...LEGACY_ENTRY, key: 0 }])).toBe(false);
		expect(isLegacyStateResidue([{ ...LEGACY_ENTRY, widget_id: 'x' }])).toBe(false);
		const { section_tipo: _dropped, ...noSectionTipo } = LEGACY_ENTRY;
		expect(isLegacyStateResidue([noSectionTipo])).toBe(false);
	});

	test('legacy v5 blob falls through to the LIVE widget compute', async () => {
		const live = (await entriesOf(ID.control)) as Record<string, unknown>[];
		// the control record proves the live compute is non-vacuous here
		expect(Array.isArray(live)).toBe(true);
		expect(live.length).toBeGreaterThan(0);
		expect(live.every((item) => item.widget === 'state')).toBe(true);

		const served = (await entriesOf(ID.legacy)) as Record<string, unknown>[];
		expect(served).toEqual(live as never);
		// and the blob itself never reaches the wire
		expect(JSON.stringify(served)).not.toContain('"dd203_1"');
		expect(served.some((item) => item.component_tipo === 'oh23')).toBe(false);
	}, 30000);

	test('legacy fall-through holds in EDIT mode too (the form the client renders)', async () => {
		const live = await entriesOf(ID.control, 'edit');
		const served = await entriesOf(ID.legacy, 'edit');
		expect(served).toEqual(live as never);
	}, 30000);

	test('a legacy blob over an EMPTY source serves the honest live result, never the blob', async () => {
		// Nothing to compute from: the fall-through must still discard the blob
		// rather than serve an unrenderable shape "because it is something".
		const served = (await entriesOf(ID.legacyEmptySource)) as Record<string, unknown>[];
		expect(JSON.stringify(served ?? [])).not.toContain('"dd203_1"');
		for (const item of served ?? []) {
			expect(item.widget).toBe('state');
		}
	}, 30000);

	test('modern stored entries still WIN over the live compute (use_db_data preserved)', async () => {
		const served = (await entriesOf(ID.modern)) as Record<string, unknown>[];
		// stored values are 0/'digitization'; the live compute on the same
		// relations is not — so equality here proves the stored branch ran
		expect(served).toEqual([
			// WC-026 dualisation applies to the stored branch too
			{ ...MODERN_ENTRIES[0], widget_id: 'digitization' },
			{ ...MODERN_ENTRIES[1], widget_id: 'digitization' },
		] as never);
		const live = await entriesOf(ID.control);
		expect(served).not.toEqual(live as never);
	}, 30000);

	test('a PARTIALLY modern array (the tags shape) is stored data, not legacy', async () => {
		const served = (await entriesOf(ID.mixed)) as Record<string, unknown>[];
		expect(served).toEqual([
			MIXED_ENTRIES[0], // raw item passes through verbatim
			{ ...MIXED_ENTRIES[1], id: 'total_missing_tags' }, // WC-026 dualisation
		] as never);
	}, 30000);

	test('an UNCLASSIFIABLE stored array is served, not recomputed (never-narrow)', async () => {
		// The whole point of the positive rule. This array carries none of the
		// keys a renderer selects on, so the retired negative rule would have
		// discarded it and served the live compute instead — silently narrowing
		// a stored shape the engine simply does not know. PHP served it; so do we.
		const served = (await entriesOf(ID.unclassifiable)) as Record<string, unknown>[];
		expect(served).toEqual(UNCLASSIFIABLE_ENTRIES as never);
		const live = await entriesOf(ID.control);
		expect(served).not.toEqual(live as never);
	}, 30000);

	test('the discarded legacy value is COUNTED, never silently dropped', async () => {
		resetCountersForTests();
		await entriesOf(ID.modern);
		await entriesOf(ID.unclassifiable);
		await entriesOf(ID.control); // an EMPTY row is PHP behaviour, not a divergence
		expect(getCounters().component_info_legacy_stored_value ?? 0).toBe(0);
		await entriesOf(ID.legacy);
		expect(getCounters().component_info_legacy_stored_value).toBe(1);
	}, 30000);
});
