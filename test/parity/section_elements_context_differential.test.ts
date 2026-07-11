/**
 * Differential gate: dd_core_api.get_section_elements_context — the edit-mode
 * search-filter panel's element list (the "CAMPOS" tree). TS builder vs the live
 * PHP oracle, same sections in, same flat element list out — MEMBERSHIP and
 * ORDER, plus the client-nesting fields (type / parent / parent_grouper).
 *
 * Why order matters: the client's components_list_container nests each component
 * under the PRECEDING grouper entry. A groups-then-components (or tipo-sorted)
 * list silently breaks the grouping — the components "vanish" from their
 * section_group. So this gate compares the ORDERED tipo sequence, not a set.
 *
 * Corpus covers the three defect classes this reader had:
 *  - real section with groupers + a section_group_div wrapper (numisdata6,
 *    numisdata3): DFS ontology order; the div is recursed-through, never emitted.
 *  - VIRTUAL section (numisdata5, rsc167): resolves to the real section's
 *    elements minus its exclude_elements — a plain parent-walk returns nothing.
 *  - the common section_info group (dd196 + children) appended to every section.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { buildSectionElementsContext } from '../../src/core/resolve/section_elements_context.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

// ontology1 exercises the ontology_sections source (222 targets), hierarchy1
// the field_value source (active-hierarchy targets) — both differential-cover
// the resolveSqoSectionTipos case ports. dd1758 (field_value over the 1.8M-row
// activity table) is pinned in the unit gate instead (oracle timeout risk).
const SECTIONS = [
	'numisdata6',
	'numisdata5',
	'numisdata3',
	'rsc167',
	'oh1',
	'dd128',
	'ontology1',
	'hierarchy1',
];

// Aggregate count of target_section_tipo values compared across all sections
// (the suite-level non-empty floor guards against a silently vacuous gate).
let targetsChecked = 0;
// Aggregate count of NON-EMPTY search tooltips compared (same vacuous-gate floor).
let tooltipsChecked = 0;

interface ElementEntry {
	tipo?: string;
	model?: string;
	mode?: unknown;
	type?: unknown;
	parent?: unknown;
	parent_grouper?: unknown;
	search_operators_info?: unknown;
	search_options_title?: unknown;
}

const client = new PhpApiClient();

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	await client.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
});

async function phpElements(sectionTipo: string): Promise<ElementEntry[]> {
	const { body } = await client.call({
		dd_api: 'dd_core_api',
		action: 'get_section_elements_context',
		options: { ar_section_tipo: [sectionTipo] },
	} as Record<string, unknown>);
	return ((body.result as ElementEntry[]) ?? []) as ElementEntry[];
}

describe.if(hasPhpCredentials())('get_section_elements_context differential (TS vs PHP)', () => {
	for (const sectionTipo of SECTIONS) {
		test(`${sectionTipo}: ordered membership matches PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const php = await phpElements(sectionTipo);
			const principal = await resolvePrincipal(-1);
			const ts = (await buildSectionElementsContext(principal, {
				ar_section_tipo: [sectionTipo],
			})) as ElementEntry[];

			const phpTipos = php.map((entry) => entry.tipo);
			const tsTipos = ts.map((entry) => entry.tipo);
			// Ordered sequence identity (catches order bugs AND missing/extra).
			expect(tsTipos).toEqual(phpTipos);
			// The common section_info group is appended (real-section regression guard).
			expect(tsTipos).toContain('dd196');
		});

		test(`${sectionTipo}: client-nesting fields (type/parent/parent_grouper) match PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const php = await phpElements(sectionTipo);
			const principal = await resolvePrincipal(-1);
			const ts = (await buildSectionElementsContext(principal, {
				ar_section_tipo: [sectionTipo],
			})) as ElementEntry[];
			const tsByTipo = new Map(ts.map((entry) => [entry.tipo, entry]));
			for (const phpEntry of php) {
				const tsEntry = tsByTipo.get(phpEntry.tipo);
				expect(tsEntry).toBeDefined();
				expect(tsEntry?.type).toEqual(phpEntry.type);
				expect(tsEntry?.parent).toEqual(phpEntry.parent);
				expect(tsEntry?.parent_grouper).toEqual(phpEntry.parent_grouper);
			}
		});

		test(`${sectionTipo}: target_section_tipo matches PHP (values, order, duplicates)`, async () => {
			if (!hasPhpCredentials()) return;
			// Two bugs pinned here. (1) SHAPE: the client drills into deep components
			// via target_section_tipo[0] (render_common.js:246) — a SCALAR STRING
			// makes [0] a single character → bogus 1-char section → empty list.
			// (2) VALUES: full ordered parity with PHP get_ar_target_section_tipo,
			// duplicates preserved — this closed the four Phase-F target-resolution
			// divergences (search-mode stamp for oh27; cross-config concat for
			// numisdata560's 2×8 targets; {source:'self'} for numisdata73;
			// inactive-TLD drop for numisdata279/rsc1213). PHP contract: dedup
			// per-config (array_unique, relation_common :2892-95), concat across
			// configs (component_common :3070-77), stamped in mode 'search'
			// (common :3915-22).
			const php = await phpElements(sectionTipo);
			const principal = await resolvePrincipal(-1);
			const ts = (await buildSectionElementsContext(principal, {
				ar_section_tipo: [sectionTipo],
			})) as ElementEntry[];
			const tsByTipo = new Map(ts.map((entry) => [entry.tipo, entry]));
			for (const phpEntry of php) {
				const target = (phpEntry as { target_section_tipo?: unknown }).target_section_tipo;
				if (target === undefined || target === null) continue;
				targetsChecked += 1;
				const tsTarget = (tsByTipo.get(phpEntry.tipo) as { target_section_tipo?: unknown })
					?.target_section_tipo;
				expect(Array.isArray(tsTarget)).toBe(true);
				expect(tsTarget as string[]).toEqual(target as string[]);
			}
		});

		test(`${sectionTipo}: search-operator tooltip (mode + operators + title) matches PHP`, async () => {
			if (!hasPhpCredentials()) return;
			// The bug this pins: components were built in mode 'list', so the search
			// tooltip PHP stamps for every search-mode component (search_operators_info
			// + search_options_title, class.common.php:2010-13) was absent — the client
			// (ui.js build_wrapper_search) then renders NO .hidden_tooltip under a
			// selected search component. Byte-exact operator map + rendered HTML +
			// mode='search' for every component.
			const php = await phpElements(sectionTipo);
			const principal = await resolvePrincipal(-1);
			const ts = (await buildSectionElementsContext(principal, {
				ar_section_tipo: [sectionTipo],
			})) as ElementEntry[];
			const tsByTipo = new Map(ts.map((entry) => [entry.tipo, entry]));
			for (const phpEntry of php) {
				if (!String(phpEntry.model).startsWith('component_')) continue;
				const tsEntry = tsByTipo.get(phpEntry.tipo);
				expect(tsEntry).toBeDefined();
				// Components are search-mode (section/groupers stay 'list').
				expect(tsEntry?.mode).toEqual(phpEntry.mode);
				expect(tsEntry?.mode).toBe('search');
				// Both fields present and byte-identical (operator map order + HTML).
				expect(tsEntry?.search_operators_info).toEqual(phpEntry.search_operators_info);
				expect(tsEntry?.search_options_title).toEqual(phpEntry.search_options_title);
				if (typeof phpEntry.search_options_title === 'string' && phpEntry.search_options_title) {
					tooltipsChecked += 1;
				}
			}
		});
	}

	// Suite-level non-empty floor: some fixture sections (e.g. dd128) legitimately
	// have NO drill-in component, so the floor is aggregate, not per-section — but
	// across all SECTIONS at least one target_section_tipo must have been asserted,
	// or the whole gate is silently vacuous (the bug it guards would be invisible).
	afterAll(() => {
		if (!hasPhpCredentials()) return;
		expect(targetsChecked).toBeGreaterThan(0);
		// Same vacuous-gate floor for the tooltip assertions.
		expect(tooltipsChecked).toBeGreaterThan(0);
	});
});
