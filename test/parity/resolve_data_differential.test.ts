/**
 * Phase 6 gate: resolve_data (portal search-mode locator resolution) vs live
 * PHP — the main item (injected id-stamped entries, search mode, null record
 * identity) and every locator-target child item, compared on the normalized
 * read-differential fields.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const RESOLVE_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'component_autocomplete',
		tipo: 'numisdata30',
		section_tipo: 'numisdata3',
		section_id: null,
		mode: 'search',
		lang: 'lg-spa',
		action: 'resolve_data',
		value: [
			{
				section_tipo: 'numisdata6',
				section_id: '1',
				type: 'dd151',
				from_component_tipo: 'numisdata30',
			},
		],
	},
	sqo: { section_tipo: ['numisdata3'], limit: 10, offset: 0 },
};

function comparableItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		from_component_tipo: item.from_component_tipo ?? null,
		entries: item.entries ?? null,
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
		parent_section_id: item.parent_section_id ?? null,
		pagination: item.pagination ?? null,
	};
}

let phpData: Record<string, unknown>[] = [];
let tsData: Record<string, unknown>[] = [];

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpResult = await php.call(structuredClone(RESOLVE_RQO) as Record<string, unknown>);
	// WC-001 (unified []): PHP emits entries:null for empty values; the TS
	// engine emits [] for EVERY model. Rewrite the PHP side only.
	phpData = adoptEntriesArrayContract(
		(phpResult.body as { result?: { data?: unknown[] } }).result?.data ?? [],
	) as Record<string, unknown>[];

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(RESOLVE_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	tsData = ((tsResult.body as { result?: { data?: unknown[] } }).result?.data ?? []) as Record<
		string,
		unknown
	>[];
});

describe.if(hasPhpCredentials())('resolve_data differential (portal search chips)', () => {
	test('the main item carries the injected id-stamped entries in search mode', () => {
		if (!hasPhpCredentials()) return;
		const phpMain = phpData.find((item) => item.tipo === 'numisdata30');
		const tsMain = tsData.find((item) => item.tipo === 'numisdata30');
		expect(phpMain).toBeDefined();
		expect(comparableItem(tsMain as Record<string, unknown>)).toEqual(
			comparableItem(phpMain as Record<string, unknown>),
		);
	});

	test('every locator-target child item matches PHP on the normalized fields', () => {
		if (!hasPhpCredentials()) return;
		const keyOf = (item: Record<string, unknown>): string =>
			`${item.tipo}|${item.section_tipo}|${item.section_id}`;
		const phpByKey = new Map(
			phpData.filter((item) => item.tipo !== 'numisdata30').map((item) => [keyOf(item), item]),
		);
		const tsByKey = new Map(
			tsData.filter((item) => item.tipo !== 'numisdata30').map((item) => [keyOf(item), item]),
		);
		expect([...tsByKey.keys()].sort()).toEqual([...phpByKey.keys()].sort());
		for (const [key, phpItem] of phpByKey) {
			expect(comparableItem(tsByKey.get(key) as Record<string, unknown>)).toEqual(
				comparableItem(phpItem),
			);
		}
	});
});
