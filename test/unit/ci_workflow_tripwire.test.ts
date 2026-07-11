/**
 * Tripwire (DEC-12): the CI wiring's invariants hold — the workflow YAMLs are
 * plain config nobody type-checks, so each rule below is enforced here or it
 * silently rots (engineering/CI.md).
 *
 *   1. Bun pin — every GitHub workflow using setup-bun pins via
 *      `bun-version-file: .bun-version` (never an inline version), and the
 *      .gitlab-ci.yml `oven/bun:<tag>` image tag equals .bun-version. The pin
 *      is load-bearing: Bun.sql jsonb-inference drift is a data-corruption
 *      class.
 *   2. Oracle honesty — every self-hosted workflow that runs test/parity or
 *      scripts/verify.ts sets ORACLE_REQUIRED: "1", so an absent PHP oracle is
 *      a RED canary, never a silent green (the AGENTS.md "oracle trap").
 *   3. No hermetic drift — the GitHub hermetic jobs AND .gitlab-ci.yml all
 *      invoke the shared scripts/ci/hermetic.sh (one source of truth), and
 *      hermetic.sh's tripwire list stays a SUBSET of scripts/verify.ts
 *      TRIPWIRES (the hosted tier may run fewer gates, never unknown ones).
 *   4. Tripwire index integrity — scripts/verify.ts TRIPWIRES equals the
 *      engineering/TRIPWIRES.md rows exactly (the 12-vs-14 drift found
 *      2026-07-09 stays fixed), and every listed test file exists.
 *   5. PUBLIC-REPO POSTURE (2026-07-11) — NO self-hosted job may live in
 *      .github/workflows/. renderpci/dedalo is PUBLIC: anyone can fork it and
 *      open a PR, and a `runs-on: self-hosted` job would execute that fork's
 *      code on the Mac holding the real ../private/.env and the live matrix
 *      Postgres — RCE on the data host. The self-hosted tier is preserved,
 *      inert, in .github/workflows-private/ (GitHub executes only
 *      .github/workflows/) for a PRIVATE mirror. This was prose in CI.md and
 *      prose does not stop a paste; now it is a gate.
 *
 * EVERY path this gate reads is version-controlled, so it runs on a bare clone.
 * The index moved out of rewrite/LEDGER.md on 2026-07-11 for exactly that
 * reason: rewrite/ is internal process and is not in the repo.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

const bunPin = read('.bun-version').trim();

const yaml = (f: string) => f.endsWith('.yml') || f.endsWith('.yaml');

/**
 * A job actually TARGETS the self-hosted runner — i.e. a `runs-on:` directive names
 * it. Deliberately NOT a substring scan: these files must be free to *discuss*
 * self-hosted in their headers (the whole public-repo posture is documented there),
 * and a naive includes('self-hosted') would flag the warning that prevents the bug.
 */
const targetsSelfHosted = (src: string) => /^\s*runs-on:.*self-hosted/m.test(src);

/** EXECUTED by GitHub — the public tier. Hermetic only (rule 5). */
const workflowDir = join(repoRoot, '.github', 'workflows');
const workflowFiles = readdirSync(workflowDir).filter(yaml);

/** INERT on the public repo — the self-hosted tier, kept for the private mirror. */
const privateDir = join(repoRoot, '.github', 'workflows-private');
const privateFiles = existsSync(privateDir) ? readdirSync(privateDir).filter(yaml) : [];

/** Every workflow YAML, wherever it lives: the pin + oracle rules bind to both tiers. */
const allWorkflows: Array<{ rel: string; src: string }> = [
	...workflowFiles.map((f) => ({ rel: join('.github', 'workflows', f), src: '' })),
	...privateFiles.map((f) => ({ rel: join('.github', 'workflows-private', f), src: '' })),
].map((w) => ({ ...w, src: read(w.rel) }));

/** verify.ts TRIPWIRES entries (the quoted test paths inside the array). */
function verifyTripwires(): string[] {
	const src = read('scripts/verify.ts');
	const block = src.match(/const TRIPWIRES = \[([\s\S]*?)\];/)?.[1];
	if (!block) throw new Error('scripts/verify.ts: TRIPWIRES array not found');
	return [...block.matchAll(/'(test\/[^']+\.test\.ts)'/g)].map((m) => m[1] as string);
}

/** hermetic.sh HERMETIC_TRIPWIRES entries. */
function hermeticTripwires(): string[] {
	const src = read('scripts/ci/hermetic.sh');
	const block = src.match(/HERMETIC_TRIPWIRES=\(([\s\S]*?)\)/)?.[1];
	if (!block) throw new Error('scripts/ci/hermetic.sh: HERMETIC_TRIPWIRES array not found');
	return [...block.matchAll(/(test\/[^\s)]+\.test\.ts)/g)].map((m) => m[1] as string);
}

/** engineering/TRIPWIRES.md table rows (first column, test paths). */
function ledgerTripwires(): string[] {
	const src = read('engineering/TRIPWIRES.md');
	const rows = [...src.matchAll(/^\| (test\/[^\s|]+\.test\.ts) \|/gm)].map((m) => m[1] as string);
	if (rows.length === 0) throw new Error('engineering/TRIPWIRES.md: no tripwire rows found');
	return rows;
}

describe('CI workflow tripwire', () => {
	test('every GitHub workflow using setup-bun pins via bun-version-file, never inline', () => {
		for (const { rel, src } of allWorkflows) {
			if (!src.includes('setup-bun')) continue;
			expect(src, `${rel}: setup-bun must use bun-version-file: .bun-version`).toContain(
				'bun-version-file: .bun-version',
			);
			expect(src, `${rel}: inline bun-version would drift from the .bun-version pin`).not.toMatch(
				/bun-version:\s/,
			);
		}
	});

	// Rule 5 — the public-repo security posture, mechanically.
	test('NO self-hosted job lives in .github/workflows/ (public repo — fork PRs would get RCE on the data host)', () => {
		const offenders = workflowFiles.filter((f) =>
			targetsSelfHosted(read(join('.github', 'workflows', f))),
		);
		expect(
			offenders,
			'renderpci/dedalo is PUBLIC. A `runs-on: self-hosted` job here executes fork-PR code on the Mac that holds ../private/.env and the live matrix Postgres. Move it to .github/workflows-private/ (inert; for the private mirror). If the repo ever goes private again, retire this rule deliberately — do not just delete it:',
		).toEqual([]);
	});

	test('.gitlab-ci.yml oven/bun image tag equals the .bun-version pin', () => {
		const src = read('.gitlab-ci.yml');
		const tag = src.match(/image:\s*oven\/bun:(\S+)/)?.[1];
		expect(tag, '.gitlab-ci.yml: oven/bun:<tag> image not found').toBeDefined();
		expect(tag).toBe(bunPin);
	});

	// Binds to BOTH tiers: the self-hosted jobs now live in workflows-private/, and the
	// invariant has to travel with them or it silently stops guarding anything.
	test('self-hosted workflows running parity/verify set ORACLE_REQUIRED: "1"', () => {
		for (const { rel, src } of allWorkflows) {
			if (!targetsSelfHosted(src)) continue;
			const runsOracleGates =
				src.includes('test/parity') ||
				src.includes('scripts/verify.ts') ||
				/\bbun test\b/.test(src);
			if (!runsOracleGates) continue;
			expect(src, `${rel}: self-hosted oracle-gated job must set ORACLE_REQUIRED: "1"`).toContain(
				'ORACLE_REQUIRED: "1"',
			);
		}
	});

	test('the GitHub hermetic jobs and .gitlab-ci.yml invoke the shared hermetic.sh', () => {
		for (const file of [
			'.github/workflows/ci.yml',
			'.github/workflows/main.yml',
			'.gitlab-ci.yml',
		]) {
			expect(read(file), `${file}: hermetic tier must run scripts/ci/hermetic.sh`).toContain(
				'scripts/ci/hermetic.sh',
			);
		}
	});

	test('hermetic.sh tripwires are a subset of verify.ts TRIPWIRES', () => {
		const verify = new Set(verifyTripwires());
		for (const t of hermeticTripwires()) {
			expect(verify.has(t), `hermetic.sh runs ${t} which verify.ts TRIPWIRES does not list`).toBe(
				true,
			);
		}
	});

	test('verify.ts TRIPWIRES equals the engineering/TRIPWIRES.md index exactly', () => {
		expect([...verifyTripwires()].sort()).toEqual([...ledgerTripwires()].sort());
	});

	test('every tripwire file listed anywhere actually exists', async () => {
		for (const t of new Set([...verifyTripwires(), ...hermeticTripwires(), ...ledgerTripwires()])) {
			expect(await Bun.file(join(repoRoot, t)).exists(), `${t} listed but missing on disk`).toBe(
				true,
			);
		}
	});
});
