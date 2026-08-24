/**
 * The release files directory provisioner (src/core/update/code_files_dir.ts).
 *
 * The invariant: a code server whose DEDALO_CODE_FILES_DIR is configured but
 * absent gets it CREATED, recursively, AT THE DECLARED MODE — not at whatever
 * the process umask happens to give, which is what `mkdirSync`'s `mode` option
 * alone yields (0700 under a hardened `UMask=0077`). An existing directory is
 * observed, never re-moded. Nothing here throws.
 *
 * The boot wrapper is gated on config, which a unit test cannot rebuild
 * (`config` is frozen at import), so its WIRING is asserted structurally —
 * the same shape as media_tree_provision_native.test.ts's boot-pass gate,
 * because a provisioner nobody calls is exactly the regression that matters.
 *
 * Scratch root under TMPDIR: no ../private, no live tree, no DB.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { CODE_DIR_MODE, ensureCodeFilesDir } from '../../src/core/update/code_files_dir.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const ROOT = join(
	process.env.TMPDIR ?? '/tmp',
	`dedalo_code_files_dir_${process.pid}_${Math.random().toString(36).slice(2)}`,
);
/** Root ignores permission bits, so a "cannot create" case cannot mean anything. */
const asRoot = process.getuid?.() === 0;

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const modeOf = (path: string): number => statSync(path).mode & 0o777;

/** Run with a pinned umask: the gate must assert the FORCED mode, not the ambient one. */
function withUmask<T>(mask: number, body: () => T): T {
	const previous = process.umask(mask);
	try {
		return body();
	} finally {
		process.umask(previous);
	}
}

describe('ensureCodeFilesDir', () => {
	test('creates a missing directory, recursively, at CODE_DIR_MODE', () => {
		const dir = join(ROOT, 'missing', 'srv', 'dedalo', 'code');
		const report = ensureCodeFilesDir(dir);
		expect(report.created).toBe(true);
		expect(report.error).toBeNull();
		expect(report.writable).toBe(true);
		expect(report.isDirectory).toBe(true);
		expect(existsSync(dir)).toBe(true);
		expect(modeOf(dir)).toBe(CODE_DIR_MODE);
		// Every level it minted, not just the leaf.
		expect(modeOf(join(ROOT, 'missing', 'srv'))).toBe(CODE_DIR_MODE);
		// The REPORTED mode is the observed one (the log line quotes it).
		expect(report.mode).toBe(CODE_DIR_MODE);
	});

	test('the mode survives a hardened umask (the whole point of the module)', () => {
		// Without the post-mkdir chmod this lands at 0700 and the log line lies.
		const dir = withUmask(0o077, () => {
			const target = join(ROOT, 'hardened', 'code');
			expect(ensureCodeFilesDir(target).mode).toBe(CODE_DIR_MODE);
			return target;
		});
		expect(modeOf(dir)).toBe(CODE_DIR_MODE);
		expect(modeOf(join(ROOT, 'hardened'))).toBe(CODE_DIR_MODE);
	});

	test('never touches a level that already existed', () => {
		const parent = join(ROOT, 'preexisting');
		mkdirSync(parent, { recursive: true });
		chmodSync(parent, 0o775);
		ensureCodeFilesDir(join(parent, 'code'));
		expect(modeOf(parent)).toBe(0o775);
		expect(modeOf(join(parent, 'code'))).toBe(CODE_DIR_MODE);
	});

	test('is idempotent and never re-modes an existing directory', () => {
		const dir = join(ROOT, 'existing');
		mkdirSync(dir, { recursive: true });
		chmodSync(dir, 0o775); // an operator's deliberate wider mode
		const report = ensureCodeFilesDir(dir);
		expect(report.created).toBe(false);
		expect(report.writable).toBe(true);
		expect(report.isDirectory).toBe(true);
		expect(modeOf(dir)).toBe(0o775);
	});

	test('a regular FILE at the path is reported as not-a-directory, not as unwritable', () => {
		const path = join(ROOT, 'a_file');
		mkdirSync(ROOT, { recursive: true });
		writeFileSync(path, 'not a directory');
		const report = ensureCodeFilesDir(path);
		expect(report.isDirectory).toBe(false);
		expect(report.writable).toBe(false);
		expect(report.error).toBeNull();
	});

	test.skipIf(asRoot)('reports the failure instead of throwing when it cannot create', () => {
		const parent = join(ROOT, 'sealed');
		mkdirSync(parent, { recursive: true });
		chmodSync(parent, 0o500); // read+execute only: no mkdir inside
		const report = ensureCodeFilesDir(join(parent, 'code'));
		expect(report.created).toBe(false);
		expect(report.writable).toBe(false);
		expect(report.error).toBeInstanceOf(Error);
		chmodSync(parent, 0o700); // so afterAll can sweep it
	});
});

describe('the boot wiring', () => {
	test('src/server.ts calls ensureCodeFilesDirAtBoot() at boot, statically imported', () => {
		// Structural, because startServer binds a socket: a provisioner with no
		// boot caller never reaches an installed box (DEC-12 — the invariant is
		// the CALL, so the call is what is gated).
		const src = readFileSync(join(REPO_ROOT, 'src', 'server.ts'), 'utf8');
		const startServer = src.indexOf('export async function startServer');
		const bootCall = src.indexOf('ensureCodeFilesDirAtBoot()');
		expect(startServer).toBeGreaterThan(-1);
		expect(bootCall, 'src/server.ts must call ensureCodeFilesDirAtBoot() at boot').toBeGreaterThan(
			startServer,
		);
		expect(src).toContain(
			"import { ensureCodeFilesDirAtBoot } from './core/update/code_files_dir.ts'",
		);
	});

	test('the wrapper is gated on IS_A_CODE_SERVER and on a non-empty key', () => {
		// The gate is read from the frozen `config`, which a unit test cannot
		// rebuild — so the three refusals are asserted on the source, next to the
		// structural call gate above.
		const src = readFileSync(join(REPO_ROOT, 'src', 'core', 'update', 'code_files_dir.ts'), 'utf8');
		expect(src).toContain('if (config.update.isCodeServer !== true) return null;');
		expect(src).toContain("if (configured === undefined || configured === '') return null;");
	});
});
