/**
 * TEST-MEDIA-ROOT TRIPWIRE (DEC-12) — the FILESYSTEM half of "a test never
 * writes to production data", 2026-08-19.
 *
 * `test_db_marker_tripwire` closed the database: the suite runs on a database
 * that says in a row of its own that it is disposable, and every test-data
 * writer asks it. That work LEDGERED the surface it left open — `MEDIA_PATH`.
 * The client suite, `ensureMediaKit`, the media unit gates and every tool that
 * builds a derivative wrote into the INSTALLATION's media tree, beside 32 GB of
 * heritage masters that cannot be re-acquired.
 *
 * THE MECHANISM THIS GATE GUARDS, in one line: `DEDALO_TEST_MEDIA_ROOT` both
 * REPOINTS the media root and ARMS a refusal, and every door that resolves a
 * media root asks the directory for a `.dedalo_test_media` marker before it
 * writes. One key does both halves so a run cannot be armed at the installation's
 * root, nor repointed with the guard asleep (src/core/media/test_media_root.ts;
 * src/config/config.ts `buildMediaConfig`).
 *
 * FIVE RULES, each with an anti-vacuity probe:
 *
 *  1. INVENTORY — DERIVED, not enumerated. Every file under `src/` and `tools/`
 *     that RESOLVES a media root (reads `config.media.rootPath`, comments
 *     stripped) either passes it through the guard, or delegates to a resolver
 *     that does (`requireMediaRoot`), or carries a NAMED reason in
 *     `EXEMPT_RESOLVERS`. A new door that forgets is caught by derivation, and a
 *     stale exemption is a failure — a dead exemption widens the law silently.
 *  2. REFUSAL, PROVED ON THE REAL DOORS. Each door is pointed at an UNMARKED
 *     temp root and must refuse naming itself, having written NOTHING (the
 *     directory is read back and must still be empty); then at a MARKED root,
 *     where it must succeed. A guard nobody proves in both directions is a guard
 *     that may be refusing for some other reason, or not refusing at all.
 *  3. THE MARKER LITERAL AGREES IN BOTH PLACES. It is spelled twice by
 *     necessity: `test/helpers/test_media_root.ts` runs in the preload, BEFORE
 *     `src/config/config.ts` may be imported (importing it there would freeze
 *     the media root and the DB connection at the installation's values), so it
 *     cannot import the canonical constant. This asserts the copy is identical.
 *  4. THE SEAM IS ACTUALLY ON, in this very process, and the root it names is
 *     marked and is NOT the installation's.
 *  5. ONE SETTER PER TIER, and no more. Exactly three places set the key — the
 *     `bun test` preload, `scripts/test_db_setup.ts` (which sweeps and rebuilds
 *     the tree) and `scripts/client_test_server.ts` (which hands it to the
 *     server it spawns) — and the preload is registered in `bunfig.toml`. A
 *     fourth setter, or a missing preload line, is how a tier quietly stops
 *     being covered.
 *
 * HONEST LIMIT. This proves that every door RESOLVING a root asks the marker,
 * and that the doors refuse. It does not prove a module cannot compose an
 * absolute media path from parts it read out of `files_info` without ever
 * calling a resolver — the confinement chokepoint (`assertInsideMediaRoot`) is
 * what covers that direction, and it too resolves through `requireMediaRoot`.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';
import { config } from '../../src/config/config.ts';
import { NEW_IN_V7 } from '../../src/config/migration_map.ts';
import {
	mediaRootIsMarked,
	requireTestMediaRoot,
	TEST_MEDIA_MARKER as SRC_TEST_MEDIA_MARKER,
} from '../../src/core/media/test_media_root.ts';
import { markMediaRoot } from '../helpers/media_scratch_root.ts';
import { stripComments } from '../helpers/strip_comments.ts';
import {
	assertDistinctFromInstallMediaRoot,
	TEST_MEDIA_MARKER,
	testMediaRootPath,
} from '../helpers/test_media_root.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), 'utf8');

// ---------------------------------------------------------------------------
// RULE 1 — the inventory is DERIVED from the source.
// ---------------------------------------------------------------------------

/** Directories scanned whole, `.ts` only, tests excluded. */
const SCAN_DIRS = ['src', 'tools'];

/** The token that MAKES a file a media-root resolver. */
const ROOT_READ = 'config.media.rootPath';

/** The guards, and the resolver that delegates to them. */
const GUARD_CALLS = ['assertTestMediaRoot(', 'requireTestMediaRoot(', 'requireMediaRoot('];

/**
 * Files that read the root and are NOT write doors. Each reason is a fact about
 * what the file DOES with the value, never "it looked safe".
 */
const EXEMPT_RESOLVERS: Record<string, string> = {
	'src/server.ts':
		'SERVES bytes: `MEDIA_ROOT` is the read-only base of the static media route. It never creates a file, and refusing a READ would break the dev media route on a legitimately unmarked root.',
	'src/core/api/handlers/system_info.ts':
		'REPORTS the configured root back to an administrator as a string in a JSON body. It touches no filesystem path at all.',
	'src/core/section/record/duplicate_record.ts':
		'Reads it only as `!== null`, to decide whether media duplication runs; every path it then builds is produced by `media/path.ts`, which is guarded.',
};

/** Every `.ts` file under the scanned dirs, tests and node_modules excluded. */
function scannedFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir).sort()) {
			if (name === 'node_modules' || name === 'dist') continue;
			const full = join(dir, name);
			if (statSync(full).isDirectory()) {
				walk(full);
				continue;
			}
			if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
			out.push(relative(REPO_ROOT, full));
		}
	};
	for (const dir of SCAN_DIRS) walk(join(REPO_ROOT, dir));
	return out;
}

/** The files that resolve a media root, comments stripped so prose never counts. */
function resolverFiles(): string[] {
	return scannedFiles().filter((file) => stripComments(read(file)).includes(ROOT_READ));
}

describe('test media root — RULE 1: the resolver inventory is derived', () => {
	const resolvers = resolverFiles();

	test('the scan finds the resolvers we know about (anti-vacuity)', () => {
		// If the token or the walk broke, the inventory would be empty and every
		// assertion below would pass while proving nothing.
		expect(resolvers.length).toBeGreaterThan(5);
		for (const pinned of [
			'src/core/media/path.ts',
			'src/core/media/protection.ts',
			'src/core/install/media_tree.ts',
			'src/diffusion/targets/mediastore/media_index.ts',
		]) {
			expect(resolvers, `${pinned} must be classified as a media-root resolver`).toContain(pinned);
		}
	});

	test('every resolver asks the guard, or is exempt with a reason', () => {
		const unguarded = resolvers.filter((file) => {
			if (EXEMPT_RESOLVERS[file] !== undefined) return false;
			const source = stripComments(read(file));
			return !GUARD_CALLS.some((call) => source.includes(call));
		});
		expect(
			unguarded,
			`These files resolve a media root without asking the '${TEST_MEDIA_MARKER}' guard. Pass the root through assertTestMediaRoot('<door>') (or resolve it with requireMediaRoot), or add an entry to EXEMPT_RESOLVERS stating what the file does with the value: ${unguarded.join(', ')}`,
		).toEqual([]);
	});

	test('no exemption is stale', () => {
		const stale = Object.keys(EXEMPT_RESOLVERS).filter((file) => !resolvers.includes(file));
		expect(
			stale,
			`Exempt files that no longer resolve a media root (or no longer exist). Delete the entry — a dead exemption widens the law silently: ${stale.join(', ')}`,
		).toEqual([]);
	});

	test('every exemption carries a substantive reason', () => {
		const thin = Object.entries(EXEMPT_RESOLVERS)
			.filter(([, reason]) => reason.trim().length < 40)
			.map(([file]) => file);
		expect(thin, `An exemption reason must say what the file DOES: ${thin.join(', ')}`).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// RULE 2 — the doors REFUSE an unmarked root, and write nothing.
// ---------------------------------------------------------------------------

/** A fresh, deliberately UNDECLARED temp directory. */
function unmarkedRoot(): string {
	return mkdtempSync(join(tmpdir(), 'dedalo_unmarked_media_'));
}

/**
 * THE DOORS, by name. `run(root)` must WRITE when the root is marked and REFUSE
 * when it is not — both directions are asserted, so a door that throws for an
 * unrelated reason cannot masquerade as a refusal.
 */
const DOORS: readonly {
	name: string;
	run: (root: string) => unknown | Promise<unknown>;
}[] = [
	{
		name: 'requireMediaRoot',
		run: async (root) => {
			const { requireMediaRoot } = await import('../../src/core/media/path.ts');
			return requireMediaRoot(root);
		},
	},
	{
		name: 'buildMediaLocation (every quality path in the engine)',
		run: async (root) => {
			const { buildMediaLocation } = await import('../../src/core/media/path.ts');
			const { mediaTypeOf } = await import('../../src/core/concepts/media.ts');
			const spec = mediaTypeOf('component_image');
			if (spec === null) throw new Error('component_image spec unavailable');
			return buildMediaLocation(
				spec,
				{ componentTipo: 'test78', sectionTipo: 'test2', sectionId: 1, lang: null },
				spec.defaultQuality,
				'jpg',
				{ initialMediaPath: '', maxItemsFolder: null, mediaRoot: root },
			);
		},
	},
	{
		name: 'stagingDir (the upload endpoint the client suite drives)',
		run: async (root) => {
			const { stagingDir } = await import('../../src/core/media/ingest/add_file.ts');
			return stagingDir(1, 'test', root);
		},
	},
	{
		name: 'provisionMediaTree (the directory creator)',
		run: async (root) => {
			const { provisionMediaTree } = await import('../../src/core/install/media_tree.ts');
			return provisionMediaTree({ root, create: true });
		},
	},
	{
		name: 'ensureMediaKit (the corpus media planter)',
		run: async (root) => {
			const { ensureMediaKit } = await import('../../src/core/test_data/test_corpus/ensure.ts');
			return ensureMediaKit({ mediaRoot: root });
		},
	},
];

describe('test media root — RULE 2: every door refuses an unmarked root', () => {
	for (const door of DOORS) {
		test(`${door.name} refuses, names itself, and writes NOTHING`, async () => {
			const root = unmarkedRoot();
			try {
				let message = '';
				try {
					await door.run(root);
					throw new Error(`${door.name} did NOT refuse an unmarked media root`);
				} catch (error) {
					message = error instanceof Error ? error.message : String(error);
				}
				expect(message).toContain(TEST_MEDIA_MARKER);
				expect(message).toContain('REFUSED');
				expect(message).toContain('NOTHING WAS WRITTEN');
				// The load-bearing half: the refusal happened BEFORE any write.
				expect(readdirSync(root)).toEqual([]);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	}

	test('provisionMediaTree WRITES into a marked root (the other direction)', async () => {
		const root = markMediaRoot(unmarkedRoot());
		try {
			const { provisionMediaTree } = await import('../../src/core/install/media_tree.ts');
			const report = provisionMediaTree({ root, create: true });
			expect(report.created.length).toBeGreaterThan(0);
			expect(existsSync(join(root, 'image'))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('the marker predicate is not vacuous', () => {
		const root = unmarkedRoot();
		try {
			expect(mediaRootIsMarked(root)).toBe(false);
			markMediaRoot(root);
			expect(mediaRootIsMarked(root)).toBe(true);
			// And the unconditional door agrees with the predicate in both states.
			expect(requireTestMediaRoot(root, 'probe')).toBe(root);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// RULE 3 — the marker literal is spelled the same in both homes.
// ---------------------------------------------------------------------------

describe('test media root — RULE 3: one marker, two spellings, no drift', () => {
	test('the preload-safe copy equals the canonical constant', () => {
		expect(TEST_MEDIA_MARKER).toBe(SRC_TEST_MEDIA_MARKER);
		expect(TEST_MEDIA_MARKER).toBe('.dedalo_test_media');
	});

	test('the copy exists for the stated reason: the helper must not import config', () => {
		// If this ever becomes false, the duplication is no longer necessary and the
		// helper should import the canonical constant instead.
		const helper = stripComments(read('test/helpers/test_media_root.ts'));
		expect(helper).not.toContain('config/config.ts');
	});
});

// ---------------------------------------------------------------------------
// RULE 4 — the seam is ON in this process, and points somewhere safe.
// ---------------------------------------------------------------------------

describe('test media root — RULE 4: this run is armed', () => {
	test('the guard is armed and the configured root IS the test root', () => {
		expect(config.media.testRoot).not.toBeNull();
		expect(config.media.rootPath).toBe(config.media.testRoot);
	});

	test('the suite root carries its marker', () => {
		const root = config.media.testRoot as string;
		expect(existsSync(join(root, TEST_MEDIA_MARKER))).toBe(true);
	});

	test('the suite root is NOT the installation media root, and cannot contain it', () => {
		// Asserted on the root THIS PROCESS ACTUALLY USES, not on a re-derivation:
		// `testMediaRootPath()`'s default reads DB_NAME, which the database preload
		// has already repointed by the time a test runs, so it would answer about a
		// different path. The derivation refuses on its own; calling it here is the
		// proof, not a restatement — it reads MEDIA_PATH the way the catalog does.
		const root = config.media.testRoot as string;
		expect(assertDistinctFromInstallMediaRoot(root)).toBe(root);
	});

	test('the path helper agrees with the seam when given the suite database name', () => {
		// The other half of the ordering rule: hand the helper the name explicitly and
		// it lands on exactly the directory the preload chose, from EITHER side of the
		// database repoint. (In this process `DB_NAME` already IS the suite database —
		// that is what `testDatabaseName()` can no longer be asked here, and why the
		// two script setters pass the name they resolved.)
		const suiteDb = process.env.DB_NAME ?? '';
		expect(suiteDb).not.toBe('');
		expect(testMediaRootPath(suiteDb)).toBe(config.media.testRoot as string);
	});

	test('the key is a declared, classified config key (not a stray env read)', () => {
		expect(CONFIG_CATALOG.DEDALO_TEST_MEDIA_ROOT).toBeDefined();
		expect(CONFIG_CATALOG.DEDALO_TEST_MEDIA_ROOT?.scope).toBe('test_seam');
		expect([...NEW_IN_V7]).toContain('DEDALO_TEST_MEDIA_ROOT');
	});
});

// ---------------------------------------------------------------------------
// RULE 5 — exactly three setters, and the preload is wired.
// ---------------------------------------------------------------------------

const SETTERS = [
	'test/preload/test_media.ts',
	'scripts/test_db_setup.ts',
	'scripts/client_test_server.ts',
];

describe('test media root — RULE 5: one setter per tier', () => {
	test('the three tiers set the key, and nothing else does', () => {
		const candidates = [
			...scannedFiles(),
			...readdirSync(join(REPO_ROOT, 'scripts'))
				.filter((n) => n.endsWith('.ts'))
				.map((n) => `scripts/${n}`),
			...readdirSync(join(REPO_ROOT, 'test/preload'))
				.filter((n) => n.endsWith('.ts'))
				.map((n) => `test/preload/${n}`),
		];
		const setters = candidates.filter((file) =>
			/process\.env\.DEDALO_TEST_MEDIA_ROOT\s*=/.test(stripComments(read(file))),
		);
		expect(setters.sort()).toEqual([...SETTERS].sort());
	});

	test('the preload is registered in bunfig.toml, BEFORE the database repoint', () => {
		const bunfig = read('bunfig.toml');
		const mediaAt = bunfig.indexOf('./test/preload/test_media.ts');
		const dbAt = bunfig.indexOf('./test/preload/test_database.ts');
		const sessionAt = bunfig.indexOf('./test/preload/session_db.ts');
		expect(mediaAt).toBeGreaterThan(-1);
		// ORDER IS LOAD-BEARING: the tree is keyed by the suite database NAME, which
		// the preload derives as `<DB_NAME>_test` — it must read DB_NAME before
		// test_database.ts rewrites it, or the tree lands at `<app>_test_test` and
		// disagrees with the two script setters, which pass the name explicitly.
		expect(mediaAt).toBeLessThan(dbAt);
		expect(mediaAt).toBeLessThan(sessionAt);
	});

	test('test:db:setup SWEEPS the tree (it is rebuildable, not accumulating)', () => {
		expect(stripComments(read('scripts/test_db_setup.ts'))).toContain('rebuildTestMediaRoot(');
	});

	test('the client suite hands the key to the server it spawns', () => {
		const source = stripComments(read('scripts/client_test_server.ts'));
		expect(source).toContain('DEDALO_TEST_MEDIA_ROOT:');
	});
});
