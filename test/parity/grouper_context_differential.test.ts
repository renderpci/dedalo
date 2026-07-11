/**
 * SECTION_SPEC §8 gate: grouper CONTEXT entries in an edit-mode section read.
 *
 * Groupers (section_group/section_group_div/section_tab/tab) organize the edit
 * form's components in the client DOM. The edit ddo_map order is already gated
 * (edit_ddo_map_differential); this gate pins the emitted CONTEXT entries for
 * the groupers — tipo/model/label/parent_grouper — and that each component
 * carries parent_grouper = its ontology grouper, so the client can nest.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { GROUPER_MODELS } from '../../src/core/concepts/section.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const SECTIONS = ['numisdata3', 'numisdata4']; // 6+1 and 10 groupers respectively

function editRqo(sectionTipo: string): Rqo {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			model: 'section',
			tipo: sectionTipo,
			section_tipo: sectionTipo,
			mode: 'edit',
			lang: 'lg-spa',
			action: 'search',
		},
		sqo: { section_tipo: [sectionTipo], limit: 1, offset: 0 },
	} as unknown as Rqo;
}

function isGrouper(entry: Record<string, unknown>): boolean {
	return GROUPER_MODELS.includes(entry.model as string);
}

function grouperKey(entry: Record<string, unknown>): string {
	// `type` is load-bearing: the client nests components into a grouper only
	// when the grouper entry's type === 'grouper' (view_default_edit_section_record).
	return `${entry.tipo}|${entry.model}|${entry.type}|${entry.label ?? ''}|${entry.parent_grouper ?? ''}`;
}

describe.if(hasPhpCredentials())('grouper context differential (SECTION_SPEC §8)', () => {
	for (const section of SECTIONS) {
		test(`${section}: every PHP grouper context entry is emitted by TS with matching fields`, async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const rqo = editRqo(section);
			const { body } = await client.call(
				structuredClone(rqo) as unknown as Record<string, unknown>,
			);
			const phpContext = (body.result as { context: Record<string, unknown>[] }).context;
			const tsContext = (await readSection(rqo)).context as unknown as Record<string, unknown>[];
			const phpGroupers = phpContext.filter(isGrouper).map(grouperKey).sort();
			const tsGroupers = tsContext.filter(isGrouper).map(grouperKey).sort();
			expect(phpGroupers.length).toBeGreaterThan(0);
			expect(tsGroupers).toEqual(phpGroupers);
		});
	}
});
