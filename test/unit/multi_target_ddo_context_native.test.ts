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
 * DB-FREE by construction: the resolution is a pure function of the ddo and the
 * emitted data items, which is the whole reason it was extracted.
 */

import { expect, test } from 'bun:test';
import { resolveDdoContextSections } from '../../src/core/section/read.ts';

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
