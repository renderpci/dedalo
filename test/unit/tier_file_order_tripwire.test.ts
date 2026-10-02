/**
 * TIER FILE ORDER — every tier runs ONE sorted, complete, `./`-prefixed file list.
 *
 * Diagnosed 2026-10-02: `bun test <dir>` runs files in raw readdir order, which is
 * hash order per filesystem, so the GitHub runner and the Mac's CI container ran
 * the unit tier's ~1000 files in different orders and order-dependent reds showed
 * on one host only. The fix lives in scripts/lib/test_order.ts (TS tiers: unit,
 * parity, MariaDB via `runTier`; the shard runner; verify) and its bash twin
 * scripts/ci/test_order.sh (the tripwire stages — held by tier_execution_tripwire,
 * which executes those stages with `bun` stubbed).
 *
 * Legs:
 *   1. BUN'S BEHAVIOUR, re-measured on the pinned bun every run (a scratch dir, no
 *      repo bunfig): `./` paths run in ARGV order (two permutations), and a missing
 *      `./path` is dropped SILENTLY — the two facts the design rests on. If bun
 *      changes either, this leg is red and test_order.ts's header must be re-read.
 *   2. COMPLETE vs the walk: `tierFiles` of the unit and parity tiers equals an
 *      independent listing (test_tree_corpus, sifted by bun's four test shapes) — nothing dropped,
 *      nothing invented — and is codepoint-sorted.
 *   3. THE CENSUS ARGV: `tierArgv` (what `runTier` spawns) hands bun the sorted
 *      `./` list and no bare directory; `runTier` spawns `tierArgv`.
 *   4. LOUD EDGES: a missing file / path / empty dir throws; `inventory` tolerates.
 *   5. THE BASH TWIN orders, de-duplicates, prefixes, and refuses a missing file.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REPO_ROOT, TIER_PATH } from '../../scripts/lib/parity_census.ts';
import { TEST_TIMEOUT_FLAG } from '../../scripts/lib/test_flags.ts';
import {
	ARGV_BUDGET_BYTES,
	bunTestFileArgs,
	codepointCompare,
	tierFileArgs,
	tierFiles,
} from '../../scripts/lib/test_order.ts';
import { tierArgv } from '../../scripts/lib/tier_run.ts';
import { TIER_PATHS as UNIT_TIER_PATHS } from '../../scripts/unit_baseline.ts';
import { testTreeSourceFiles } from '../helpers/test_tree_corpus.ts';

const ROOT = resolve(import.meta.dir, '../..');

/** Bun's four test-file shapes, re-stated independently of test_order.ts. */
const BUN_TEST_SHAPE = /(\.test|_test|\.spec|_spec)\.(js|jsx|ts|tsx|mjs|cjs)$/;

/** The independent walks the tier lists are held equal to. */
// Through the registered lister of test/ (census_derivation SHARED_LISTERS), not a
// private walk: every `.ts` under test/, sifted by bun's test shapes and the tier's roots.
const TREE = testTreeSourceFiles();
const underTier = (roots: readonly string[]) =>
	TREE.filter((f) => BUN_TEST_SHAPE.test(f) && roots.some((root) => f.startsWith(`${root}/`))).sort(
		codepointCompare,
	);
const UNIT_WALK = underTier(UNIT_TIER_PATHS);
const PARITY_WALK = underTier([TIER_PATH]);

const isSorted = (list: readonly string[]): boolean =>
	list.every((item, i) => i === 0 || codepointCompare(list[i - 1] as string, item) < 0);

describe('tier file order', () => {
	test('1. bun runs `./` paths in argv order and drops a missing one silently (pinned bun, re-measured)', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-test-order-'));
		try {
			mkdirSync(join(dir, 't'));
			const names = ['m_mid', 'z_last', 'a_first', 'q_x', 'b_y'];
			for (const name of names) {
				writeFileSync(
					join(dir, 't', `${name}.test.ts`),
					`import { test } from 'bun:test';\ntest('x', () => { console.log('RAN ${name}'); });\n`,
				);
			}
			const ran = (args: string[]): string[] => {
				const proc = Bun.spawnSync(['bun', 'test', TEST_TIMEOUT_FLAG, ...args], {
					cwd: dir,
					stdout: 'pipe',
					stderr: 'pipe',
				});
				const out = proc.stdout.toString() + proc.stderr.toString();
				return [...out.matchAll(/RAN (\w+)/g)].map((m) => m[1] as string);
			};
			const sorted = [...names].sort(codepointCompare);
			for (const order of [sorted, [...sorted].reverse()]) {
				expect(ran(order.map((n) => `./t/${n}.test.ts`))).toEqual(order);
			}
			// The silent drop the existence checks exist for.
			expect(ran(['./t/absent.test.ts', './t/a_first.test.ts'])).toEqual(['a_first']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('2. the walks are not empty (anti-vacuity floors)', () => {
		expect(UNIT_WALK.length).toBeGreaterThan(900);
		expect(PARITY_WALK.length).toBeGreaterThan(50);
	});

	for (const [name, paths, walked] of [
		['unit', UNIT_TIER_PATHS, UNIT_WALK],
		['parity', [TIER_PATH], PARITY_WALK],
	] as const) {
		test(`2. the ${name} tier's file list is sorted and complete vs the walk`, () => {
			const files = tierFiles(paths, REPO_ROOT);
			expect(files).toEqual(walked);
			expect(isSorted(files)).toBe(true);
		});

		test(`3. the ${name} census argv is the sorted ./ list, no bare path`, () => {
			const argv = tierArgv(paths, '/tmp/x.xml');
			expect(argv.slice(0, 2)).toEqual(['bun', 'test']);
			expect(argv).toContain(TEST_TIMEOUT_FLAG);
			const fileArgs = argv.slice(2).filter((arg) => !arg.startsWith('-'));
			expect(fileArgs).toEqual(tierFiles(paths, REPO_ROOT).map((f) => `./${f}`));
			for (const p of paths) expect(argv).not.toContain(p);
			expect(fileArgs.reduce((n, a) => n + a.length + 1, 0)).toBeLessThan(ARGV_BUDGET_BYTES);
		});
	}

	test('3b. runTier spawns tierArgv (the census argv IS the gated argv)', () => {
		const src = readFileSync(join(ROOT, 'scripts/lib/tier_run.ts'), 'utf8');
		const body = src.slice(src.indexOf('export function runTier('));
		expect(body).toMatch(/Bun\.spawnSync\(tierArgv\(paths, outfile\)/);
		expect(body.slice(0, body.indexOf('\n}\n'))).not.toMatch(/\.\.\.paths\b/);
	});

	test('4. loud edges: missing file/path/empty dir throw; inventory tolerates', () => {
		expect(() => bunTestFileArgs(['test/unit/zz_absent_order.test.ts'])).toThrow(/silently/);
		expect(() => tierFiles(['test/zz_absent_order'])).toThrow(/does not exist/);
		expect(() => tierFiles([])).toThrow(/no paths/);
		expect(() => tierFiles(['/abs'])).toThrow(/absolute/);
		expect(() => tierFiles(['../x'])).toThrow(/leaves/);
		expect(tierFiles(['test/zz_absent_order'], REPO_ROOT, { inventory: true })).toEqual([]);
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-test-order-empty-'));
		try {
			mkdirSync(join(dir, 'empty'));
			expect(() => tierFiles(['empty'], dir)).toThrow(/holds no test file/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
		// De-duplicated and normalized: `./x` and `x` are one file.
		const one = 'test/unit/tier_file_order_tripwire.test.ts';
		expect(bunTestFileArgs([one, `./${one}`])).toEqual([`./${one}`]);
		expect(tierFileArgs([one])).toEqual([`./${one}`]);
		// Sorted whatever the caller's order (the shard bins and verify hand unsorted lists).
		const two = 'test/unit/tier_execution_tripwire.test.ts';
		expect(bunTestFileArgs([one, two])).toEqual([`./${two}`, `./${one}`]);
	});

	test('5. the bash twin sorts, de-duplicates, prefixes and refuses a missing file', () => {
		const a = 'test/unit/tier_file_order_tripwire.test.ts';
		const b = 'test/unit/tier_execution_tripwire.test.ts';
		const run = (args: string[]) => {
			const script = `source scripts/ci/test_order.sh; order_test_paths "$@"; rc=$?; printf 'P\\t%s\\n' "\${TEST_ORDER_PATHS[@]}"; echo "RC $rc"`;
			const proc = Bun.spawnSync(['bash', '-c', script, 'x', ...args], {
				cwd: ROOT,
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const out = proc.stdout.toString().split('\n');
			return {
				paths: out.filter((l) => l.startsWith('P\t')).map((l) => l.slice(2)),
				rc: out.find((l) => l.startsWith('RC '))?.slice(3),
			};
		};
		expect(run([a, b, `./${a}`])).toEqual({ paths: [`./${b}`, `./${a}`], rc: '0' });
		const missing = run([a, 'test/unit/zz_absent_order.test.ts']);
		expect(missing.rc).not.toBe('0');
		expect(missing.paths).toEqual([`./${a}`]);
	});
});
