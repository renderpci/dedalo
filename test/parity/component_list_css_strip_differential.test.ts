/**
 * SECTION_SPEC §7.1 gate: the component EDIT-css LIST strip + the portal
 * section_list swap + strip (PHP build_structure_context_core remove_edit_css,
 * class.common.php:1801-1846).
 *
 * Component css add-ons in ontology properties are EDIT-oriented (grid-row/
 * grid-column wrapper placement). PHP nulls a plain component's css in list
 * mode — without the strip the edit grid rules bleed into every list row.
 * component_portal follows the SECTION rule instead: in list mode its css is
 * swapped to its section_list child's (the strip applies only when no child
 * exists). tm mode keeps the element's OWN css — the swap/strip is list-only.
 * Byte-parity vs live PHP for the `css` context field in list vs edit modes.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import {
	buildStructureContext,
	clearStructureContextCache,
} from '../../src/core/resolve/structure_context.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** Plain components carrying authored edit css (probe-verified 2026-07-10). */
const COMPONENTS = [
	{ tipo: 'numisdata281', model: 'component_input_text', section: 'numisdata3' },
	{ tipo: 'numisdata1562', model: 'component_select', section: 'numisdata3' },
	{ tipo: 'numisdata16', model: 'component_input_text', section: 'numisdata6' },
	{ tipo: 'numisdata17', model: 'component_text_area', section: 'numisdata6' },
];
/** Portals with authored css AND a section_list child (whose css is null here —
 * the swap, not the leak, is what makes list css null for these). */
const PORTALS_WITH_CHILD = [
	{ tipo: 'dd1404', model: 'component_portal', section: 'dd1100' },
	{ tipo: 'ich107', model: 'component_portal', section: 'ich100' },
	{ tipo: 'ich108', model: 'component_portal', section: 'ich100' },
];
/** Portals with authored css and NO section_list child (the strip branch). */
const PORTALS_WITHOUT_CHILD = [
	{ tipo: 'oh25', model: 'component_portal', section: 'oh1' },
	{ tipo: 'numisdata1564', model: 'component_portal', section: 'numisdata349' },
];
/** The get_view fallback edge (PHP :4464-4506): mosaic portals whose view lives
 * on the PORTAL node while their section_list child has none — list-mode view
 * must fall back to the portal's OWN properties.view, NOT the swapped child's
 * absence (16 live cases; regression melts the mosaic render to default). */
const VIEW_EDGE_PORTALS = [
	{ tipo: 'oh17', model: 'component_portal', section: 'oh1', view: 'mosaic' },
	{ tipo: 'tch66', model: 'component_portal', section: 'tch7', view: 'mosaic' },
];

async function phpElementEntry(
	client: PhpApiClient,
	fixture: { tipo: string; model: string; section: string },
	mode: string,
): Promise<{ css?: unknown; view?: unknown }> {
	const { body } = await client.call({
		action: 'get_element_context',
		dd_api: 'dd_core_api',
		source: {
			model: fixture.model,
			tipo: fixture.tipo,
			section_tipo: fixture.section,
			mode,
			lang: 'lg-spa',
		},
	} as unknown as Record<string, unknown>);
	return ((body.result as Record<string, unknown>[])[0] ?? {}) as { css?: unknown; view?: unknown };
}

async function phpElementCss(
	client: PhpApiClient,
	fixture: { tipo: string; model: string; section: string },
	mode: string,
): Promise<unknown> {
	return (await phpElementEntry(client, fixture, mode)).css ?? null;
}

async function tsElementEntry(
	fixture: { tipo: string; model: string; section: string },
	mode: string,
): Promise<{ css?: unknown; view?: unknown } | null> {
	clearStructureContextCache();
	return await buildStructureContext({
		tipo: fixture.tipo,
		sectionTipo: fixture.section,
		mode,
		lang: 'lg-spa',
		permissions: 3,
	});
}

async function tsElementCss(
	fixture: { tipo: string; model: string; section: string },
	mode: string,
): Promise<unknown> {
	return (await tsElementEntry(fixture, mode))?.css ?? null;
}

describe.if(hasPhpCredentials())(
	'component list css strip differential (SECTION_SPEC §7.1, PHP :1801-1846)',
	() => {
		let php: PhpApiClient;
		beforeAll(async () => {
			if (!hasPhpCredentials()) return;
			php = new PhpApiClient();
			await php.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
		});

		for (const fixture of COMPONENTS) {
			test(`${fixture.tipo}: edit css matches PHP and is NON-null (fixture floor)`, async () => {
				if (!hasPhpCredentials()) return;
				const phpCss = await phpElementCss(php, fixture, 'edit');
				// Non-triviality floor: the fixture must still carry authored css,
				// or the list rows below pass vacuously (null == null).
				expect(phpCss).not.toBeNull();
				expect(await tsElementCss(fixture, 'edit')).toEqual(phpCss);
			});

			test(`${fixture.tipo}: list css is STRIPPED on both engines`, async () => {
				if (!hasPhpCredentials()) return;
				const phpCss = await phpElementCss(php, fixture, 'list');
				expect(phpCss).toBeNull();
				expect(await tsElementCss(fixture, 'list')).toBeNull();
			});
		}

		for (const fixture of PORTALS_WITH_CHILD) {
			test(`${fixture.tipo}: portal list css = section_list child's (swap), edit css own`, async () => {
				if (!hasPhpCredentials()) return;
				const phpEdit = await phpElementCss(php, fixture, 'edit');
				expect(phpEdit).not.toBeNull();
				expect(await tsElementCss(fixture, 'edit')).toEqual(phpEdit);
				const phpList = await phpElementCss(php, fixture, 'list');
				expect(await tsElementCss(fixture, 'list')).toEqual(phpList ?? null);
				// The child carries no css in this install: the swap must emit the
				// CHILD's null, never the portal's own edit css.
				expect(phpList ?? null).toBeNull();
			});
		}

		for (const fixture of PORTALS_WITHOUT_CHILD) {
			test(`${fixture.tipo}: child-less portal strips to null in list, keeps edit css`, async () => {
				if (!hasPhpCredentials()) return;
				const phpEdit = await phpElementCss(php, fixture, 'edit');
				expect(phpEdit).not.toBeNull();
				expect(await tsElementCss(fixture, 'edit')).toEqual(phpEdit);
				expect(await phpElementCss(php, fixture, 'list')).toBeNull();
				expect(await tsElementCss(fixture, 'list')).toBeNull();
			});
		}

		for (const fixture of VIEW_EDGE_PORTALS) {
			test(`${fixture.tipo}: list-mode view falls back to the portal's OWN '${fixture.view}'`, async () => {
				if (!hasPhpCredentials()) return;
				const phpEntry = await phpElementEntry(php, fixture, 'list');
				const tsEntry = await tsElementEntry(fixture, 'list');
				expect(tsEntry?.view ?? null).toEqual(phpEntry.view ?? null);
				// The oracle-independent floor: the authored mosaic view survives.
				expect(phpEntry.view ?? null).toBe(fixture.view);
			});
		}

		test('numisdata3 in tm mode emits its OWN css (swap/strip is list-only)', async () => {
			if (!hasPhpCredentials()) return;
			const fixture = { tipo: 'numisdata3', model: 'section', section: 'numisdata3' };
			const phpCss = await phpElementCss(php, fixture, 'tm');
			expect(await tsElementCss(fixture, 'tm')).toEqual(phpCss ?? null);
			// Own edit-form grid, NOT the numisdata122 section_list column css.
			const keys = Object.keys((phpCss as Record<string, unknown>) ?? {});
			expect(keys).toContain('.list_body');
			expect(keys).not.toContain('.column_numisdata77');
		});
	},
);
