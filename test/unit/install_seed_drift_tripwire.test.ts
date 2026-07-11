/**
 * Drift tripwire — the server-side hierarchy metadata JSONs vendored under
 * install/import/hierarchy/ must stay byte-identical to the client copies under
 * client/dedalo/core/installer/ (the install engine reads the server-side copy;
 * a client re-sync must not silently diverge them). Also asserts the seed dump
 * and the offered TLDs' data files are present.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const SERVER_DIR = join(ROOT, 'install/import/hierarchy');
const CLIENT_DIR = join(ROOT, 'client/dedalo/core/installer');

const METADATA = ['hierarchies.json', 'hierarchies_typologies.json', 'hierarchies_to_install.json'];

describe('install seed drift tripwire', () => {
	for (const file of METADATA) {
		test(`${file} matches the client copy byte-for-byte`, () => {
			const server = readFileSync(join(SERVER_DIR, file));
			const client = readFileSync(join(CLIENT_DIR, file));
			expect(server.equals(client)).toBe(true);
		});
	}

	test('the seed dump is vendored', () => {
		expect(existsSync(join(ROOT, 'install/db/dedalo_install.pgsql.gz'))).toBe(true);
	});

	test('the core default-checked hierarchies have a vendored data file', () => {
		// The install_checked_default entries that ship data (fr/utoponymy are
		// legacy pre-check hints with no file even upstream — filtered by
		// context.effectiveDefaults()).
		for (const tld of ['es', 'lg', 'ts']) {
			expect(existsSync(join(SERVER_DIR, `${tld}1.copy.gz`))).toBe(true);
		}
	});
});
