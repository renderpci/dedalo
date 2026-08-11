/**
 * `pgDumpCandidates` — the pg_dump probe ORDER extracted out of
 * `resolvePgDump` (plan §4.1.7).
 *
 * The order is the whole contract. A pg_dump older than the server refuses to
 * dump, so the probe must be NEWEST-FIRST: on a machine carrying pg15 and
 * pg19, picking pg15 makes every backup fail silently into a `.log` nobody
 * reads (audit S2-35's failure mode). A newly released major belongs at the
 * FRONT of the version list, never appended to the end.
 *
 * `resolvePgDump()` itself is not driven and `existsSync` is NOT mocked: this
 * suite has a documented `mock.module` cross-file leak problem, and mocking
 * the filesystem to assert an order is theatre when the order is a pure list.
 */

import { describe, expect, test } from 'bun:test';
import { pgDumpCandidates } from '../../src/core/area_maintenance/backup.ts';

const SOURCE_FILE = `${import.meta.dir}/../../src/core/area_maintenance/backup.ts`;

describe('pgDumpCandidates — the probe order', () => {
	test('with a configured bin dir the sequence is exactly declared → 18,17,16,15 → PATH', () => {
		expect(pgDumpCandidates('/usr/local/pgsql/bin')).toEqual([
			'/usr/local/pgsql/bin/pg_dump',
			'/opt/homebrew/opt/postgresql@18/bin/pg_dump',
			'/opt/homebrew/opt/postgresql@17/bin/pg_dump',
			'/opt/homebrew/opt/postgresql@16/bin/pg_dump',
			'/opt/homebrew/opt/postgresql@15/bin/pg_dump',
			'pg_dump',
		]);
	});

	test('the version probes are strictly DESCENDING', () => {
		// Stated as an order property too, so a reshuffle that keeps the same
		// set (the ascending regression) cannot pass by re-listing members.
		const versions = pgDumpCandidates('')
			.map((candidate) => /postgresql@(\d+)/.exec(candidate)?.[1])
			.filter((version): version is string => version !== undefined)
			.map(Number);
		expect(versions.length).toBeGreaterThanOrEqual(4);
		for (let index = 1; index < versions.length; index++) {
			expect(versions[index] as number).toBeLessThan(versions[index - 1] as number);
		}
	});

	test('the configured directory always wins — it is FIRST, before any version probe', () => {
		expect(pgDumpCandidates('/opt/pg/bin')[0]).toBe('/opt/pg/bin/pg_dump');
	});

	test('the bare PATH fallback is always LAST and always present', () => {
		for (const declared of ['/opt/pg/bin', '', undefined, null, 42]) {
			const candidates = pgDumpCandidates(declared);
			expect(candidates[candidates.length - 1]).toBe('pg_dump');
			expect(candidates.filter((entry) => entry === 'pg_dump').length).toBe(1);
		}
	});

	test('an unset / empty / non-string bin dir contributes NO candidate', () => {
		const versionsOnly = [
			'/opt/homebrew/opt/postgresql@18/bin/pg_dump',
			'/opt/homebrew/opt/postgresql@17/bin/pg_dump',
			'/opt/homebrew/opt/postgresql@16/bin/pg_dump',
			'/opt/homebrew/opt/postgresql@15/bin/pg_dump',
			'pg_dump',
		];
		// `typeof declared === 'string' && declared !== ''`, not truthiness on an
		// unknown: a non-string config value must not be join()'d into a path.
		expect(pgDumpCandidates('')).toEqual(versionsOnly);
		expect(pgDumpCandidates(undefined)).toEqual(versionsOnly);
		expect(pgDumpCandidates(null)).toEqual(versionsOnly);
		expect(pgDumpCandidates(42)).toEqual(versionsOnly);
	});

	test('the declared directory is joined, not concatenated (trailing slash tolerated)', () => {
		expect(pgDumpCandidates('/opt/pg/bin/')[0]).toBe('/opt/pg/bin/pg_dump');
	});
});

describe('the extraction is REWIRED, not duplicated', () => {
	test('resolvePgDump probes the extracted list and holds no inline copy', async () => {
		const source = await Bun.file(SOURCE_FILE).text();
		const body = source.slice(
			source.indexOf('export function resolvePgDump'),
			source.indexOf('export function pgDumpCandidates'),
		);
		expect(body).not.toBe('');
		expect(body).toContain('pgDumpCandidates(config.ops.pgBinPath)');
		// the inline probe loop and the inline join are gone from the resolver
		expect(body).not.toContain('for (const version of [18, 17, 16, 15])');
		expect(body).not.toContain("join(declared, 'pg_dump')");
		// each survives EXACTLY ONCE in the file — inside the extraction
		expect(source.split('for (const version of [18, 17, 16, 15])').length - 1).toBe(1);
		expect(source.split('postgresql@${version}').length - 1).toBe(1);
	});

	test('the extraction touches no filesystem — the probe stays in the caller', async () => {
		const source = await Bun.file(SOURCE_FILE).text();
		const body = source.slice(
			source.indexOf('export function pgDumpCandidates'),
			source.indexOf('export function getBackupFiles'),
		);
		expect(body).not.toBe('');
		expect(body).not.toContain('existsSync');
	});
});
