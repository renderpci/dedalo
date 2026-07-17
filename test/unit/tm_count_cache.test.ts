/**
 * TM bare-count cache (read_tm.ts tmReadSource.count + TM_COUNT_CACHE_TTL_MS):
 * the unscoped dd15 browse total is a full-table COUNT(*) on the append-only
 * matrix_time_machine — cached, invalidated by the section-data save event
 * (fireSaveEvent — every engine save clears it), TTL as the backstop for
 * out-of-band inserts. Scoped counts (filter_by_locators / tipo filter) are
 * NEVER cached — they are index-served and must stay exact.
 *
 * Asserted with direct scratch INSERTs (bypassing the save event on purpose —
 * that is exactly the out-of-band shape the cache may briefly hide, and what
 * fireSaveEvent must reveal immediately). Scratch rows are tagged with an
 * impossible tipo and swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { tmReadSource } from '../../src/core/resolve/read_tm.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';

const SCRATCH_TIPO = 'test999'; // impossible component tipo — the sweep key
const BARE_SQO = { section_tipo: ['dd15'], limit: 10, offset: 0 } as never;

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false;
	}
});

afterAll(async () => {
	if (!dbReady) return;
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE tipo = $1', [SCRATCH_TIPO]);
	await fireSaveEvent('test3'); // leave no stale cached total behind
});

async function insertScratchTmRow(): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_time_machine
		   (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
		 VALUES (1, 'test3', $1, 'lg-nolan', now(), -1, '"tm_count_cache scratch"'::jsonb)`,
		[SCRATCH_TIPO],
	);
}

describe('TM bare-count cache', () => {
	test('sanity: the cache is active in this environment (TTL > 0)', () => {
		// TM_COUNT_CACHE_TTL_MS=0 is the parity/exact setting; these tests assert
		// the CACHING behavior, so they require the default-on posture.
		expect(config.ops.tmCountCacheTtlMs).toBeGreaterThan(0);
	});

	test('bare count is cached until a save event fires, then exact again', async () => {
		if (!dbReady) return;
		const before = await tmReadSource.count(BARE_SQO, undefined as never);

		// Out-of-band insert: the cached total may not see it yet.
		await insertScratchTmRow();
		const cached = await tmReadSource.count(BARE_SQO, undefined as never);
		expect(cached).toBe(before);

		// Any section save invalidates; the next count recomputes and sees it.
		await fireSaveEvent('test3');
		const fresh = await tmReadSource.count(BARE_SQO, undefined as never);
		expect(fresh).toBe(before + 1);
	});

	test('scoped counts are NEVER cached (exact on every call)', async () => {
		if (!dbReady) return;
		const scopedSqo = {
			section_tipo: ['dd15'],
			filter_by_locators: [{ section_tipo: 'test3', section_id: 1, tipo: SCRATCH_TIPO }],
		} as never;
		const before = await tmReadSource.count(scopedSqo, undefined as never);
		await insertScratchTmRow();
		// No save event fired — a scoped count must still see the new row.
		const after = await tmReadSource.count(scopedSqo, undefined as never);
		expect(after).toBe(before + 1);
	});
});
