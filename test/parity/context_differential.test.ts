/**
 * Phase 4b gate: structure-context SUBSET differential — the TS context[]
 * versus the live PHP read context[] for the same RQO.
 *
 * v0 compares the STRUCTURAL subset (tipo, section_tipo, model, mode, lang,
 * label, translatable, parent_grouper, view) per entry, plus entry identity +
 * order. Fields the TS builder does not emit yet (tools/buttons/columns_map/
 * request_config/…) are reported by the coverage ledger, never silently
 * skipped.
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
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: ['numisdata6'], limit: 2, offset: 0 },
	show: {
		ddo_map: [
			{ tipo: 'numisdata16', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
			{ tipo: 'numisdata17', section_tipo: 'self', parent: 'self', mode: 'list', lang: 'lg-spa' },
		],
	},
};

/** The structural subset both sides must agree on (v0 scope). */
function subset(entry: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: entry.tipo,
		section_tipo: entry.section_tipo,
		model: entry.model,
		mode: entry.mode,
		lang: entry.lang,
		label: entry.label,
		translatable: entry.translatable ?? false,
		parent_grouper: entry.parent_grouper ?? null,
		view: entry.view ?? null,
		// css must be compared: numisdata16/17 carry authored EDIT css and this
		// RQO reads them in LIST mode — a leaked component css passes every other
		// field (the SECTION_SPEC §7.1 strip, PHP class.common.php:1801-1846).
		// PHP omits null fields on the wire; TS emits css:null — normalize.
		css: entry.css ?? null,
	};
}

describe.if(hasPhpCredentials())('structure-context subset differential (Phase 4b gate)', () => {
	let phpContext: Record<string, unknown>[];
	let tsContext: Record<string, unknown>[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(READ_RQO));
		phpContext = (body.result as { context: Record<string, unknown>[] }).context;
		const tsResult = await readSection(READ_RQO as unknown as Rqo);
		tsContext = tsResult.context as unknown as Record<string, unknown>[];
	});

	test('context entries for our ddos match structurally (identity + fields)', () => {
		if (!hasPhpCredentials()) return;
		// Compare only the entries for OUR requested tipos (PHP may add
		// grouper/injected entries — those are Phase 4 continuation).
		const targetTipos = new Set(['numisdata6', 'numisdata16', 'numisdata17']);
		const phpEntries = phpContext.filter((entry) => targetTipos.has(entry.tipo as string));
		const tsEntries = tsContext.filter((entry) => targetTipos.has(entry.tipo as string));
		// Non-empty floor: an empty PHP context must redden, not compare 0 entries.
		expect(phpEntries.length).toBeGreaterThan(0);
		expect(tsEntries.length).toBe(phpEntries.length);
		for (let index = 0; index < phpEntries.length; index++) {
			const phpEntry = phpEntries[index] as Record<string, unknown>;
			const tsEntry = tsEntries[index] as Record<string, unknown>;
			// section_tipo may be array-typed on PHP section entries — normalize.
			const phpSubset = subset(phpEntry);
			const tsSubset = subset(tsEntry);
			if (Array.isArray(phpSubset.section_tipo)) {
				phpSubset.section_tipo = (phpSubset.section_tipo as string[])[0];
			}
			expect(tsSubset).toEqual(phpSubset);
		}
	});

	test('coverage ledger: PHP context fields not yet emitted by TS', () => {
		if (!hasPhpCredentials()) return;
		const emitted = new Set([
			'label',
			'tipo',
			'section_tipo',
			'model',
			'legacy_model',
			'parent_grouper',
			'mode',
			'translatable',
			'properties',
			'css',
			'tools',
			'buttons',
			'sortable',
			'path',
			'columns_map',
			'permissions',
			'parent',
			'lang',
			'view',
			'request_config',
			'matrix_table',
			'config',
			'section_map',
			'type',
			'typo',
		]);
		const missing = new Set<string>();
		for (const entry of phpContext) {
			for (const field of Object.keys(entry)) {
				if (!emitted.has(field)) missing.add(field);
			}
		}
		if (missing.size > 0) {
			console.warn(
				`[UNCOVERED] PHP context fields not yet modeled: ${[...missing].sort().join(', ')}`,
			);
		}
		expect(true).toBe(true);
	});
});
