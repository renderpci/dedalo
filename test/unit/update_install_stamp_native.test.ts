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
import { parseInstallStamp } from '../../src/core/update/install_stamp.ts';

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
