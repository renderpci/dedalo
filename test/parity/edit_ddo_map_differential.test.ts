/**
 * Phase 4/7 gate: the SECTION EDIT-mode ddo_map — the flat list the client
 * renders the edit FORM BODY from (PHP resolve_ar_related_edit 'section' +
 * build_legacy_ddo_map): every component/grouper descendant (recursive walk,
 * component_dataframe excluded), parent = the section, mode 'edit', view from
 * own properties or the legacy resolve_view default.
 *
 * Asserts the TS section edit context carries a request_config whose show
 * ddo_map equals live PHP EXACTLY — same ddos, same ORDER, same
 * tipo/model/parent/mode/view per entry.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

type Ddoish = { tipo: string; model: string; parent: string; mode: string; view?: string | null };

function keyOf(ddo: Ddoish): string {
	return `${ddo.tipo}|${ddo.model}|${ddo.parent}|${ddo.mode}|${ddo.view ?? ''}`;
}

describe.if(hasPhpCredentials())('section EDIT ddo_map differential (edit form body gate)', () => {
	let phpKeys: string[];
	let tsKeys: string[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call({
			action: 'get_element_context',
			dd_api: 'dd_core_api',
			source: {
				model: 'section',
				tipo: 'numisdata6',
				section_tipo: 'numisdata6',
				mode: 'edit',
				lang: 'lg-spa',
			},
		} as unknown as Record<string, unknown>);
		const phpEntry = (body.result as Record<string, unknown>[])[0] as {
			request_config?: { show?: { ddo_map?: Ddoish[] } }[];
		};
		phpKeys = (phpEntry?.request_config?.[0]?.show?.ddo_map ?? []).map(keyOf);

		const tsEntry = await buildStructureContext({
			tipo: 'numisdata6',
			sectionTipo: 'numisdata6',
			mode: 'edit',
			lang: 'lg-spa',
			permissions: 3,
		});
		const tsConfig = tsEntry?.request_config as { show?: { ddo_map?: Ddoish[] } }[] | undefined;
		tsKeys = (tsConfig?.[0]?.show?.ddo_map ?? []).map(keyOf);
	});

	test('the edit form tree matches PHP exactly (ddos, order, view)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsKeys.length).toBeGreaterThan(20); // the full numisdata6 form
		expect(tsKeys).toEqual(phpKeys);
	});
});
