/**
 * Tier-1 backlog gate — `existingReleaseVersions` (coverage plan §4.1.9;
 * code_manifest.ts, population-B member). It is what the build panel shows an
 * operator as "already built": the <major>/<major.minor>/<triple>.zip layout,
 * flattened to sorted version strings.
 *
 * Operator-visible failure it prevents: a loose file where a version directory
 * is expected (a stray .DS_Store, a downloaded zip dropped at the top level)
 * must be SKIPPED — without the isDirectory guards the panel either throws
 * (ENOTDIR on readdir) or advertises a release that does not exist, and the
 * operator builds over, or tries to ship, a version that was never made.
 *
 * Filesystem scratch only: an mkdtemp under the OS temp dir, removed in afterAll.
 * No DB, no repo write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existingReleaseVersions } from '../../src/core/update/code_manifest.ts';

let dir = '';

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'zzbk_releases_'));
	// Two majors, one with two minors — deliberately created OUT of sorted order.
	mkdirSync(join(dir, '8/8.1'), { recursive: true });
	mkdirSync(join(dir, '7/7.10'), { recursive: true });
	mkdirSync(join(dir, '7/7.2'), { recursive: true });
	writeFileSync(join(dir, '8/8.1/8.1.0.zip'), 'z');
	writeFileSync(join(dir, '7/7.10/7.10.1.zip'), 'z');
	writeFileSync(join(dir, '7/7.2/7.2.5.zip'), 'z');
	// Noise that must be ignored at every level.
	writeFileSync(join(dir, 'stray.zip'), 'z'); // a FILE where a major dir is expected
	writeFileSync(join(dir, '7/notes.txt'), 'x'); // a FILE where a minor dir is expected
	writeFileSync(join(dir, '7/7.2/README.md'), 'x'); // a non-zip inside a release dir
});

afterAll(() => {
	if (dir !== '') rmSync(dir, { recursive: true, force: true });
});

describe('existingReleaseVersions (§4.1.9)', () => {
	test('absent or non-existent dir yields no versions (never a throw)', () => {
		expect(existingReleaseVersions(undefined)).toEqual([]);
		expect(existingReleaseVersions(join(dir, 'nope_zzbk'))).toEqual([]);
	});

	test('walks <major>/<major.minor>/<triple>.zip and returns SORTED version strings', () => {
		// String sort (documented behaviour, not semver): '7.10.1' precedes '7.2.5'.
		expect(existingReleaseVersions(dir)).toEqual(['7.10.1', '7.2.5', '8.1.0']);
	});

	test('files where directories are expected, and non-zip files, are skipped', () => {
		const versions = existingReleaseVersions(dir);
		expect(versions).not.toContain('stray');
		expect(versions).not.toContain('notes');
		expect(versions.some((v) => v.includes('README'))).toBe(false);
	});

	// DROPPED AS VACUOUS: "an existing but EMPTY release tree yields []". No
	// single-line production mutation distinguishes it from the absent-dir case
	// above (the loops simply have nothing to iterate), so the assertion passes
	// on every regression it could name. Covering it would move a percentage and
	// gate nothing — plan §5.
});
