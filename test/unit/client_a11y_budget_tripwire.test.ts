/**
 * CLIENT A11Y BUDGET tripwire (DEC-12; audit 2026-08-26 row P1-18, findings
 * CLI-10 / CLI-11 / CLI-22 / CLI-23).
 *
 * There was no axe, lighthouse or pa11y anywhere in this repo and no
 * accessibility row in the tripwire index, so every WCAG defect on the
 * cataloguing surface was invisible to every gate. The browser tier now runs
 * axe-core over a NAMED set of surfaces built by the client's own builders
 * (client/dedalo/test/client/js/a11y_surfaces.js), inside the headless Chrome
 * the client suite already launches — no new CI runtime.
 *
 * THIS gate is the hermetic half. It proves, without a browser:
 *   1. every leg of the pure judgement (`judgeAxe`) with a planted positive
 *      control each: over budget, unbudgeted, a REQUIRED SURFACE the phase did
 *      not mount (silence is not a pass), and a budget entry that stopped
 *      firing (an excuse may not outlive its defect);
 *   2. that the RUNNER PROCESS exits on that judgement — driven through the
 *      runner's own `--replay` subprocess over a planted observation, so the
 *      exit code is measured, not read off a substring;
 *   3. that the budget file and the surface module agree: every required
 *      surface has a builder, every banked key names a required surface, and
 *      every banked entry carries a reason;
 *   4. that the keyboard suite is REGISTERED — an unregistered suite runs in no
 *      tier, which is exactly how 104 lines of real assertions once never ran.
 *
 * HONEST LIMIT: whether axe actually finds a given violation is the browser
 * tier's own run (`bun run test:client`). What is proved here is that a
 * violation, once observed, reddens the gate — and that the budget cannot be
 * loosened silently.
 *
 * HERMETIC: static reads, in-memory judgements, one `--replay` subprocess. No
 * DB, no browser, no network.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type A11yBudget,
	type AxeObservation,
	judgeAxe,
	loadA11yBudget,
	loadInventory,
	type ScrapedCard,
	type ScrapedRun,
} from '../../scripts/lib/client_gate_verdict.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SURFACES_FILE = 'client/dedalo/test/client/js/a11y_surfaces.js';
const REGISTRY_FILE = 'client/dedalo/test/client/js/test_registry.js';
const KEYBOARD_SUITE = 'test_a11y_keyboard';

const BUDGET = loadA11yBudget();
const INVENTORY = loadInventory();

/** A budget with exactly one banked entry, for the pure legs. */
const plantedBudget = (nodes: number): A11yBudget => ({
	rule: 'planted',
	required_surfaces: ['tree_row'],
	violations: { 'tree_row:color-contrast': { nodes, reason: 'planted control' } },
});

const observation = (
	violations: AxeObservation['violations'],
	surfaces = ['tree_row'],
): AxeObservation => ({
	surfaces,
	violations,
});

describe('judgeAxe — every leg, with a planted control', () => {
	test('a clean run against an empty budget is green', () => {
		expect(
			judgeAxe(observation([]), { rule: '', required_surfaces: ['tree_row'], violations: {} }),
		).toEqual([]);
	});

	test('an UNBUDGETED violation is red', () => {
		const errors = judgeAxe(
			observation([{ surface: 'tree_row', id: 'aria-required-attr', impact: 'serious', nodes: 1 }]),
			{
				rule: '',
				required_surfaces: ['tree_row'],
				violations: {},
			},
		);
		expect(errors.length).toBe(1);
		expect(errors[0]).toContain('NEW violation tree_row:aria-required-attr');
	});

	test('a violation OVER its budget is red', () => {
		const errors = judgeAxe(
			observation([{ surface: 'tree_row', id: 'color-contrast', impact: 'serious', nodes: 3 }]),
			plantedBudget(2),
		);
		expect(errors.length).toBe(1);
		expect(errors[0]).toContain('SHRINK-ONLY');
	});

	test('a violation AT its budget is green', () => {
		expect(
			judgeAxe(
				observation([{ surface: 'tree_row', id: 'color-contrast', impact: 'serious', nodes: 2 }]),
				plantedBudget(2),
			),
		).toEqual([]);
	});

	test('a required surface the phase did not mount is RED, never silently skipped', () => {
		const errors = judgeAxe(observation([], []), plantedBudget(2));
		expect(errors.some((e) => e.includes("did not mount the 'tree_row' surface"))).toBe(true);
	});

	test('a budget entry that no longer fires is red — an excuse may not outlive its defect', () => {
		const errors = judgeAxe(observation([]), plantedBudget(2));
		expect(errors.length).toBe(1);
		expect(errors[0]).toContain('lower it in');
	});
});

describe('the RUNNER PROCESS exits on the a11y verdict (--replay subprocess)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'client_a11y_replay_'));
	const runnerPath = join(REPO_ROOT, 'scripts/client_test_runner.ts');
	const each = Math.ceil(INVENTORY.mocha_test_floor / INVENTORY.suite_floor) + 1;

	/** A scrape healthy in every OTHER respect, so only the a11y leg can red it. */
	const healthyRun = (axe: AxeObservation | undefined): ScrapedRun => {
		const cards: ScrapedCard[] = Array.from({ length: INVENTORY.suite_floor }, (_, i) => ({
			status: 'pass',
			dataset: {
				testName: `test_planted_${i}`,
				group: 'planted',
				testCount: String(each),
				pendingCount: '0',
				runCount: '1',
			},
		}));
		return {
			cards,
			counters: { total: cards.length, pass: cards.length, fail: 0, pending: 0 },
			groups: {},
			...(axe === undefined ? {} : { axe }),
		};
	};

	const run = (name: string, observed: ScrapedRun) => {
		const file = join(dir, `${name}.json`);
		writeFileSync(file, JSON.stringify(observed));
		const proc = Bun.spawnSync(['bun', runnerPath, '--replay', file, '--no-reseed'], {
			cwd: REPO_ROOT,
			stdout: 'pipe',
			stderr: 'pipe',
			env: { ...process.env, DB_PORT: '1', TEST_URL: '' },
		});
		return {
			exitCode: proc.exitCode,
			stderr: proc.stderr.toString(),
			stdout: proc.stdout.toString(),
		};
	};

	test('a run whose axe phase is clean over the REAL budget exits 0', () => {
		const clean: AxeObservation = {
			surfaces: [...BUDGET.required_surfaces],
			violations: Object.entries(BUDGET.violations).map(([key, entry]) => ({
				surface: key.split(':')[0] as string,
				id: key.split(':').slice(1).join(':'),
				impact: null,
				nodes: entry.nodes,
			})),
		};
		const r = run('clean', healthyRun(clean));
		expect(r.stderr + r.stdout).toContain('--replay:');
		expect(r.exitCode).toBe(0);
	});

	test('a run carrying an UNBUDGETED violation exits 1 through the same door', () => {
		const dirty: AxeObservation = {
			surfaces: [...BUDGET.required_surfaces],
			violations: [
				{
					surface: BUDGET.required_surfaces[0] as string,
					id: 'planted-rule',
					impact: 'critical',
					nodes: 4,
				},
			],
		};
		const r = run('dirty', healthyRun(dirty));
		expect(r.stderr).toContain('A11Y: NEW violation');
		expect(r.exitCode).toBe(1);
	});

	test('a run whose axe phase mounted NO surface exits 1', () => {
		const empty: AxeObservation = { surfaces: [], violations: [] };
		const r = run('unmounted', healthyRun(empty));
		expect(r.stderr).toContain('did not mount');
		expect(r.exitCode).toBe(1);
	});
});

describe('the budget and the surfaces agree', () => {
	const surfaces = readFileSync(join(REPO_ROOT, SURFACES_FILE), 'utf8');

	/** The names the module actually exposes, read out of its SURFACE_BUILDERS map. */
	const builderNames = (): string[] => {
		const block = /export const SURFACE_BUILDERS\s*=\s*\{([\s\S]*?)\}/.exec(surfaces);
		if (block === null) return [];
		return [...(block[1] ?? '').matchAll(/([a-z_][a-z0-9_]*)\s*:/gi)].map((m) => m[1] as string);
	};

	test('every required surface has a builder in the surface module', () => {
		const names = builderNames();
		expect(names.length).toBeGreaterThan(3);
		for (const name of BUDGET.required_surfaces) {
			expect(names).toContain(name);
		}
		expect(BUDGET.required_surfaces.length).toBeGreaterThan(3);
	});

	test('every banked violation names a required surface and carries a reason', () => {
		for (const [key, entry] of Object.entries(BUDGET.violations)) {
			const surface = key.split(':')[0] as string;
			expect(BUDGET.required_surfaces).toContain(surface);
			expect(entry.reason.trim().length).toBeGreaterThan(10);
			expect(entry.nodes).toBeGreaterThan(0);
		}
	});

	test('the keyboard suite is REGISTERED — an unregistered suite runs in no tier', () => {
		const registry = readFileSync(join(REPO_ROOT, REGISTRY_FILE), 'utf8');
		expect(registry).toContain(`'${KEYBOARD_SUITE}'`);
	});

	test('the axe phase is wired into the runner and reads the devDependency off disk', () => {
		const runner = readFileSync(join(REPO_ROOT, 'scripts/client_test_runner.ts'), 'utf8');
		expect(runner).toContain('runAxePhase');
		expect(runner).toContain("'axe-core', 'axe.min.js'");
		const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
			devDependencies: Record<string, string>;
		};
		expect(pkg.devDependencies['axe-core']).toBeDefined();
	});
});
