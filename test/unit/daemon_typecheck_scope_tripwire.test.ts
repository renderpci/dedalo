/**
 * TRIPWIRE — every TypeScript file a DAEMON PACKAGE ships is in the program its
 * own `tsc` checks (audit 2026-09-26 G9).
 *
 * THE DEFECT. `publication/site_builder/tsconfig.json` included `src/` and
 * `tests/` only, so the owner-VM probes under `deploy/probes/` — scripts an
 * operator runs as root against a live host — were never type-checked by
 * anything: the hermetic daemon gate runs `bunx tsc --noEmit` in the package,
 * and tsc checks exactly the files its `include` (plus their imports) reaches.
 * A type error there surfaced on the VM, not in CI. Fixed at f4b9987b12 by
 * adding `deploy/probes/**​/*.ts` — with no gate, so the next directory a
 * package grows is dark the same way.
 *
 * THE OUTCOME MEASURED, never a spelling: for each daemon package (DERIVED —
 * every directory under `publication/` with both a package.json and a
 * tsconfig.json — test/helpers/daemon_package_corpus.ts), the census is the
 * package's own source listing (git's view, tracked or new, so a file not
 * committed yet counts), and the program is what `tsc --listFilesOnly -p <tsconfig>` reports.
 * Census minus program minus the named exemptions must be EMPTY. Reading the
 * `include` globs instead would check the config's spelling, not what tsc does.
 *
 * THE EXEMPTIONS are a closed ledger, each with its reason, and a STALE one is
 * red (an exemption that no longer matches a dark file must be deleted).
 *
 * DB-FREE: it spawns git and the repo's own tsc, nothing else.
 *
 * TSC RUNS UNDER BUN, never through `node_modules/.bin/tsc`: that shim's
 * shebang is `#!/usr/bin/env node`, and the CI image ships no node — the spawn
 * listed nothing, every file read as dark, and the stale-exemption and control
 * legs passed VACUOUSLY on the empty program. An empty (or unparseable) listing
 * is therefore a LOUD failure of the detector itself (tscProgram throws, with
 * tsc's exit code and stderr), never a census result.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { daemonPackageSources, daemonPackages } from '../helpers/daemon_package_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
/**
 * The repo's own tsc (root devDependency) — the package's JS entry, run by THIS
 * bun (process.execPath), so no node is needed (see the header).
 */
const TSC = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * Files a daemon package ships that its tsc program does not cover, each with
 * why. Keyed by repo-relative PREFIX (a directory ends in '/').
 */
const EXEMPTIONS: { prefix: string; reason: string }[] = [
	{
		prefix: 'publication/site_builder/templates/',
		reason:
			'a SITE TEMPLATE, not daemon code: its own TS project (templates/basic/tsconfig.json, DOM lib) copied into a site workspace and built there by vite. KNOWN-OPEN: no CI stage type-checks it (vite build does not) — kept visible here instead of silent',
	},
	{
		prefix: 'publication/server_api/v2/scripts/bench-parse-json.ts',
		reason:
			'KNOWN-OPEN: a developer micro-benchmark the v2 tsconfig (`src/**`, `tests/**`) does not include, so it is not type-checked — the same shape G9 closed for site_builder probes; the fix is a `scripts/**/*.ts` include in publication/server_api/v2/tsconfig.json (owner of that package)',
	},
];

/** The package's own TS source (the shared corpus: git's view, tracked or new). */
const SOURCES = daemonPackageSources();
const sourceCensus = (pkg: string): string[] => SOURCES.get(pkg) ?? [];

/** What tsc REALLY puts in the program of `tsconfigPath` (repo-relative paths). */
function tscProgram(tsconfigPath: string): Set<string> {
	const run = Bun.spawnSync([process.execPath, TSC, '-p', tsconfigPath, '--listFilesOnly'], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	// The exit code is NOT the signal: an unresolved `types` entry (a package
	// whose node_modules is not installed) exits non-zero and still lists.
	const program = new Set<string>();
	for (const line of run.stdout.toString().split('\n')) {
		const path = line.trim();
		if (!path.startsWith('/')) continue;
		const rel = relative(REPO_ROOT, path);
		if (!rel.startsWith('..')) program.add(rel);
	}
	// AN EMPTY PROGRAM IS THE DETECTOR FAILING, not a census answer: every census
	// file would read as dark and the control/stale legs would pass vacuously.
	if (program.size === 0) {
		throw new Error(
			`tsc listed NO in-repo file for ${relative(REPO_ROOT, tsconfigPath)} ` +
				`(exit ${String(run.exitCode)}${run.signalCode ? `, signal ${run.signalCode}` : ''}). ` +
				`The daemon typecheck census cannot run blind. stderr: ${run.stderr.toString().trim().slice(0, 800) || '(empty)'}; ` +
				`stdout: ${run.stdout.toString().trim().slice(0, 400) || '(empty)'}`,
		);
	}
	return program;
}

/** Census files of `pkg` that the program at `tsconfigPath` does not check. */
function darkFiles(pkg: string, tsconfigPath = join(REPO_ROOT, pkg, 'tsconfig.json')): string[] {
	const program = tscProgram(tsconfigPath);
	return sourceCensus(pkg).filter((path) => !program.has(path));
}

const exempted = (path: string): boolean =>
	EXEMPTIONS.some((entry) => path === entry.prefix || path.startsWith(entry.prefix));

const PACKAGES = daemonPackages();
const DARK = new Map(PACKAGES.map((pkg) => [pkg, darkFiles(pkg)]));

describe('every daemon package type-checks every TypeScript file it ships', () => {
	test('the package census is derived and non-trivial (anti-vacuity)', () => {
		expect(existsSync(TSC)).toBe(true);
		expect(PACKAGES.length).toBeGreaterThan(2);
		expect(PACKAGES).toContain('publication/site_builder');
		expect(PACKAGES).toContain('publication/host_agent');
		expect(PACKAGES).toContain('publication/server_api/v2');
		for (const pkg of PACKAGES) {
			// The program is real: most of the package's census IS in it. A tsc that
			// listed nothing would make every file "dark" — this says so, distinctly.
			const census = sourceCensus(pkg);
			const dark = DARK.get(pkg) ?? [];
			expect(census.length, pkg).toBeGreaterThan(10);
			expect(dark.length, `${pkg}: tsc listed almost nothing`).toBeLessThan(census.length / 2);
		}
	});

	test('G9 — the site_builder owner-VM probes are in the census AND in the program', () => {
		const probes = sourceCensus('publication/site_builder').filter((p) =>
			p.startsWith('publication/site_builder/deploy/probes/'),
		);
		expect(probes.length).toBeGreaterThan(0);
		const program = tscProgram(join(REPO_ROOT, 'publication/site_builder/tsconfig.json'));
		expect(probes.filter((p) => !program.has(p))).toEqual([]);
	});

	test('no shipped TypeScript file is outside its package tsc program (exemptions aside)', () => {
		const unexempted = [...DARK.values()].flat().filter((path) => !exempted(path));
		expect(
			unexempted,
			'These files are shipped by a daemon package but its `tsc --noEmit` never checks them ' +
				'(the hermetic daemon gate runs exactly that). Add their directory to the package ' +
				"tsconfig.json `include` — never to this gate's EXEMPTIONS without a reason.",
		).toEqual([]);
	});

	test('every exemption still matches a dark file (a stale exemption is RED) and has a reason', () => {
		const dark = [...DARK.values()].flat();
		for (const entry of EXEMPTIONS) {
			expect(
				dark.some((p) => p === entry.prefix || p.startsWith(entry.prefix)),
				entry.prefix,
			).toBe(true);
			expect(entry.reason.length, entry.prefix).toBeGreaterThan(60);
		}
	});

	test('control — a tsconfig without the probes include reports the probes dark', () => {
		// The detector's own control: the pre-G9 include, as a scratch config that
		// extends the real one (so every other option is the package's own).
		const sb = join(REPO_ROOT, 'publication', 'site_builder');
		const dir = mkdtempSync(join(tmpdir(), 'dedalo_tsc_scope_'));
		try {
			const scratch = join(dir, 'tsconfig.json');
			writeFileSync(
				scratch,
				JSON.stringify({
					extends: join(sb, 'tsconfig.json'),
					compilerOptions: { incremental: false },
					include: [join(sb, 'src/**/*.ts'), join(sb, 'tests/**/*.ts')],
				}),
			);
			const dark = darkFiles('publication/site_builder', scratch);
			expect(dark.some((p) => p.startsWith('publication/site_builder/deploy/probes/'))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
