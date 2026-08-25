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
 *   7. LEAST PRIVILEGE (2026-08-03) — every workflow declares a top-level
 *      `permissions:` block. With none, the job inherits the REPOSITORY default,
 *      which on a repo created before GitHub changed the default is read/WRITE on
 *      contents — ambient push rights granted to every step, including third-party
 *      actions, in jobs that write nothing back.
 *   8. PINNED ACTIONS (2026-08-03) — every `uses:` names a 40-hex commit SHA, with
 *      the human version in a trailing comment. `@v5` is a MOVING TAG the action's
 *      owner can repoint at any commit: the pin is the difference between "we chose
 *      this code" and "we run whatever that repo publishes today", and the deploy
 *      workflow hands one of these actions an SSH key.
 *   9. CODEQL PAIRING (2026-08-03) — every `github/codeql-action/*` step is pinned
 *      to the SAME SHA. init and analyze are one dependency (init writes the database
 *      analyze reads); Dependabot models them as two and WILL propose splitting them.
 *  10. STATUS-PROSE (2026-08-18) — no row of engineering/TRIPWIRES.md narrates a
 *      transient red/failing state as a standing fact (scripts/lib/status_prose.ts
 *      is the ONE detector; see its header for what pairs a status word with an
 *      instance marker and why bare rule wording stays legal). A row states what
 *      its gate ASSERTS; how the gate is doing at some moment belongs in
 *      rewrite/LEDGER.md or in the commit message. Narrated red in the index
 *      becomes the expected condition and trains the regeneration reflex the
 *      ratchets exist to starve — and it was never load-bearing: rule 4's parser
 *      takes only the first column, and scripts/verify.ts has no allowlist.
 *
 * SCANNERS THAT ARE NOT GATED HERE, deliberately: CodeQL (.github/workflows/codeql.yml)
 * and the secret scan (.github/workflows/security.yml) are third-party analyses whose
 * rulesets we do not control. Their WIRING is checked by the two rules above like any
 * other workflow; their FINDINGS are not this file's business.
 *
 * EVERY path this gate reads is version-controlled, so it runs on a bare clone.
 * The index moved out of rewrite/LEDGER.md on 2026-07-11 for exactly that
 * reason: rewrite/ is internal process and is not in the repo.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findStatusProse } from '../../scripts/lib/status_prose.ts';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';

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
	// Terminate at a LINE-START ')', not the first ')' anywhere: section comments
	// inside the array legitimately contain parentheses, and a non-greedy match
	// stopped dead at the first one. Measured 2026-08-24: that truncation hid 20
	// of the 41 entries from this gate — the rule guarding the hermetic list was
	// itself only checking half of it, silently, since 2026-08-03.
	const block = src.match(/HERMETIC_TRIPWIRES=\(\n([\s\S]*?)\n\)/)?.[1];
	if (!block) throw new Error('scripts/ci/hermetic.sh: HERMETIC_TRIPWIRES array not found');
	// Entries only: a path must BE the line, so a path mentioned inside a comment
	// is not mistaken for a wired gate.
	return block
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
		.map((line) => {
			const m = line.match(/^(test\/[^\s]+\.test\.ts)$/);
			if (!m)
				throw new Error(`scripts/ci/hermetic.sh: unparsable HERMETIC_TRIPWIRES line: ${line}`);
			return m[1] as string;
		});
}

/** engineering/TRIPWIRES.md table rows (first column, test paths). */
function ledgerTripwires(): string[] {
	const src = read('engineering/TRIPWIRES.md');
	const rows = [...src.matchAll(/^\| (test\/[^\s|]+\.test\.ts) \|/gm)].map((m) => m[1] as string);
	if (rows.length === 0) throw new Error('engineering/TRIPWIRES.md: no tripwire rows found');
	return rows;
}

/**
 * Rule 3c — tripwires that do NOT run on the hermetic tier, each with a written
 * reason. This is the CONVERSE of the subset rule below it, and it exists
 * because the subset rule alone is a one-way silence: for months a tripwire
 * could be added to verify.ts, never wired into hermetic.sh, and run on NO
 * executing tier while every gate stayed green. Measured 2026-08-24: the index
 * held 89 gates and hermetic.sh 41 — and five more landed that same day, taking
 * the unrun set from 48 to 53, with nothing red at any point.
 *
 * The map is exact in BOTH directions: an unlisted exclusion is red (the new
 * gate must be wired or explained) and a stale entry is red too (a listed gate
 * that now runs hermetically, or that is no longer a tripwire at all).
 *
 * Every entry below is a DB-tier gate — verified by reading its closure, not its
 * name. To move one here it is not enough that it looks pure: hermetic.sh's
 * standing rule is that an entry is EMPIRICALLY re-verified with DB_PORT closed
 * before being added.
 */
const NOT_HERMETIC: ReadonlyMap<string, string> = new Map([
	[
		'test/unit/consultation_only_sections_tripwire.test.ts',
		'The engine-guard refusals resolve pre-DB but the readSection end-to-end leg and the ontology-backed permission/structure lookups query the suite Postgres, so the gate cannot run on the hosted tier',
	],
	[
		'test/unit/error_taxonomy_tripwire.test.ts',
		'Legs A–C and E are pure tracked-source scans, but leg D needs the suite Postgres and would report an explicit SKIP forever on the hosted tier — putting the whole file there would silently drop the runtime-envelope leg, so it belongs on the DB tier (or needs a split)',
	],
	[
		'test/unit/external_degradation_tripwire.test.ts',
		'The derivation and import-refusal halves read the suite database’s ontology (test TLD nodes) through the postgres-backed resolver, so it needs the live suite DB even though it writes nothing',
	],
	[
		'test/unit/external_egress_tripwire.test.ts',
		'The adapter-shape tests are pure, but the sentinel-control legs resolve the test3 section’s api_config from dd_ontology through the live Postgres before the stubbed fetch ever runs',
	],
	[
		'test/unit/external_isolation_tripwire.test.ts',
		'The behavioural tests run fetchExternalRows against real ontology properties of section test3, so the closure both loads the postgres pool and issues live queries against the suite DB (fetch itself is stubbed, so no network)',
	],
	[
		'test/unit/external_search_target_tripwire.test.ts',
		'The frozen-copy half is credless but the ’real ontology’ describe must resolve the generic test61/test204 callers in the suite database and is deliberately red when it cannot, so the gate as a whole needs postgres',
	],
	[
		'test/unit/external_write_refusal_tripwire.test.ts',
		'It performs real matrix reads and a real scratch-record write/save round trip on the marked suite database — a genuine DB-tier gate that cannot run hosted',
	],
	[
		'test/unit/info_widget_registry_tripwire.test.ts',
		'The ontology-census test queries the shared dd_ontology table for every declared widget_name, so it needs the live matrix Postgres and cannot run on a bare runner',
	],
	[
		'test/unit/matrix_index_asset_policy_agreement.test.ts',
		'By design it creates indexes on and reads pg_get_indexdef from a live Postgres catalog — the signature-not-hand-writable rule cannot be checked without one',
	],
	[
		'test/unit/media_thumb_census_tripwire.test.ts',
		'Its assertions are pure path math and source scans (no query is ever issued — the media root is a marked tmpdir), but the dynamic posterframe.ts import drags the postgres pool module (and its DB config requirements) into the closure, which the hermetic criteria disqualify; splitting posterframeAbsolutePath out of the file_ops chain would make this gate hermetic',
	],
	[
		'test/unit/root_user_hidden_tripwire.test.ts',
		'Half the gate is the exemption direction — proving the direct-fetch paths still resolve the seeded root row from the suite database — so it cannot run without live postgres',
	],
	[
		'test/unit/sql_confinement_tripwire.test.ts',
		'The T1/T3/T4 halves are pure source scans, but the T3 behavioural half writes and queries scratch ontology rows in the live matrix Postgres, so the file as a whole cannot go hermetic without splitting the accessor-semantics tests out',
	],
	[
		'test/unit/temporal_instance_tripwire.test.ts',
		'Drives the real write door against the suite database’s test3 fixture, including a deliberate canary write to a scratch record, so a live Postgres with the suite fixture is required',
	],
	[
		'test/unit/test3_canonical_fixture.test.ts',
		'It restores, resets and snapshots the matrix_test table and matrix_counter in the live suite database — it is the DB fixture’s own gate and is meaningless without Postgres',
	],
	[
		'test/unit/test_db_marker_tripwire.test.ts',
		'The gate’s core proof is behavioural against the live suite database (delete-marker-in-transaction, real refusals, real installer bypass), so it is DB-bound by design',
	],
	[
		'test/unit/test_media_root_tripwire.test.ts',
		'Most legs are fs/source scans, but the ensureMediaKit refusal door must reach the suite Postgres for the test-database marker check before its media-root refusal fires, so the gate needs the DB tier (or that one door split out)',
	],
	[
		'test/unit/test_tld_ontology_gate.test.ts',
		'Tiers (c)/(d) are declared DATABASE tiers and query/round-trip dd_ontology and matrix tables on the suite DB; only tiers (a)/(b) are hermetic, so the file as a whole cannot go on the hosted tier without being split',
	],
	[
		'test/unit/tm_mode_retired_tripwire.test.ts',
		'Its final test’s dynamic import pulls the postgres pool module into the closure (no query is ever executed — pickReadSource only selects a function — so splitting that one test out or asserting the wiring from source would make the remainder hermetic), but as written the gate reaches the DB layer',
	],
	[
		'test/unit/tools_cache_invalidation.test.ts',
		'Its reachability and registry-cache tests create, duplicate and delete real records in the suite database to observe cache invalidation end-to-end, so it requires the live matrix Postgres',
	],
]);

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
	test('scripts/ci/hermetic.sh stubs every required-no-default config key', () => {
		// Read the required set from the CATALOG, not by regex-scraping config.ts. That scrape
		// broke the moment defaults moved into src/config/catalog/ — and a gate that silently
		// parses zero keys would have passed vacuously forever. `required: true` is now data,
		// so this cannot go stale again.
		const required = new Set(
			Object.entries(CONFIG_CATALOG)
				.filter(([, entry]) => entry.required === true)
				.map(([key]) => key),
		);
		expect(
			required.size,
			'no required config keys in the catalog — src/config/catalog/ moved or lost its `required` flags',
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

	// Rule 7 — least privilege. Binds to BOTH tiers: the self-hosted jobs are the ones
	// with real reach (they run on the data host), so an inherited write token there is
	// worse, not better.
	test('every workflow declares a top-level permissions block', () => {
		const offenders = allWorkflows
			.filter(({ src }) => !/^permissions:/m.test(src))
			.map(({ rel }) => rel);
		expect(
			offenders,
			'A workflow with no top-level `permissions:` inherits the REPOSITORY default GITHUB_TOKEN scope — historically read/write on contents, i.e. push rights handed to every step of a job that only reads. Declare what the job actually needs (`permissions: {contents: read}` for all of ours except codeql.yml, which writes code-scanning alerts):',
		).toEqual([]);
	});

	// Rule 8 — supply chain. A tag is mutable; a SHA is the thing we reviewed.
	test('every action is pinned to a commit SHA, never a moving tag', () => {
		const USES = /^\s*(?:-\s*)?uses:\s*(\S+)/gm;
		const offenders: string[] = [];
		for (const { rel, src } of allWorkflows) {
			for (const [, ref] of src.matchAll(USES)) {
				const value = ref as string;
				// Local (`./…`) and container (`docker://…`) references are not fetched from
				// a third-party repo at run time; everything else is `owner/repo@ref`.
				if (value.startsWith('./') || value.startsWith('docker://')) continue;
				const at = value.lastIndexOf('@');
				const pin = at === -1 ? '' : value.slice(at + 1);
				if (!/^[0-9a-f]{40}$/.test(pin)) offenders.push(`${rel}: uses: ${value}`);
			}
		}
		expect(
			offenders,
			'A GitHub action referenced by tag (`@v5`) runs whatever commit that tag points at TODAY — the action owner, or anyone who compromises that account, can repoint it. Pin the 40-hex SHA and keep the version in a trailing comment (`uses: actions/checkout@fbc6f39… # v5`); Dependabot updates both. .github/workflows-selfhosted/deploy.yml hands one of these an SSH deploy key:',
		).toEqual([]);
	});

	/**
	 * Rule 9 — every `github/codeql-action/*` step is pinned to ONE SHA.
	 *
	 * `init` and `analyze` are two paths inside one repo and MUST come from the same
	 * release: init writes the database that analyze reads, and a major-version split
	 * fails the run. Dependabot cannot see that — it models each action PATH as its own
	 * dependency, so on 2026-08-03 it opened a PR (#77) bumping `analyze` to v4.37.4
	 * while leaving `init` on the v3 SHA. The PR's own CodeQL job went red, which is the
	 * lucky case; the unlucky one is a green-looking half-upgrade nobody reads.
	 *
	 * Dependabot will propose the same split every time codeql-action releases, so this
	 * has to be mechanical: whoever takes that PR gets a red gate here until both lines
	 * move together.
	 */
	test('every codeql-action step is pinned to the same SHA (init and analyze cannot split)', () => {
		const CODEQL_USES = /uses:\s*github\/codeql-action\/[a-z-]+@([0-9a-f]{40})/g;
		const bySha = new Map<string, string[]>();
		for (const { rel, src } of allWorkflows) {
			for (const [line, sha] of [...src.matchAll(CODEQL_USES)].map(
				(m) => [m[0] as string, m[1] as string] as const,
			)) {
				bySha.set(sha, [...(bySha.get(sha) ?? []), `${rel}: ${line}`]);
			}
		}
		// Guards the guard: rename the workflow or the action and this would pass over an
		// empty map, proving nothing — the same zero-length trap the ledger gates carry.
		expect(
			bySha.size,
			'No SHA-pinned github/codeql-action step found in any workflow. Either CodeQL was removed (then delete this rule deliberately) or the pin grammar changed and this gate is now blind.',
		).toBeGreaterThan(0);
		expect(
			[...bySha.entries()].map(([sha, where]) => `${sha}: ${where.join(' | ')}`),
			'The codeql-action steps are pinned to DIFFERENT commits. `init` builds the database `analyze` consumes; across majors that run fails. Bump every codeql-action line to one SHA in one change — Dependabot proposes them separately and cannot know they are one dependency:',
		).toHaveLength(1);
	});

	// The secret scanner's config is the one place where "make the alert go away" and
	// "fix the leak" look identical in a diff. Keep the default ruleset load-bearing.
	test('the gitleaks config extends the default ruleset instead of replacing it', () => {
		const src = read('.gitleaks.toml');
		expect(
			/^\s*useDefault\s*=\s*true\s*$/m.test(src),
			'.gitleaks.toml must set `[extend] useDefault = true`. Without it, our two allowlists REPLACE ~170 upstream provider rules and the scan reports a clean repo because it stopped looking — and GitLab loads this same file wholesale through .gitlab/secret-detection-ruleset.toml, so the blindness would be on both platforms at once.',
		).toBe(true);
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

	// Rule 3c — the converse of 3b. Without this, an unwired tripwire is silent.
	test('every tripwire either runs on the hermetic tier or has a written exclusion reason', () => {
		const hermetic = new Set(hermeticTripwires());
		const verify = verifyTripwires();
		const excluded = verify.filter((t) => !hermetic.has(t));

		for (const t of excluded) {
			expect(
				NOT_HERMETIC.has(t),
				`${t} runs on NO executing tier: it is in verify.ts TRIPWIRES but not in ` +
					'hermetic.sh, and carries no reason. Wire it into HERMETIC_TRIPWIRES ' +
					'(re-verify it DB-less first, with DB_PORT closed) or add it to ' +
					'NOT_HERMETIC with the live dependency that keeps it off the hosted tier.',
			).toBe(true);
		}

		// Stale entries are red in both directions.
		const verifySet = new Set(verify);
		for (const t of NOT_HERMETIC.keys()) {
			expect(verifySet.has(t), `NOT_HERMETIC lists ${t}, which is no longer a tripwire`).toBe(true);
			expect(
				hermetic.has(t),
				`NOT_HERMETIC lists ${t} as un-hostable, but hermetic.sh now runs it — delete the row`,
			).toBe(false);
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

	// Rule 10 — the index describes what each gate ASSERTS, never how it is doing.
	test('no TRIPWIRES.md row narrates a transient red/failing state as a standing fact', () => {
		const src = read('engineering/TRIPWIRES.md');
		const rows = [...src.matchAll(/^\| (test\/[^\s|]+\.test\.ts) \|.*$/gm)].map(
			(m) => [m[1] as string, m[0] as string] as const,
		);
		// Anti-vacuity: the same grammar rule 4 parses — if it drifted, this rule
		// would otherwise scan zero rows and pass having read nothing.
		expect(
			rows.length,
			'engineering/TRIPWIRES.md: the row grammar changed and this rule is now scanning nothing',
		).toBe(ledgerTripwires().length);
		const offenders = rows.flatMap(([path, row]) =>
			findStatusProse(row).map((excerpt) => `${path}: “${excerpt}”`),
		);
		expect(
			offenders,
			'A TRIPWIRES.md row is where a RULE lives, never where its current state lives. Transient state — a gate that is not green at some moment, the files it is over on — belongs in rewrite/LEDGER.md (gitignored, not on a clone) or in the commit message of the change that opened it; narrating it in the index makes that state read as the expected condition and trains the regeneration reflex the ratchets exist to prevent. It is also never load-bearing: rule 4 parses only the first column, and scripts/verify.ts has no allowlist. Fix the gate (or take the deliberate, reviewed regression path its own message names), then DELETE the narration — keep the general rule wording around it, which is usually correct. Each line quotes the offending excerpt:\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});

	test('every tripwire file listed anywhere actually exists', async () => {
		for (const t of new Set([...verifyTripwires(), ...hermeticTripwires(), ...ledgerTripwires()])) {
			expect(await Bun.file(join(repoRoot, t)).exists(), `${t} listed but missing on disk`).toBe(
				true,
			);
		}
	});
});
