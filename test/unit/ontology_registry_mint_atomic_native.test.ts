/**
 * THE REGISTRY-ROW MINT IS ONE TRANSACTION, ONE MINTER PER TLD
 * (cross-write:r2, review of b095553e22..73ff5d88a4, S3).
 *
 * THE DEFECT. createMainSection minted the ontology35 row
 * (createSectionRecord) and then wrote ~9 registry keys, each autocommitting,
 * with no transaction — and checked "no row names this TLD" with nothing
 * holding it until the mint. A failure after the mint left an ORPHAN registry
 * row (no TLD, no target section) that no TLD resolves and no rebuild repairs;
 * two concurrent minters of one TLD both passed the check and minted TWO rows.
 *
 * THE OUTCOMES PINNED:
 *   - a failure on a key write after the mint (injected at the DATABASE: a
 *     scratch trigger refusing this test's TLD key — no seam in the engine)
 *     leaves NO new ontology35 row, and no TLD row;
 *   - two concurrent ensureMainSection calls for one TLD mint EXACTLY ONE row,
 *     both answer its section_id, one of them `created`.
 *
 * Scratch: matrix_ontology_main rows of the `zzmnt*` TLDs (swept by tld and by
 * the id watermark, asserted gone); the trigger is dropped in a finally.
 * assertTestDatabase before the first write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	createMainSection,
	ensureMainSection,
	getOntologyMainFromTld,
} from '../../src/core/ontology/ontology_write.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { countActivityRows, sweepActivityRows } from '../helpers/activity_rows.ts';

const FAIL_TLD = 'zzmntf';
const RACE_TLD = 'zzmntr';
let watermark = 0;
/** Every registry id this gate minted (above the watermark) — their activity rows are swept. */
const mintedIds = new Set<number>();

async function maxRegistryId(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT COALESCE(max(section_id), 0)::int AS n FROM matrix_ontology_main WHERE section_tipo = 'ontology35'`,
		[],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? 0);
}

async function rowsNamed(tld: string): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_ontology_main
		 WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: tld }] })],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? 0);
}

async function sweep(): Promise<void> {
	const minted = (await sql.unsafe(
		`SELECT section_id::int AS id FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND section_id > $1`,
		[watermark],
	)) as { id: number }[];
	for (const row of minted) mintedIds.add(Number(row.id));
	await sweepActivityRows('ontology35', [...mintedIds]);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo = 'ontology35' AND section_id > $1`,
		[watermark],
	);
	await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND section_id > $1`,
		[watermark],
	);
}

beforeAll(async () => {
	await assertTestDatabase('ontology_registry_mint_atomic_native');
	// Precondition, not an assumption: the scratch TLDs have no row.
	expect(await getOntologyMainFromTld(FAIL_TLD)).toBeNull();
	expect(await getOntologyMainFromTld(RACE_TLD)).toBeNull();
	watermark = await maxRegistryId();
});

afterAll(async () => {
	await sql.unsafe('DROP TRIGGER IF EXISTS zzmnt_refuse ON matrix_ontology_main', []);
	await sql.unsafe('DROP FUNCTION IF EXISTS zzmnt_refuse_fn()', []);
	await sweep();
	expect(await maxRegistryId()).toBe(watermark);
	expect(await rowsNamed(FAIL_TLD)).toBe(0);
	expect(await rowsNamed(RACE_TLD)).toBe(0);
	// FLOOR: the race test minted a row; its activity residue is zero.
	expect(mintedIds.size).toBeGreaterThan(0);
	expect(await countActivityRows('ontology35', [...mintedIds])).toBe(0);
});

describe('createMainSection / ensureMainSection', () => {
	test('a key write failing AFTER the mint leaves no orphan registry row', async () => {
		await sql.unsafe(
			`CREATE OR REPLACE FUNCTION zzmnt_refuse_fn() RETURNS trigger LANGUAGE plpgsql AS $$
			 BEGIN
			   IF NEW.string @> '{"hierarchy6":[{"value":"${FAIL_TLD}"}]}'::jsonb THEN
			     RAISE EXCEPTION 'zzmnt: injected key-write failure';
			   END IF;
			   RETURN NEW;
			 END $$`,
			[],
		);
		await sql.unsafe(
			`CREATE TRIGGER zzmnt_refuse BEFORE UPDATE ON matrix_ontology_main
			 FOR EACH ROW EXECUTE FUNCTION zzmnt_refuse_fn()`,
			[],
		);
		try {
			let threw = false;
			try {
				await createMainSection({ tld: FAIL_TLD });
			} catch {
				threw = true;
			}
			// FLOOR: the injection took (else "no orphan" proves nothing).
			expect(threw).toBe(true);
			expect(await maxRegistryId()).toBe(watermark);
			expect(await rowsNamed(FAIL_TLD)).toBe(0);
		} finally {
			await sql.unsafe('DROP TRIGGER IF EXISTS zzmnt_refuse ON matrix_ontology_main', []);
			await sql.unsafe('DROP FUNCTION IF EXISTS zzmnt_refuse_fn()', []);
		}
	}, 60_000);

	test('two concurrent ensureMainSection calls for one TLD mint exactly one row', async () => {
		const [a, b] = await Promise.all([
			ensureMainSection({ tld: RACE_TLD }),
			ensureMainSection({ tld: RACE_TLD }),
		]);
		expect(await rowsNamed(RACE_TLD)).toBe(1);
		expect(a.sectionId).toBe(b.sectionId);
		expect([a.created, b.created].sort()).toEqual([false, true]);
		await sweep();
	}, 60_000);
});
