/**
 * THE FAIL-CLOSED MEDIA DEFAULT (2026-08-24, `WC-2026-08-24-media-protection-default-closed`).
 *
 * Until this landed, an install that configured no media access mode served its entire
 * media tree to anyone who could guess a URL — unpublished records, master-quality
 * originals, rights-restricted material — and `resolveModeSource()` reported that state
 * in those exact words: "default — no media protection configured (media is
 * world-readable)". The behaviour was documented, and documented is not defended.
 *
 * What this gate holds is not just "the default is on". A fail-closed default is easy;
 * a fail-closed default that does not BRICK the installs it protects is the actual
 * requirement, and it has three parts, each of which is a way this change could have
 * shipped as an outage instead of a fix:
 *
 *  1. the default is 'publication', not 'private' — identical on a fresh install, but
 *     'private' would later 404 the archive's OWN published site;
 *  2. an explicit `false` on either key is still honoured — an operator who chose an
 *     open tree chose it; what is refused is silence;
 *  3. the DEFAULT source degrades where an explicit mode fails loud: a login must not
 *     fail because MEDIA_PATH is unset, and an install with no web server in front of
 *     its media must still show its editors their images.
 *
 * `readMediaAccessMode` is exercised directly because `config` is a frozen module-level
 * const evaluated once at import — a test that set the env and re-read `config` would
 * assert nothing.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { readMediaAccessMode } from '../../src/config/readers.ts';
import { resolveModeSource } from '../../src/core/media/protection.ts';

const KEYS = ['DEDALO_MEDIA_ACCESS_MODE', 'DEDALO_PROTECT_MEDIA_FILES'] as const;
const SAVED = new Map<string, string | undefined>(KEYS.map((k) => [k, process.env[k]]));

/**
 * Set the two keys, spelling ABSENCE as the empty string rather than `delete`.
 *
 * That is not a shortcut: `readEnv` merges `process.env` OVER the parsed
 * `../private/.env`, and this checkout's private file really does set
 * DEDALO_MEDIA_ACCESS_MODE. Deleting from `process.env` therefore uncovers the file
 * value instead of unsetting the key, and every "nothing is configured" assertion below
 * would silently be testing this developer's own configuration. The empty string is
 * exactly how the reader spells absence (an append-only .env accumulates empty keys),
 * so it is the honest way to express "no decision" from a test.
 */
function setKeys(values: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
	for (const key of KEYS) {
		process.env[key] = values[key] ?? '';
	}
}

afterEach(() => {
	for (const [key, value] of SAVED) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe('media protection: the default is fail-closed', () => {
	test('NOTHING configured resolves to publication, not off', () => {
		setKeys({});
		expect(readMediaAccessMode()).toBe('publication');
	});

	test('an empty value is still nothing configured', () => {
		// An append-only .env accumulates empty keys; an empty string is absence,
		// not a decision.
		setKeys({ DEDALO_MEDIA_ACCESS_MODE: '' });
		expect(readMediaAccessMode()).toBe('publication');
	});

	test('a TYPO fails closed rather than opening the tree', () => {
		// 'privat'/'public' used to coerce to OFF: a misspelling published the archive.
		setKeys({ DEDALO_MEDIA_ACCESS_MODE: 'privat' });
		expect(readMediaAccessMode()).toBe('publication');
	});

	test('an explicit opt-out is honoured on either key', () => {
		// An operator who deliberately serves an open tree said so. Silence is what
		// this change refuses, not choice.
		for (const spelling of ['false', 'off', '0']) {
			setKeys({ DEDALO_MEDIA_ACCESS_MODE: spelling });
			expect(readMediaAccessMode()).toBe(false);
		}
		setKeys({ DEDALO_PROTECT_MEDIA_FILES: 'false' });
		expect(readMediaAccessMode()).toBe(false);
	});

	test('the legacy protect flag still means private', () => {
		setKeys({ DEDALO_PROTECT_MEDIA_FILES: 'true' });
		expect(readMediaAccessMode()).toBe('private');
	});

	test('an explicit mode always wins over the default', () => {
		setKeys({ DEDALO_MEDIA_ACCESS_MODE: 'private' });
		expect(readMediaAccessMode()).toBe('private');
		setKeys({ DEDALO_MEDIA_ACCESS_MODE: 'publication' });
		expect(readMediaAccessMode()).toBe('publication');
	});

	test('the mode source no longer describes the default as world-readable', () => {
		// The old string is the finding, quoted. If it ever comes back, so has the hole.
		expect(resolveModeSource()).not.toContain('world-readable');
	});
});
