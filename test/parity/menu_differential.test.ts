/**
 * Phase 6 gate: menu tree_datalist differential (superuser path).
 *
 * The menu is the last boot-render piece. For the superuser (global admin +
 * developer), PHP returns area::get_areas() unfiltered, so the tree_datalist is
 * a pure ontology walk: root areas in a fixed order, depth-first pre-order
 * children by order_number, model-filtered, deny-filtered, skip-reparented,
 * labelled in the application language.
 *
 * PLAIN nodes compare on {tipo, model, parent, label}; the config-carrying
 * REWRITTEN nodes (section_tool tool_context — tipo/model swapped to the
 * target section with the tool simple-context + enriched tool_config ddo_map
 * injected — and the two thesaurus virtuals with their swap_tipo configs)
 * compare BYTE-FOR-BYTE against PHP.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { getMenuTreeDatalist } from '../../src/core/api/handlers/menu.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

interface PhpMenuItem {
	tipo: string;
	model: string;
	parent: string | null;
	label: string;
	config?: unknown;
}

const MENU_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		typo: 'source',
		model: 'menu',
		tipo: 'dd85',
		section_tipo: 'dd85',
		action: 'get_data',
		mode: 'list',
		lang: 'lg-eng',
	},
};

/** Stable comparison key for one menu node's base fields. */
function itemKey(item: {
	tipo: string;
	model: string;
	parent: string | null;
	label: string;
}): string {
	return `${item.tipo}|${item.model}|${item.parent ?? ''}|${item.label}`;
}

describe.if(hasPhpCredentials())('menu tree_datalist differential (Phase 6 gate)', () => {
	let phpPlain: PhpMenuItem[];
	let phpConfig: PhpMenuItem[];
	let tsItems: {
		tipo: string;
		model: string;
		parent: string | null;
		label: string;
		config?: Record<string, unknown>;
	}[];
	let tsSkipped: { tipo: string; reason: string }[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(MENU_RQO));
		const data = (body.result as { data?: { tree_datalist?: PhpMenuItem[] }[] }).data ?? [];
		const menu = data.find((entry) => Array.isArray(entry.tree_datalist));
		const allItems = menu?.tree_datalist ?? [];
		phpPlain = allItems.filter((item) => item.config === undefined);
		phpConfig = allItems.filter((item) => item.config !== undefined);

		const result = await getMenuTreeDatalist();
		tsItems = result.tree_datalist;
		tsSkipped = result.skipped;
	});

	test('the walk produces the full plain node set (hundreds of nodes)', () => {
		if (!hasPhpCredentials()) return;
		expect(phpPlain.length).toBeGreaterThan(400);
	});

	test('TS plain nodes match PHP exactly on {tipo, model, parent, label}', () => {
		if (!hasPhpCredentials()) return;
		const phpKeys = new Set(phpPlain.map(itemKey));
		const tsKeys = new Set(tsItems.filter((item) => item.config === undefined).map(itemKey));

		// No PHP plain node missing from TS, and no extra TS node not in PHP.
		const missingInTs = [...phpKeys].filter((key) => !tsKeys.has(key));
		const extraInTs = [...tsKeys].filter((key) => !phpKeys.has(key));
		expect(missingInTs).toEqual([]);
		expect(extraInTs).toEqual([]);
		expect(tsKeys.size).toBe(phpKeys.size);
	});

	test('rewritten nodes (section_tool + thesaurus virtuals) match PHP byte-for-byte', () => {
		if (!hasPhpCredentials()) return;
		const tsConfig = tsItems.filter((item) => item.config !== undefined);
		expect(tsConfig.length).toBe(phpConfig.length);
		// WC-020 ADOPTED divergence (COEXISTENCE "component_alias is TS-resolved
		// ONLY" row; reconciled 2026-07-11 — the byte-compare predated the
		// migration): PHP enriches aliased ddo_map entries with the STORED model
		// ('component_alias', its owner-accepted coins-panel degradation) while
		// TS resolves the alias hop to the target model. Normalize the PHP side
		// with the TS resolution for exactly the aliased tipo before diffing.
		const ALIASED = new Map([['numisdata203', 'component_portal']]);
		const adoptAlias = (raw: string): string => {
			let out = raw;
			for (const [tipo, target] of ALIASED) {
				out = out.replaceAll(
					`"tipo":"${tipo}","section_id":"self","section_tipo":"numisdata3","model":"component_alias"`,
					`"tipo":"${tipo}","section_id":"self","section_tipo":"numisdata3","model":"${target}"`,
				);
			}
			return out;
		};
		// The walk order is deterministic on both sides — compare 1:1.
		for (let index = 0; index < phpConfig.length; index++) {
			expect(JSON.stringify(tsConfig[index])).toBe(adoptAlias(JSON.stringify(phpConfig[index])));
		}
		// A skipped node is allowed ONLY when PHP also dropped it (a section_tool
		// whose named tool is not installed — PHP silently omits the entry).
		const phpTipos = new Set([...phpPlain, ...phpConfig].map((item) => item.tipo));
		for (const skippedNode of tsSkipped) {
			expect(phpTipos.has(skippedNode.tipo)).toBe(false);
		}
	});
});
