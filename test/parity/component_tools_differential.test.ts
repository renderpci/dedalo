/**
 * Phase 6 gate: component-context tools differential (PHP common::get_tools for
 * a component_* model, superuser).
 *
 * A component's toolbar is get_user_tools filtered by the 'all_components'
 * catch-all + affected_models/affected_tipos, then requirement_translatable
 * gated by the component's translatable flag. We read a translatable component
 * (input_text) and a non-translatable one (section_id) and assert the TS filter
 * reproduces each PHP tool list exactly — proving the translatable gate (the
 * lang tools appear for the translatable component and not the other).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'edit',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '1' }],
		limit: 1,
	},
	show: {
		ddo_map: [
			{ tipo: 'numisdata16', section_tipo: 'self', parent: 'self', mode: 'edit', lang: 'lg-spa' },
			{ tipo: 'numisdata95', section_tipo: 'self', parent: 'self', mode: 'edit', lang: 'lg-spa' },
		],
	},
};

type Entry = Record<string, unknown> & { tipo: string; model: string; tools?: { name: string }[] };

describe.if(hasPhpCredentials())('component tools differential (Phase 6 gate)', () => {
	let phpEntries: Entry[];
	let tsEntries: Entry[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(READ_RQO));
		phpEntries = ((body.result as { context?: Entry[] }).context ?? []).filter((entry) =>
			entry.model?.startsWith('component_'),
		);
		const tsResult = await readSection(READ_RQO as unknown as Rqo);
		tsEntries = (tsResult.context as unknown as Entry[]).filter((entry) =>
			entry.model?.startsWith('component_'),
		);
	});

	test('each component context resolves the same tool set as PHP', () => {
		if (!hasPhpCredentials()) return;
		expect(phpEntries.length).toBeGreaterThan(0);
		const tsByTipo = new Map(tsEntries.map((entry) => [entry.tipo, entry]));
		for (const phpEntry of phpEntries) {
			const tsEntry = tsByTipo.get(phpEntry.tipo);
			expect(tsEntry).toBeDefined();
			const phpNames = (phpEntry.tools ?? []).map((tool) => tool.name).sort();
			const tsNames = ((tsEntry as Entry).tools ?? []).map((tool) => tool.name).sort();
			expect(tsNames).toEqual(phpNames);
		}
	});

	test('the translatable gate distinguishes the two components', () => {
		if (!hasPhpCredentials()) return;
		// input_text (translatable) shows the lang tools; section_id (non-translatable)
		// must not — proving requirement_translatable is honoured, whatever the
		// exact tool names are on this install.
		const inputText = phpEntries.find((entry) => entry.tipo === 'numisdata16');
		const sectionId = phpEntries.find((entry) => entry.tipo === 'numisdata95');
		if (inputText === undefined || sectionId === undefined) return; // not resolved here
		const langToolInInput = (inputText.tools ?? []).some((tool) =>
			tool.name.startsWith('tool_lang'),
		);
		const langToolInSectionId = (sectionId.tools ?? []).some((tool) =>
			tool.name.startsWith('tool_lang'),
		);
		expect(langToolInInput).toBe(true);
		expect(langToolInSectionId).toBe(false);
	});
});
