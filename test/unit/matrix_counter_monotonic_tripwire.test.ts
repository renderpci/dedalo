/**
 * MATRIX_COUNTER MONOTONIC TRIPWIRE (P0-14) — no writer anywhere may LOWER a
 * section-id counter.
 *
 * THE INVARIANT. `matrix_counter` / `matrix_counter_dd` hold the HIGHEST
 * section_id EVER MINTED for a tipo — a high-water mark, not a count of live
 * records. `counter > MAX(section_id)` is therefore the NORMAL state of any
 * section that has had a record deleted from its tail.
 *
 * WHY IT IS LOAD-BEARING. A section_id is the permanent address of a record's
 * Time Machine history, its media files (identity is exactly
 * `{component_tipo}_{section_tipo}_{section_id}`), its diffusion rows and its
 * activity trail — and NONE of those stores carries a generation of its own.
 * So an id that is minted twice binds a living record to a dead one's data:
 * the new record's TM panel lists the dead record's snapshots and a restore
 * writes the dead record's values into it with `ok:true`; `component_av`
 * re-derives `files_info` from disk and plays the dead record's derivatives.
 * All of it silent. The audit's own repro: create 1..100, delete 71..100,
 * press "Fix counter", and the next create is born at 71.
 *
 * WHAT THIS GATE ENFORCES. A TOTAL census of every INSERT/UPDATE/DELETE
 * touching a counter table in `src/`, `tools/` and `scripts/`. Each writer
 * must either be RAISE-SHAPED — a `GREATEST(...)` upsert, or the allocator's
 * `value + 1` increment — or carry a named reason in `EXEMPT_COUNTER_WRITERS`.
 * A plain `SET value = <x>` and a bare `DELETE` are the two shapes that
 * produced the defect, and both fail here.
 *
 * THE EXEMPTION LIST MAY ONLY SHRINK, and a stale entry is red: a dead
 * exemption widens the law silently.
 *
 * SCOPE CAVEAT (deliberate, stated so it is not mistaken for rigour it does
 * not have). This is a census of SHAPES, not a SQL analyser:
 *  - the classifier reads forward from each DML verb to the end of the SQL
 *    argument (or a 1500-character cap), not a parsed statement;
 *  - it matches the counter tables BY NAME, plus the one interpolation the
 *    allocator uses (`${counterTable}`). A counter table reached through some
 *    OTHER variable, or assembled from fragments, is invisible to it. If you
 *    add a third way to name these tables, teach this regex about it in the
 *    same change.
 * Its job is to make a NEW lowering writer impossible to add without either
 * the raise shape or an explicit, reviewed exemption. Behavioural proof that
 * the allocator does not re-mint a deleted id lives in
 * `test/unit/matrix_counter_monotonic_native.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import { MATRIX_TABLE_ALLOWLIST } from '../../src/core/db/matrix.ts';
import { counterFloorExpression } from '../../src/core/db/matrix_write.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Roots of the census. `test/` is excluded: it is not the engine. */
const CENSUS_ROOTS = ['src', 'tools', 'scripts'] as const;

/**
 * Hard cap on how far past the DML verb the shape classifier reads, when the
 * statement's end cannot be located. See SCOPE CAVEAT.
 */
const WINDOW_CAP = 1500;

/**
 * The end of the SQL argument: a template literal or quoted string closed by
 * the argument separator that follows it (`\`,` `\`;` `\`)` `',` `');` …).
 * Reading to the statement's END rather than a fixed number of characters is
 * what keeps the classifier honest when a statement GROWS — a fixed window
 * silently stopped seeing the GREATEST guard of a statement that got longer.
 */
const STATEMENT_END = /[`'][,;)]/;

/**
 * Every DML verb against a counter table, including the interpolated
 * `${counterTable}` form the allocator uses to switch between
 * `matrix_counter` and `matrix_counter_dd`.
 */
const COUNTER_DML =
	/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+("?matrix_counter(_dd)?"?|"?\$\{counterTable\}"?)/gi;

/**
 * Writers that touch a counter table without being raise-shaped, each with the
 * reason it is not a lowering defect AND the exact number of non-raise writes
 * the reason covers.
 *
 * The COUNT is the point: a file-wide exemption would let a SECOND, unrelated
 * destructive write be added to an already-exempt file and inherit a reason
 * that does not describe it. SHRINK-ONLY — both the list and the counts.
 */
const EXEMPT_COUNTER_WRITERS: Readonly<Record<string, { writes: number; reason: string }>> = {
	'src/core/update/transform/tipos.ts': {
		writes: 1,
		reason:
			'CARRY, not drop: `carryCounter` raises the NEW tipo to the old counter value with a GREATEST upsert and only then DELETEs the source row, so the high-water mark moves with the records instead of being destroyed (the DELETE is the second half of one operation).',
	},
	'src/core/test_data/situations/situation.ts': {
		writes: 1,
		reason:
			'Scratch-tipo teardown on the suite database. A situation creates its own `zz*` scratch tipo, and tearing it down removes the tipo ENTIRELY — records, TM rows and counter together — so no id survives that a later mint could collide with.',
	},
	'src/core/test_data/test_corpus/ensure.ts': {
		writes: 1,
		reason:
			'Same shape: the derived test corpus drops its own generated tipos wholesale (records + TM + counter), not a counter belonging to records that remain.',
	},
	'src/core/test_data/synthetic_hierarchy_fixture.ts': {
		writes: 1,
		reason:
			'Same shape: the synthetic hierarchy fixture removes the `<tld>1`/`<tld>2` tipos it generated, counter included, leaving no records behind the counter could have addressed.',
	},
};

/** All non-test TS sources under the census roots, repo-relative. */
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

interface CounterWrite {
	file: string;
	line: number;
	verb: string;
	raiseShaped: boolean;
	/** Seeds a value derived from live rows only — no time-machine witness. */
	seedNarrow: boolean;
}

/** Every counter DML site in the census, classified by shape. */
function counterWrites(): CounterWrite[] {
	const found: CounterWrite[] = [];
	for (const file of censusFiles()) {
		const src = readFileSync(join(REPO_ROOT, file), 'utf8');
		COUNTER_DML.lastIndex = 0;
		let match: RegExpExecArray | null = COUNTER_DML.exec(src);
		while (match !== null) {
			// Normalised so the classifier is case- and whitespace-insensitive:
			// a lowercase `delete from matrix_counter` was invisible to an earlier
			// version of this census, which is a counter-destroying writer shipping
			// under a green gate.
			const verb = (match[1] as string).replace(/\s+/g, ' ').toUpperCase();
			const rest = src.slice(match.index, match.index + WINDOW_CAP);
			const endAt = STATEMENT_END.exec(rest);
			const window = endAt === null ? rest : rest.slice(0, endAt.index);
			// A DELETE or TRUNCATE can never be a raise.
			const destructive = verb.startsWith('DELETE') || verb.startsWith('TRUNCATE');
			// An INSERT/UPDATE qualifies only via a GREATEST that includes the
			// counter's OWN stored value, or the allocator's monotonic increment.
			// A bare `GREATEST(` is not enough: `GREATEST(a, b)` over two values both
			// derived from live rows still LOWERS the stored counter, and would have
			// passed an earlier version of this classifier.
			const flat = window.replace(/\s+/g, ' ');
			// The guarded operand must be the COUNTER'S OWN stored value — naming
			// the counter table (or the allocator's ${counterTable}). `EXCLUDED.value`
			// does NOT count: `GREATEST(EXCLUDED.value, 0)` is a plain overwrite.
			const guardsOwnValue =
				/GREATEST\(\s*"?(?:matrix_counter(?:_dd)?|\$\{counterTable\})"?\.value\b/.test(flat);
			const raiseShaped = !destructive && (guardsOwnValue || /\.value \+ 1\b/.test(flat));
			// THE SEED, not just the ON CONFLICT clause. A statement can be
			// impeccably raise-shaped on conflict and still SEED a row it CREATES
			// from live rows alone — which is the whole P0-14 defect at any door
			// that runs where the counter row is absent (a fresh import, a restored
			// dump). If the statement derives its value from a matrix table, it must
			// also consult the time-machine witness, or be built from the canonical
			// `counterFloorExpression`.
			const derivesFromLiveRows = /MAX\(\s*section_id\s*\)/i.test(flat);
			const consultsWitness =
				/matrix_time_machine/i.test(flat) || /counterFloorExpression\(/.test(flat);
			const seedNarrow = !destructive && derivesFromLiveRows && !consultsWitness;
			found.push({
				file,
				line: src.slice(0, match.index).split('\n').length,
				verb,
				raiseShaped,
				seedNarrow,
			});
			match = COUNTER_DML.exec(src);
		}
	}
	return found;
}

describe('matrix_counter monotonic tripwire', () => {
	const writes = counterWrites();

	test('the census finds the counter writers it is meant to see (anti-vacuity)', () => {
		// If a refactor moves the counter DML behind a helper the regex cannot
		// see, this gate would pass by finding nothing. Pin the known doors.
		expect(writes.length).toBeGreaterThanOrEqual(12);
		const files = new Set(writes.map((w) => w.file));
		for (const door of [
			'src/core/db/matrix_write.ts',
			'src/core/area_maintenance/widgets/counters_status.ts',
			'src/core/update/transform/locators.ts',
		]) {
			expect(files.has(door)).toBe(true);
		}
		// The allocator itself must be present with all three of its writes.
		expect(writes.filter((w) => w.file === 'src/core/db/matrix_write.ts').length).toBe(3);
	});

	test('every counter writer is raise-shaped, or exempt with a reason', () => {
		const offenders = writes
			.filter((w) => !w.raiseShaped && EXEMPT_COUNTER_WRITERS[w.file] === undefined)
			.map((w) => `${w.file}:${w.line} (${w.verb})`);
		// A counter is the highest id EVER minted, not the count of live records —
		// lowering it re-mints deleted records' ids, and the reborn record inherits
		// their Time Machine history and media files (P0-14). Use the GREATEST
		// upsert shape of src/core/update/transform/locators.ts, or add an entry to
		// EXEMPT_COUNTER_WRITERS stating why the writer cannot strand a live record.
		expect(offenders).toEqual([]);
	});

	test('no exemption is stale', () => {
		const writerFiles = new Set(writes.map((w) => w.file));
		const stale = Object.keys(EXEMPT_COUNTER_WRITERS).filter((file) => !writerFiles.has(file));
		expect(stale).toEqual([]);
	});

	test('an exempt file that becomes raise-shaped loses its exemption', () => {
		// The list is a ratchet: once a file's every counter write is raise-shaped,
		// the entry must be deleted in the same change.
		const needless = Object.keys(EXEMPT_COUNTER_WRITERS).filter((file) =>
			writes.filter((w) => w.file === file).every((w) => w.raiseShaped),
		);
		expect(needless).toEqual([]);
	});

	test('an exemption covers a COUNTED set of writes, not the whole file', () => {
		// Adding a second destructive counter write to an already-exempt file must
		// not inherit the first one's reason. Raise the count deliberately, with a
		// reason that describes BOTH, or make the new write raise-shaped.
		const drifted = Object.entries(EXEMPT_COUNTER_WRITERS)
			.map(([file, entry]) => ({
				file,
				allowed: entry.writes,
				actual: writes.filter((w) => w.file === file && !w.raiseShaped).length,
			}))
			.filter((row) => row.actual !== row.allowed)
			.map((row) => `${row.file}: exempts ${row.allowed}, found ${row.actual}`);
		expect(drifted).toEqual([]);
	});

	test('the counter floor consults the time-machine witness for BOTH counter tables', () => {
		// An earlier draft narrowed the floor for `matrix_counter_dd` on the premise
		// that "TM does not track the ontology tables". Nothing enforces that:
		// recordTimeMachine skips only TM_EXCLUDED_SECTIONS and non-positive ids, so
		// a save on a `_dd`-backed section writes a TM row like any other, and the
		// narrow floor would re-mint its deleted ids. Pin the premise out.
		// Iterate the MATRIX TABLES, which is what the floor is actually keyed on.
		// An earlier version varied the counter-table argument — which the function
		// ignores — so the `_dd` narrowing this test exists to forbid could have been
		// re-added at the top of counterFloorExpression and stayed green.
		for (const table of MATRIX_TABLE_ALLOWLIST) {
			const expression = counterFloorExpression(table);
			expect(expression, `counterFloorExpression('${table}') drops the witness`).toContain(
				'matrix_time_machine',
			);
			expect(expression, `counterFloorExpression('${table}') is not a GREATEST`).toContain(
				'GREATEST(',
			);
		}
		// Anti-vacuity: the allowlist must actually contain the '_dd' tables whose
		// exclusion was the premise this pins out.
		expect(MATRIX_TABLE_ALLOWLIST.some((table) => table.endsWith('_dd'))).toBe(true);
	});

	test('no counter writer SEEDS a row from live rows alone', () => {
		// TOTAL, not a door list. A statement that is perfectly raise-shaped ON
		// CONFLICT can still seed the row it CREATES from `MAX(section_id)` over
		// live rows — and a deleted record frees no id, so that row restarts inside
		// the ids of records deleted before the import/restore. This is the exact
		// pre-2026-08-30 shape of `consolidateSectionCounter`, and an earlier
		// version of this gate was GREEN against it because it only ever inspected
		// the ON CONFLICT clause.
		const narrow = writes
			.filter((w) => w.seedNarrow && EXEMPT_COUNTER_WRITERS[w.file] === undefined)
			.map((w) => `${w.file}:${w.line}`);
		expect(narrow).toEqual([]);
	});

	test('the psql-text copies of the counter floor name the same witnesses as the canonical one', () => {
		// Two post-COPY import doors build the floor as psql TEXT (they shell out to
		// `psql -c`, so they cannot call counterFloorExpression). That is a
		// hand-copy, and a hand-copy drifts.
		//
		// (!) The first version of this test searched the WHOLE FILE for the witness
		// table name — which the explanatory COMMENT above each statement satisfies.
		// It would have stayed green against a full revert of the SQL. The witness
		// must be found INSIDE the counter statement itself.
		const canonical = counterFloorExpression('matrix_test');
		const witnesses = [...canonical.matchAll(/FROM\s+"?([a-z_]+)"?/g)]
			.map((match) => match[1] as string)
			.filter((table) => table !== 'matrix_test'); // the per-section table varies
		expect(witnesses.length).toBeGreaterThan(0); // anti-vacuity

		for (const door of [
			'src/core/install/hierarchy_import.ts',
			'src/core/ontology/data_io_import.ts',
		]) {
			const src = readFileSync(join(REPO_ROOT, door), 'utf8');
			// The counter INSERT statement, comments stripped, to its closing backtick.
			const withoutComments = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
			const start = withoutComments.indexOf('INSERT INTO matrix_counter');
			expect(start, `${door} no longer contains a counter INSERT`).toBeGreaterThan(-1);
			const statement = withoutComments.slice(start, withoutComments.indexOf('`', start));

			expect(
				statement.includes('GREATEST('),
				`${door}'s counter INSERT does not widen its seed with GREATEST — a row it CREATES would be derived from live rows alone and restart inside deleted records' ids (P0-14).`,
			).toBe(true);
			for (const witness of witnesses) {
				expect(
					statement.includes(witness),
					`${door} builds a counter floor in psql text whose STATEMENT does not consult '${witness}', which the canonical counterFloorExpression does. Widen the copy in the same change, or make the door share the canonical builder.`,
				).toBe(true);
			}
		}
	});

	test("the maintenance widget's destructive 'reset' action stays removed", () => {
		// The one action whose whole purpose was to DELETE a counter row. It is
		// refused in the server and its button is gone from the client; a
		// re-introduction must not pass silently.
		const widget = readFileSync(
			join(REPO_ROOT, 'src/core/area_maintenance/widgets/counters_status.ts'),
			'utf8',
		);
		expect(widget).toContain("counterAction === 'reset'");
		expect(widget).toContain('refuseAction');
		expect(widget).not.toMatch(/DELETE FROM "?matrix_counter/);

		const client = readFileSync(
			join(
				REPO_ROOT,
				'client/dedalo/core/area_maintenance/widgets/counters_status/js/render_counters_status.js',
			),
			'utf8',
		);
		// Whitespace-tolerant: the original pin was a tab-exact literal, which a
		// reformat would have silently unpinned.
		expect(client).not.toMatch(/counter_action\s*:\s*'reset'/);
		expect(client).not.toMatch(/reset_counter/i);
		// And the audit view must not call a counter AHEAD of its data "out of
		// sync" — that framing is what invited the destructive press.
		expect(client).not.toContain('out_of_sync');
		expect(client).toContain('counter_lagging');
		// ONE drift predicate for BOTH the per-row decoration and the bulk repair
		// count. They diverged once — the per-row test carried an extra
		// `last_section_id !== 'empty'` conjunct, so a section whose records were
		// ALL deleted (live MAX 0, floor > 0: the most damaged row on the install)
		// was never flagged while the bulk button still counted it.
		expect(client).toContain('const counter_lags =');
		expect(client).toContain('counter_lags(item)');
		// ...and the BULK count must equal what the server will actually repair:
		// a row whose raise is irreversible is flagged but excluded from the bulk
		// action, so counting it would promise work the action will not do.
		expect(client).toContain('.filter(bulk_repairable)');
		expect(client).toContain('bulk_repair_excluded');
		expect(client).not.toMatch(/counter_lagging\s*=.*'empty'/);
	});

	test('the widget grid declares exactly as many tracks as the renderer emits cells', () => {
		// `.dd_tr { display: contents }` makes every cell a direct grid item, so a
		// track count that disagrees with the cell count does not merely look odd —
		// it shifts every DATA row one column against the header, and the operator
		// reads the counter under the "Last section_id" heading. Removing a column
		// from one half only is exactly what happened when 'reset' was deleted.
		const base = 'client/dedalo/core/area_maintenance/widgets/counters_status';
		const renderer = readFileSync(join(REPO_ROOT, base, 'js/render_counters_status.js'), 'utf8');
		const less = readFileSync(join(REPO_ROOT, base, 'css/counters_status.less'), 'utf8');

		// One cell per `dd_th` occurrence: every cell's class is built from a
		// header/data pair, and `dd_th` appears exactly once per pair however the
		// string is assembled (ternary inline, or hoisted into a variable as the
		// last_section_id cell does).
		const cells = renderer.match(/'dd_th\b/g) ?? [];
		const tracks = /grid-template-columns:\s*([^;]+);/.exec(less)?.[1] ?? '';
		// minmax(a, b) counts as ONE track — collapse it before splitting.
		const trackCount = tracks
			.replace(/minmax\([^)]*\)/g, 'X')
			.trim()
			.split(/\s+/).length;

		expect(cells.length).toBeGreaterThan(0); // anti-vacuity
		expect(trackCount).toBe(cells.length);
	});
});
