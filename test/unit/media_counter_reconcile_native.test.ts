/**
 * THE MEDIA TREE REMEMBERS AN ID THE DATABASE DOES NOT (P0-14 / LIFE-01).
 *
 * A `pg_restore` to backup instant T0 rolls `matrix_counter` back WITH the data,
 * while the media filesystem keeps every file written up to the disaster at T1.
 * The counter half of P0-14 widened the allocator's floor to the live rows plus
 * the time-machine witness — and neither sees this, because a restore rolls BOTH
 * back together. Only the disk remembers.
 *
 * Media identity is exactly `{component_tipo}_{section_tipo}_{section_id}`, so
 * the re-minted ids key straight into the dead records' files: `component_av`
 * re-derives `files_info` from disk and plays the dead object's derivatives, and
 * `tool_update_cache` / `media_repair_files_info --apply` then PERSIST the wrong
 * attachment. No collision fires — the rows are gone — so the allocator's
 * self-heal cannot see it either.
 *
 * These gates build that exact disagreement in a scratch media root: files whose
 * names carry ids the database has no row and no history for.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { insertMatrixRecordWithCounter } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	reconcileCountersWithMedia,
	scanMediaSectionIds,
} from '../../src/core/media/counter_reconcile.ts';
import { resetMediaRoot, scratchMediaRoot } from '../helpers/media_scratch_root.ts';
import { cleanScratchTipo } from '../helpers/test_data.ts';

const TLD = 'zzmed';
const TIPO = `${TLD}1`;
const COMPONENT = `${TLD}2`;
const TABLE = 'matrix_test';
/** dd_ontology node of model 'matrix_table' whose term is `matrix_test`. */
const MATRIX_TEST_RELATION = 'test24';

let ROOT = '';

/** A media file named exactly as the engine would name it. */
function putMediaFile(sectionId: number, quality = 'original', extension = 'jpg'): string {
	const dir = join(ROOT, 'test_media', quality);
	mkdirSync(dir, { recursive: true });
	const name = `${COMPONENT}_${TIPO}_${sectionId}.${extension}`;
	writeFileSync(join(dir, name), 'not really an image');
	return name;
}

async function counterValue(): Promise<number | null> {
	const rows = (await sql`SELECT value FROM matrix_counter WHERE tipo = ${TIPO}`) as {
		value: number;
	}[];
	return rows[0] === undefined ? null : Number(rows[0].value);
}

describe('post-restore counter reconcile against the media tree', () => {
	beforeAll(async () => {
		await deleteTldNodes(TLD);
		await upsertDdOntologyNode({
			tipo: TIPO,
			model: 'section',
			tld: TLD,
			term: { 'lg-eng': 'Media reconcile scratch section' },
			properties: {},
			relations: [{ tipo: MATRIX_TEST_RELATION }],
		});
	});

	beforeEach(async () => {
		await cleanScratchTipo(TIPO, TABLE);
		ROOT = resetMediaRoot(ROOT === '' ? scratchMediaRoot('dedalo_counter_reconcile_') : ROOT);
	});

	afterAll(async () => {
		await cleanScratchTipo(TIPO, TABLE);
		await deleteTldNodes(TLD);
		if (ROOT !== '') rmSync(ROOT, { recursive: true, force: true });
	});

	test('the scan recovers the identity a file name carries', async () => {
		putMediaFile(7);
		putMediaFile(41);
		putMediaFile(12);
		// A file that is not a media identifier at all must not become evidence.
		mkdirSync(join(ROOT, 'test_media', 'original'), { recursive: true });
		writeFileSync(join(ROOT, 'test_media', 'original', 'notes.txt'), 'x');

		const { witnesses, filesScanned } = await scanMediaSectionIds(ROOT);
		expect(filesScanned).toBeGreaterThanOrEqual(4);
		expect(witnesses.get(TIPO)?.maxSectionId).toBe(41);
	});

	test('THE RESTORE CASE: the disk names an id the database has never heard of', async () => {
		// The restored database: three records, counter at 3.
		for (let i = 0; i < 3; i++) {
			await insertMatrixRecordWithCounter(TABLE, TIPO, {
				string: { [COMPONENT]: [{ id: 1, lang: 'lg-nolan', value: 'x' }] },
			});
		}
		expect(await counterValue()).toBe(3);

		// The media tree, which was never rolled back, still holds record 9's file.
		const witness = putMediaFile(9);

		// DRY RUN first — it must report and write nothing.
		const dry = await reconcileCountersWithMedia({ apply: false, mediaRoot: ROOT });
		const proposed = dry.raises.find((raise) => raise.sectionTipo === TIPO);
		expect(proposed?.before).toBe(3);
		expect(proposed?.after).toBe(9);
		expect(proposed?.witness).toBe(witness);
		expect(await counterValue()).toBe(3);

		// APPLY — and the next record is born clear of the orphaned files.
		await reconcileCountersWithMedia({ apply: true, mediaRoot: ROOT });
		expect(await counterValue()).toBe(9);
		const next = await insertMatrixRecordWithCounter(TABLE, TIPO, {
			string: { [COMPONENT]: [{ id: 1, lang: 'lg-nolan', value: 'y' }] },
		});
		expect(next).toBe(10);
	});

	test('it is RAISE-ONLY and idempotent', async () => {
		for (let i = 0; i < 5; i++) {
			await insertMatrixRecordWithCounter(TABLE, TIPO, {
				string: { [COMPONENT]: [{ id: 1, lang: 'lg-nolan', value: 'x' }] },
			});
		}
		// The disk knows LESS than the database — the normal state, and the one an
		// over-eager reconcile would wreck by lowering the counter to it.
		putMediaFile(2);

		const first = await reconcileCountersWithMedia({ apply: true, mediaRoot: ROOT });
		expect(first.raises.find((raise) => raise.sectionTipo === TIPO)).toBeUndefined();
		expect(await counterValue()).toBe(5);

		// Twice changes nothing.
		await reconcileCountersWithMedia({ apply: true, mediaRoot: ROOT });
		expect(await counterValue()).toBe(5);
	});
});
