/**
 * TM EPOCH TRIPWIRE (P0-14, second half) — every reader of a record's
 * time-machine history is narrowed to that record's GENERATION.
 *
 * THE INVARIANT. `matrix_time_machine` keys history by `(section_tipo,
 * section_id)` — the address — and nothing else. Where an id was re-minted, a
 * DEAD record's rows carry the living record's exact coordinates. A reader that
 * does not narrow by the generation epoch therefore serves the dead record's
 * snapshots as the living record's own, and a restore built on it writes the
 * dead record's values in with `ok:true`.
 *
 * WHY A GATE AND NOT A CONVENTION. The narrowing is applied by hand at six
 * separate statements across five modules, because `tmEpochPredicate()` is a
 * SQL fragment spliced into other people's queries. Nothing about adding a
 * seventh TM reader makes its author think of this file. The already-exported
 * `readTimeMachineHistory` is the standing proof: it selects a record's
 * component history with no epoch predicate at all, and is harmless ONLY
 * because it currently has no production caller.
 *
 * THE TWO DIRECTIONS BOTH MATTER. A leaking reader shows a dead record's
 * history; a leaking WRITE-GATE probe (delete_record, observers) sees the dead
 * generation's rows, concludes the record already has history, and SUPPRESSES
 * the reborn record's own backfill.
 *
 * EXEMPTIONS ARE NAMED, NOT ASSUMED, and the counter floors are the important
 * ones: they exist precisely to witness DEAD generations' ids so the allocator
 * cannot re-mint them. Narrowing those would re-open the FIRST half of P0-14.
 * The two halves pull in opposite directions and both are right.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const CENSUS_ROOTS = ['src', 'tools'] as const;

/**
 * EVERY clause that can name the history table — not just `FROM`.
 *
 * (!) The first version matched `FROM` alone, and this change's OWN epoch mint
 * is a `JOIN matrix_time_machine` (matrix_write.ts): the census scored it 0
 * reads and dropped the file entirely, so a JOIN-shaped reader — or an
 * `UPDATE`/`DELETE` — was invisible to every case in this file, including the
 * anti-vacuity one.
 */
const TM_SELECT = /(?:FROM|JOIN|UPDATE|DELETE\s+FROM)\s+matrix_time_machine/gi;

/** The two ways a statement declares itself narrowed to one generation. */
const TM_NARROWING = /tmEpochPredicate\(|withTmEpoch\(/g;

/**
 * Files that read `matrix_time_machine` WITHOUT the epoch narrowing, each with
 * the reason it is not a leak. SHRINK-ONLY.
 */
const EXEMPT_TM_READERS: Readonly<Record<string, { reads: number; reason: string }>> = {
	'src/core/db/matrix_write.ts': {
		reads: 2,
		reason:
			"TWO deliberately un-narrowed statements. (1) THE COUNTER FLOOR (counterFloorExpression): it exists to witness the section_ids of DEAD generations so the allocator cannot re-mint them — narrowing it would re-open the FIRST half of P0-14. (2) THE EPOCH MINT itself, a JOIN over the address's existing rows to place the boundary; it is what the other readers are narrowed BY.",
	},
	'src/core/install/hierarchy_import.ts': {
		reads: 1,
		reason: 'The same counter floor, hand-written as psql text for a post-COPY seed.',
	},
	'src/core/ontology/data_io_import.ts': {
		reads: 1,
		reason: 'The same counter floor, hand-written as psql text for a post-COPY seed.',
	},
	'src/core/db/record_generation.ts': {
		reads: 1,
		reason:
			'The epoch MINT itself: it reads the address’s existing rows to place the boundary. It is what the other readers are narrowed BY.',
	},
	'src/core/db/time_machine.ts': {
		reads: 2,
		reason:
			'readTimeMachineRow is a PK read whose CALLERS carry the identity check (tool_time_machine apply_value, section/read.ts preview — both narrowed). readTimeMachineHistory has NO production caller (dead code); narrow or delete it before wiring one.',
	},
	'src/core/update/transform/locators.ts': {
		reads: 2,
		reason:
			'v6→v7 UPDATE_PROCESS address rebase — it REWRITES addresses across every generation and must see all of them. It re-keys the generation store with the same transform (moveTimeMachineRows), so the fence moves with the history rather than being dropped.',
	},
	'src/core/update/transform/lang.ts': {
		reads: 2,
		reason:
			'The same migration lane, rewriting the lang column across every generation. It changes no ADDRESS, so no fence moves with it.',
	},
	'src/core/update/transform/portalize.ts': {
		reads: 1,
		reason:
			"v6→v7 UPDATE_PROCESS: RELOCATES a component's history onto a new record, deliberately making those rows the destination's own. It runs in the update process on an install being upgraded FROM v6, where the generation store cannot yet hold a row — the epochs this change mints are written only by the live TS allocator. Narrowing it would fence out the very rows it is transplanting.",
	},
	'src/core/test_data/situations/situation.ts': {
		reads: 1,
		reason: 'Suite fixture teardown: removes a scratch tipo whole, generations included.',
	},
	'src/core/test_data/test_corpus/ensure.ts': {
		reads: 3,
		reason: 'Same shape: the derived corpus drops its own generated tipos wholesale.',
	},
	'src/core/test_data/synthetic_hierarchy_fixture.ts': {
		reads: 2,
		reason: 'Same shape: the synthetic hierarchy fixture removes the tipos it generated.',
	},
};

function censusFiles(): string[] {
	const files: string[] = [];
	for (const dir of CENSUS_ROOTS) {
		const glob = new Glob('**/*.ts');
		for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
			if (match.endsWith('.test.ts')) continue;
			files.push(relative(REPO_ROOT, join(REPO_ROOT, dir, match)));
		}
	}
	return files.sort();
}

interface TmReader {
	file: string;
	reads: number;
	/** How many statements in the file declare the narrowing. */
	narrowSites: number;
}

function tmReaders(): TmReader[] {
	const found: TmReader[] = [];
	for (const file of censusFiles()) {
		const src = readFileSync(join(REPO_ROOT, file), 'utf8');
		const reads = (src.match(TM_SELECT) ?? []).length;
		if (reads === 0) continue;
		found.push({ file, reads, narrowSites: (src.match(TM_NARROWING) ?? []).length });
	}
	return found;
}

/**
 * For every NARROWED file: how many TM statements it holds and how many of them
 * declare the narrowing. Pinned as a PAIR because a file-level "does this file
 * mention withTmEpoch" test passes as soon as ONE statement does — so a fifth
 * query shape added to read_tm.ts with a bare `WHERE ${whereSql}` would ship
 * green while the dd15 panel served a dead generation's snapshots.
 */
const NARROWED_READERS: Readonly<Record<string, { reads: number; narrowSites: number }>> = {
	// narrowSites < reads is CORRECT here: the deep-page barrier and late-lookup
	// shapes each name the table twice (an outer `FROM matrix_time_machine tm`
	// joined to an inner scoped subquery), and the narrowing belongs on the INNER
	// one that selects the ids. Four narrowings cover the four WHERE clauses:
	// the count twin, the barrier inner, the late-lookup inner, and the plain page.
	'src/core/resolve/read_tm.ts': { reads: 6, narrowSites: 4 },
	'src/core/section/record/delete_record.ts': { reads: 2, narrowSites: 2 },
	'src/core/section/record/observers.ts': { reads: 1, narrowSites: 1 },
	'tools/tool_time_machine/server/bulk_revert.ts': { reads: 2, narrowSites: 2 },
};

describe('time-machine epoch tripwire', () => {
	const readers = tmReaders();

	test('the census finds the TM readers it is meant to see (anti-vacuity)', () => {
		expect(readers.length).toBeGreaterThanOrEqual(10);
		const files = new Set(readers.map((r) => r.file));
		for (const door of [
			'src/core/resolve/read_tm.ts',
			'src/core/section/record/delete_record.ts',
			'tools/tool_time_machine/server/bulk_revert.ts',
			'src/core/db/matrix_write.ts',
		]) {
			expect(files.has(door)).toBe(true);
		}
	});

	test('every TM reader is epoch-narrowed, or exempt with a reason', () => {
		// A reader that serves a record's history without narrowing it shows a DEAD
		// record's snapshots as the living record's own (P0-14). Narrow it with
		// tmEpochPredicate()/withTmEpoch(), or add an entry to EXEMPT_TM_READERS
		// stating why this reader cannot serve one generation's rows as another's.
		const leaking = readers
			.filter((r) => r.narrowSites === 0 && EXEMPT_TM_READERS[r.file] === undefined)
			.map((r) => r.file);
		expect(leaking).toEqual([]);
	});

	test('no exemption is stale', () => {
		const readerFiles = new Set(readers.map((r) => r.file));
		const stale = Object.keys(EXEMPT_TM_READERS).filter((file) => !readerFiles.has(file));
		expect(stale).toEqual([]);
	});

	test('an exemption covers a COUNTED set of reads, not the whole file', () => {
		// Adding a second, different TM read to an exempt file must not inherit the
		// first one's reason — raise the count deliberately with a reason that
		// describes both, or narrow the new read.
		const drifted = Object.entries(EXEMPT_TM_READERS)
			.map(([file, entry]) => ({
				file,
				allowed: entry.reads,
				actual: readers.find((r) => r.file === file)?.reads ?? 0,
			}))
			.filter((row) => row.actual !== row.allowed)
			.map((row) => `${row.file}: exempts ${row.allowed}, found ${row.actual}`);
		expect(drifted).toEqual([]);
	});

	test('each narrowed file narrows EVERY statement it holds, not merely one', () => {
		const drifted = Object.entries(NARROWED_READERS)
			.map(([file, pin]) => {
				const actual = readers.find((r) => r.file === file);
				return {
					file,
					want: `${pin.reads} reads / ${pin.narrowSites} narrowings`,
					got: `${actual?.reads ?? 0} reads / ${actual?.narrowSites ?? 0} narrowings`,
				};
			})
			.filter((row) => row.want !== row.got)
			.map((row) => `${row.file}: pinned ${row.want}, found ${row.got}`);
		// A statement added without its narrowing moves `reads` without moving
		// `narrowSites` — update BOTH deliberately, having checked the new
		// statement is narrowed (or belongs in EXEMPT_TM_READERS).
		expect(drifted).toEqual([]);
	});

	test('the counter floor is exempt for the RIGHT reason, and still unnarrowed', () => {
		// The load-bearing exemption: if someone "helpfully" narrows the floor, the
		// allocator stops seeing dead ids and re-mints them — half one, reopened.
		const floor = readFileSync(join(REPO_ROOT, 'src/core/db/matrix_write.ts'), 'utf8');
		expect(floor).toContain('counterFloorExpression');
		expect(floor).not.toContain('tmEpochPredicate');
		expect(EXEMPT_TM_READERS['src/core/db/matrix_write.ts']?.reason).toContain('DEAD generations');
	});
});
