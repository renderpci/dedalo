/**
 * TIER WIRING — every gate the repo owns is REACHED by a workflow that EXECUTES.
 *
 * P0-1 residual of the 2026-08-26 deep audit (GATE-02, GATE-03, GATE-14, GATE-15). The
 * three earlier P0-1 gates answer "does the tier script run its array"
 * (tier_execution), "does every test file have a tier" (tier_assignment) and "is every
 * tripwire assigned" (ci_workflow rule 3c). None of them asked the question underneath:
 * is the tier script itself RUN BY ANYTHING? Measured at HEAD before this gate:
 * scripts/ci/client_gate.sh (133 browser suites), `bun run test:update` and
 * `bun run test:update:dev` were invoked ONLY from .github/workflows-selfhosted/ — a
 * directory GitHub does not read on a public repo (ci_workflow rule 5) — and
 * scripts/verify.ts likewise. Wired, green, and never executed on any CI.
 *
 * WHAT IS HELD, each leg DERIVED from the tree with a floor, never a hand list:
 *
 *   A. TOTAL census of scripts/ci/*.sh: each is reached from an EXECUTING chain
 *      (.github/workflows/*.yml or .gitlab-ci.yml → `bash scripts/ci/x.sh`, transitively
 *      through `bash`/`source` lines of the scripts themselves) or sits in the
 *      shrink-only SELF_HOSTED_ONLY map with a reason. A stale row is red.
 *   B. Every `run:` payload of .github/workflows-selfhosted/*.yml — the parked tier — is
 *      DELIVERED by a hosted chain (its tier script reached; its `bun test` paths
 *      claimed by an executing TierSpec; verify.ts's stages twinned) or the workflow
 *      is exempt with a reason. The mirror's steps may not be the only home of anything.
 *   C. scripts/verify.ts's stage names, DERIVED from its `results.push({ name })` and
 *      `runTestFiles('…')` calls, each have a hosted twin that is actually executed.
 *   D. Every package.json `test:*` / `ci:*` script that names a `scripts/*.ts` module is
 *      invoked BY NAME from a reached script or executing workflow, or carries a reason
 *      in the shrink-only LOCAL_ONLY_SCRIPTS map.
 *   E. Every tier root (a script a workflow runs directly) keeps the independent-stage
 *      accumulator, and every job that BUILDS the suite database declares its own
 *      service container.
 *   F. Every job that runs a tier root carries NO step-level `if:`, NO
 *      `continue-on-error:`, and no job-level `if:` EXCEPT the one sanctioned dedupe
 *      condition — a conditioned job is silent on the events it excludes, a tolerated
 *      step is green whatever the tier said; `needs:` no job that is itself
 *      conditioned (a skipped upstream skips the tier, transitively); the step's WHOLE
 *      payload is exactly `bash <root>` — `|| true`, `; true`, a `run: |` block around
 *      it and a `| tee` (no pipefail in the default shell) all swallow the verdict; and
 *      no tier root exits before its accumulator decides. Measured: `if: false` on the
 *      instance job, `continue-on-error: true` and `|| true` on its run step, and a
 *      `needs:` on an `if:`-gated job each left the other legs green.
 *      THE DEDUPE CARVE-OUT (2026-09-26): one sha landing on both LANDING_BRANCHES ran
 *      every tier twice, so a job-level `if:` reading `needs.<job>.outputs.<key>` /
 *      `needs.<job>.result` of an UNCONDITIONED upstream job is allowed — but it is not
 *      trusted by spelling. It is EVALUATED (skipConditionFaults) over every event ×
 *      upstream result × output: true on every non-push event (a PR, a dispatch, a
 *      schedule can never be skipped), true on a push whose upstream said nothing or
 *      `false` (fail-open), and true on a push whose upstream FAILED or was cancelled —
 *      the implicit success() is MODELLED, so a condition without the `!cancelled()`
 *      guard is red: a failed dedupe would skip the tier, and a skipped job passes a
 *      required check. Its grammar is closed — an optional `!cancelled() && ( … )`
 *      around `||`-joined `==`/`!=` comparisons against a quoted literal — so
 *      `always()`, `success()`, a bare `&&`, a negation or a function call is red, not
 *      guessed at. What the upstream probe decides is ci_workflow_tripwire rule 19's
 *      business: it is executed there against stubbed run listings.
 *   G. Every executing workflow that runs a tier root FIRES on the events work lands
 *      through: `pull_request` bare (no paths/branches/types narrowing) and `push` to
 *      exactly LANDING_BRANCHES (`master`, `v7`; held equal both ways so neither the
 *      constant nor the files can drift alone). The GitLab mirror's tier job carries no
 *      `allow_failure`, no `when: manual|never`, rules for merge requests AND the
 *      default branch, and the run line as its whole script item. Measured: every
 *      workflow back to `branches: [master]` — the audit's exact GATE-03(c) — left
 *      legs A–F green; so did `on: workflow_dispatch` alone.
 *   H. Every STAGE line (`bun …`, `bunx …`, `bash scripts/ci/…`) of every reached
 *      script carries its exit status to the verdict: bare under `set -e`, or
 *      `|| x_rc=$?` + `[ "$x_rc" -eq 0 ] || … tier_status=1`, or a `|| {` block that
 *      raises, or under `set +e` a `V=$?` capture that reaches `exit "$V"`. `|| true`,
 *      `; true`, `|| echo`, a pipe, an `_rc` nobody checks: red. The unit tier's
 *      advisory stage is the ONE reasoned, shrink-only ADVISORY_STAGES row, red the
 *      day its raise line is restored. Measured: `bun run test:update || true` in
 *      instance_tier.sh left legs A–F green (leg D credits the invocation, leg E only
 *      asks that tier_status is raised SOMEWHERE).
 *
 * WHAT IS NOT GATED, and said so rather than pretended: GitHub branch protection is
 * owner-only and unobservable from the repo. The required checks (`ci / hermetic`,
 * `db / db`, `db / instance`) and the periodic `gh api …/branches/<b>/protection`
 * verification are a runbook step in engineering/CI.md, not an assertion here. Nor is
 * GitLab's default branch observable (its rules are held textually), nor a `shell:`
 * override on a step (a single command's status is the step's under any shell).
 *
 * DB-free by construction: file scans plus the import of the two TierSpec modules
 * (the same import tier_assignment_tripwire makes on the hermetic tier).
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TierSpec } from '../../scripts/lib/red_baseline.ts';

const ROOT = resolve(import.meta.dir, '../..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const yaml = (f: string) => f.endsWith('.yml') || f.endsWith('.yaml');

// ─────────────────────────────────────────────────────────────────────────────
// The corpus, as a PURE structure — the real one is read once; the controls below
// mutate copies of it, which is how every leg proves it can see the offender.
// ─────────────────────────────────────────────────────────────────────────────

interface Corpus {
	/** EXECUTING workflow definitions: .github/workflows/*.yml + .gitlab-ci.yml. */
	workflows: Map<string, string>;
	/** TOTAL: every scripts/ci/*.sh, whether or not anything runs it. */
	scripts: Map<string, string>;
}

function realCorpus(): Corpus {
	const workflows = new Map<string, string>();
	for (const f of readdirSync(join(ROOT, '.github', 'workflows'))
		.filter(yaml)
		.sort()) {
		workflows.set(`.github/workflows/${f}`, read(`.github/workflows/${f}`));
	}
	workflows.set('.gitlab-ci.yml', read('.gitlab-ci.yml'));
	const scripts = new Map<string, string>();
	for (const f of readdirSync(join(ROOT, 'scripts', 'ci')).sort()) {
		if (!f.endsWith('.sh')) continue;
		scripts.set(`scripts/ci/${f}`, read(`scripts/ci/${f}`));
	}
	return { workflows, scripts };
}

/** Lines that are CODE: a shell or YAML comment cannot invoke anything. */
function codeLines(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'));
}

const SCRIPT_REF =
	/(?:^|[\s;&|(])(?:bash|source|\.)\s+"?(?:\$REPO_ROOT\/)?(scripts\/ci\/[a-z0-9_]+\.sh)"?/g;

/** The scripts/ci/*.sh a text invokes or sources, on its code lines. */
function scriptRefs(text: string): string[] {
	const found: string[] = [];
	for (const line of codeLines(text)) {
		for (const m of line.matchAll(SCRIPT_REF)) found.push(m[1] as string);
	}
	return found;
}

/**
 * The scripts reached from the executing workflows, transitively. `roots` are the ones a
 * workflow runs DIRECTLY — the tier scripts, held to the accumulator law below.
 */
function reachedScripts(corpus: Corpus): { reached: Set<string>; roots: Set<string> } {
	const roots = new Set<string>();
	for (const text of corpus.workflows.values()) for (const ref of scriptRefs(text)) roots.add(ref);
	const reached = new Set<string>();
	const queue = [...roots];
	while (queue.length > 0) {
		const rel = queue.shift() as string;
		if (reached.has(rel)) continue;
		reached.add(rel);
		const text = corpus.scripts.get(rel);
		if (text === undefined) continue;
		for (const ref of scriptRefs(text)) if (!reached.has(ref)) queue.push(ref);
	}
	return { reached, roots };
}

/** Every code line of every REACHED script plus every executing workflow — the hosted chain's text. */
function hostedChainLines(corpus: Corpus): string[] {
	const { reached } = reachedScripts(corpus);
	const lines: string[] = [];
	for (const text of corpus.workflows.values()) lines.push(...codeLines(text));
	for (const rel of reached) {
		const text = corpus.scripts.get(rel);
		if (text !== undefined) lines.push(...codeLines(text));
	}
	return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leg A — scripts/ci/*.sh, TOTAL, each with an executing home or a reason.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SHRINK-ONLY. A script here runs only on the private mirror's self-hosted runner, and
 * the reason says why a hosted runner CANNOT run it — not why nobody has wired it yet.
 */
const SELF_HOSTED_ONLY: ReadonlyMap<string, string> = new Map([
	[
		'scripts/ci/link_siblings.sh',
		'Its whole job is materializing the SIBLING trees of the data host (../private → the real private dir, the PHP tree) as symlinks inside the runner checkout. A hosted runner has no sibling to link: the hosted tiers compose their configuration in-process (scripts/ci/hosted_env.sh) precisely so that no such file exists, and ci_workflow_tripwire rule 13 FORBIDS any hosted tier from invoking this script.',
	],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Leg B — the parked tier's run: payloads, each delivered by a hosted chain.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SHRINK-ONLY. A parked workflow whose steps are not GATES and so have no hosted twin
 * to demand.
 */
const EXEMPT_SELFHOSTED_WORKFLOWS: ReadonlyMap<string, string> = new Map([
	[
		'.github/workflows-selfhosted/deploy.yml',
		'A DEPLOY, not a gate: it is PARKED until a target host exists (engineering/CI.md §Deploy), its only run: payloads are the loud PARKED guard and deploy/deploy.sh over SSH with a repository secret, and neither proves anything about the code. A hosted twin would be a deploy from a fork PR.',
	],
]);

/** The `run:` payloads of a workflow: single-line `run: cmd` and `run: |` blocks. */
function runPayloads(text: string): string[] {
	const payloads: string[] = [];
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const single = line.match(/^\s*(?:-\s+)?run:\s+(?!\|)(\S.*)$/);
		if (single) {
			payloads.push((single[1] as string).trim());
			continue;
		}
		if (/^\s*(?:-\s+)?run:\s*\|\s*$/.test(line)) {
			const indent = (line.match(/^\s*/) as RegExpMatchArray)[0].length;
			for (let j = i + 1; j < lines.length; j++) {
				const body = lines[j] as string;
				if (body.trim() === '') continue;
				const bodyIndent = (body.match(/^\s*/) as RegExpMatchArray)[0].length;
				if (bodyIndent <= indent) break;
				payloads.push(body.trim());
			}
		}
	}
	return payloads.filter((p) => !p.startsWith('#'));
}

/** The command a payload line runs: its first pipe segment, redirections stripped. */
function commandOf(payload: string): string {
	return (payload.split('|')[0] as string)
		.replace(/\d?>&\d/g, '')
		.replace(/\s+\d?>\S+/g, '')
		.trim();
}

/** Top-level test/ directories that hold at least one test file — what a bare `bun test` runs. */
function testDirectories(): string[] {
	const hasTest = (dir: string): boolean =>
		readdirSync(dir).some((entry) => {
			const path = join(dir, entry);
			return statSync(path).isDirectory() ? hasTest(path) : entry.endsWith('.test.ts');
		});
	return readdirSync(join(ROOT, 'test'))
		.filter((entry) => statSync(join(ROOT, 'test', entry)).isDirectory())
		.filter((entry) => hasTest(join(ROOT, 'test', entry)))
		.map((entry) => `test/${entry}`)
		.sort();
}

/**
 * The directories an EXECUTING TierSpec claims: the `bun run scripts/X.ts` modules the
 * reached scripts invoke, imported for their real `paths` when their source declares a
 * spec — the same binding tier_assignment_tripwire uses.
 */
async function claimedByExecutingSpecs(corpus: Corpus): Promise<Set<string>> {
	const claimed = new Set<string>();
	const modules = new Set<string>();
	for (const line of hostedChainLines(corpus)) {
		for (const m of line.matchAll(/\bbun run (scripts\/[A-Za-z0-9_./-]+\.ts)/g))
			modules.add(m[1] as string);
	}
	for (const module of modules) {
		const source = read(module);
		const names = [...source.matchAll(/^export const ([A-Za-z0-9_]+): TierSpec\b/gm)].map(
			(m) => m[1] as string,
		);
		if (names.length === 0) continue;
		const loaded = (await import(join(ROOT, module))) as Record<string, unknown>;
		for (const name of names) {
			const spec = loaded[name] as TierSpec | undefined;
			for (const path of spec?.paths ?? []) claimed.add(path);
		}
	}
	return claimed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leg C — verify.ts's stages, derived, each with an executed hosted twin.
// ─────────────────────────────────────────────────────────────────────────────

function verifyStages(): string[] {
	const src = read('scripts/verify.ts');
	const names = new Set<string>();
	for (const m of src.matchAll(/results\.push\(\{\s*name:\s*'([A-Za-z0-9_:]+)'/g))
		names.add(m[1] as string);
	for (const m of src.matchAll(/runTestFiles\('([A-Za-z0-9_:]+)'/g)) names.add(m[1] as string);
	return [...names].sort();
}

function verifyTripwires(): string[] {
	const block = read('scripts/verify.ts').match(/const TRIPWIRES = \[([\s\S]*?)\];/)?.[1];
	if (!block) throw new Error('scripts/verify.ts: TRIPWIRES array not found');
	return [...block.matchAll(/'(test\/[^']+\.test\.ts)'/g)].map((m) => m[1] as string);
}

/** The union of every `*_TRIPWIRES=(` array declared by a REACHED script. */
function hostedTripwires(corpus: Corpus): Set<string> {
	const union = new Set<string>();
	const { reached } = reachedScripts(corpus);
	for (const rel of reached) {
		const text = corpus.scripts.get(rel);
		if (text === undefined) continue;
		for (const m of text.matchAll(/^[A-Z0-9_]*TRIPWIRES=\(\n([\s\S]*?)\n\)/gm)) {
			for (const line of codeLines(m[1] as string)) {
				if (/^test\/\S+\.test\.ts$/.test(line)) union.add(line);
			}
		}
	}
	return union;
}

interface TwinContext {
	lines: string[];
	claimed: Set<string>;
	corpus: Corpus;
}

/** Each verify stage → what a hosted chain must EXECUTE to stand in for it; null = delivered. */
const VERIFY_STAGE_TWINS: Record<string, (ctx: TwinContext) => string | null> = {
	typecheck: ({ lines }) =>
		lines.some(
			(l) => /^bun run --parallel\b.*\btypecheck\b/.test(l) || /^bunx tsc --noEmit/.test(l),
		)
			? null
			: 'no reached script runs `typecheck` (bun run --parallel … typecheck, or bunx tsc --noEmit)',
	lint: ({ lines }) =>
		lines.some(
			(l) => /^bun run --parallel\b.*\blint\b(?!:)/.test(l) || /^bun run lint\b(?!:)/.test(l),
		)
			? null
			: 'no reached script runs `lint`',
	'lint:browser': ({ lines }) =>
		lines.some((l) => /^bun run\b.*\blint:browser\b/.test(l))
			? null
			: 'no reached script runs `lint:browser` — the browser-tree error budget (P1-17) executes nowhere',
	tripwires: ({ corpus }) => {
		const hosted = hostedTripwires(corpus);
		const missing = verifyTripwires().filter((t) => !hosted.has(t));
		return missing.length === 0
			? null
			: `verify.ts TRIPWIRES not in any reached tier's array: ${missing.join(', ')}`;
	},
	neighbours: ({ claimed }) => {
		// verify's neighbour selector picks files under test/; a hosted twin exists iff
		// every test directory is claimed by a TierSpec some reached script RUNS.
		const unclaimed = testDirectories().filter((dir) => !claimed.has(dir));
		return unclaimed.length === 0
			? null
			: `test directories no executing TierSpec claims (verify's neighbours could select files there that run on no CI): ${unclaimed.join(', ')}`;
	},
	'crap:ledger': ({ lines }) =>
		// verify.ts compares the ledger against the merge-base; hermetic.sh fetches
		// the reference itself (base tip on a PR, first parent on a push) and runs
		// the same `--check --reference` — an empty reference is refused by the script.
		lines.some((l) => /^bun run scripts\/crap_baseline\.ts --check --reference\b/.test(l))
			? null
			: "no reached script runs `scripts/crap_baseline.ts --check --reference` — the ledger's append-only proof against history (P2-18/GATE-22) executes nowhere",
	site_builder: ({ lines }) => {
		// hermetic.sh runs the daemon package through its daemon_gate() function: the
		// invocation names the package, the function body carries the `bun test`.
		const inline = lines.some(
			(l) => l.includes('publication/site_builder') && /\bbun test\b/.test(l),
		);
		const viaFunction =
			lines.some((l) => /^daemon_gate publication\/site_builder\b/.test(l)) &&
			lines.some((l) => /\(cd "\$dir" && .*\bbun test\b/.test(l));
		return inline || viaFunction
			? null
			: 'no reached script runs `bun test` in publication/site_builder';
	},
};

// ─────────────────────────────────────────────────────────────────────────────
// Leg D — package.json test:*/ci:* scripts naming a scripts/*.ts module.
// ─────────────────────────────────────────────────────────────────────────────

/** SHRINK-ONLY. Developer-desk commands, each with the reason it is NOT a CI gate. */
const LOCAL_ONLY_SCRIPTS: ReadonlyMap<string, string> = new Map([
	[
		'test:baseline',
		'Generates/refreshes the test-baseline artifacts (a campaign tool), it asserts nothing.',
	],
	['test:timings', 'The same generator in timings mode; a measurement, not a gate.'],
	[
		'test:shard',
		'Plans a shard partition for a developer running the suite in parallel; the plan itself is gated by test_shard_partition_tripwire on the hermetic tier.',
	],
	[
		'test:shard:sweep',
		'The shard planner in sweep mode — a developer tool over the same gated planner.',
	],
	[
		'test:client:server',
		'Keeps the client suite server alive for BROWSING a page by hand (scripts/client_test_serve.ts); the suite that asserts is test:client, which the instance tier runs.',
	],
	[
		'ci:local',
		'IS the local reproduction of the CI tiers (scripts/ci_local.ts): it runs the tier scripts this gate holds; running it from CI would run CI inside CI.',
	],
]);

function packageTestScripts(): Map<string, string> {
	const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
	const found = new Map<string, string>();
	for (const [name, command] of Object.entries(pkg.scripts)) {
		if (!/^(?:test|ci):/.test(name)) continue;
		if (!/\bscripts\/[A-Za-z0-9_./-]+\.ts\b/.test(command)) continue;
		found.set(name, command);
	}
	return found;
}

/**
 * An INVOCATION, never a mention: the command must open the line (after optional
 * `KEY=value` prefixes). Unanchored, the tier's own `echo "… (bun run test:update)"`
 * label credited the script after its run line was deleted — measured while
 * mutation-verifying this leg, which is why the anchor is not optional.
 */
function invokedByName(name: string, lines: string[]): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`^(?:[A-Z0-9_]+=\\S*\\s+)*bun run ${escaped}(?=[\\s"'|&;)]|$)`);
	return lines.some((line) => re.test(line));
}

// ─────────────────────────────────────────────────────────────────────────────
// The gate
// ─────────────────────────────────────────────────────────────────────────────

const CORPUS = realCorpus();
const REAL = reachedScripts(CORPUS);
const CHAIN_LINES = hostedChainLines(CORPUS);

describe('tier wiring — every gate is reached by a workflow that executes', () => {
	test('controls: the reachability walk follows bash and source, and ignores comments', () => {
		const corpus: Corpus = {
			workflows: new Map([
				['x.yml', 'jobs:\n  j:\n    steps:\n      - run: bash scripts/ci/a.sh\n'],
			]),
			scripts: new Map([
				['scripts/ci/a.sh', 'source scripts/ci/b.sh\n# bash scripts/ci/e.sh\n'],
				['scripts/ci/b.sh', 'bash scripts/ci/c.sh || rc=$?\n'],
				['scripts/ci/c.sh', 'echo c\n'],
				['scripts/ci/d.sh', 'echo unreferenced\n'],
				['scripts/ci/e.sh', 'echo only in a comment\n'],
			]),
		};
		const { reached, roots } = reachedScripts(corpus);
		expect([...roots]).toEqual(['scripts/ci/a.sh']);
		expect([...reached].sort()).toEqual(['scripts/ci/a.sh', 'scripts/ci/b.sh', 'scripts/ci/c.sh']);
		// The gitlab list-item spelling is a root too.
		const gitlab: Corpus = {
			workflows: new Map([
				['.gitlab-ci.yml', 'hermetic:\n  script:\n    - bash scripts/ci/a.sh\n'],
			]),
			scripts: new Map([['scripts/ci/a.sh', '']]),
		};
		expect([...reachedScripts(gitlab).roots]).toEqual(['scripts/ci/a.sh']);
	});

	test('control: dropping the instance job from db.yml orphans instance_tier.sh AND client_gate.sh', () => {
		const withoutInstance = new Map(CORPUS.workflows);
		withoutInstance.set(
			'.github/workflows/db.yml',
			(withoutInstance.get('.github/workflows/db.yml') as string).replace(
				/^\s*run: bash scripts\/ci\/instance_tier\.sh\s*$/m,
				'',
			),
		);
		const { reached } = reachedScripts({ workflows: withoutInstance, scripts: CORPUS.scripts });
		expect(reached.has('scripts/ci/instance_tier.sh')).toBe(false);
		expect(reached.has('scripts/ci/client_gate.sh')).toBe(false);
		// …and the real corpus reaches both, or the control above proved the wrong thing.
		expect(REAL.reached.has('scripts/ci/instance_tier.sh')).toBe(true);
		expect(REAL.reached.has('scripts/ci/client_gate.sh')).toBe(true);
	});

	// Leg A
	test('A. every scripts/ci/*.sh is reached from an executing workflow or carries a self-hosted-only reason', () => {
		expect(
			CORPUS.scripts.size,
			'the scripts/ci census is smaller than the tree — the walk broke',
		).toBeGreaterThanOrEqual(5);
		expect(
			REAL.roots.size,
			'no executing workflow runs any scripts/ci script',
		).toBeGreaterThanOrEqual(3);
		const orphans = [...CORPUS.scripts.keys()].filter(
			(rel) => !REAL.reached.has(rel) && !SELF_HOSTED_ONLY.has(rel),
		);
		expect(
			orphans,
			'scripts/ci scripts reached from NO executing workflow chain (.github/workflows/*.yml, .gitlab-ci.yml, transitively through bash/source lines). A script only the parked self-hosted tier names runs nowhere: give it an executing home, or — only if a hosted runner CANNOT run it — a reasoned SELF_HOSTED_ONLY row:',
		).toEqual([]);
		for (const [rel, reason] of SELF_HOSTED_ONLY) {
			expect(
				CORPUS.scripts.has(rel),
				`SELF_HOSTED_ONLY names ${rel}, which no longer exists — delete the row`,
			).toBe(true);
			expect(
				REAL.reached.has(rel),
				`SELF_HOSTED_ONLY names ${rel}, but a hosted chain now reaches it — delete the row`,
			).toBe(false);
			expect(reason.length).toBeGreaterThan(40);
		}
	});

	// Leg B
	test('B. every run: payload of the parked self-hosted tier is delivered by a hosted chain (or the workflow is exempt with a reason)', async () => {
		const dir = join(ROOT, '.github', 'workflows-selfhosted');
		const files = readdirSync(dir)
			.filter(yaml)
			.map((f) => `.github/workflows-selfhosted/${f}`);
		expect(
			files.length,
			'the parked tier is empty — ci_workflow_tripwire guards its presence',
		).toBeGreaterThan(0);
		for (const [rel] of EXEMPT_SELFHOSTED_WORKFLOWS) {
			expect(
				files,
				`EXEMPT_SELFHOSTED_WORKFLOWS names ${rel}, which no longer exists — delete the row`,
			).toContain(rel);
		}

		// Control: the payload parser sees both spellings, and strips the tee.
		const parsed = runPayloads(
			'steps:\n  - run: bash scripts/ci/x.sh 2>&1 | tee x.log\n  - name: n\n    run: |\n      echo a\n      bun test --timeout=30000 test/unit\n  - uses: z\n',
		);
		expect(parsed).toEqual([
			'bash scripts/ci/x.sh 2>&1 | tee x.log',
			'echo a',
			'bun test --timeout=30000 test/unit',
		]);
		expect(commandOf(parsed[0] as string)).toBe('bash scripts/ci/x.sh');

		const claimed = await claimedByExecutingSpecs(CORPUS);
		const allTestDirs = testDirectories();
		expect(allTestDirs.length).toBeGreaterThanOrEqual(3);
		const undelivered: string[] = [];
		let payloadsSeen = 0;
		for (const rel of files) {
			if (EXEMPT_SELFHOSTED_WORKFLOWS.has(rel)) continue;
			for (const payload of runPayloads(read(rel))) {
				payloadsSeen++;
				const command = commandOf(payload);
				const script = command.match(/^bash (scripts\/ci\/[a-z0-9_]+\.sh)/)?.[1];
				if (script !== undefined) {
					if (REAL.reached.has(script) || SELF_HOSTED_ONLY.has(script)) continue;
					undelivered.push(`${rel}: ${command} — ${script} is reached by no hosted chain`);
					continue;
				}
				if (/^bun install --frozen-lockfile$/.test(command)) {
					if (CHAIN_LINES.some((l) => l.includes('bun install --frozen-lockfile'))) continue;
					undelivered.push(`${rel}: ${command} — no hosted chain installs`);
					continue;
				}
				if (/^bun run scripts\/verify\.ts\b/.test(command)) {
					const ctx: TwinContext = { lines: CHAIN_LINES, claimed, corpus: CORPUS };
					const broken = verifyStages()
						.map((stage) => {
							const twin = VERIFY_STAGE_TWINS[stage];
							return twin === undefined ? `stage '${stage}' has no twin` : twin(ctx);
						})
						.filter((r): r is string => r !== null);
					if (broken.length === 0) continue;
					undelivered.push(`${rel}: ${command} — ${broken.join('; ')}`);
					continue;
				}
				const bunTest = command.match(/^bun test\b(.*)$/);
				if (bunTest) {
					const paths = (bunTest[1] as string)
						.split(/\s+/)
						.filter((t) => t !== '' && !t.startsWith('-'));
					const wanted = paths.length === 0 ? allTestDirs : paths;
					const unclaimed = wanted.filter((p) => !claimed.has(p));
					if (unclaimed.length === 0) continue;
					undelivered.push(
						`${rel}: ${command} — no executing TierSpec claims ${unclaimed.join(', ')}`,
					);
					continue;
				}
				undelivered.push(
					`${rel}: ${command} — unrecognised payload; a parked step this gate cannot classify has no proven twin`,
				);
			}
		}
		expect(
			payloadsSeen,
			'the parked tier has no run: payloads — the parser or the tier changed shape',
		).toBeGreaterThanOrEqual(6);
		expect(
			undelivered,
			'Steps of the parked self-hosted tier that NO executing hosted chain delivers. The private mirror is not wired, so anything only these steps run, runs nowhere:\n  ' +
				undelivered.join('\n  '),
		).toEqual([]);
	});

	// Leg C
	test('C. every scripts/verify.ts stage (derived) has a hosted twin that a reached script executes', async () => {
		const stages = verifyStages();
		expect(
			stages.length,
			'verify.ts stage derivation found too few stages — its results.push grammar changed',
		).toBeGreaterThanOrEqual(5);
		const ctx: TwinContext = {
			lines: CHAIN_LINES,
			claimed: await claimedByExecutingSpecs(CORPUS),
			corpus: CORPUS,
		};
		const problems: string[] = [];
		for (const stage of stages) {
			const twin = VERIFY_STAGE_TWINS[stage];
			if (twin === undefined) {
				problems.push(
					`${stage}: a verify stage with NO hosted twin declared — decide what executes it on CI and add it to VERIFY_STAGE_TWINS`,
				);
				continue;
			}
			const failure = twin(ctx);
			if (failure !== null) problems.push(`${stage}: ${failure}`);
		}
		for (const declared of Object.keys(VERIFY_STAGE_TWINS)) {
			if (!stages.includes(declared))
				problems.push(
					`VERIFY_STAGE_TWINS names '${declared}', which verify.ts no longer reports — delete the row`,
				);
		}
		expect(
			problems,
			'scripts/verify.ts runs on no CI (it is invoked only by the parked tier); every one of its stages must therefore be executed by a hosted twin:\n  ' +
				problems.join('\n  '),
		).toEqual([]);

		// Control: a hermetic.sh without lint:browser is an undelivered stage.
		const neutered = CHAIN_LINES.map((l) => l.replace(/\blint:browser\b/g, ''));
		expect(VERIFY_STAGE_TWINS['lint:browser']?.({ ...ctx, lines: neutered })).not.toBeNull();
		// Control: a tier array missing a verify tripwire is an undelivered stage.
		const scripts = new Map(CORPUS.scripts);
		const first = verifyTripwires()[0] as string;
		for (const [rel, text] of scripts) scripts.set(rel, text.replace(`\t${first}\n`, ''));
		expect(
			VERIFY_STAGE_TWINS.tripwires?.({ ...ctx, corpus: { workflows: CORPUS.workflows, scripts } }),
		).toContain(first);
	});

	// Leg D
	test('D. every package.json test:*/ci:* script naming a scripts/*.ts module is run BY NAME on a hosted chain, or is local-only with a reason', () => {
		const scripts = packageTestScripts();
		expect(
			scripts.size,
			'package.json has no test:*/ci:* scripts naming scripts/*.ts — the derivation is blind',
		).toBeGreaterThanOrEqual(8);
		const delivered: string[] = [];
		const orphans: string[] = [];
		for (const name of scripts.keys()) {
			if (invokedByName(name, CHAIN_LINES)) {
				delivered.push(name);
				if (LOCAL_ONLY_SCRIPTS.has(name))
					orphans.push(`${name}: listed LOCAL_ONLY but a hosted chain runs it — delete the row`);
				continue;
			}
			if (!LOCAL_ONLY_SCRIPTS.has(name))
				orphans.push(`${name} (${scripts.get(name)}): run by no hosted chain and no reason given`);
		}
		for (const name of LOCAL_ONLY_SCRIPTS.keys()) {
			if (!scripts.has(name))
				orphans.push(
					`LOCAL_ONLY_SCRIPTS names '${name}', which package.json no longer defines — delete the row`,
				);
		}
		expect(
			orphans,
			`package.json gates with no executing home:\n  ${orphans.join('\n  ')}`,
		).toEqual([]);
		// The three the audit measured as unrun, now delivered — the floor that makes
		// this leg mean something.
		for (const must of ['test:client', 'test:update', 'test:update:dev', 'test:db:setup']) {
			expect(delivered, `${must} is not run by name on any hosted chain`).toContain(must);
		}
		// Controls: the name match is exact — `test:update` is not credited by
		// `test:update:dev` — and a MENTION (an echo label, a string) is not a run.
		expect(invokedByName('test:update', ['bun run test:update:dev'])).toBe(false);
		expect(invokedByName('test:update', ['bun run test:update || rc=$?'])).toBe(true);
		expect(invokedByName('test:update', ['TMPDIR=/tmp/dd bun run test:update'])).toBe(true);
		expect(invokedByName('test:update', ['echo "== drill (bun run test:update)"'])).toBe(false);
	});

	// Leg E
	test('E. every tier root keeps the independent-stage accumulator, and every suite-building job has its own service', () => {
		expect(REAL.roots.size).toBeGreaterThanOrEqual(3);
		for (const rel of REAL.roots) {
			const text = CORPUS.scripts.get(rel) as string;
			expect(
				text.includes('tier_status=0'),
				`${rel}: no tier_status accumulator — under set -e the first red stage hides every later one`,
			).toBe(true);
			expect(
				/tier_status=1|tier_status=\$\?/.test(text),
				`${rel}: tier_status is never raised`,
			).toBe(true);
			expect(
				/\[ "\$tier_status" -eq 0 \]|exit "?\$tier_status"?/.test(text),
				`${rel}: tier_status never decides the exit`,
			).toBe(true);
		}
		// A job that builds the suite database on a hosted runner needs a Postgres of
		// its own; without a services: block its gates die at connect and the run is
		// noise. Jobs are the `  <id>:` blocks under `jobs:`.
		const suiteBuilders = new Set(
			[...REAL.reached].filter((rel) =>
				/^\s*bun run test:db:setup\b/m.test(CORPUS.scripts.get(rel) ?? ''),
			),
		);
		expect(suiteBuilders).toContain('scripts/ci/instance_tier.sh');
		let jobsChecked = 0;
		for (const [rel, text] of CORPUS.workflows) {
			const jobsAt = text.indexOf('\njobs:');
			if (jobsAt === -1) continue;
			const jobBlocks = text
				.slice(jobsAt)
				.split(/\n(?= {2}[A-Za-z0-9_-]+:\s*$)/m)
				.slice(1);
			for (const block of jobBlocks) {
				const runs = [...block.matchAll(/^\s*run: bash (scripts\/ci\/[a-z0-9_]+\.sh)/gm)].map(
					(m) => m[1] as string,
				);
				if (!runs.some((r) => suiteBuilders.has(r))) continue;
				jobsChecked++;
				expect(
					/^\s*services:/m.test(block),
					`${rel}: the job running ${runs.join(', ')} builds the suite database but declares no services: block`,
				).toBe(true);
			}
		}
		expect(
			jobsChecked,
			'no workflow job runs a suite-building tier — the job splitter is blind',
		).toBeGreaterThanOrEqual(2);
	});

	// Leg F
	test('F. a job that runs a tier root has no if:, no continue-on-error:, needs no conditioned job, and runs EXACTLY `bash <root>` — wired means EXECUTED and BLOCKING', () => {
		// Controls: a job under `if: false` never runs, a step under `continue-on-error`
		// never blocks — both measured GREEN against legs A–E by a reviewer, the GATE-03
		// class (wired, never executed) this gate exists for. And a tier script that
		// exits before its stages runs nothing.
		const conditioned =
			'jobs:\n  db:\n    if: false\n    runs-on: x\n    steps:\n      - run: bash scripts/ci/db_tier.sh\n';
		expect(tierJobFaults('x.yml', conditioned, new Set(['scripts/ci/db_tier.sh']))).toHaveLength(1);
		const tolerated =
			'jobs:\n  db:\n    runs-on: x\n    steps:\n      - run: bash scripts/ci/db_tier.sh\n        continue-on-error: true\n';
		expect(tierJobFaults('x.yml', tolerated, new Set(['scripts/ci/db_tier.sh']))).toHaveLength(1);
		const stepIf =
			"jobs:\n  db:\n    runs-on: x\n    steps:\n      - run: bash scripts/ci/db_tier.sh\n        if: github.event_name == 'schedule'\n";
		expect(tierJobFaults('x.yml', stepIf, new Set(['scripts/ci/db_tier.sh']))).toHaveLength(1);
		const clean =
			'jobs:\n  other:\n    if: false\n    steps:\n      - run: echo not a tier\n  db:\n    runs-on: x\n    steps:\n      - run: bash scripts/ci/db_tier.sh\n';
		expect([...tierJobFaults('x.yml', clean, new Set(['scripts/ci/db_tier.sh']))]).toEqual([]);
		// The dedupe carve-out: the sanctioned condition passes in both spellings, and
		// every way to make it skip more than a verified push is red.
		const dedupe = (condition: string, needs = 'dedupe', upstream = '') =>
			`jobs:\n  dedupe:\n    runs-on: x${upstream}\n    outputs:\n      skip: x\n    steps:\n      - run: echo probe\n  db:\n    needs: ${needs}\n    ${condition}\n    runs-on: x\n    steps:\n      - run: bash scripts/ci/db_tier.sh\n`;
		const tierRoot = new Set(['scripts/ci/db_tier.sh']);
		const sanctioned =
			"if: ${{ !cancelled() && (github.event_name != 'push' || needs.dedupe.result != 'success' || needs.dedupe.outputs.skip != 'true') }}";
		expect([...tierJobFaults('x.yml', dedupe(sanctioned), tierRoot)]).toEqual([]);
		expect([
			...tierJobFaults(
				'x.yml',
				dedupe(
					"if: \"!cancelled() && (github.event_name != 'push' || needs.dedupe.result != 'success' || needs.dedupe.outputs.skip != 'true')\"",
					'[dedupe]',
				),
				tierRoot,
			),
		]).toEqual([]);
		for (const [condition, needs, upstream] of [
			// The implicit success(): a FAILED dedupe skips the tier, and a skip passes a
			// required check — the verifier's S2 shape, the previously sanctioned spelling.
			["if: github.event_name != 'push' || needs.dedupe.outputs.skip != 'true'", 'dedupe', ''],
			// Guarded, but a failed dedupe whose output still says 'true' skips.
			[
				"if: ${{ !cancelled() && (github.event_name != 'push' || needs.dedupe.outputs.skip != 'true') }}",
				'dedupe',
				'',
			],
			[
				"if: ${{ !cancelled() && (needs.dedupe.result != 'success' || needs.dedupe.outputs.skip != 'true') }}",
				'dedupe',
				'',
			], // skips a PR
			[
				"if: ${{ !cancelled() && (github.event_name != 'push' || needs.dedupe.result != 'success' || needs.dedupe.outputs.skip == 'false') }}",
				'dedupe',
				'',
			], // fails closed on an empty output
			["if: needs.dedupe.outputs.skip != 'true'", 'dedupe', ''], // skips a PR
			["if: needs.dedupe.outputs.skip == 'false'", 'dedupe', ''], // fails closed
			["if: github.event_name != 'push' && needs.dedupe.outputs.skip != 'true'", 'dedupe', ''],
			[
				"if: always() && (github.event_name != 'push' || needs.dedupe.outputs.skip != 'true')",
				'dedupe',
				'',
			],
			[
				"if: ${{ success() && (github.event_name != 'push' || needs.dedupe.result != 'success' || needs.dedupe.outputs.skip != 'true') }}",
				'dedupe',
				'',
			],
			["if: github.event_name != 'push' || !needs.dedupe.outputs.skip", 'dedupe', ''],
			["if: github.event_name != 'push' || needs.other.outputs.skip != 'true'", 'dedupe', ''],
			["if: github.event_name != 'push' || needs.other.result != 'success'", 'dedupe', ''],
			["if: github.event_name == 'pull_request'", 'dedupe', ''], // dark on push
			[sanctioned, 'dedupe', '\n    if: false'], // the upstream itself conditioned
		] as const) {
			expect(
				[...tierJobFaults('x.yml', dedupe(condition, needs, upstream), tierRoot)].length,
				`${condition} (upstream${upstream})`,
			).toBeGreaterThan(0);
		}
		// The sanctioned condition is JOB-level only: on the run step it is red.
		expect(
			tierJobFaults(
				'x.yml',
				clean.replace(
					'      - run: bash scripts/ci/db_tier.sh\n',
					`      - run: bash scripts/ci/db_tier.sh\n        ${sanctioned}\n`,
				),
				tierRoot,
			),
		).toHaveLength(1);
		// The run payload is the WHOLE step: `|| true`, `; true`, a tee, a block.
		for (const payload of [
			'bash scripts/ci/db_tier.sh || true',
			'bash scripts/ci/db_tier.sh; true',
			'bash scripts/ci/db_tier.sh 2>&1 | tee db.log',
			'|\n          bash scripts/ci/db_tier.sh\n          true',
			'|\n          echo before\n          bash scripts/ci/db_tier.sh',
		]) {
			const swallowed = clean.replace('bash scripts/ci/db_tier.sh', payload);
			expect(
				[...tierJobFaults('x.yml', swallowed, new Set(['scripts/ci/db_tier.sh']))],
				payload,
			).toHaveLength(1);
		}
		expect(prematureExits('tier_status=0\nexit 0\nbash x || tier_status=1\n')).toHaveLength(1);
		expect(
			prematureExits(
				'tier_status=0\nbash x || { echo RED; tier_status=1; }\n[ "$tier_status" -eq 0 ] || exit 1\n',
			),
		).toEqual([]);

		const faults: string[] = [];
		let tierJobs = 0;
		for (const [rel, text] of CORPUS.workflows) {
			const found = tierJobFaults(rel, text, REAL.roots);
			tierJobs += found.jobsSeen;
			faults.push(...found);
		}
		expect(
			tierJobs,
			'no executing workflow job runs a tier root — the splitter is blind',
		).toBeGreaterThanOrEqual(3);
		expect(
			faults,
			'Tier jobs whose execution is CONDITIONED or whose verdict is TOLERATED. A `jobs.<id>.if` or a step `if:` decides whether the tier runs at all — on the events it excludes the tier is "wired" and silent; a `needs:` on such a job skips the tier with it; `continue-on-error`, a `|| true`, a `; true`, a `| tee` or a `run: |` block around the run line turn a red tier green. None belongs on a gate — the ONE exception is the job-level dedupe condition, and only while it evaluates true on every non-push event and on an unverified push (skipConditionFaults):\n  ' +
				faults.join('\n  '),
		).toEqual([]);
		for (const rel of REAL.roots) {
			expect(
				prematureExits(CORPUS.scripts.get(rel) as string),
				`${rel}: an unconditional exit before the accumulator decides — stages after it run nowhere`,
			).toEqual([]);
		}
	});

	// Leg G
	test('G. every executing workflow that runs a tier root fires on every pull_request and on a push to every landing branch; the GitLab mirror cannot tolerate or skip its tier', () => {
		// Controls — the reviewer's three measured shapes, each red here and green
		// against legs A–F: (T1) push.branches back to [master] alone (the audit's
		// GATE-03(c): "the development branch is dark"); (T2) pull_request narrowed
		// with paths-ignore; (T3) a conditioned upstream job the tier `needs`.
		const good =
			'name: x\non:\n  pull_request:\n  push:\n    branches: [master, v7]\n  workflow_dispatch:\n\njobs:\n';
		expect(triggerFaults('x.yml', good)).toEqual([]);
		expect(triggerFaults('x.yml', good.replace('[master, v7]', '[master]'))).toHaveLength(1);
		expect(triggerFaults('x.yml', good.replace('[master, v7]', '[master, v7, main]'))).toHaveLength(
			1,
		);
		expect(
			triggerFaults(
				'x.yml',
				good.replace('pull_request:\n', "pull_request:\n    paths-ignore: ['**']\n"),
			),
		).toHaveLength(1);
		expect(triggerFaults('x.yml', 'name: x\non:\n  workflow_dispatch:\njobs:\n')).toHaveLength(2);
		expect(triggerFaults('x.yml', 'name: x\njobs:\n')).toHaveLength(1);
		// Block-list branches parse the same as the flow list.
		expect(
			triggerFaults(
				'x.yml',
				'on:\n  pull_request:\n  push:\n    branches:\n      - master\n      - v7\njobs:\n',
			),
		).toEqual([]);
		const gated =
			"jobs:\n  gate:\n    if: github.event_name == 'schedule'\n    runs-on: x\n    steps:\n      - run: echo gate\n  db:\n    needs: gate\n    runs-on: x\n    steps:\n      - run: bash scripts/ci/db_tier.sh\n";
		expect(tierJobFaults('x.yml', gated, new Set(['scripts/ci/db_tier.sh']))).toHaveLength(1);
		const gatedTwice =
			'jobs:\n  gate:\n    if: false\n    steps:\n      - run: echo gate\n  mid:\n    needs: [gate]\n    steps:\n      - run: echo mid\n  db:\n    needs:\n      - mid\n    steps:\n      - run: bash scripts/ci/db_tier.sh\n';
		expect(tierJobFaults('x.yml', gatedTwice, new Set(['scripts/ci/db_tier.sh']))).toHaveLength(1);
		const gitlabGood =
			'hermetic:\n  image: oven/bun:1.4.0\n  rules:\n    - if: $CI_PIPELINE_SOURCE == "merge_request_event"\n    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH\n  script:\n    - bash scripts/ci/hermetic.sh\n';
		const roots = new Set(['scripts/ci/hermetic.sh']);
		expect(gitlabFaults(gitlabGood, roots)).toEqual([]);
		expect(
			gitlabFaults(gitlabGood.replace('  script:', '  allow_failure: true\n  script:'), roots),
		).toHaveLength(1);
		expect(
			gitlabFaults(gitlabGood.replace('  script:', '  when: manual\n  script:'), roots),
		).toHaveLength(1);
		expect(
			gitlabFaults(
				gitlabGood.replace('bash scripts/ci/hermetic.sh', 'bash scripts/ci/hermetic.sh || true'),
				roots,
			),
		).toHaveLength(1);
		expect(
			gitlabFaults(gitlabGood.replace(/ {4}- if: \$CI_COMMIT_BRANCH.*\n/, ''), roots),
		).toHaveLength(1);

		const faults: string[] = [];
		let tierWorkflows = 0;
		for (const [rel, text] of CORPUS.workflows) {
			if (!scriptRefs(text).some((r) => REAL.roots.has(r))) continue;
			tierWorkflows++;
			if (rel === '.gitlab-ci.yml') faults.push(...gitlabFaults(text, REAL.roots));
			else faults.push(...triggerFaults(rel, text));
		}
		expect(tierWorkflows, 'no executing workflow runs a tier root').toBeGreaterThanOrEqual(3);
		expect(
			faults,
			'A tier that does not fire on the event work lands through reports NOTHING (GATE-03). Every workflow running a tier root fires on every `pull_request` (bare) and on `push` to exactly LANDING_BRANCHES; the GitLab mirror runs its tier on merge requests and the default branch, unconditioned and untolerated:\n  ' +
				faults.join('\n  '),
		).toEqual([]);
	});

	// Leg H
	test('H. every stage of every reached script carries its verdict to the tier — a `|| true` is a swallowed gate', () => {
		// Controls: each accepted shape, then each swallowing shape.
		const base = 'set -euo pipefail\ntier_status=0\n';
		const verdict = '[ "$tier_status" -eq 0 ] || exit 1\n';
		const ok = (body: string) => [...stageVerdictFaults('x.sh', base + body + verdict)];
		expect(ok('bun run test:db:setup\n')).toEqual([]);
		expect(
			ok('bun test a || tw_rc=$?\n[ "$tw_rc" -eq 0 ] || { echo RED; tier_status=1; }\n'),
		).toEqual([]);
		expect(ok('bun run x || {\n\ttier_status=$?\n\techo RED\n}\n')).toEqual([]);
		expect(ok('bun run x || tier_status=1\n')).toEqual([]);
		expect(
			ok(
				'bun test a || sb_rc=$?\n[ "$sb_rc" -eq 0 ] || daemon_status=1\n[ "$daemon_status" -eq 0 ] || exit 1\n',
			),
		).toEqual([]);
		expect([
			...stageVerdictFaults(
				'x.sh',
				'set -e\nset +e\nbun run test:client\nRESULT=$?\nset -e\nexit "$RESULT"\n',
			),
		]).toEqual([]);
		expect(ok('bun run test:update || true\n')).toHaveLength(1);
		expect(ok('bun run test:update; true\n')).toHaveLength(1);
		expect(ok('bun run test:update || echo tolerated\n')).toHaveLength(1);
		expect(ok('bun run test:update 2>&1 | tee log\n')).toHaveLength(1);
		expect(ok('bun run test:update || update_rc=$?\n')).toHaveLength(1);
		expect(
			ok('bun run test:update || update_rc=$?\n[ "$update_rc" -eq 0 ] || echo RED\n'),
		).toHaveLength(1);
		expect(ok('bun run x || {\n\techo RED\n}\n')).toHaveLength(1);
		expect(
			stageVerdictFaults('x.sh', 'set -e\nset +e\nbun run test:client\necho done\n'),
		).toHaveLength(1);
		expect(ok('bash scripts/ci/client_gate.sh || true\n')).toHaveLength(1);
		expect(
			ok(
				'bash scripts/ci/client_gate.sh || client_rc=$?\n[ "$client_rc" -eq 0 ] || tier_status=1\n',
			),
		).toEqual([]);
		// The ADVISORY row is credited only while the raise is absent.
		const advisory = 'bun run scripts/unit_baseline.ts --check || unit_rc=$?\n';
		expect([...stageVerdictFaults('scripts/ci/db_tier.sh', base + advisory + verdict)]).toEqual([]);
		expect([
			...stageVerdictFaults(
				'scripts/ci/db_tier.sh',
				`${base}${advisory}[ "$unit_rc" -eq 0 ] || tier_status=1\n${verdict}`,
			),
		]).toHaveLength(1);

		const faults: string[] = [];
		let stages = 0;
		for (const rel of REAL.reached) {
			const text = CORPUS.scripts.get(rel);
			if (text === undefined) continue;
			const found = stageVerdictFaults(rel, text);
			stages += found.stagesSeen;
			faults.push(...found);
		}
		expect(
			stages,
			'the stage derivation found too few stage lines — its grammar changed',
		).toBeGreaterThanOrEqual(10);
		expect(
			faults,
			'Stages whose exit status never reaches the tier verdict. A stage aborts the script (bare, under set -e) or raises the accumulator; anything else is a gate that runs and cannot fail (GATE-15):\n  ' +
				faults.join('\n  '),
		).toEqual([]);
		for (const [key, reason] of ADVISORY_STAGES) {
			const [rel, line] = key.split(': ') as [string, string];
			expect(
				codeLines(CORPUS.scripts.get(rel) ?? ''),
				`ADVISORY_STAGES names \`${key}\`, which no longer exists — delete the row`,
			).toContain(line);
			expect(REAL.reached.has(rel)).toBe(true);
			expect(reason.length).toBeGreaterThan(80);
		}
	});
});

/**
 * The faults of every job block in `text` that runs one of `roots` (any code line of
 * the job naming it): any `if:` (job- or step-level — a step `if:` on the run line
 * conditions the tier just as well), any `continue-on-error:`, a `needs:` on a job
 * that is itself conditioned (its skip skips the tier, green — transitively), and a
 * run payload that is anything but EXACTLY `bash <root>`: `|| true`, `; true`, a
 * `run: |` block around it, a `2>&1 | tee` (GitHub's default shell has no pipefail,
 * so the tee's status IS the step's) all swallow the verdict. `jobsSeen` counts the
 * tier jobs inspected, the leg's floor.
 */
function tierJobFaults(
	rel: string,
	text: string,
	roots: ReadonlySet<string>,
): string[] & { jobsSeen: number } {
	const faults = Object.assign([] as string[], { jobsSeen: 0 });
	const jobsAt = text.search(/^jobs:/m);
	if (jobsAt === -1) return faults;
	const blocks = new Map<string, string>();
	for (const block of text
		.slice(jobsAt)
		.split(/\n(?= {2}[A-Za-z0-9_-]+:\s*$)/m)
		.slice(1)) {
		blocks.set((block.match(/^\s*([A-Za-z0-9_-]+):/) as RegExpMatchArray)[1] as string, block);
	}
	const conditioned = (id: string, seen: Set<string>): string | null => {
		const block = blocks.get(id);
		if (block === undefined) return `needs '${id}', a job this workflow does not define`;
		if (seen.has(id)) return null;
		seen.add(id);
		for (const line of codeLines(block)) {
			if (/^(?:-\s+)?if:/.test(line)) return `needs '${id}', which is conditioned by \`${line}\``;
		}
		for (const up of needsOf(block)) {
			const why = conditioned(up, seen);
			if (why !== null) return why;
		}
		return null;
	};
	for (const [id, block] of blocks) {
		const refs = scriptRefs(block).filter((r) => roots.has(r));
		if (refs.length === 0) continue;
		faults.jobsSeen++;
		for (const raw of block.split('\n')) {
			const line = raw.trim();
			if (line === '' || line.startsWith('#')) continue;
			if (/^(?:-\s+)?if:/.test(line)) {
				// Job-level (4-space key): the dedupe carve-out, EVALUATED. Anywhere else: red.
				const why = /^ {4}if:/.test(raw)
					? skipConditionFaults(line.replace(/^if:\s*/, ''), needsOf(block))
					: ['a step-level `if:` conditions the tier'];
				for (const w of why) faults.push(`${rel} job '${id}': conditioned by \`${line}\` — ${w}`);
			}
			if (/^(?:-\s+)?continue-on-error:/.test(line))
				faults.push(`${rel} job '${id}': tolerated by \`${line}\``);
		}
		for (const up of needsOf(block)) {
			const why = conditioned(up, new Set([id]));
			if (why !== null) faults.push(`${rel} job '${id}': ${why}`);
		}
		for (const payload of runPayloadsWhole(block)) {
			const named = [...payload.matchAll(SCRIPT_REF)]
				.map((m) => m[1] as string)
				.filter((r) => roots.has(r));
			if (named.length === 0) continue;
			const root = named[0] as string;
			if (payload !== `bash ${root}`)
				faults.push(
					`${rel} job '${id}': the step running ${root} has payload \`${payload.replace(/\n/g, '⏎')}\` — it must be EXACTLY \`bash ${root}\`, nothing before, after or around it`,
				);
		}
	}
	return faults;
}

/**
 * The dedupe carve-out's judge: the faults of a tier job's job-level `if:` expression,
 * found by EVALUATING it, never by comparing its spelling. The grammar is closed — an
 * optional `!cancelled() && ( … )` status guard around `||`-joined comparisons
 * `<operand> ==|!= '<literal>'`, the operand `github.event_name`,
 * `needs.<a job this one needs>.outputs.<key>` or `needs.<a job this one needs>.result`
 * — and anything outside it is a fault (`always()`, `success()`, a bare `&&`, `!x`, a
 * function call), because a condition this gate cannot evaluate is one it cannot vouch
 * for. String comparison is case-insensitive, as GitHub's is.
 *
 * The status guard is MODELLED, not assumed: without it GitHub applies the implicit
 * `success()`, so a FAILED (or timed-out) upstream SKIPS the tier — and a skipped job
 * reports as passing to a required check, so a runner fault in the dedupe would pass
 * branch protection with no tier executed. That is a fault here. `!cancelled()` lets
 * the tier run whatever the upstream's result; only a cancelled WORKFLOW stops it.
 *
 * Required outcomes, over every upstream result (success, failure, cancelled) and
 * output ('true', 'false', ''): TRUE on every non-push event — a pull request, a
 * dispatch or a schedule can never be skipped; TRUE on a push whose upstream did not
 * conclude success (the probe proved nothing); TRUE on a push whose output is empty or
 * `false` (the probe failed open or found nothing). The ONE admissible skip is a push
 * whose upstream concluded success and said 'true'.
 */
function skipConditionFaults(expression: string, needs: readonly string[]): string[] {
	let body = expression.replace(/\s+#.*$/, '').trim();
	body = body.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
	body = body.replace(/^\$\{\{([\s\S]*)\}\}$/, '$1').trim();
	const guard = body.match(/^!\s*cancelled\(\)\s*&&\s*\(([\s\S]*)\)$/);
	const statusGuarded = guard !== null;
	if (guard !== null) body = (guard[1] as string).trim();
	if (/&&|[()]|!(?!=)/.test(body))
		return [
			`\`${body}\` is outside the evaluable grammar (&&, !, parentheses, a function call — the one admitted status guard is \`!cancelled() && ( … )\`)`,
		];
	type Operand = 'event' | 'output' | 'result';
	const terms: Array<{ operand: Operand; op: string; literal: string }> = [];
	for (const term of body.split('||').map((t) => t.trim())) {
		const m = term.match(
			/^(?:github\.event_name|needs\.([A-Za-z0-9_-]+)\.(outputs\.[A-Za-z0-9_-]+|result))\s*(==|!=)\s*'([^']*)'$/,
		);
		if (m === null) return [`the term \`${term}\` is outside the evaluable grammar`];
		if (m[1] !== undefined && !needs.includes(m[1]))
			return [`it reads needs.${m[1]}, a job this one does not need`];
		const operand: Operand = m[1] === undefined ? 'event' : m[2] === 'result' ? 'result' : 'output';
		terms.push({ operand, op: m[3] as string, literal: m[4] as string });
	}
	const evaluate = (event: string, result: string, output: string) => {
		// The implicit success(): an unguarded condition is never reached on a non-success upstream.
		if (!statusGuarded && result !== 'success') return false;
		const value = { event, result, output };
		return terms.some((t) => {
			const equal = value[t.operand].toLowerCase() === t.literal.toLowerCase();
			return t.op === '==' ? equal : !equal;
		});
	};
	const faults: string[] = [];
	const RESULTS = ['success', 'failure', 'cancelled'];
	const OUTPUTS = ['true', 'false', ''];
	for (const event of ['pull_request', 'workflow_dispatch', 'schedule', 'merge_group'])
		for (const result of RESULTS)
			for (const output of OUTPUTS)
				if (!evaluate(event, result, output))
					faults.push(
						`it skips the tier on a ${event} event (upstream ${result}, output '${output}') — only a verified PUSH may be deduplicated`,
					);
	for (const result of RESULTS)
		for (const output of OUTPUTS) {
			if (result === 'success' && output === 'true') continue; // the one admissible skip
			if (!evaluate('push', result, output))
				faults.push(
					result === 'success'
						? `it skips a push whose upstream output is '${output}' — the dedupe must fail OPEN`
						: `it skips a push whose upstream ${result === 'failure' ? 'FAILED' : 'was cancelled'} (output '${output}') — a skipped job reports as passing to a required check, so a broken dedupe must RUN the tiers (guard with \`!cancelled() && ( … )\`, and test the upstream's result)`,
				);
		}
	return faults;
}

/** The job ids a block `needs:` — scalar, flow list or block list. */
function needsOf(block: string): string[] {
	const lines = block.split('\n');
	const at = lines.findIndex((l) => /^\s{4}needs:/.test(l));
	if (at === -1) return [];
	const inline = (lines[at] as string)
		.replace(/^\s*needs:\s*/, '')
		.replace(/\s+#.*$/, '')
		.trim();
	if (inline !== '') return listItems(inline, [inline]);
	const items: string[] = [];
	for (let i = at + 1; i < lines.length; i++) {
		const l = (lines[i] as string).trim();
		if (!l.startsWith('-')) break;
		items.push(...listItems('', [l]));
	}
	return items;
}

/** Every `run:` payload of a block, WHOLE: a single line as-is, a `run: |` block joined by newlines. */
function runPayloadsWhole(block: string): string[] {
	const payloads: string[] = [];
	const lines = block.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const single = line.match(/^\s*(?:-\s+)?run:\s+(?!\||>)(\S.*)$/);
		if (single) {
			payloads.push((single[1] as string).trim());
			continue;
		}
		if (/^\s*(?:-\s+)?run:\s*[|>][-+]?\s*$/.test(line)) {
			const indent = (line.match(/^\s*/) as RegExpMatchArray)[0].length;
			const body: string[] = [];
			for (let j = i + 1; j < lines.length; j++) {
				const next = lines[j] as string;
				if (next.trim() === '') continue;
				if ((next.match(/^\s*/) as RegExpMatchArray)[0].length <= indent) break;
				body.push(next.trim());
			}
			payloads.push(body.join('\n'));
		}
	}
	return payloads;
}

/**
 * Code lines of a tier script that `exit` UNCONDITIONALLY (the whole line is the exit)
 * before the accumulator's own verdict line — a script that leaves before its stages.
 * A conditional `… || exit 1` is the verdict, not a fault.
 */
function prematureExits(text: string): string[] {
	return codeLines(text).filter((line) => /^exit\b/.test(line) && !/\$tier_status/.test(line));
}

// ─────────────────────────────────────────────────────────────────────────────
// Leg G — the trigger law: a tier fires on every event work lands through.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The branches work LANDS ON. Not derived from git — a checkout on a runner holds one
 * ref — so it is a reasoned constant held EQUAL, both ways, to what the executing tier
 * workflows name: a branch listed here and missing from a tier's `push.branches` is
 * red (the audit's GATE-03(c): "the development branch is dark"), and a branch a tier
 * names that is not here is red too, so the constant cannot drift from the files.
 * `master` is the default branch (merges); `v7` is where development commits land
 * directly (engineering/CI.md, branch protection on BOTH).
 */
const LANDING_BRANCHES: readonly string[] = ['master', 'v7'];

interface Trigger {
	/** Sub-keys of the event (`branches`, `paths-ignore`, `types`…) → their scalar/list text. */
	keys: Map<string, string[]>;
}

/** `[a, b]` or a `- a` block after `key:` → the items, trimmed of quotes. */
function listItems(inline: string, block: string[]): string[] {
	const flow = inline.match(/^\[(.*)\]$/);
	const raw = flow ? (flow[1] as string).split(',') : block.map((l) => l.replace(/^-\s*/, ''));
	return raw.map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter((s) => s !== '');
}

/**
 * The `on:` block of a GitHub workflow as event → sub-keys. Supports the block form
 * (`on:\n  push:\n    branches: […]`) and the flow/scalar forms (`on: [push]`,
 * `on: push`). Returns null when no `on:` is found — a fault, not an absence.
 */
function parseTriggers(text: string): Map<string, Trigger> | null {
	const lines = text.split('\n');
	const at = lines.findIndex((l) => /^on:/.test(l));
	if (at === -1) return null;
	const events = new Map<string, Trigger>();
	const head = (lines[at] as string)
		.replace(/^on:\s*/, '')
		.replace(/\s+#.*$/, '')
		.trim();
	if (head !== '') {
		for (const ev of listItems(head, [head])) events.set(ev, { keys: new Map() });
		return events;
	}
	let current: Trigger | null = null;
	let currentKey: string[] | null = null;
	for (let i = at + 1; i < lines.length; i++) {
		const raw = (lines[i] as string).replace(/\s+#.*$/, '');
		if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
		if (/^\S/.test(raw)) break; // next top-level key
		const indent = (raw.match(/^\s*/) as RegExpMatchArray)[0].length;
		const body = raw.trim();
		if (indent === 2) {
			const ev = body.replace(/:.*$/, '');
			current = { keys: new Map() };
			events.set(ev, current);
			currentKey = null;
			continue;
		}
		if (current === null) continue;
		if (indent === 4) {
			const m = body.match(/^([A-Za-z_-]+):\s*(.*)$/);
			if (!m) continue;
			currentKey = m[2] === '' ? [] : listItems(m[2] as string, [m[2] as string]);
			current.keys.set(m[1] as string, currentKey);
			continue;
		}
		if (indent > 4 && currentKey !== null && body.startsWith('-')) {
			currentKey.push(...listItems('', [body]));
		}
	}
	return events;
}

/**
 * The faults of a GitHub workflow's `on:` block, for a workflow that runs a tier root:
 * `pull_request` present and BARE (any sub-key — branches, paths-ignore, types… —
 * narrows the events it fires on), `push` present with `branches` EQUAL to
 * LANDING_BRANCHES, and no `paths`/`paths-ignore` on push either.
 */
function triggerFaults(rel: string, text: string): string[] {
	const faults: string[] = [];
	const events = parseTriggers(text);
	if (events === null) return [`${rel}: no \`on:\` block — the workflow fires on nothing`];
	const pr = events.get('pull_request');
	if (pr === undefined) faults.push(`${rel}: no \`pull_request\` trigger`);
	else if (pr.keys.size > 0)
		faults.push(
			`${rel}: \`pull_request\` is narrowed by ${[...pr.keys.keys()].join(', ')} — a tier fires on every PR or it is not a gate`,
		);
	const push = events.get('push');
	if (push === undefined) faults.push(`${rel}: no \`push\` trigger`);
	else {
		const branches = push.keys.get('branches') ?? [];
		for (const b of LANDING_BRANCHES)
			if (!branches.includes(b))
				faults.push(`${rel}: \`push.branches\` does not name ${b} — a push there runs no tier`);
		for (const b of branches)
			if (!LANDING_BRANCHES.includes(b))
				faults.push(
					`${rel}: \`push.branches\` names ${b}, which LANDING_BRANCHES does not — add it there with its reason or drop it here`,
				);
		for (const narrowing of ['paths', 'paths-ignore', 'branches-ignore', 'tags', 'tags-ignore'])
			if (push.keys.has(narrowing)) faults.push(`${rel}: \`push\` is narrowed by ${narrowing}`);
	}
	return faults;
}

/**
 * The faults of the GitLab hermetic mirror: the job that runs a tier root must carry
 * no `allow_failure`, no manual/never `when:`, `rules:` naming both the merge-request
 * source and the default-branch push, and the run line as its whole script item.
 * (GitLab's default branch is not observable from the repo: the rule is held textually.)
 */
function gitlabFaults(text: string, roots: ReadonlySet<string>): string[] {
	const faults: string[] = [];
	const blocks = text.split(/\n(?=[A-Za-z0-9_.-]+:\s*$)/m);
	let seen = 0;
	for (const block of blocks) {
		const refs = scriptRefs(block).filter((r) => roots.has(r));
		if (refs.length === 0) continue;
		seen++;
		const id = (block.match(/^\s*([A-Za-z0-9_.-]+):/) as RegExpMatchArray)[1];
		const lines = codeLines(block);
		if (lines.some((l) => /^allow_failure:/.test(l)))
			faults.push(
				`.gitlab-ci.yml job '${id}': allow_failure — a red tier does not fail the pipeline`,
			);
		if (lines.some((l) => /^when:\s*(manual|never)\b/.test(l)))
			faults.push(
				`.gitlab-ci.yml job '${id}': when: manual|never — the tier runs only by hand, or not at all`,
			);
		if (!lines.some((l) => /merge_request_event/.test(l)))
			faults.push(`.gitlab-ci.yml job '${id}': no rule for merge_request_event`);
		if (!lines.some((l) => /CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH/.test(l)))
			faults.push(`.gitlab-ci.yml job '${id}': no rule for the default-branch push`);
		for (const root of refs) {
			if (!lines.includes(`- bash ${root}`))
				faults.push(
					`.gitlab-ci.yml job '${id}': ${root} is not a whole script item (\`- bash ${root}\`) — anything around it can swallow the verdict`,
				);
		}
	}
	if (seen === 0) faults.push('.gitlab-ci.yml: no job runs a tier root');
	return faults;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leg H — every stage a reached script runs reaches the verdict.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SHRINK-ONLY. A stage whose red is REPORTED but does not fail its tier, with the
 * measured reason why blocking would be worse than advisory. Key: `<script>: <stage
 * line>`. The row is red once the script raises the accumulator for that stage.
 */
const ADVISORY_STAGES: ReadonlyMap<string, string> = new Map([
	[
		'scripts/ci/db_tier.sh: bun run scripts/unit_baseline.ts --check || unit_rc=$?',
		'The 725-file unit tier vs its frozen red baseline: its red SET is load- and order-dependent (measured 2026-08-29: 7 / 1 / 14 reds on the same commit depending on the machine and the fixture), so gating on it would gate on how busy the runner was, and a flapping gate teaches the team to regenerate the baseline unread. The stage RUNS on every push and prints every new red; db_tier.sh states the criterion under which the raise line is restored (the same red set on three consecutive clean-fixture runs, one on a loaded runner).',
	],
]);

/** A line that starts a STAGE: a bun / bunx / scripts/ci invocation, after optional KEY=value prefixes. */
const STAGE_LINE = /^(?:[A-Z0-9_]+=\S*\s+)*(?:bun|bunx|bash scripts\/ci\/)\b/;

/**
 * The faults of a reached script's stage lines: each stage's exit status must reach
 * the tier's verdict. Accepted shapes, in order:
 *   - bare invocation under `set -e` (the script aborts red — blocking, if not
 *     independent);
 *   - `cmd || <v>_rc=$?` followed by `[ "$<v>_rc" -eq 0 ] || … <acc>=1` where <acc> is
 *     `tier_status` or a variable whose own `[ "$acc" -eq 0 ] || … exit` line exists;
 *   - `cmd || {` … `tier_status=…` … `}` (the multi-line block);
 *   - `cmd || … tier_status=1 …` inline;
 *   - under `set +e`, a bare `cmd` whose NEXT code line is `V=$?` and whose `exit "$V"`
 *     (or `[ "$V" … ] || exit`) follows.
 * Anything else — `|| true`, `; true`, `|| echo`, a captured `_rc` nobody checks — is
 * a swallowed verdict. `stagesSeen` is the leg's floor.
 */
function stageVerdictFaults(rel: string, text: string): string[] & { stagesSeen: number } {
	const faults = Object.assign([] as string[], { stagesSeen: 0 });
	const lines = codeLines(text);
	const accumulators = new Set<string>(['tier_status']);
	for (const line of lines) {
		const m = line.match(/^\[ "\$([a-z_]+)" -eq 0 \] \|\| .*\bexit\b/);
		if (m) accumulators.add(m[1] as string);
	}
	const raises = (rhs: string): boolean =>
		[...accumulators].some((acc) => new RegExp(`\\b${acc}=(?:1|\\$\\?)`).test(rhs));
	const rcChecked = (v: string): boolean =>
		lines.some((l) => {
			const m = l.match(new RegExp(`^\\[ "\\$${v}" -eq 0 \\] \\|\\| (.*)$`));
			return m !== null && raises(m[1] as string);
		});
	let errexit = /^set -[a-z]*e/m.test(text);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		if (/^set \+e\b/.test(line)) errexit = false;
		if (/^set -[a-z]*e\b/.test(line)) errexit = true;
		if (!STAGE_LINE.test(line)) continue;
		faults.stagesSeen++;
		const key = `${rel}: ${line}`;
		if (ADVISORY_STAGES.has(key)) {
			const captured = line.match(/\|\| ([a-z_]+_rc)=\$\?$/)?.[1];
			if (captured !== undefined && rcChecked(captured))
				faults.push(
					`${key} — listed ADVISORY but the script raises the accumulator for it; delete the row`,
				);
			continue;
		}
		const tolerated = /(\|\||&&|;|\|)/.test(line);
		if (!tolerated) {
			if (errexit) continue;
			const next = lines[i + 1] ?? '';
			const v = next.match(/^([A-Z_a-z]+)=\$\?$/)?.[1];
			if (
				v !== undefined &&
				lines.some(
					(l) => l === `exit "$${v}"` || new RegExp(`^\\[ "\\$${v}" .*\\] .*\\bexit\\b`).test(l),
				)
			)
				continue;
			faults.push(`${key} — runs under set +e and its status is never carried to an exit`);
			continue;
		}
		const captured = line.match(/ \|\| ([a-z_]+_rc)=\$\?$/)?.[1];
		if (captured !== undefined) {
			if (rcChecked(captured)) continue;
			faults.push(`${key} — captures $${captured} but no line raises an accumulator from it`);
			continue;
		}
		if (/ \|\| \{$/.test(line)) {
			const body: string[] = [];
			for (let j = i + 1; j < lines.length && !/^\}/.test(lines[j] as string); j++)
				body.push(lines[j] as string);
			if (body.some(raises)) continue;
			faults.push(`${key} — its \`|| {\` block raises no accumulator`);
			continue;
		}
		const rhs = line.match(/ \|\| (.*)$/)?.[1];
		if (rhs !== undefined && raises(rhs)) continue;
		faults.push(
			`${key} — the verdict is swallowed (\`|| true\`, \`; true\`, a pipe, an echo…); a stage raises tier_status or aborts`,
		);
	}
	return faults;
}
