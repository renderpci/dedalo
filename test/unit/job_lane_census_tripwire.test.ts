/**
 * JOB LANE CENSUS (PERF-11) — every piece of background work DECLARES the lane
 * it spends, and the declaration is TOTAL over the tree.
 *
 * Background work used to draw from ONE process-wide semaphore, so a queue of
 * transcodes starved the code update an operator was waiting on. Lanes fix the
 * budget; this gate fixes the thing that would quietly undo them — a NEW job
 * that lands in a lane nobody chose. The rule is therefore not "lanes exist" but
 * "no submit site and no backgroundable tool action is without an EXPLICIT lane".
 *
 * WHY NOT A `kind` PREFIX RULE. A rule that derives the lane from the job's kind
 * string files a new job into whatever lane its name happens to resemble, and
 * the starvation returns with nobody having edited a budget. The lane is
 * declared at the call site and this census is what keeps that true.
 *
 * TWO CENSUSES, both derived from the tree with a floor, never a hand list:
 *
 *  1. SUBMIT SITES — every `.submit(` call in a file that imports the media job
 *     manager, anywhere under `src/` or `tools/`. The meta argument must carry a
 *     `lane`. (The compiler already refuses a missing one — `JobSubmitMeta.lane`
 *     is required — so this census is the second, source-level guard that also
 *     covers a site added with an `as` cast or in a file tsc is not asked about.)
 *
 *  2. TOOL DECLARATIONS — every `tools/*​/server/index.ts` that actually loads.
 *     These are IMPORTED, not grepped: the assertion is on the module object the
 *     loader will really see, so a module whose `backgroundLanes` is computed,
 *     spread, or keyed by a constant is judged by what it EXPORTS, not by how it
 *     is spelled. Every name in `backgroundRunnable` must have a lane in
 *     `backgroundLanes`, and every lane must be a real `JobLane`.
 *
 * Both analyzers are pure functions run over PLANTED offenders as well as over
 * the tree, so a census that has stopped detecting anything fails loudly instead
 * of passing vacuously.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceRootsOf } from '../../scripts/lib/production_corpus.ts';
import { JOB_LANES, type JobLane } from '../../src/core/media/jobs.ts';
import { stripComments } from '../helpers/strip_comments.ts';
import { WRITE_PATH_CORPUS_FLOOR, writePathSourceFiles } from '../helpers/write_path_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * FLOORS. A census that silently scanned nothing would be green forever; these
 * are the "the walk really found the tree" assertions. They are minimums, not
 * expectations — they never need editing when work is added.
 */
const MIN_TS_FILES_SCANNED = WRITE_PATH_CORPUS_FLOOR;
const MIN_SUBMIT_SITES = 6;
const MIN_TOOL_MODULES = 20;
const MIN_BACKGROUND_TOOL_MODULES = 8;

/**
 * The submit-site corpus: the SHARED write-path lister's files (src/ + tools/ +
 * scripts/, non-test), absolute. This gate chooses no walk root of its own —
 * the roots live in one place, so this census cannot drift away from the other
 * gates that claim to cover "the code that runs in the engine process".
 */
function submitScanFiles(): string[] {
	return writePathSourceFiles().map((relative) => join(REPO_ROOT, relative));
}

/**
 * Every tool server entry that exists, derived from the SHARED production
 * corpus lister (which owns the `tools` root and returns `<tool>/server` for
 * each). `'.'` is the repo package, and narrows nothing.
 */
function toolServerEntries(): string[] {
	return sourceRootsOf('.')
		.filter((dir) => dir.startsWith(join(REPO_ROOT, 'tools')))
		.map((dir) => join(dir, 'index.ts'))
		.filter((entry) => existsSync(entry));
}

/** The text of the argument list of the call that starts at `openParen`. */
function callArguments(source: string, openParen: number): string {
	let depth = 0;
	for (let i = openParen; i < source.length; i++) {
		const char = source[i];
		if (char === '(') depth += 1;
		else if (char === ')') {
			depth -= 1;
			if (depth === 0) return source.slice(openParen + 1, i);
		}
	}
	return source.slice(openParen + 1);
}

/** One offending submit call. */
interface LanelessSubmit {
	file: string;
	snippet: string;
}

/**
 * Does this source reach the media job manager? STATIC and DYNAMIC forms both
 * count: most submit sites reach it through `await import('…/media/jobs.ts')`
 * (the cycle-breaking convention), and a detector that only knew the static
 * `from` clause found three of seven — a census that misses the majority of its
 * own population is worse than none.
 */
function usesJobManager(strippedSource: string): boolean {
	// `…/media/jobs.ts` from anywhere, or the sibling `./jobs.ts` from inside
	// src/core/media itself. Deliberately not a bare `jobs.ts` suffix: the
	// diffusion queue has its own `jobs/` tree and is a different system.
	return /(?:from\s+|import\s*\(\s*)'(?:[^']*media\/|\.\/)jobs\.ts'/.test(strippedSource);
}

/**
 * THE SUBMIT ANALYZER (pure — the tree and the planted controls both go through
 * it). A file counts as a submit site only when it names the job manager, so an
 * unrelated `.submit(` (a form, a diffusion queue) is not dragged in.
 */
function lanelessSubmits(file: string, rawSource: string): LanelessSubmit[] {
	const source = stripComments(rawSource);
	if (!usesJobManager(source)) return [];
	const offenders: LanelessSubmit[] = [];
	const call = /\.submit\s*\(/g;
	for (;;) {
		const match = call.exec(source);
		if (match === null) break;
		const args = callArguments(source, match.index + match[0].length - 1);
		// `lane` in any position a declaration can take: `lane: 'media'`, the
		// shorthand `{ lane, userId }`, or a trailing `{ lane }`.
		if (!/\blane\s*[:,}]/.test(args)) {
			offenders.push({ file, snippet: args.slice(0, 80).replace(/\s+/g, ' ').trim() });
		}
	}
	return offenders;
}

/** The shape a tool module must satisfy for its background actions. */
interface ToolLaneModule {
	name: string;
	backgroundRunnable?: readonly string[];
	backgroundLanes?: Readonly<Record<string, string>>;
}

/** THE TOOL ANALYZER (pure): which background actions lack a valid lane. */
function undeclaredToolLanes(module: ToolLaneModule): string[] {
	const bad: string[] = [];
	for (const action of module.backgroundRunnable ?? []) {
		const lane = module.backgroundLanes?.[action];
		if (lane === undefined) bad.push(`${module.name}::${action} (no lane declared)`);
		else if (!(JOB_LANES as readonly string[]).includes(lane)) {
			bad.push(`${module.name}::${action} (lane '${lane}' is not a JobLane)`);
		}
	}
	return bad;
}

describe('job lane census — submit sites (PERF-11)', () => {
	const files = submitScanFiles();

	test('the walk really scanned the tree', () => {
		expect(files.length).toBeGreaterThanOrEqual(MIN_TS_FILES_SCANNED);
	});

	test('every media-job submit site declares its lane', () => {
		const offenders: LanelessSubmit[] = [];
		let sites = 0;
		for (const file of files) {
			const source = readFileSync(file, 'utf8');
			if (!source.includes('.submit(')) continue;
			const relative = file.slice(REPO_ROOT.length + 1);
			const stripped = stripComments(source);
			if (usesJobManager(stripped)) sites += (stripped.match(/\.submit\s*\(/g) ?? []).length;
			offenders.push(...lanelessSubmits(relative, source));
		}
		// THE FLOOR: the census must have found real submit sites, or "no offender"
		// would mean "nothing was looked at".
		expect(sites).toBeGreaterThanOrEqual(MIN_SUBMIT_SITES);
		expect(offenders).toEqual([]);
	});

	test('POSITIVE CONTROL: a planted laneless submit is caught, a lane-carrying one is not', () => {
		const header = "import { mediaJobs } from '../media/jobs.ts';\n";
		// The DYNAMIC form the majority of the real sites use.
		const dynamicHeader = "const { mediaJobs } = await import('../../media/jobs.ts');\n";
		expect(
			lanelessSubmits('planted.ts', `${dynamicHeader}mediaJobs.submit('k', worker, {});`),
		).toHaveLength(1);
		expect(
			lanelessSubmits('planted.ts', `${header}mediaJobs.submit('k', worker, { userId: 1 });`),
		).toHaveLength(1);
		expect(
			lanelessSubmits(
				'planted.ts',
				`${header}mediaJobs.submit('k', worker, { lane: 'media', userId: 1 });`,
			),
		).toEqual([]);
		// The shorthand form the tool executor uses.
		expect(
			lanelessSubmits('planted.ts', `${header}mediaJobs.submit('k', worker, { lane, userId });`),
		).toEqual([]);
		// A `.submit(` in a file that does NOT use the job manager is not ours.
		expect(lanelessSubmits('planted.ts', 'form.submit({ nothing: true });')).toEqual([]);
	});
});

describe('job lane census — tool background actions (PERF-11)', () => {
	test('every backgroundRunnable action declares a real lane', async () => {
		const modules: ToolLaneModule[] = [];
		for (const entry of toolServerEntries()) {
			const loaded = (await import(entry)) as { tool?: ToolLaneModule };
			if (loaded.tool !== undefined) modules.push(loaded.tool);
		}
		// FLOORS: the tool tree was really walked, and it really contains
		// backgroundable tools — the population this rule is about.
		expect(modules.length).toBeGreaterThanOrEqual(MIN_TOOL_MODULES);
		const backgroundable = modules.filter((m) => (m.backgroundRunnable ?? []).length > 0);
		expect(backgroundable.length).toBeGreaterThanOrEqual(MIN_BACKGROUND_TOOL_MODULES);
		expect(modules.flatMap(undeclaredToolLanes)).toEqual([]);
	});

	test('POSITIVE CONTROL: a planted undeclared and a planted bogus lane are caught', () => {
		expect(undeclaredToolLanes({ name: 'tool_planted', backgroundRunnable: ['run'] })).toEqual([
			'tool_planted::run (no lane declared)',
		]);
		expect(
			undeclaredToolLanes({
				name: 'tool_planted',
				backgroundRunnable: ['run'],
				backgroundLanes: { run: 'publication' },
			}),
		).toEqual(["tool_planted::run (lane 'publication' is not a JobLane)"]);
		expect(
			undeclaredToolLanes({
				name: 'tool_planted',
				backgroundRunnable: ['run'],
				backgroundLanes: { run: 'maintenance' satisfies JobLane },
			}),
		).toEqual([]);
	});
});
