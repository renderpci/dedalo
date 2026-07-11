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
 *      inert, in .github/workflows-selfhosted/ (GitHub executes only
 *      .github/workflows/) for a PRIVATE mirror. This was prose in CI.md and
 *      prose does not stop a paste; now it is a gate.
 *
 * EVERY path this gate reads is version-controlled, so it runs on a bare clone.
 * The index moved out of rewrite/LEDGER.md on 2026-07-11 for exactly that
 * reason: rewrite/ is internal process and is not in the repo.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
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

/**
 * INERT on the public repo — the self-hosted tier, kept for the private mirror.
 * GitHub executes ONLY .github/workflows/, so these never run here; that
 * structural fact IS the protection (they hold no secrets — only `${{ secrets.X }}`
 * names, which are meaningless without the secret).
 *
 * NOT existsSync-guarded, deliberately: these files must stay VERSION-CONTROLLED.
 * If they were gitignored or deleted, a soft guard would make the pin/oracle rules
 * below pass VACUOUSLY over an empty list — the silent-narrowing trap. readdirSync
 * throws instead, so removing the tier is a LOUD red, and the mirror (which is a
 * push of this repo) keeps receiving them.
 */
const selfHostedDir = join(repoRoot, '.github', 'workflows-selfhosted');
const selfHostedFiles = readdirSync(selfHostedDir).filter(yaml);

/** Every workflow YAML, wherever it lives: the pin + oracle rules bind to both tiers. */
const allWorkflows: Array<{ rel: string; src: string }> = [
	...workflowFiles.map((f) => ({ rel: join('.github', 'workflows', f), src: '' })),
	...selfHostedFiles.map((f) => ({ rel: join('.github', 'workflows-selfhosted', f), src: '' })),
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
			'renderpci/dedalo is PUBLIC. A `runs-on: self-hosted` job here executes fork-PR code on the Mac that holds ../private/.env and the live matrix Postgres. Move it to .github/workflows-selfhosted/ (inert; GitHub executes only .github/workflows/). If the repo ever goes private again, retire this rule deliberately — do not just delete it:',
		).toEqual([]);
	});

	/**
	 * Rule 6 — hermetic.sh stubs EVERY required-no-default config key.
	 *
	 * The bug this exists to prevent (2026-07-11, the first real CI run): hermetic.sh
	 * stubbed 5 of the 8 required keys. On a developer machine the missing three were
	 * silently satisfied by ../private/.env, so the script passed locally and died on
	 * the bare runner with `Missing required config key 'PROJECTS_DEFAULT_LANGS'`. A
	 * hermetic script that reads a file it swears it does not read is not hermetic —
	 * and only CI could tell us. Now the stub list cannot drift from the catalog.
	 */
	test('scripts/ci/hermetic.sh stubs every required-no-default key in src/config/config.ts', () => {
		const configSrc = read('src/config/config.ts');
		const required = new Set(
			[
				...configSrc.matchAll(
					/(?:requireEnv|requireOrInstallSentinel|requireJsonArrayOrInstallSentinel|requireJsonMapOrInstallSentinel)\(\s*'([A-Z0-9_]+)'/g,
				),
			].map((m) => m[1] as string),
		);
		expect(
			required.size,
			'no required config keys parsed — the regex or config.ts moved',
		).toBeGreaterThan(0);

		const hermetic = read('scripts/ci/hermetic.sh');
		// Both stub forms: `: "${KEY:=default}"` and the if-block used for JSON values
		// (a `}` inside a `:=` default terminates the expansion — see hermetic.sh).
		const stubbed = new Set(
			[...hermetic.matchAll(/\$\{([A-Z0-9_]+):[=-]/g)].map((m) => m[1] as string),
		);

		const unstubbed = [...required].filter((key) => !stubbed.has(key)).sort();
		expect(
			unstubbed,
			'Required config keys with no stub in scripts/ci/hermetic.sh. On a bare CI runner there is no ../private/.env, so the config catalog THROWS at module init and the whole hermetic tier dies (with cascading "Cannot access \'config\' before initialization" TDZ noise). Add a harmless stub — it only has to parse:',
		).toEqual([]);
	});

	// The self-hosted tier must stay IN THE REPO. Gitignoring it would (a) never reach
	// the private mirror, which is a push of this repo, and (b) make the pin/oracle
	// rules above pass vacuously over an empty list. It carries no secrets — only
	// `${{ secrets.X }}` names — so there is nothing to hide, and hiding it would only
	// remove it from review.
	test('the self-hosted tier is version-controlled and non-empty (never gitignored)', () => {
		expect(
			selfHostedFiles.length,
			'.github/workflows-selfhosted/ has no workflow YAML. It is the parked DB/parity/client tier — if it was deleted or gitignored, restore it: the private mirror receives it by PUSH, and this gate guards its bun pin + ORACLE_REQUIRED wiring.',
		).toBeGreaterThan(0);
		const stray = selfHostedFiles.filter(
			(f) => !targetsSelfHosted(read(join('.github', 'workflows-selfhosted', f))),
		);
		expect(
			stray,
			'Workflow in .github/workflows-selfhosted/ that targets no self-hosted runner — if it can run hosted, it belongs in .github/workflows/ where it will actually execute:',
		).toEqual([]);
	});

	test('.gitlab-ci.yml oven/bun image tag equals the .bun-version pin', () => {
		const src = read('.gitlab-ci.yml');
		const tag = src.match(/image:\s*oven\/bun:(\S+)/)?.[1];
		expect(tag, '.gitlab-ci.yml: oven/bun:<tag> image not found').toBeDefined();
		expect(tag).toBe(bunPin);
	});

	// Binds to BOTH tiers: the self-hosted jobs now live in workflows-selfhosted/, and the
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
