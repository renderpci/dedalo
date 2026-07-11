/**
 * SECTION_SPEC §6 gate: the section-only context extras — section_map,
 * matrix_table, config.relation_list_tipo — byte-parity vs live PHP.
 *
 * The base context_differential compares only the 9-field structural subset;
 * this gate pins the section stamp fields PHP emits on the SECTION entry
 * (class.common.php :2056-2100) that the earlier ledger reported as UNCOVERED.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** The full SECTION_SPEC §12 corpus: object sections, an audiovisual + a people
 * section, a thesaurus-config section (cult1) and the Thesaurus section
 * (hierarchy20) — covering section_map present/absent, virtual sections
 * (rsc167 → rsc2), and relation_list present/absent. */
const SECTIONS = [
	'numisdata6',
	'numisdata3',
	'numisdata4',
	'rsc167',
	'rsc197',
	'cult1',
	'hierarchy20',
];

function readRqo(sectionTipo: string): Rqo {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			model: 'section',
			tipo: sectionTipo,
			section_tipo: sectionTipo,
			mode: 'list',
			lang: 'lg-spa',
			action: 'search',
		},
		sqo: { section_tipo: [sectionTipo], limit: 1, offset: 0 },
	} as unknown as Rqo;
}

function sectionEntry(context: Record<string, unknown>[], tipo: string): Record<string, unknown> {
	const entry = context.find((item) => item.tipo === tipo && item.model === 'section');
	if (entry === undefined) throw new Error(`no section entry for ${tipo}`);
	return entry;
}

describe.if(hasPhpCredentials())('section context extras differential (SECTION_SPEC §6)', () => {
	for (const sectionTipo of SECTIONS) {
		test(`${sectionTipo}: section_map + matrix_table + relation_list_tipo match PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const rqo = readRqo(sectionTipo);
			const { body } = await client.call(
				structuredClone(rqo) as unknown as Record<string, unknown>,
			);
			const phpContext = (body.result as { context: Record<string, unknown>[] }).context;
			const tsContext = (await readSection(rqo)).context as unknown as Record<string, unknown>[];

			const php = sectionEntry(phpContext, sectionTipo);
			const ts = sectionEntry(tsContext, sectionTipo);

			// section_map: the section_map node properties (null when the section
			// declares none). PHP may omit the key entirely vs TS null — treat
			// undefined and null as equivalent absence.
			expect(ts.section_map ?? null).toEqual(php.section_map ?? null);
			expect(ts.matrix_table ?? null).toEqual(php.matrix_table ?? null);
			const phpRelListTipo =
				(php.config as { relation_list_tipo?: unknown } | undefined)?.relation_list_tipo ?? null;
			const tsRelListTipo =
				(ts.config as { relation_list_tipo?: unknown } | undefined)?.relation_list_tipo ?? null;
			expect(tsRelListTipo).toEqual(phpRelListTipo);
		});
	}
});
