/**
 * export_hierarchy — the manifest's streamed certify pass ALWAYS SETTLES, even when
 * the data file's SOURCE stream fails (W4 cross-authz_read:r2, review-diff S3).
 *
 * `hierarchy.json` certifies every listed dump in ONE streamed pass
 * (digestAndCompleteness → gzipRowCount: the file piped through gunzip, read to its
 * end). `Readable.pipe()` does not forward a SOURCE error: a dump that vanished
 * between the census and the certify pass (or that cannot be read) made the read
 * stream emit 'error' into nothing, gunzip never ended, and the maintenance action
 * waited for ever. gzipRowCount forwards the source error into gunzip, so the
 * pass reads it as "not a complete gzip stream" and the manifest is refused.
 *
 * OUTCOMES (a mkdtemp directory; no database):
 *   G1 a source whose file does not exist (the vanished dump) settles — null, not
 *      a hang (bounded: a hang reads as 'STILL RUNNING');
 *   G2 a source that is a DIRECTORY (EISDIR on read — unreadable as root too) settles null;
 *   G3 control: a whole gzip stream counts its rows; a torn one is null.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { createReadStream, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { gzipRowCount } from '../../src/core/area_maintenance/widgets/export_hierarchy.ts';

const dir = mkdtempSync(join(tmpdir(), 'dd_export_gzip_count_'));
const SETTLE_BOUND_MS = 5_000;

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** The count, or 'STILL RUNNING' when it has not settled by the bound. */
async function countWithin(path: string): Promise<number | null | 'STILL RUNNING'> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const bound = new Promise<'STILL RUNNING'>((resolve) => {
		timer = setTimeout(() => resolve('STILL RUNNING'), SETTLE_BOUND_MS);
	});
	try {
		return await Promise.race([gzipRowCount(createReadStream(path)), bound]);
	} finally {
		clearTimeout(timer);
	}
}

describe('the certify pass settles whatever the source stream does', () => {
	test('G1 a vanished data file: null, never a hang', async () => {
		expect(await countWithin(join(dir, 'zzgc1.copy.gz'))).toBeNull();
	});

	test('G2 an unreadable data file (a directory at its name): null, never a hang', async () => {
		const path = join(dir, 'zzgc2.copy.gz');
		mkdirSync(path);
		expect(await countWithin(path)).toBeNull();
	});

	test('G3 control: a whole stream counts its rows; a torn one is null', async () => {
		const whole = gzipSync(Buffer.from('1\tzzgc1\n2\tzzgc1\n3\tzzgc1\n'));
		writeFileSync(join(dir, 'whole.copy.gz'), whole);
		writeFileSync(join(dir, 'torn.copy.gz'), whole.subarray(0, whole.byteLength - 10));
		expect(await countWithin(join(dir, 'whole.copy.gz'))).toBe(3);
		expect(await countWithin(join(dir, 'torn.copy.gz'))).toBeNull();
	});
});
