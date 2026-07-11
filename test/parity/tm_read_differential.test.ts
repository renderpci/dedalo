/**
 * Phase 3/6 gate: Time Machine read (sqo mode 'tm') vs live PHP.
 *
 * The inspector/TM-tool record-history listing: dd15 envelope entries
 * (matrix_id/timestamp/caller/bulk/user) must match EXACTLY, and every
 * component item (dd1371 bulk, dd559 date transform, dd578 user portal +
 * dd132 username subdatum, dd577 "term [tipo]" label) must match on the
 * normalized comparison fields (same convention as the read differential).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** A record with real TM history on this install. */
const CALLER = { section_tipo: 'rsc1242', section_id: '578' };

function tmDdo(id: string, tipo: string, model: string): Record<string, unknown> {
	return {
		id,
		tipo,
		type: 'component',
		typo: 'ddo',
		model,
		section_tipo: 'dd15',
		parent: 'dd15',
		mode: 'tm',
		view: 'mini',
	};
}

const TM_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		typo: 'source',
		type: 'tm',
		model: 'section',
		tipo: 'dd15',
		section_tipo: 'dd15',
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		id: 'time_machine_temporal',
		mode: 'tm',
		section_tipo: [CALLER.section_tipo],
		limit: 4,
		offset: 0,
		order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
		skip_projects_filter: true,
		filter_by_locators: [CALLER],
	},
	show: {
		ddo_map: [
			tmDdo('bulk_process_id', 'dd1371', 'component_number'),
			tmDdo('when', 'dd559', 'component_date'),
			tmDdo('who', 'dd578', 'component_autocomplete'),
			tmDdo('where', 'dd577', 'component_input_text'),
		],
	},
};

/** The read-differential normalization, plus the TM-relevant extras. */
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
		pagination: item.pagination ?? null,
	};
}

let phpData: Record<string, unknown>[] = [];
let tsData: Record<string, unknown>[] = [];

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpResult = await php.call(structuredClone(TM_RQO) as Record<string, unknown>);
	phpData = ((phpResult.body as { result?: { data?: unknown[] } }).result?.data ?? []) as Record<
		string,
		unknown
	>[];

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(TM_RQO) as never,
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

describe.if(hasPhpCredentials())('time machine read differential', () => {
	test('the dd15 envelope entries match PHP exactly', () => {
		if (!hasPhpCredentials()) return;
		const phpEnvelope = phpData[0] as { entries?: unknown[] };
		const tsEnvelope = tsData[0] as { entries?: unknown[] };
		expect(phpEnvelope?.entries?.length ?? 0).toBeGreaterThan(0);
		expect(tsEnvelope?.entries).toEqual(phpEnvelope?.entries);
	});

	test('every TM component item matches PHP on the normalized fields', () => {
		if (!hasPhpCredentials()) return;
		const phpItems = phpData.slice(1).map(comparableItem);
		const tsItems = tsData.slice(1).map(comparableItem);
		// Same multiset regardless of emission order: key by (row, tipo).
		const keyOf = (item: Record<string, unknown>): string =>
			`${item.row_section_id}|${item.tipo}|${item.section_id}`;
		const phpByKey = new Map(phpItems.map((item) => [keyOf(item), item]));
		const tsByKey = new Map(tsItems.map((item) => [keyOf(item), item]));
		expect([...tsByKey.keys()].sort()).toEqual([...phpByKey.keys()].sort());
		for (const [key, phpItem] of phpByKey) {
			expect(tsByKey.get(key)).toEqual(phpItem);
		}
	});
});
