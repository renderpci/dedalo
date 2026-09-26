/**
 * TRIPWIRE — every committed baseline a gate reads is in the bank's registry.
 *
 * `bun run baselines:bank` (scripts/baselines_bank.ts) locks in ratchet improvements
 * before a push so an improvement never reddens CI for want of a regeneration. That
 * only holds for the ratchets its REGISTRY knows: a new baseline left out of it goes
 * back to the old failure — green locally, red on the first push that improves it. So
 * the registry must be TOTAL, and totality is measured, not listed:
 *
 *   DISCOVERED READ PATHS. Every `engineering/…json` a script, test, source file or
 *   workflow names — as a literal path, as a `join(…, 'engineering', '…')` chain, or as
 *   a bare ratchet-shaped basename (`*_baseline|_budget|_backlog|_inventory|_ledger|
 *   _exempt.json`, however it is assembled) — is registered, or is in NOT_A_BASELINE
 *   with the reason it is not one.
 *   ON-DISK ARTIFACTS. Every `engineering/**\/*.json` on disk is registered, or in
 *   NOT_A_BASELINE. This leg needs no spelling at all: a baseline that some gate reads
 *   through a path this scan cannot parse is still a file in engineering/, and it still
 *   has to be registered.
 *   THE REGISTRY SPEAKS THE CONTRACT. Every HERMETIC entry's check is actually RUN and
 *   must print a verdict (scripts/lib/ratchet_check.ts) under its own id — a registered
 *   ratchet whose `--check --json` crashes or prints prose would be an entry the bank
 *   silently cannot read.
 *
 * And the inverse: every registered artifact exists (no ghost rows), no artifact has two
 * owners, every NOT_A_BASELINE row is still referenced by the tree (a stale excuse is
 * red) and the ones that are runtime artifacts are not committed.
 *
 * HERMETIC: tracked-source reads, a disk walk of engineering/, the hermetic ratchets'
 * own read-only `--check --json` runs (seconds), and `git ls-files` for the
 * not-committed leg. Every walk goes through scripts/lib/baseline_artifacts.ts, the one
 * lister whose roots are written down (this gate chooses none in-file).
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseVerdict, REGISTRY } from '../../scripts/baselines_bank.ts';
import {
	engineeringJsonOnDisk,
	type ReaderSource,
	readerSources,
	trackedEngineeringFiles,
} from '../../scripts/lib/baseline_artifacts.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * Paths the discovery finds that are NOT committed ratchet baselines — each with why.
 * `runtime: true` rows are generated per machine and must never be committed (the gate
 * checks the index): committing one is how it would become a baseline, and then it has
 * to be registered.
 */
const NOT_A_BASELINE: Readonly<Record<string, { reason: string; runtime: boolean }>> = {
	'engineering/test_baseline/runs.json': {
		reason:
			'a per-machine run RECORD of scripts/test_baseline.ts (bun run test:baseline), compared candidate-vs-recorded on the machine that made it; engineering/test_baseline/README.md — never committed',
		runtime: true,
	},
	'engineering/test_baseline/timings.json': {
		reason:
			'per-machine test timings for scripts/test_shard.ts partitioning (bun run test:timings) — an input to sharding, not a ratchet; never committed',
		runtime: true,
	},
	'engineering/test_baseline/components.json': {
		reason:
			'the per-machine component census scripts/lib/test_components.ts writes beside the run record — never committed',
		runtime: true,
	},
	'engineering/client_compat_read_baseline.json': {
		reason:
			'PRESCRIBED by scripts/lib/client_compat_census.ts for a future shrink-only ratchet and NOT PRESENT: the day it is created it must be registered (this row then goes stale and reddens)',
		runtime: true,
	},
};

/** The ratchet-shaped basenames, however a path to them is assembled. */
const RATCHET_BASENAME =
	/\b([a-z0-9_]+_(?:baseline|budget|backlog|inventory|ledger|exempt)\.json)\b/g;
/** A literal repo-relative path. */
const LITERAL_PATH = /\bengineering\/([A-Za-z0-9_./-]+\.json)\b/g;
/** A `join()` chain whose first segment is the engineering directory — the other spelling in use. */
const JOIN_CHAIN = /['"]engineering['"]((?:\s*,\s*['"][A-Za-z0-9_.-]+['"])+)/g;

/** Every engineering/…json path the tree names, with EVERY file naming it. */
function discoveredReadPaths(sources: ReaderSource[]): Map<string, string[]> {
	const found = new Map<string, string[]>();
	const add = (path: string, file: string) => {
		const files = found.get(path) ?? [];
		if (!files.includes(file)) files.push(file);
		found.set(path, files);
	};
	for (const { file, source } of sources) {
		for (const m of source.matchAll(LITERAL_PATH)) add(`engineering/${m[1]}`, file);
		for (const m of source.matchAll(JOIN_CHAIN)) {
			const segments = [...(m[1] ?? '').matchAll(/['"]([A-Za-z0-9_.-]+)['"]/g)].map((s) => s[1]);
			const path = `engineering/${segments.join('/')}`;
			if (path.endsWith('.json')) add(path, file);
		}
		for (const m of source.matchAll(RATCHET_BASENAME)) {
			const name = m[1] as string;
			// A bare basename resolves to the engineering/ artifact of that name, wherever it
			// sits in the tree (a baseline's home is engineering/ because a gate reads it).
			const onDisk = engineeringJsonOnDisk().find((path) => basename(path) === name);
			add(onDisk ?? `engineering/${name}`, file);
		}
	}
	return found;
}

const REGISTERED = new Map(
	REGISTRY.flatMap((entry) => entry.artifacts.map((artifact) => [artifact, entry.id] as const)),
);

describe('the bank registry is TOTAL over the baselines the gates read', () => {
	const sources = readerSources();
	const discovered = discoveredReadPaths(sources);
	const onDisk = engineeringJsonOnDisk();

	test('the scans see the tree (anti-vacuity)', () => {
		expect(sources.length).toBeGreaterThan(1000);
		expect(onDisk.length).toBeGreaterThanOrEqual(10);
		expect(discovered.size).toBeGreaterThanOrEqual(10);
		expect(REGISTRY.length).toBeGreaterThanOrEqual(10);
		// Positive controls: each discovery form finds what it exists for.
		expect(discovered.get('engineering/crap_complexity_baseline.json')).toBeDefined(); // literal
		expect(discovered.get('engineering/gate_vacuity_budget.json')).toBeDefined(); // join chain
		expect(discovered.get('engineering/test_baseline/timings.json')).toBeDefined(); // nested join
	});

	test('every engineering/ JSON the tree names is registered or reasoned out', () => {
		const missing = [...discovered.entries()]
			.filter(([path]) => !REGISTERED.has(path) && NOT_A_BASELINE[path] === undefined)
			.map(([path, files]) => `${path} (read by ${files.join(', ')})`);
		expect(
			missing,
			'A gate reads a baseline the bank does not know. Register it in REGISTRY ' +
				'(scripts/baselines_bank.ts) with its `--check --json` and flagless writer — or, if ' +
				'it genuinely has no writer, as a `manual` row WITH the reason:\n  ' +
				missing.join('\n  '),
		).toEqual([]);
	});

	test('every engineering/ JSON on disk is registered or reasoned out (no spelling needed)', () => {
		const missing = onDisk.filter(
			(path) => !REGISTERED.has(path) && NOT_A_BASELINE[path] === undefined,
		);
		expect(missing, `unregistered artifacts in engineering/:\n  ${missing.join('\n  ')}`).toEqual(
			[],
		);
	});

	test('no ghost rows: every registered artifact exists, and has ONE owner', () => {
		const ghosts = [...REGISTERED.keys()].filter((path) => !existsSync(join(REPO_ROOT, path)));
		expect(ghosts).toEqual([]);
		const all = REGISTRY.flatMap((entry) => entry.artifacts);
		expect(all.length).toBe(new Set(all).size);
		const ids = REGISTRY.map((entry) => entry.id);
		expect(ids.length).toBe(new Set(ids).size);
	});

	test('every NOT_A_BASELINE row is still named by the tree, and the runtime ones are not committed', () => {
		const stale = Object.keys(NOT_A_BASELINE).filter((path) => !discovered.has(path));
		expect(stale, 'NOT_A_BASELINE rows nothing reads any more — delete them').toEqual([]);
		// A tree with no git index (an exported archive) cannot answer this leg; the lister
		// THROWS then — loud, never read as "nothing committed".
		const tracked = trackedEngineeringFiles();
		expect(tracked.size).toBeGreaterThanOrEqual(10);
		const committedRuntime = Object.entries(NOT_A_BASELINE)
			.filter(([path, row]) => row.runtime && tracked.has(path))
			.map(([path]) => path);
		expect(
			committedRuntime,
			'A runtime artifact was COMMITTED — a committed file a gate reads is a baseline: register it in the bank',
		).toEqual([]);
	});

	test('ORDER: a ratchet runs after the artifact it derives from', () => {
		// twin_map derives unmapped_reds from engineering/parity_baseline.json
		// (scripts/lib/twin_census.ts redFilesFromBaseline), so a parity re-freeze must be
		// banked first or twin_map would be checked against the stale reds.
		const index = (id: string) => REGISTRY.findIndex((entry) => entry.id === id);
		expect(index('parity_baseline')).toBeGreaterThanOrEqual(0);
		expect(index('twin_map')).toBeGreaterThan(index('parity_baseline'));
		const twinCensus = readFileSync(join(REPO_ROOT, 'scripts/lib/twin_census.ts'), 'utf8');
		expect(twinCensus).toContain('parity_baseline.json');
	});
});

describe('every HERMETIC registered ratchet speaks the contract (run, not read)', () => {
	for (const entry of REGISTRY.filter((e) => e.tier === 'hermetic')) {
		test(`${entry.id}: \`--check --json\` prints a verdict under its own id`, () => {
			expect(entry.check, entry.id).toBeDefined();
			const run = Bun.spawnSync(['bun', 'run', ...(entry.check ?? [])], {
				cwd: REPO_ROOT,
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const verdict = parseVerdict(run.stdout.toString(), entry.id);
			expect(verdict, `${entry.id}: no verdict.\n${run.stdout}\n${run.stderr}`).not.toBeNull();
			// The exit code is the plain --check's: 1 exactly when there is drift.
			const drift = (verdict?.improvements.length ?? 0) + (verdict?.regressions.length ?? 0);
			expect(run.exitCode).toBe(drift > 0 ? 1 : 0);
			for (const artifact of verdict?.baselines ?? []) {
				expect(entry.artifacts, `${entry.id} reports on ${artifact}`).toContain(artifact);
			}
		}, 60_000);
	}
});
