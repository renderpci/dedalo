/**
 * portalize_data move SELECTION (Tier 3.1) — gates the pure plan layer
 * `collectPortalizeMoves` (src/core/update/transform/portalize_plan.ts),
 * extracted out of `portalizeOne`'s inline loop, plus the REWIRE (the inline
 * loop must be gone), plus ONE db-scratch dry-run through `portalizeOne`
 * itself.
 *
 * THE LOAD-BEARING SEMANTIC. The presence test is `decoded[source_tipo] ===
 * undefined`, NOT truthiness. Step 3 of `portalizeOne` nulls the source key of
 * every collected move, so a truthy test would leave `[]` / `0` / `''` / `null`
 * behind on a record whose source key is then nulled — silent, TM-suppressed
 * data loss. Four cases below pin exactly that.
 *
 * SCRATCH SURFACES (this file's namespace only — other agents write the same DB
 * concurrently): matrix_test rows with section_tipo='test3' and section_id in
 * 941000-941999; component tipos `zztportsrc1` / `zztporttgt1` (unique to this
 * file, so no other row in test3 can contribute a move). No table-global count
 * is asserted anywhere.
 *
 * ------------------------------------------------------------------------
 * STILL UNGATED after this file (stated per the plan's requirement):
 *  - the `getMatrixTableFromTipo(...) === null` guard at portalize.ts:53 (a
 *    zzt* tipo has no ontology node, so the ONLY way to reach the guard is a
 *    section that resolves for one side and not the other — not constructible
 *    on a scratch surface without an ontology write);
 *  - the EXECUTE path entirely: the create→write-flat→link-portal→null-source
 *    →relocate-TM ORDER, and the partial-application window (there is NO
 *    transaction around those five steps; a failure between 1 and 3 leaves the
 *    data duplicated, between 3 and 4 leaves the TM orphaned). Executing it
 *    here would create real records through createSectionRecord + counters;
 *  - PARTIAL: the four dry-run deltas ARE asserted below, but only for one
 *    scratch row (the delta ORDER and per-op detail strings are pinned; the
 *    multi-row accumulation is not).
 *
 * D6 (named, pinned, NOT fixed): portalize.ts step 2 writes
 * `{column:'relation', key:item.portal, value:[portalLocator]}` — an
 * UNCONDITIONAL REPLACE of the portal key. Any pre-existing content of that
 * portal on the source record is clobbered, on a TM-suppressed write, i.e.
 * unrecoverable. Pinned by a source assertion below.
 *
 * NOT WRITTEN, deliberately: `planPortalWrite` / append-instead-of-replace.
 * Appending would make re-runs non-idempotent (duplicate locators); it is a
 * behaviour change needing a decision + an engineering/wire_contract/ entry.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { executePortalize, portalizeOne } from '../../src/core/update/transform/portalize.ts';
import { collectPortalizeMoves } from '../../src/core/update/transform/portalize_plan.ts';
import { TransformRecorder } from '../../src/core/update/transform/report.ts';

const SRC = 'zztportsrc1';
const TGT = 'zztporttgt1';

/** Build the `::text` column bag the plan layer consumes. */
function cols(
	input: Partial<Record<MatrixJsonbColumn, unknown>>,
): Partial<Record<MatrixJsonbColumn, string | null>> {
	const out: Partial<Record<MatrixJsonbColumn, string | null>> = {};
	for (const [column, value] of Object.entries(input)) {
		out[column as MatrixJsonbColumn] = JSON.stringify(value);
	}
	return out;
}

const MAP = [{ source_tipo: SRC, target_tipo: TGT }];

// ---------------------------------------------------------------------------
// 1. pure: the value is picked from WHICHEVER column carries the source tipo
// ---------------------------------------------------------------------------

test('picks the value from whichever column carries the source tipo', () => {
	for (const column of MATRIX_JSONB_COLUMNS) {
		const moves = collectPortalizeMoves(cols({ [column]: { [SRC]: 'V' } }), MAP);
		expect(moves).toEqual([{ column, sourceTipo: SRC, targetTipo: TGT, value: 'V' }]);
	}
});

test('a tipo absent from every column produces no move', () => {
	const moves = collectPortalizeMoves(cols({ data: { other7: 'x' }, string: {} }), MAP);
	expect(moves).toEqual([]);
});

test('null and absent columns are skipped (no JSON.parse of null)', () => {
	const moves = collectPortalizeMoves({ data: null, string: undefined }, MAP);
	expect(moves).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. THE SEMANTIC: `=== undefined`, not truthiness
// ---------------------------------------------------------------------------

test('falsy-but-PRESENT values still move: [] / 0 / "" / null / false', () => {
	// NB `[]` is TRUTHY in JS — the discriminating values against a truthy
	// presence test are 0 / '' / null / false. `[]` is kept because an empty
	// relation array is the commonest cleared-component shape.
	const falsy: unknown[] = [[], 0, '', null, false];
	for (const value of falsy) {
		const moves = collectPortalizeMoves(cols({ data: { [SRC]: value } }), MAP);
		expect(moves.length).toBe(1);
		expect(moves[0]?.value).toEqual(value as never);
		expect(moves[0]?.targetTipo).toBe(TGT);
	}
});

test('an explicit undefined-shaped key (absent after JSON round-trip) does NOT move', () => {
	// JSON.stringify drops undefined values, so the key vanishes — the same
	// state the DB would hold. This is the ONE case the presence test rejects.
	const moves = collectPortalizeMoves(cols({ data: { [SRC]: undefined } }), MAP);
	expect(moves).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. from_component_tipo repointing — relation-like columns only
// ---------------------------------------------------------------------------

test('relation and relation_search array locators are repointed to the target tipo', () => {
	for (const column of ['relation', 'relation_search'] as const) {
		const moves = collectPortalizeMoves(
			cols({
				[column]: {
					[SRC]: [
						{ section_tipo: 'test3', section_id: 1, from_component_tipo: SRC, type: 'dd151' },
					],
				},
			}),
			MAP,
		);
		expect(moves.length).toBe(1);
		expect(moves[0]?.value).toEqual([
			{ section_tipo: 'test3', section_id: 1, from_component_tipo: TGT, type: 'dd151' },
		] as never);
	}
});

test('non-relation columns are NEVER repointed, even when the value looks like a locator', () => {
	const locator = [{ section_tipo: 'test3', section_id: 1, from_component_tipo: SRC }];
	for (const column of MATRIX_JSONB_COLUMNS.filter(
		(c) => c !== 'relation' && c !== 'relation_search',
	)) {
		const moves = collectPortalizeMoves(cols({ [column]: { [SRC]: locator } }), MAP);
		expect(moves[0]?.value).toEqual(locator as never);
	}
});

test('null array elements survive the repoint untouched', () => {
	const moves = collectPortalizeMoves(
		cols({ relation: { [SRC]: [null, { from_component_tipo: SRC }, null] } }),
		MAP,
	);
	expect(moves[0]?.value).toEqual([null, { from_component_tipo: TGT }, null] as never);
});

test('scalar array elements survive the repoint untouched (typeof guard)', () => {
	const moves = collectPortalizeMoves(cols({ relation: { [SRC]: ['a', 7, true] } }), MAP);
	expect(moves[0]?.value).toEqual(['a', 7, true] as never);
});

test('a NON-array payload in a relation column is untouched (Array.isArray guard)', () => {
	const object = { from_component_tipo: SRC, section_id: 9 };
	const moves = collectPortalizeMoves(cols({ relation: { [SRC]: object } }), MAP);
	expect(moves[0]?.value).toEqual(object as never);
	const scalar = collectPortalizeMoves(cols({ relation_search: { [SRC]: 'plain' } }), MAP);
	expect(scalar[0]?.value).toBe('plain');
});

test('repointing does not mutate the decoded input value (fresh objects)', () => {
	const source = { relation: JSON.stringify({ [SRC]: [{ from_component_tipo: SRC }] }) };
	collectPortalizeMoves(source, MAP);
	// the text is the source of truth and must be unchanged
	expect(source.relation).toBe(JSON.stringify({ [SRC]: [{ from_component_tipo: SRC }] }));
});

// ---------------------------------------------------------------------------
// 4. ordering / multiplicity
// ---------------------------------------------------------------------------

test('a tipo present in TWO columns yields 2 moves in MATRIX_JSONB_COLUMNS order', () => {
	// 'string' is declared BEFORE 'misc'; seed them in the reverse order so a
	// naive Object.keys iteration would produce the wrong order.
	const moves = collectPortalizeMoves(cols({ misc: { [SRC]: 'M' }, string: { [SRC]: 'S' } }), MAP);
	expect(moves.map((m) => m.column)).toEqual(['string', 'misc']);
	expect(moves.map((m) => m.value)).toEqual(['S', 'M']);
});

test('components iterate OUTER, columns INNER', () => {
	const moves = collectPortalizeMoves(
		cols({ data: { a1: 'A', b1: 'B' }, string: { a1: 'A2', b1: 'B2' } }),
		[
			{ source_tipo: 'b1', target_tipo: 'b9' },
			{ source_tipo: 'a1', target_tipo: 'a9' },
		],
	);
	expect(moves.map((m) => `${m.sourceTipo}.${m.column}`)).toEqual([
		'b1.data',
		'b1.string',
		'a1.data',
		'a1.string',
	]);
	expect(moves.map((m) => m.targetTipo)).toEqual(['b9', 'b9', 'a9', 'a9']);
});

test('an empty component list yields no moves and never parses a column', () => {
	expect(collectPortalizeMoves(cols({ data: { [SRC]: 'V' } }), [])).toEqual([]);
	// malformed JSON is not even reached when there is nothing to look for
	expect(collectPortalizeMoves({ data: '{not json' }, [])).toEqual([]);
});

test('malformed column JSON THROWS (faithful to the pre-extraction executor)', () => {
	// FOUND, NOT FIXED: portalizeOne has no try/catch around this parse, so one
	// corrupt row aborts the whole transform mid-run (see the partial-application
	// window noted in the header). Pinned as-is.
	expect(() => collectPortalizeMoves({ data: '{not json' }, MAP)).toThrow();
});

// ---------------------------------------------------------------------------
// 5. REWIRE: the inline loop is gone and portalizeOne calls the extraction
// ---------------------------------------------------------------------------

const PORTALIZE_SRC = await Bun.file(
	new URL('../../src/core/update/transform/portalize.ts', import.meta.url).pathname,
).text();

test('portalizeOne calls collectPortalizeMoves', () => {
	expect(PORTALIZE_SRC).toContain("from './portalize_plan.ts'");
	expect(PORTALIZE_SRC).toContain('collectPortalizeMoves(');
});

test('the inline move-collection loop is DELETED from portalize.ts', () => {
	// Each marker is a line that existed ONLY inside the old :65-96 loop. If a
	// revert re-inlines it, this fails.
	for (const marker of [
		'decoded[component.source_tipo] === undefined',
		'const decoded = JSON.parse(text)',
		'RELATION_LIKE',
		'from_component_tipo: component.target_tipo',
		'for (const column of MATRIX_JSONB_COLUMNS) {',
	]) {
		expect(PORTALIZE_SRC).not.toContain(marker);
	}
});

test('D6 pinned, not fixed: the portal key is written as an UNCONDITIONAL REPLACE', () => {
	// portalize.ts step 2 replaces the portal key with a single-element array,
	// clobbering any pre-existing portal content on a TM-suppressed write.
	expect(PORTALIZE_SRC).toContain(
		"{ column: 'relation', key: item.portal, value: [portalLocator] }",
	);
	// there is no read-merge of the existing portal value anywhere in the file
	expect(PORTALIZE_SRC).not.toContain('existingPortal');
});

// ---------------------------------------------------------------------------
// 6. executePortalize item validation
// ---------------------------------------------------------------------------

test('executePortalize refuses 3 malformed items; the third names its info', async () => {
	const recorder = new TransformRecorder(true);
	await executePortalize(
		[
			{ source_section: 'BAD TIPO', target_section: 'test3', portal: 'test5', components: [] },
			{ source_section: 'test3', target_section: '', portal: 'test5', components: [] },
			{
				source_section: 'test3',
				target_section: 'test3',
				portal: 'nope',
				components: [],
				info: 'line 7 of move_to_portal.json',
			},
		],
		recorder,
	);
	expect(recorder.errors.length).toBe(3);
	for (const error of recorder.errors) {
		expect(error).toContain('portalize: invalid section/portal tipos');
	}
	expect(recorder.errors[0]).toContain('item'); // no info → the 'item' fallback
	expect(recorder.errors[2]).toContain('line 7 of move_to_portal.json');
	expect(recorder.counts).toEqual({});
});

test('executePortalize on a non-array raw input is a no-op', async () => {
	const recorder = new TransformRecorder(true);
	await executePortalize(null, recorder);
	await executePortalize({ source_section: 'test3' }, recorder);
	expect(recorder.errors).toEqual([]);
	expect(recorder.counts).toEqual({});
});

// ---------------------------------------------------------------------------
// 7. DB SCRATCH: one dry-run through portalizeOne itself
// ---------------------------------------------------------------------------

const SCRATCH_TIPO = 'test3';
const SCRATCH_ID = 941007;
let scratchRowId: number | null = null;

beforeAll(async () => {
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, data, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb) RETURNING id`,
		[
			SCRATCH_ID,
			SCRATCH_TIPO,
			// an EMPTY STRING: present-but-FALSY, the exact value a truthy
			// presence test would drop while step 3 still nulls the source key.
			JSON.stringify({ [SRC]: '' }),
			JSON.stringify({
				[SRC]: [{ section_tipo: 'test3', section_id: 1, from_component_tipo: SRC }],
			}),
		] as (string | number)[],
	)) as { id: number }[];
	const id = rows[0]?.id;
	if (typeof id !== 'number') throw new Error('scratch seed failed — no id returned');
	scratchRowId = id;
});

afterAll(async () => {
	await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
		SCRATCH_TIPO,
		SCRATCH_ID,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SCRATCH_TIPO,
		SCRATCH_ID,
	]);
	const residue = (await sql.unsafe(
		`SELECT (SELECT count(*) FROM matrix_test WHERE section_tipo = $1 AND section_id = $2) AS rows,
		        (SELECT count(*) FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2) AS tm`,
		[SCRATCH_TIPO, SCRATCH_ID],
	)) as { rows: string | number; tm: string | number }[];
	const left = Number(residue[0]?.rows) + Number(residue[0]?.tm);
	if (left !== 0) throw new Error(`portalize scratch residue left behind: ${left}`);
});

test('portalizeOne dry-run: 4 deltas for the scratch row, nothing written', async () => {
	if (scratchRowId === null) throw new Error('scratch row missing — seed did not run');
	const recorder = new TransformRecorder(true);
	await portalizeOne(
		{
			source_section: SCRATCH_TIPO,
			target_section: SCRATCH_TIPO,
			portal: 'test99',
			components: [{ source_tipo: SRC, target_tipo: TGT }],
		},
		recorder,
	);
	expect(recorder.errors).toEqual([]);
	// SRC is unique to this file, so ONLY the scratch row can contribute.
	expect(recorder.counts).toEqual({
		insert: 1,
		link_portal: 1,
		null_component: 1,
		update: 1,
	});
	expect(recorder.sample.map((d) => d.op)).toEqual([
		'insert',
		'link_portal',
		'null_component',
		'update',
	]);
	// 2 moves: the falsy '' in `data` AND the locator in `relation`. A truthy
	// presence test would report 1 here.
	expect(recorder.sample[0]).toEqual({
		op: 'insert',
		table: 'matrix_test',
		target: `${SCRATCH_TIPO}/(new)`,
		detail: `2 flat component(s) from ${SCRATCH_TIPO}/${SCRATCH_ID}`,
	});
	expect(recorder.sample[1]?.target).toBe(`${SCRATCH_TIPO}/${SCRATCH_ID}`);
	expect(recorder.sample[1]?.detail).toBe(`portal test99 → new ${SCRATCH_TIPO}`);
	expect(recorder.sample[3]?.table).toBe('matrix_time_machine');

	// nothing was written: the scratch row is byte-identical.
	const after = (await sql.unsafe(
		'SELECT data::text AS data, relation::text AS relation FROM matrix_test WHERE id = $1',
		[scratchRowId],
	)) as { data: string; relation: string }[];
	expect(JSON.parse(after[0]?.data ?? 'null')).toEqual({ [SRC]: '' });
	expect(JSON.parse(after[0]?.relation ?? 'null')[SRC][0].from_component_tipo).toBe(SRC);
});

test('portalizeOne dry-run with an unmapped component records nothing', async () => {
	const recorder = new TransformRecorder(true);
	await portalizeOne(
		{
			source_section: SCRATCH_TIPO,
			target_section: SCRATCH_TIPO,
			portal: 'test99',
			components: [{ source_tipo: 'zztportabsent1', target_tipo: TGT }],
		},
		recorder,
	);
	expect(recorder.counts).toEqual({});
	expect(recorder.errors).toEqual([]);
});
