/**
 * A MULTI-TARGET ddo_map entry gets one structure context PER TARGET SECTION
 * (src/core/section/read.ts resolveDdoContextSections).
 *
 * WHY IT EXISTS. A picker's show map names N target sections at once — the
 * epigraphy autocomplete's `hierarchy95` over eight glyph thesauri is the live
 * case. The same component tipo in a different section is a DIFFERENT ontology
 * element (its own label, features and ACL), and the client resolves a row's
 * component context by BOTH tipo and section_tipo
 * (`client/dedalo/core/services/service_autocomplete/js/view_default_autocomplete.js`
 * render_grid_choose). Emitting one entry built against `section_tipo[0]` made
 * every row from the other seven targets fail that lookup and render nothing —
 * `console.error('Ignored element: context not found')` and an empty grid.
 *
 * This is a bug fix TOWARD the oracle, not a divergence from it: PHP's own
 * context identity is tipo + section_tipo + mode
 * (`common::merge_unique_context` / `context_key`, class.common.php:93), i.e.
 * the shape has always allowed several entries per tipo, and the client's
 * matcher was written against exactly that. No wire-contract entry.
 *
 * WHAT IS PINNED (outcomes, never spellings):
 *   1. the sections a read EMITTED ROWS FOR are the sections that get context —
 *      not the first declared target;
 *   2. a target with no rows contributes no entry (context does not inflate to
 *      N for every multi-target ddo);
 *   3. with no matching row at all the FIRST declared target is still emitted
 *      (an empty result still ships structure — the pre-fix behaviour, kept);
 *   4. `'self'`, a bare string, undefined and a one-element array are strict
 *      no-ops: exactly one section, the same one as before;
 *   5. non-string members of the array are dropped rather than handed on as a
 *      section tipo.
 *
 * The unit half is DB-FREE by construction — the resolution is a pure function
 * of the ddo and the emitted data items, which is the whole reason it was
 * extracted. The END-TO-END half at the bottom is NOT optional: the fix is the
 * consuming LOOP in readSectionScoped, and a mutation that keeps the helper and
 * takes only its first answer (`ddoSectionTipos.slice(0, 1)`) is EXACTLY the
 * pre-fix behaviour — it left every unit assertion here green.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readSection, resolveDdoContextSections } from '../../src/core/section/read.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** The live shape: one component tipo declared over eight thesaurus sections. */
const TARGETS = ['zzmtca1', 'zzmtcb1', 'zzmtcc1'];
const TIPO = 'zzmtcg1';

/** A ddo_map entry, only the fields the resolution reads. */
function ddo(sectionTipo: unknown): never {
	return { tipo: TIPO, section_tipo: sectionTipo } as never;
}

/** An emitted data item, only the fields the resolution reads. */
function row(tipo: string, sectionTipo: unknown): unknown {
	return { tipo, section_tipo: sectionTipo, entries: [] };
}

test('the sections that EMITTED ROWS get the context, not the first target', () => {
	const data = [row(TIPO, 'zzmtcc1')];

	expect(resolveDdoContextSections(ddo(TARGETS), 'zzmtcown1', data)).toEqual(['zzmtcc1']);
});

test('several answering sections each get their own entry, in declared order', () => {
	const data = [row(TIPO, 'zzmtcc1'), row(TIPO, 'zzmtca1')];

	expect(resolveDdoContextSections(ddo(TARGETS), 'zzmtcown1', data)).toEqual([
		'zzmtca1',
		'zzmtcc1',
	]);
});

test('a target with no rows contributes nothing', () => {
	const data = [row(TIPO, 'zzmtca1')];
	const resolved = resolveDdoContextSections(ddo(TARGETS), 'zzmtcown1', data);

	expect(resolved).toEqual(['zzmtca1']);
	expect(resolved).not.toContain('zzmtcb1');
});

test('rows of ANOTHER tipo never widen the answer', () => {
	const data = [row('zzmtco1', 'zzmtcb1'), row(TIPO, 'zzmtcc1')];

	expect(resolveDdoContextSections(ddo(TARGETS), 'zzmtcown1', data)).toEqual(['zzmtcc1']);
});

test('no matching row at all still ships the first declared target', () => {
	// An empty result must still carry structure — the client renders the
	// picker's frame before it has anything to put in it.
	expect(resolveDdoContextSections(ddo(TARGETS), 'zzmtcown1', [])).toEqual(['zzmtca1']);
	// …and a row from a section the ddo does not declare is not a match either.
	expect(resolveDdoContextSections(ddo(TARGETS), 'zzmtcown1', [row(TIPO, 'zzmtce1')])).toEqual([
		'zzmtca1',
	]);
});

test("single-target shapes are strict no-ops: 'self', a string, absent, one-element", () => {
	const data = [row(TIPO, 'zzmtcc1')];

	expect(resolveDdoContextSections(ddo('self'), 'zzmtcown1', data)).toEqual(['zzmtcown1']);
	expect(resolveDdoContextSections(ddo(undefined), 'zzmtcown1', data)).toEqual(['zzmtcown1']);
	expect(resolveDdoContextSections(ddo('zzmtcb1'), 'zzmtcown1', data)).toEqual(['zzmtcb1']);
	// A one-element array resolves to that element even though no row answers it.
	expect(resolveDdoContextSections(ddo(['zzmtcb1']), 'zzmtcown1', data)).toEqual(['zzmtcb1']);
});

test('a degenerate array never leaks a non-string as a section tipo', () => {
	const data = [row(TIPO, 'zzmtcc1')];

	// Members that are not tipos are dropped; the remaining declaration decides.
	expect(resolveDdoContextSections(ddo([null, 'zzmtcc1']), 'zzmtcown1', data)).toEqual(['zzmtcc1']);
	// Nothing usable left → the read's own section, never `undefined`/`null`.
	expect(resolveDdoContextSections(ddo([null, 7]), 'zzmtcown1', data)).toEqual(['zzmtcown1']);
	expect(resolveDdoContextSections(ddo([]), 'zzmtcown1', data)).toEqual(['zzmtcown1']);
});

test('a row whose section_tipo is not a string cannot match a target', () => {
	// The `typo:'sections'` envelope carries `section_tipo: []` — it must never
	// be read as a target answer.
	const data = [{ typo: 'sections', tipo: TIPO, section_tipo: [] }];

	expect(resolveDdoContextSections(ddo(TARGETS), 'zzmtcown1', data)).toEqual(['zzmtca1']);
});

// ---------------------------------------------------------------------------
// END-TO-END: the LOOP, not just the helper.
// ---------------------------------------------------------------------------

/**
 * The live shape in miniature: ONE component tipo declared over TWO sections,
 * with rows in both — a picker's show map, the way `render_grid_choose` sends
 * it (`show.ddo_map` with an ARRAY `section_tipo`).
 */
const SECTION_A = 'zzmt1';
const SECTION_B = 'zzmt2';
const SHARED = 'zzmt3';
const ROW_A = 1;
const ROW_B = 1;

const S = situation({
	name: 'multi-target ddo context',
	tld: 'zzmt',
	nodes: [
		{ tipo: SECTION_A, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		{ tipo: SECTION_B, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		// Declared under A, USED by both — which is exactly how a hierarchy
		// component (hierarchy95) is shared across every thesaurus section.
		{ tipo: SHARED, parent: SECTION_A, model: 'component_input_text' },
	],
	records: [
		{
			section_tipo: SECTION_A,
			section_id: ROW_A,
			columns: { string: { [SHARED]: [{ id: 1, lang: 'lg-nolan', value: 'in A' }] } },
		},
		{
			section_tipo: SECTION_B,
			section_id: ROW_B,
			columns: { string: { [SHARED]: [{ id: 1, lang: 'lg-nolan', value: 'in B' }] } },
		},
	],
});

beforeAll(async () => {
	await ensureSituation(S);
}, 60000);

afterAll(async () => {
	expect(await dropSituation(S)).toBe(0);
}, 60000);

/** The read a picker makes: both target sections, one multi-target column. */
async function readBothSections(): Promise<{ context: unknown[]; data: unknown[] }> {
	return await readSection({
		action: 'read',
		source: {
			action: null,
			model: 'section',
			tipo: SECTION_A,
			section_tipo: SECTION_A,
			mode: 'list',
		},
		show: {
			ddo_map: [
				{
					tipo: SHARED,
					parent: 'self',
					section_tipo: [SECTION_A, SECTION_B],
					mode: 'list',
				},
			],
		},
		sqo: { section_tipo: [SECTION_A, SECTION_B], limit: 10, offset: 0 },
	} as never);
}

test('the read EMITS one context entry per answering section', async () => {
	const { context, data } = await readBothSections();
	const entries = (context as { tipo?: string; section_tipo?: string }[]).filter(
		(entry) => entry.tipo === SHARED,
	);

	// Both sections answered…
	const rowSections = new Set(
		(data as { typo?: string; tipo?: string; section_tipo?: string }[])
			.filter((item) => item.typo !== 'sections' && item.tipo === SHARED)
			.map((item) => String(item.section_tipo)),
	);
	expect([...rowSections].sort()).toEqual([SECTION_A, SECTION_B]);

	// …so both sections get a context. ONE entry here is the pre-fix behaviour
	// and the empty glyph grid: the client resolves a row's context by tipo AND
	// section_tipo, so a row from the section without an entry renders nothing.
	expect(entries.length).toBe(2);
	expect(entries.map((entry) => entry.section_tipo).sort()).toEqual([SECTION_A, SECTION_B]);
});

test('every emitted row can find a context by (tipo, section_tipo)', async () => {
	// The client's own lookup, run server-side: not one row may miss.
	const { context, data } = await readBothSections();
	const rows = (data as { typo?: string; tipo?: string; section_tipo?: string }[]).filter(
		(item) => item.typo !== 'sections' && item.tipo === SHARED,
	);

	expect(rows.length).toBeGreaterThan(0);
	for (const row of rows) {
		const match = (context as { tipo?: string; section_tipo?: string }[]).find(
			(entry) => entry.tipo === row.tipo && entry.section_tipo === row.section_tipo,
		);
		expect(match).toBeDefined();
	}
});
