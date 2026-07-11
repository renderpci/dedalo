/**
 * CONFIG-CENSUS TRIPWIRE (DEC-12: every documented invariant has a mechanical gate).
 *
 * Three sets must agree, or the config story is a lie somewhere:
 *
 *   A. the env keys the engine ACTUALLY READS  (scanned from src/)
 *   B. the keys the v6→v7 migration knows about (`migration_map.ts`:
 *      the non-DROPPED targets of V6_MIGRATION, plus NEW_IN_V7)
 *   C. every constant a real v6 install can set  (the vendored fixture)
 *
 * A == B  ⇒ the migration can never promise a key the engine ignores, and a new
 *           key cannot be added to the engine without being classified (which is
 *           also the moment it gets documented).
 * C ⊆ map ⇒ no legacy constant is silently dropped on the floor: every one is
 *           classified, DROPPED entries carrying an explicit reason.
 *
 * The fixture is VENDORED (test/fixtures/v6_config/) rather than read from the
 * sibling v6 checkout: a gate that depends on a directory outside the repo is a
 * gate that passes vacuously in CI. It is a byte copy of v6's shipped
 * sample.config.php + siblings — i.e. exactly what `cp sample.config.php
 * config.php` gives a real install.
 *
 * NOTE `../private/sample.env` is the operator-facing census, but it lives
 * OUTSIDE the repo, so it cannot be gated here. `migration_map.ts` is therefore
 * the in-repo source of truth, and sample.env is documentation generated from the
 * same knowledge.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { NEW_IN_V7, V6_MIGRATION } from '../../src/config/migration_map.ts';
import { extractDefines } from '../../src/config/php_defines.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const FIXTURE_DIR = join(REPO_ROOT, 'test', 'fixtures', 'v6_config');

/**
 * Uppercase-snake string literals passed as the first argument of ANY call in
 * src/. That deliberately over-collects (it catches keys read through wrappers
 * like `bin('DEDALO_AV_FFMPEG_PATH', …)`, which a `readEnv\(`-only regex misses)
 * and the few non-env literals it sweeps up are named below.
 */
const KEY_CALL = /[a-zA-Z_]\w*\s*\(\s*'([A-Z][A-Z0-9_]{2,})'/g;

/** Uppercase-snake literals in src/ that are NOT env keys. */
const NOT_ENV_KEYS = new Set([
	'GMT', // date formatting
	'NFD', // unicode normalization form
	'SIGINT', // signal names
	'SIGTERM',
]);

function envKeysReadInSrc(): Set<string> {
	const keys = new Set<string>();
	for (const file of new Glob('src/**/*.ts').scanSync(REPO_ROOT)) {
		const source = readFileSync(join(REPO_ROOT, file), 'utf8');
		for (const match of source.matchAll(KEY_CALL)) {
			const key = match[1] as string;
			if (!NOT_ENV_KEYS.has(key)) keys.add(key);
		}
	}
	return keys;
}

/** Every key the migration map believes the engine reads. */
function keysTheMapKnows(): Set<string> {
	const keys = new Set<string>(NEW_IN_V7);
	for (const rule of Object.values(V6_MIGRATION)) {
		if (rule.cls !== 'DROPPED' && rule.target !== undefined) keys.add(rule.target);
	}
	return keys;
}

describe('config census: the engine, the migration map, and v6 agree', () => {
	test('every key the engine READS is classified in migration_map.ts', () => {
		const read = envKeysReadInSrc();
		const known = keysTheMapKnows();
		const unclassified = [...read].filter((k) => !known.has(k)).sort();

		// A key the engine reads but the map has never heard of: the migration would
		// silently fail to carry it, and the docs would never mention it.
		expect(unclassified).toEqual([]);
	});

	test('migration_map.ts never targets a key the engine does NOT read', () => {
		const read = envKeysReadInSrc();
		const known = keysTheMapKnows();
		const phantom = [...known].filter((k) => !read.has(k)).sort();

		// A target nothing reads = the migration writes a dead line and the docs
		// promise a setting that does nothing (this is how DEDALO_DIFFUSION_DB_NAME
		// was caught).
		expect(phantom).toEqual([]);
	});

	test('every constant a real v6 install can set is CLASSIFIED', () => {
		const files = ['config.php', 'config_db.php', 'config_areas.php', 'config_core.php'].map(
			(name) => ({ path: name, content: readFileSync(join(FIXTURE_DIR, name), 'utf8') }),
		);
		const extracted = extractDefines(files);
		expect(extracted.records.size).toBeGreaterThan(150); // the fixture really parsed

		const unknown = [...extracted.records.keys()].filter((n) => !(n in V6_MIGRATION)).sort();
		expect(unknown).toEqual([]);

		// A commented-out define is still a setting the operator may enable — it must
		// be classified too, or enabling it silently loses the value on migration.
		const unknownCommented = extracted.commentedOut.filter((n) => !(n in V6_MIGRATION)).sort();
		expect(unknownCommented).toEqual([]);
	});

	test('every DROPPED constant says WHY (the report prints the reason verbatim)', () => {
		const reasonless = Object.entries(V6_MIGRATION)
			.filter(([, rule]) => rule.cls === 'DROPPED' && (rule.reason ?? '').trim() === '')
			.map(([name]) => name)
			.sort();
		expect(reasonless).toEqual([]);
	});

	test('a RENAMED source is never also emitted — that would refuse the boot', () => {
		// RETIRED_ENV_KEYS makes config.ts throw when the old spelling is present and
		// the new one is not. The map must therefore never TARGET a retired name.
		const targets = keysTheMapKnows();
		const retiredTargets = Object.entries(V6_MIGRATION)
			.filter(([name, rule]) => rule.cls === 'RENAMED' && targets.has(name))
			.map(([name]) => name);
		expect(retiredTargets).toEqual([]);
	});
});
