/**
 * The user search-presets panel (search_container_selection_presets, section
 * dd623) renders as the COMPACT preset strip — driven by the CALLER + the
 * section_map, NOT the v6 client hardcode (a literal ddo_map:[dd624]) and NOT
 * the section_list child (dd629 stays the GENERAL menu-list config). TS-golden
 * (the preset picker is client-native; no PHP oracle).
 *
 * Two engine capabilities make this work — both asserted here as MECHANISMS so
 * the gate is robust across databases (the dd623 section_map dd1267 is an
 * app-install configuration, absent from the vanilla install seed / test DB):
 *
 *  1. A caller-requested SECTION view is honored on the section context (PHP
 *     get_view top precedence). readSection threads source.view → the section
 *     entry's view; a read WITHOUT source.view (the general menu list) does NOT
 *     get it. This is the regression that produced view_null → the full list.
 *  2. A caller `show.get_ddo_map` (model 'section_map') resolves the label
 *     column via the section_map ROLE — always exactly the section's
 *     default.term (so the picker never hardcodes a component tipo). Where no
 *     section_map is configured the directive resolves empty and the read
 *     falls back to the ontology default (graceful — still the compact view).
 */

import { describe, expect, test } from 'bun:test';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { getSectionMapValue } from '../../src/core/ontology/section_map.ts';
import { resolveSectionMapGetDdoMap } from '../../src/core/relations/request_config/explicit.ts';
import { readSection } from '../../src/core/section/read.ts';

const PRESETS_SECTION = 'dd623';
const PRESETS_VIEW = 'search_user_presets';
const GET_DDO_MAP = { model: 'section_map', columns: [{ path: ['default', 'term'] }] };

const baseRqo = (extra: Partial<Rqo['source']>, show?: unknown): Rqo =>
	({
		source: {
			model: 'section',
			tipo: PRESETS_SECTION,
			section_tipo: PRESETS_SECTION,
			mode: 'list',
			lang: 'lg-spa',
			...extra,
		},
		sqo: { section_tipo: [PRESETS_SECTION], limit: 1, offset: 0 },
		...(show === undefined ? {} : { show }),
	}) as unknown as Rqo;

const sectionEntry = (context: { tipo?: string; model?: string; view?: unknown }[]) =>
	context.find((c) => c.tipo === PRESETS_SECTION && c.model === 'section');

describe('search-presets compact list — caller view + section_map label (dd623)', () => {
	test('get_ddo_map resolves the label column to exactly the section_map default.term', async () => {
		const term = await getSectionMapValue(PRESETS_SECTION, 'default', 'term');
		const expected = term === null ? [] : Array.isArray(term) ? term : [term];
		const resolved = (
			await resolveSectionMapGetDdoMap(PRESETS_SECTION, PRESETS_SECTION, GET_DDO_MAP)
		).map((d) => String(d.tipo));
		expect(resolved).toEqual(expected);
	});

	test("caller-requested view flows onto the section context (view:'search_user_presets')", async () => {
		const { context } = await readSection(
			baseRqo({ view: PRESETS_VIEW }, { get_ddo_map: GET_DDO_MAP }),
		);
		expect(sectionEntry(context)?.view).toBe(PRESETS_VIEW);
	});

	test('the GENERAL list (no source.view) does NOT get the compact view', async () => {
		// dd629 (section_list) is untouched, so the section keeps its normal list
		// view — never the caller-only search_user_presets.
		const { context } = await readSection(baseRqo({}));
		expect(sectionEntry(context)?.view).not.toBe(PRESETS_VIEW);
	});
});

// The client builds its columns_map from the SECTION entry's request_config
// (common.js get_columns_map), so a caller-shaped read must ship there exactly
// the columns the data half resolved — else every unrequested section_list
// column renders as an empty cell (the preset rows wrapped, 2026-09-30).
describe('caller show narrows the section entry request_config (context = data columns)', () => {
	const mainShowTipos = (
		context: { tipo?: string; model?: string; request_config?: unknown }[],
		st: string,
	) =>
		(
			(context.find((c) => c.tipo === st && c.model === 'section')?.request_config ?? []) as {
				api_engine?: string;
				type?: string;
				show?: { ddo_map?: { tipo: string }[] };
			}[]
		)
			.find((i) => i.api_engine === 'dedalo' && i.type === 'main')
			?.show?.ddo_map?.map((d) => d.tipo);

	test('literal show.ddo_map: the section entry lists only the requested column', async () => {
		const { context } = await readSection(
			baseRqo(
				{},
				{ ddo_map: [{ tipo: 'dd624', section_tipo: PRESETS_SECTION, parent: PRESETS_SECTION }] },
			),
		);
		expect(mainShowTipos(context, PRESETS_SECTION)).toEqual(['dd624']);
	});

	test('get_ddo_map directive: the section entry lists the resolved columns', async () => {
		const resolved = (
			await resolveSectionMapGetDdoMap(PRESETS_SECTION, PRESETS_SECTION, GET_DDO_MAP)
		).map((d) => String(d.tipo));
		const { context } = await readSection(
			baseRqo({ view: PRESETS_VIEW }, { get_ddo_map: GET_DDO_MAP }),
		);
		const tipos = mainShowTipos(context, PRESETS_SECTION);
		if (resolved.length > 0) expect(tipos).toEqual(resolved);
		else expect(tipos?.length ?? 0).toBeGreaterThan(0); // no section_map: ontology default, still columns
	});

	test('no caller show: the ontology section_list is untouched', async () => {
		const plain = mainShowTipos((await readSection(baseRqo({}))).context, PRESETS_SECTION) ?? [];
		expect(plain.length).toBeGreaterThan(1);
	});
});
