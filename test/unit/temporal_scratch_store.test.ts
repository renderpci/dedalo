/**
 * WC-079 gate: the temporal scratch store.
 *
 * Runs against a SCRATCH table (the injectable `table` option), never the live
 * one, so a failed run cannot strand rows in an operator's staging area.
 *
 * The assertions that matter most are the two PHP defects this store exists to
 * not repeat — per-user isolation, and cross-tool key non-collision — plus the
 * `::text::jsonb` bind check, which is the one failure mode that would look
 * fine in every round trip and still break the read graft.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	type TemporalScratchAddress,
	clearTemporalScratch,
	ensureTemporalScratchTable,
	readTemporalScratch,
	sweepTemporalScratch,
	temporalScratchAddress,
	writeTemporalScratch,
} from '../../src/core/section/record/temporal_store.ts';

const TABLE = 'dedalo_ts_test_temporal_scratch';
const opts = { table: TABLE };

const USER_A = -101;
const USER_B = -102;

const addr = (over: Partial<TemporalScratchAddress> = {}): TemporalScratchAddress => ({
	scope: 'tool_import_files',
	sectionTipo: 'test3',
	componentTipo: 'test52',
	lang: 'lg-eng',
	...over,
});

let hasDb = false;
try {
	await sql`SELECT 1`;
	hasDb = true;
} catch {
	console.warn('[temporal_scratch_store] DB unavailable — store drives SKIPPED');
}
const testIfDb = test.if(hasDb);

beforeAll(async () => {
	if (!hasDb) return;
	await ensureTemporalScratchTable(TABLE);
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE user_id IN ($1, $2)`, [USER_A, USER_B]);
});
afterAll(async () => {
	if (!hasDb) return;
	await sql.unsafe(`DROP TABLE IF EXISTS "${TABLE}"`, []);
});

describe('temporal scratch store — round trip', () => {
	testIfDb('writes, reads back verbatim, and UPSERTs rather than appending', async () => {
		const a = addr();
		await writeTemporalScratch(USER_A, a, [{ id: 1, lang: 'lg-eng', value: 'first' }], opts);
		expect(await readTemporalScratch(USER_A, a, opts)).toEqual([
			{ id: 1, lang: 'lg-eng', value: 'first' },
		]);

		await writeTemporalScratch(USER_A, a, [{ id: 1, lang: 'lg-eng', value: 'second' }], opts);
		expect(await readTemporalScratch(USER_A, a, opts)).toEqual([
			{ id: 1, lang: 'lg-eng', value: 'second' },
		]);
		const rows = (await sql.unsafe(`SELECT count(*)::int AS n FROM "${TABLE}" WHERE user_id = $1`, [
			USER_A,
		])) as { n: number }[];
		expect(rows[0]?.n).toBe(1);
	});

	testIfDb('stores a REAL jsonb array, not a double-encoded string scalar', async () => {
		// The $n::jsonb bind trap: a string scalar round-trips through read() as a
		// string, and the read graft would then inject a string into a locator slot.
		const a = addr({ componentTipo: 'test53' });
		await writeTemporalScratch(USER_A, a, [{ value: 'x' }], opts);
		const rows = (await sql.unsafe(
			`SELECT jsonb_typeof(entries) AS t FROM "${TABLE}"
			 WHERE user_id = $1 AND component_tipo = $2`,
			[USER_A, 'test53'],
		)) as { t: string }[];
		expect(rows[0]?.t).toBe('array');
	});

	testIfDb('an EMPTY value deletes the row instead of storing an empty husk', async () => {
		const a = addr({ componentTipo: 'test54' });
		await writeTemporalScratch(USER_A, a, [{ value: 'x' }], opts);
		expect(await readTemporalScratch(USER_A, a, opts)).not.toBeNull();
		await writeTemporalScratch(USER_A, a, [], opts);
		expect(await readTemporalScratch(USER_A, a, opts)).toBeNull();
	});

	testIfDb('an oversize payload is refused without throwing, and stores nothing', async () => {
		const a = addr({ componentTipo: 'test55' });
		const big = [{ value: 'x'.repeat(5000) }];
		expect(await writeTemporalScratch(USER_A, a, big, { ...opts, maxBytes: 512 })).toBe(false);
		expect(await readTemporalScratch(USER_A, a, opts)).toBeNull();
	});
});

describe('temporal scratch store — isolation (the tenancy boundary)', () => {
	testIfDb('one user cannot READ another user’s row at the same address', async () => {
		const a = addr({ componentTipo: 'test60' });
		await writeTemporalScratch(USER_A, a, [{ value: 'A-secret' }], opts);
		expect(await readTemporalScratch(USER_B, a, opts)).toBeNull();
	});

	testIfDb('one user cannot CLOBBER another user’s row at the same address', async () => {
		const a = addr({ componentTipo: 'test61' });
		await writeTemporalScratch(USER_A, a, [{ value: 'A-value' }], opts);
		await writeTemporalScratch(USER_B, a, [{ value: 'B-value' }], opts);
		expect(await readTemporalScratch(USER_A, a, opts)).toEqual([{ value: 'A-value' }]);
		expect(await readTemporalScratch(USER_B, a, opts)).toEqual([{ value: 'B-value' }]);
	});

	testIfDb('clearing one user’s scope leaves the other user untouched', async () => {
		const a = addr({ componentTipo: 'test62' });
		await writeTemporalScratch(USER_A, a, [{ value: 'A' }], opts);
		await writeTemporalScratch(USER_B, a, [{ value: 'B' }], opts);
		await clearTemporalScratch(USER_A, 'tool_import_files', opts);
		expect(await readTemporalScratch(USER_A, a, opts)).toBeNull();
		expect(await readTemporalScratch(USER_B, a, opts)).toEqual([{ value: 'B' }]);
	});
});

describe('temporal scratch store — the key does not collide (the PHP regression)', () => {
	// PHP keyed on `section_tipo . user_id` with no separator and no tool, so two
	// tools on one section shared a row and 'oh1'+42 collided with 'oh14'+2.
	testIfDb('two TOOLS on the same component are two independent rows', async () => {
		const files = addr({ componentTipo: 'test70', scope: 'tool_import_files' });
		const marc = addr({ componentTipo: 'test70', scope: 'tool_import_marc21' });
		await writeTemporalScratch(USER_A, files, [{ value: 'from files' }], opts);
		await writeTemporalScratch(USER_A, marc, [{ value: 'from marc21' }], opts);
		expect(await readTemporalScratch(USER_A, files, opts)).toEqual([{ value: 'from files' }]);
		expect(await readTemporalScratch(USER_A, marc, opts)).toEqual([{ value: 'from marc21' }]);
	});

	testIfDb('two SECTIONS and two LANGS are independent rows', async () => {
		const s1 = addr({ componentTipo: 'test71', sectionTipo: 'test3' });
		const s2 = addr({ componentTipo: 'test71', sectionTipo: 'oh1' });
		const eng = addr({ componentTipo: 'test72', lang: 'lg-eng' });
		const spa = addr({ componentTipo: 'test72', lang: 'lg-spa' });
		await writeTemporalScratch(USER_A, s1, [{ value: 's1' }], opts);
		await writeTemporalScratch(USER_A, s2, [{ value: 's2' }], opts);
		await writeTemporalScratch(USER_A, eng, [{ value: 'eng' }], opts);
		await writeTemporalScratch(USER_A, spa, [{ value: 'spa' }], opts);
		expect(await readTemporalScratch(USER_A, s1, opts)).toEqual([{ value: 's1' }]);
		expect(await readTemporalScratch(USER_A, s2, opts)).toEqual([{ value: 's2' }]);
		expect(await readTemporalScratch(USER_A, eng, opts)).toEqual([{ value: 'eng' }]);
		expect(await readTemporalScratch(USER_A, spa, opts)).toEqual([{ value: 'spa' }]);
	});

	testIfDb('clearing a scope does not reach another scope', async () => {
		const files = addr({ componentTipo: 'test73', scope: 'tool_import_files' });
		const zotero = addr({ componentTipo: 'test73', scope: 'tool_import_zotero' });
		await writeTemporalScratch(USER_A, files, [{ value: 'f' }], opts);
		await writeTemporalScratch(USER_A, zotero, [{ value: 'z' }], opts);
		await clearTemporalScratch(USER_A, 'tool_import_files', opts);
		expect(await readTemporalScratch(USER_A, files, opts)).toBeNull();
		expect(await readTemporalScratch(USER_A, zotero, opts)).toEqual([{ value: 'z' }]);
	});
});

describe('temporal scratch store — TTL sweep keeps the table bounded', () => {
	testIfDb('a stale row is pruned and a fresh one survives', async () => {
		const stale = addr({ componentTipo: 'test80' });
		const fresh = addr({ componentTipo: 'test81' });
		await writeTemporalScratch(USER_A, stale, [{ value: 'old' }], opts);
		await writeTemporalScratch(USER_A, fresh, [{ value: 'new' }], opts);
		await sql.unsafe(
			`UPDATE "${TABLE}" SET updated_at = now() - make_interval(hours => 500)
			 WHERE user_id = $1 AND component_tipo = $2`,
			[USER_A, 'test80'],
		);
		await sweepTemporalScratch(opts);
		expect(await readTemporalScratch(USER_A, stale, opts)).toBeNull();
		expect(await readTemporalScratch(USER_A, fresh, opts)).toEqual([{ value: 'new' }]);
	});
});

describe('temporal scratch address — the SCOPE gate (what keeps 4 producers out)', () => {
	// This is the test that proves tool_propagate_component_data and the two
	// component_text_area pickers persist NOTHING: no scope on the wire ⇒ no address.
	test('a temporal source with NO scope yields no address', () => {
		expect(
			temporalScratchAddress({
				is_temporal: true,
				section_tipo: 'test3',
				tipo: 'test52',
				lang: 'lg-eng',
			}),
		).toBeNull();
	});

	test('a NON-temporal source never yields an address, even with a scope', () => {
		expect(
			temporalScratchAddress({
				is_temporal: false,
				temporal_scope: 'tool_import_files',
				section_tipo: 'test3',
				tipo: 'test52',
				lang: 'lg-eng',
			}),
		).toBeNull();
	});

	test('a malformed scope is refused rather than keyed on', () => {
		for (const scope of ['', 'Tool Import', '../etc', 'x'.repeat(120), 9 as unknown as string]) {
			expect(
				temporalScratchAddress({
					is_temporal: true,
					temporal_scope: scope,
					section_tipo: 'test3',
					tipo: 'test52',
					lang: 'lg-eng',
				}),
			).toBeNull();
		}
	});

	test('a well-formed temporal source yields the full address', () => {
		expect(
			temporalScratchAddress({
				is_temporal: true,
				temporal_scope: 'tool_import_files',
				section_tipo: 'test3',
				tipo: 'test52',
				lang: 'lg-eng',
			}),
		).toEqual({
			scope: 'tool_import_files',
			sectionTipo: 'test3',
			componentTipo: 'test52',
			lang: 'lg-eng',
		});
	});

	test('a missing lang falls back to lg-nolan on BOTH sides (round-trip symmetry)', () => {
		expect(
			temporalScratchAddress({
				is_temporal: true,
				temporal_scope: 'tool_import_files',
				section_tipo: 'test3',
				tipo: 'test52',
			})?.lang,
		).toBe('lg-nolan');
	});
});

/**
 * AUTHZ-02 on the scratch graft. The store shipped WITHOUT this filter and was a
 * live cross-tenant read: the save door persists client-supplied locators before
 * any scope check, admits at a READ grant, and read_facade exempts temporal
 * sources from the per-record gate — so a level-1 user could stage any locator
 * and have the standard expansion hand back another tenant's field values.
 *
 * The filter is shared with the search-chip door (read.ts) so the two cannot
 * drift again; these pin the branches that need no DB.
 */
describe('filterLocatorsInScope — the shared AUTHZ-02 guard', () => {
	const LOCATORS = [
		{ section_tipo: 'test3', section_id: 1 },
		{ section_tipo: 'test3', section_id: 2 },
	];

	test('a GLOBAL ADMIN is unscoped — every locator passes', async () => {
		const { filterLocatorsInScope } = await import('../../src/core/security/record_scope.ts');
		const admin = { userId: -1, isGlobalAdmin: true } as never;
		expect(await filterLocatorsInScope(LOCATORS, admin, 'dd128')).toEqual(LOCATORS);
	});

	test('NO principal is unscoped (the caller decides; this is not the gate)', async () => {
		const { filterLocatorsInScope } = await import('../../src/core/security/record_scope.ts');
		expect(await filterLocatorsInScope(LOCATORS, undefined, 'dd128')).toEqual(LOCATORS);
	});

	test('a locator with no (section_tipo, section_id) identity passes through', async () => {
		// Nothing to scope — dropping these would blank legitimate literal-ish items.
		const { filterLocatorsInScope } = await import('../../src/core/security/record_scope.ts');
		const nonAdmin = { userId: 12345, isGlobalAdmin: false } as never;
		const shapeless = [{ value: 'x' }, { section_tipo: 'test3' }];
		expect(await filterLocatorsInScope(shapeless, nonAdmin, 'dd128')).toEqual(shapeless);
	});

	test('the root-user locator (users section, -1) is allowed for a non-admin', async () => {
		// It resolves to a LABEL only and activity "who" chips must render; record
		// access stays blocked downstream. Without this allow, isRecordInScope would
		// silently drop the chip for every non-admin.
		const { filterLocatorsInScope } = await import('../../src/core/security/record_scope.ts');
		const nonAdmin = { userId: 12345, isGlobalAdmin: false } as never;
		const rootUser = [{ section_tipo: 'dd128', section_id: -1 }];
		expect(await filterLocatorsInScope(rootUser, nonAdmin, 'dd128')).toEqual(rootUser);
	});

	test('an empty set is returned unchanged without touching the DB', async () => {
		const { filterLocatorsInScope } = await import('../../src/core/security/record_scope.ts');
		const nonAdmin = { userId: 12345, isGlobalAdmin: false } as never;
		expect(await filterLocatorsInScope([], nonAdmin, 'dd128')).toEqual([]);
	});

	// THE POSITIVE CASE — the one that actually proves the tenant boundary holds.
	// A non-admin with NO projects is out of scope for every record, so a real
	// isRecordInScope round trip must DROP the locator; the same locator under an
	// admin must SURVIVE. Without the admin half this could pass because the query
	// errored, or because the record does not exist.
	testIfDb(
		'a REAL record locator is dropped for an out-of-scope non-admin, kept for an admin',
		async () => {
			const { filterLocatorsInScope } = await import('../../src/core/security/record_scope.ts');
			// userId 999999 has no projects assignment — the same fixture
			// search_projects_filter_multisection uses for "sees nothing".
			const outOfScope = { userId: 999999, isGlobalAdmin: false, isDeveloper: false } as never;
			const admin = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as never;
			const real = [{ section_tipo: 'test3', section_id: 1 }];

			expect(
				await filterLocatorsInScope(real, admin, 'dd128'),
				'control: the record must be resolvable at all, or the drop below proves nothing',
			).toEqual(real);
			expect(
				await filterLocatorsInScope(real, outOfScope, 'dd128'),
				'an out-of-scope non-admin must NOT be able to resolve this locator',
			).toEqual([]);
		},
	);
});
