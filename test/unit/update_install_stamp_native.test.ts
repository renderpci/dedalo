/**
 * THE INSTALL STAMP — what a swapped code tree says about itself.
 *
 * `build_info.txt` answers "which commit was this archived from", and it is
 * `export-subst`-expanded by ANY `git archive` — a branch build included. So it
 * cannot answer either question the dev channel raises: WHICH ARCHIVE is
 * installed (a rebuild of the same commit repeats the commit sha, so the
 * commit cannot be an identity) and WHETHER THIS TREE IS A RELEASE (a `v7`
 * build would otherwise present itself, everywhere, as the published release).
 * The updater writes this stamp into the tree it swaps in; both answers come
 * from here.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
	INSTALL_STAMP_PATH,
	installedRootEntriesOf,
	parseInstallStamp,
} from '../../src/core/update/install_stamp.ts';

const DIGEST = 'c'.repeat(64);

describe('parseInstallStamp', () => {
	test('a well-formed stamp yields the digest and the channel', () => {
		const stamp = parseInstallStamp(
			JSON.stringify({
				digest: DIGEST,
				channel: 'dev',
				source_url: 'https://master.example/dedalo/install/code/7.0.1/7.0.1-dev.zip',
				installed_at: '2026-08-24T10:00:00.000Z',
			}),
		);
		expect(stamp).not.toBeNull();
		expect(stamp?.digest).toBe(DIGEST);
		expect(stamp?.channel).toBe('dev');
	});

	test('a master-channel stamp reads back as master', () => {
		const stamp = parseInstallStamp(JSON.stringify({ digest: DIGEST, channel: 'master' }));
		expect(stamp?.channel).toBe('master');
	});

	test.each([
		['not json at all', 'not json at all'],
		['an empty file', ''],
		['a non-hex digest', JSON.stringify({ digest: 'nope', channel: 'dev' })],
		['a truncated digest', JSON.stringify({ digest: 'c'.repeat(63), channel: 'dev' })],
		['a missing digest', JSON.stringify({ channel: 'dev' })],
		['an unknown channel', JSON.stringify({ digest: DIGEST, channel: 'trunk' })],
		['a missing channel', JSON.stringify({ digest: DIGEST })],
	])('%s parses to null rather than throwing', (_name, content) => {
		expect(parseInstallStamp(content)).toBeNull();
	});
});

/**
 * The ROOT LIST (2026-10-07): the next update's evidence that a live root entry
 * was release-shipped. It is trusted only whole, and its failure costs only
 * itself — the digest and channel stay.
 */
describe('root_entries', () => {
	test('a well-formed list round-trips', () => {
		const stamp = parseInstallStamp(
			JSON.stringify({ digest: DIGEST, channel: 'master', root_entries: ['.vscode', 'src'] }),
		);
		expect(stamp?.root_entries).toEqual(['.vscode', 'src']);
	});

	test('a stamp without the list still parses, with no list', () => {
		const stamp = parseInstallStamp(JSON.stringify({ digest: DIGEST, channel: 'master' }));
		expect(stamp).not.toBeNull();
		expect(stamp?.root_entries).toBeUndefined();
	});

	test.each([
		['a nested path', ['src', 'a/b']],
		['a parent reference', ['..']],
		['a dot', ['.']],
		['an empty name', ['']],
		['a backslash path', ['a\\b']],
		['a non-string item', ['src', 3]],
		['a non-array', 'src'],
	])('%s drops ONLY the list — the stamp itself survives', (_name, rootEntries) => {
		const stamp = parseInstallStamp(
			JSON.stringify({ digest: DIGEST, channel: 'master', root_entries: rootEntries }),
		);
		expect(stamp?.digest).toBe(DIGEST);
		expect(stamp?.root_entries).toBeUndefined();
	});

	test('installedRootEntriesOf reads the TREE it is given, and null without a list', () => {
		const tree = mkdtempSync(join(tmpdir(), 'dedalo_stamp_root_entries_'));
		try {
			expect(installedRootEntriesOf(tree)).toBeNull();
			const path = join(tree, INSTALL_STAMP_PATH);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, JSON.stringify({ digest: DIGEST, channel: 'master' }));
			expect(installedRootEntriesOf(tree)).toBeNull();
			writeFileSync(
				path,
				JSON.stringify({ digest: DIGEST, channel: 'master', root_entries: ['.vscode'] }),
			);
			expect([...(installedRootEntriesOf(tree) ?? [])]).toEqual(['.vscode']);
		} finally {
			rmSync(tree, { recursive: true, force: true });
		}
	});
});
