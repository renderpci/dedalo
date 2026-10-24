/**
 * THE LOCKED MEDIA TRANSFORM DECIDES SYNCHRONOUSLY (cross-ops:r1, review finding
 * "files_info sweep does disk I/O inside the locked transform, which its own
 * contract forbids").
 *
 * The finding was a contract that disagreed with every caller: files_info_persist.ts
 * said "no file work ever happens under the lock", while the three doors that
 * refresh files_info (the reconcile sweep, tool_update_cache, the duplicate's clone
 * refresh) all stat the locked items' files inside it — deliberately, so the rescan
 * judges the items as they stand under the lock (repair.ts). The contract now says
 * what is true: bounded read-only stats of the locked items' own files are the ONE
 * file work allowed; nothing is awaited, nothing written to disk, nothing fetched.
 *
 * What a gate can hold of that contract at run time is its ASYNC half: a transform
 * that awaits would keep the row lock across whatever it awaits. Its "decision" is a
 * promise, which `'skip' in promise` takes for items — and the jsonb write refuses
 * that non-array (`internal.invariant`), rolling the unit back. That refusal is what
 * this gate pins: an async transform writes nothing and leaves the row free. (A
 * dedicated thenable check was tried in this round and removed: no outcome told it
 * apart from the write's own refusal — mutation-verified.)
 *
 * LEGS (scratch `zzmtc` section → matrix_test, one component_image, records made
 * at runtime):
 *  T1 an `async` transform is refused `internal.invariant`; the stored items are
 *     unchanged.
 *  T2 the refusal rolled the transaction back: the row lock is released — the next
 *     (synchronous) transform on the same row writes, at once.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	type StoredMediaItem,
	transformStoredMediaItems,
} from '../../src/core/media/tools/files_info_persist.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { countActivityRows, sweepActivityRows } from '../helpers/activity_rows.ts';

const SECTION = 'zzmtc1';
const IMAGE = 'zzmtc2';
const TABLE = 'matrix_test';

const SITUATION = situation({
	tld: 'zzmtc',
	name: 'media transform synchronous',
	nodes: [
		{ tipo: SECTION, model: 'section', parent: 'dd14' },
		{ tipo: IMAGE, model: 'component_image', parent: SECTION },
	],
});

const STORED = [{ id: 1, files_info: [{ quality: 'stored' }] }];

async function storedItems(sectionId: number): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT media->$3 AS items FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, IMAGE],
	)) as { items: unknown }[];
	return rows[0]?.items ?? null;
}

async function recordWithItems(): Promise<number> {
	const id = await createSectionRecord(SECTION, -1);
	await sql.unsafe(
		`UPDATE "${TABLE}" SET media = jsonb_build_object($3::text, $4::text::jsonb)
		  WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, IMAGE, JSON.stringify(STORED)],
	);
	return id;
}

beforeAll(async () => {
	await assertTestDatabase('media_transform_synchronous_native');
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
}, 60_000);

afterAll(async () => {
	await sql.unsafe('DELETE FROM dedalo_ts_record_generation WHERE section_tipo = $1', [SECTION]);
	await sweepActivityRows(SECTION);
	expect(await countActivityRows(SECTION), 'activity residue after the sweep').toBe(0);
	expect(await dropSituation(SITUATION), 'zzmtc residue after drop').toBe(0);
}, 60_000);

describe('transformStoredMediaItems: the decision is synchronous', () => {
	test('T1 an async transform is refused internal.invariant and writes nothing; T2 its lock is released', async () => {
		const id = await recordWithItems();
		const target = { sectionTipo: SECTION, sectionId: id, componentTipo: IMAGE };
		let ran = false;
		const asyncTransform = (async () => {
			ran = true;
			return { write: [{ id: 1, files_info: [{ quality: 'from_an_await' }] }] };
		}) as unknown as Parameters<typeof transformStoredMediaItems>[1];
		await expect(
			transformStoredMediaItems(target, asyncTransform, { lockWait: 'request' }),
		).rejects.toMatchObject({ code: 'internal.invariant' });
		expect(ran, 'the transform was never reached — the gate is vacuous').toBe(true);
		expect(await storedItems(id)).toEqual(STORED);

		// T2: rolled back, so the row is free — a synchronous transform writes at once.
		const next: StoredMediaItem[] = [{ id: 1, files_info: [{ quality: 'synchronous' }] }];
		const outcome = await transformStoredMediaItems(target, () => ({ write: next }), {
			lockWait: 'per-record',
		});
		expect(outcome.action).toBe('written');
		expect(await storedItems(id)).toEqual(next);
	}, 60_000);
});
