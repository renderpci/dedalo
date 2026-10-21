/**
 * THE REGISTRY-ROW MINT NAMES ONE TLD — the lock key, the "no row names this
 * tld" check and the row's own hierarchy6 value are the SAME normalized tld
 * (cross-write:r3, review of b095553e22..ffc2a8479b, S3).
 *
 * THE DEFECT. mintMainSection took the per-tld mint lock on the RAW tld and
 * wrote the RAW tld into the row, while the existence check under the lock
 * (getOntologyMainFromTld) normalizes (trim + lowercase + grammar). A mint of
 * `ZZmnn` locked `ZZmnn`, found no `zzmnn` row and wrote a row naming `ZZmnn` —
 * a row no lookup of its own tld ever finds; a later mint of `zzmnn` then found
 * nothing either and minted a SECOND row: two registry rows for one tld, the
 * very thing the lock exists to make impossible.
 *
 * THE OUTCOMES PINNED:
 *   - a mint of `ZZmnn` writes a row that the lookup of `zzmnn` finds, naming
 *     `zzmnn` (the normalized form) — and a second mint of `zzmnn` is refused
 *     (`refuse`) / answered with the same row (`keep`): ONE row;
 *   - a tld that is not a tld after normalization is refused (a typed
 *     `request.invalid`, never an untyped throw) before anything is minted.
 *
 * Scratch: matrix_ontology_main rows above the id watermark (+ their TM and
 * activity rows), asserted gone. assertTestDatabase before the first write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { ONTOLOGY_MAIN_SECTION } from '../../src/core/ontology/ontology_tipos.ts';
import {
	createMainSection,
	ensureMainSection,
	getOntologyMainFromTld,
} from '../../src/core/ontology/ontology_write.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { countActivityRows, sweepActivityRows } from '../helpers/activity_rows.ts';
import { refusalOf } from '../helpers/refusal.ts';

const TLD = 'zzmnn';
let watermark = 0;

async function maxRegistryId(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT COALESCE(max(section_id), 0)::int AS n FROM matrix_ontology_main WHERE section_tipo = $1`,
		[ONTOLOGY_MAIN_SECTION],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? 0);
}

/** Registry rows above the watermark (this file's), with their stored hierarchy6 value. */
async function mintedRows(): Promise<{ id: number; tld: string | null }[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id AS id, string->'hierarchy6'->0->>'value' AS tld FROM matrix_ontology_main
		 WHERE section_tipo = $1 AND section_id > $2 ORDER BY section_id`,
		[ONTOLOGY_MAIN_SECTION, watermark],
	)) as { id: number; tld: string | null }[];
	return rows.map((row) => ({ id: Number(row.id), tld: row.tld }));
}

const ids: number[] = [];

async function sweep(): Promise<void> {
	for (const row of await mintedRows()) ids.push(row.id);
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id > $2`, [
		ONTOLOGY_MAIN_SECTION,
		watermark,
	]);
	await sql.unsafe(`DELETE FROM matrix_ontology_main WHERE section_tipo = $1 AND section_id > $2`, [
		ONTOLOGY_MAIN_SECTION,
		watermark,
	]);
	await sweepActivityRows(ONTOLOGY_MAIN_SECTION, ids);
}

beforeAll(async () => {
	await assertTestDatabase('ontology_registry_mint_tld_normalized_native');
	expect(await getOntologyMainFromTld(TLD)).toBeNull();
	watermark = await maxRegistryId();
});

afterAll(async () => {
	await sweep();
	expect(await maxRegistryId()).toBe(watermark);
	expect(await countActivityRows(ONTOLOGY_MAIN_SECTION, ids)).toBe(0);
});

describe('the mint normalizes its tld once: lock, check and row agree', () => {
	test('a mint of an unnormalized spelling names the tld; a second mint finds it', async () => {
		// The target section stated, as a definition may: the only input that kept
		// an unnormalized tld from tripping mapTldToTargetSectionTipo's own grammar.
		const first = await createMainSection({ tld: ' ZZmnn ', section_tipo: `${TLD}0` });
		// The row is found by the tld it was minted for, and names it normalized.
		expect((await getOntologyMainFromTld(TLD))?.section_id).toBe(first);
		expect(await mintedRows()).toEqual([{ id: first, tld: TLD }]);
		// ONE row per tld: refused by createMainSection, answered by ensureMainSection.
		const refusal = await refusalOf(createMainSection({ tld: TLD }));
		expect(refusal.code).toBe('internal.invariant');
		expect(await ensureMainSection({ tld: 'ZZMNN' })).toEqual({ sectionId: first, created: false });
		expect((await mintedRows()).length).toBe(1);
	}, 60_000);

	test('a tld that is not one after normalization is refused before any mint', async () => {
		const before = await maxRegistryId();
		const refusal = await refusalOf(createMainSection({ tld: 'zz mnn', section_tipo: `${TLD}0` }));
		expect(refusal.code).toBe('request.invalid');
		expect(await maxRegistryId()).toBe(before);
	}, 60_000);
});
