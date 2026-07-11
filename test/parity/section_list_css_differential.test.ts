/**
 * SECTION_SPEC §7.1 gate: the list-mode SOURCE-PROPERTIES swap
 * (PHP resolve_source_properties, trait.request_config_utils.php:264-309).
 *
 * For a section in list mode WITHOUT its own source.request_config, the context
 * is built from its section_list child's properties — so the list view gets the
 * section_list's column css (e.g. numisdata122's .column_numisdata77 width),
 * NOT the section's own edit-form .list_body grid. Getting this wrong misaligns
 * every list column in the client (the diagonal-cascade bug). Byte-parity vs
 * live PHP for the section `css` field in list vs edit mode.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import {
	buildStructureContext,
	clearStructureContextCache,
} from '../../src/core/resolve/structure_context.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const SECTIONS = ['numisdata3', 'numisdata6', 'oh7'];

async function phpSectionCss(client: PhpApiClient, tipo: string, mode: string): Promise<unknown> {
	const { body } = await client.call({
		action: 'get_element_context',
		dd_api: 'dd_core_api',
		source: { model: 'section', tipo, section_tipo: tipo, mode, lang: 'lg-spa' },
	} as unknown as Record<string, unknown>);
	return ((body.result as Record<string, unknown>[])[0] as { css?: unknown })?.css ?? null;
}

describe.if(hasPhpCredentials())('section_list css swap differential (SECTION_SPEC §7.1)', () => {
	let php: PhpApiClient;
	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
	});

	for (const tipo of SECTIONS) {
		test(`${tipo}: list-mode css comes from the section_list child (matches PHP)`, async () => {
			if (!hasPhpCredentials()) return;
			clearStructureContextCache();
			const phpCss = await phpSectionCss(php, tipo, 'list');
			const tsEntry = await buildStructureContext({
				tipo,
				sectionTipo: tipo,
				mode: 'list',
				lang: 'lg-spa',
				permissions: 3,
			});
			// null (TS "no css") and undefined/absent (PHP) are equivalent absence.
			expect(tsEntry?.css ?? null).toEqual(phpCss ?? null);
		});
	}

	test('numisdata3 specifically carries the section_list column-width css, not .list_body', async () => {
		if (!hasPhpCredentials()) return;
		clearStructureContextCache();
		const tsEntry = await buildStructureContext({
			tipo: 'numisdata3',
			sectionTipo: 'numisdata3',
			mode: 'list',
			lang: 'lg-spa',
			permissions: 3,
		});
		const cssKeys = Object.keys((tsEntry?.css as Record<string, unknown>) ?? {});
		expect(cssKeys).toContain('.column_numisdata77');
		expect(cssKeys).not.toContain('.list_body');
	});
});
