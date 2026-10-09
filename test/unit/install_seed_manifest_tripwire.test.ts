/**
 * TRIPWIRE — the committed install seed is the one the compiler wrote, from the
 * sources in this checkout (2026-10-09).
 *
 * install/db/dedalo_install.pgsql.gz is a binary blob every fresh install
 * restores. Before this gate nothing tied it to anything: it was hand-patched,
 * then rebuilt from whatever database a button was pressed in (one such build
 * shipped a 2022 data typo that broke every fresh install). It is now COMPILED
 * from repo sources (src/core/install/seed_build.ts) and its manifest
 * (install/db/dedalo_install.manifest.json, seed_manifest.ts) records the seed's
 * sha256, its content digest and row counts, and a sha256 per source file.
 *
 * RED when: the seed is not the file the compiler wrote; its content or row
 * counts differ from the manifest; a source file changed, appeared (a new
 * migration) or vanished since the compile (STALE — run `bun run seed:build`);
 * the compiler's declared rules changed; the engine version moved.
 *
 * HERMETIC: two files and the sources, no database. Planted controls prove
 * every finding fires.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { projectRoot } from '../../src/config/env.ts';
import { SEED_DUMP_PATH, SEED_MANIFEST_PATH } from '../../src/core/install/paths.ts';
import {
	copyRowCounts,
	manifestFindings,
	observeCommittedSeed,
	type SeedManifest,
	type SeedObservation,
	seedContentDigest,
	seedSourceFiles,
} from '../../src/core/install/seed_manifest.ts';
import {
	ONTOLOGY_RELEASE_DIR,
	SEED_LANGS_PATH,
	SEED_ONTOLOGY_TLDS,
	SEED_REGISTRY_PATH,
	SEED_SCAFFOLD_PATH,
	SEED_SCHEMA_PATH,
} from '../../src/core/install/seed_sources.ts';

const manifest = (): SeedManifest =>
	JSON.parse(readFileSync(SEED_MANIFEST_PATH, 'utf8')) as SeedManifest;

describe('install seed manifest tripwire', () => {
	test('the manifest is vendored next to the seed', () => {
		expect(existsSync(SEED_DUMP_PATH)).toBe(true);
		expect(existsSync(SEED_MANIFEST_PATH), 'run `bun run seed:build`').toBe(true);
	});

	test('the committed seed agrees with its manifest and with the sources (no finding)', async () => {
		expect(manifestFindings(manifest(), await observeCommittedSeed(SEED_DUMP_PATH))).toEqual([]);
	});

	test('the manifest names every source the compiler reads (anti-vacuity)', () => {
		const files = seedSourceFiles();
		expect(files.length).toBeGreaterThan(20);
		// Derived from the compiler's own declarations — never a hand list of paths.
		const expected = [
			SEED_SCHEMA_PATH,
			SEED_LANGS_PATH,
			SEED_REGISTRY_PATH,
			SEED_SCAFFOLD_PATH,
			join(ONTOLOGY_RELEASE_DIR, 'ontology.json'),
			...SEED_ONTOLOGY_TLDS.map((tld) => join(ONTOLOGY_RELEASE_DIR, `${tld}.copy.gz`)),
		].map((path) => relative(projectRoot, path));
		for (const file of expected) expect(files).toContain(file);
		expect(files.some((file) => file.startsWith('install/db/migrations/'))).toBe(true);
		expect(Object.keys(manifest().sources).length).toBe(files.length);
	});

	test('planted: every disagreement is a finding', () => {
		const base = manifest();
		const observed: SeedObservation = {
			seedSha256: base.seed.sha256,
			contentSha256: base.seed.content_sha256,
			tables: base.tables,
			sources: base.sources,
			rulesDigest: base.rules_digest,
			engineVersion: base.engine_version,
		};
		expect(manifestFindings(base, observed)).toEqual([]);
		const [firstSource = ''] = Object.keys(base.sources);
		const { [firstSource]: _gone, ...withoutFirst } = base.sources;
		const cases: [Partial<SeedObservation>, RegExp][] = [
			[{ seedSha256: 'x' }, /not the one the compiler wrote/],
			[{ contentSha256: 'x' }, /content differs/],
			[{ tables: { ...base.tables, matrix: 1 } }, /row counts differ/],
			[{ sources: { ...base.sources, [firstSource]: 'x' } }, /STALE: source .* changed/],
			[
				{ sources: { ...base.sources, 'install/db/migrations/9999_new.sql': 'x' } },
				/STALE: source .* newer/,
			],
			[{ sources: withoutFirst }, /STALE: source .* gone/],
			[{ rulesDigest: 'x' }, /compiler rules changed/],
			[{ engineVersion: '9.9.9' }, /compiled for/],
		];
		for (const [mutation, finding] of cases) {
			const findings = manifestFindings(base, { ...observed, ...mutation });
			expect(findings.length, JSON.stringify(mutation)).toBe(1);
			expect(findings[0]).toMatch(finding);
		}
	});

	test('planted: the content digest ignores only pg_dump per-run noise; row counts read COPY blocks', () => {
		const dump = [
			'\\restrict AbC',
			'-- Dumped from database version 18.4',
			'-- Started on 2026-10-09',
			'COPY public.matrix_users (id, data) FROM stdin;',
			'1\t{}',
			'\\.',
			'COPY public.matrix (id) FROM stdin;',
			'\\.',
			'\\unrestrict AbC',
		].join('\n');
		const noise = dump
			.replace('AbC', 'XyZ')
			.replace('2026-10-09', '2027-01-01')
			.replace('18.4', '19.0');
		expect(seedContentDigest(noise)).toBe(seedContentDigest(dump));
		expect(seedContentDigest(dump.replace('1\t{}', '1\t{"a":1}'))).not.toBe(
			seedContentDigest(dump),
		);
		expect(copyRowCounts(dump)).toEqual({ matrix: 0, matrix_users: 1 });
	});
});
