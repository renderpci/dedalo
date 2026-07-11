/**
 * Phase 6 gate: the ACTIVITY listing (dd542 over matrix_activity) vs live
 * PHP — the standard read pipeline must serve the activity area's grid:
 * the user portal (dd543 + its dd132 username subdatum), the what select
 * (dd545 → datalist label), and the where/ip input_texts. Oldest records
 * (ASC) keep the fixture stable while the log grows between engine calls.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const ACTIVITY_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'section',
		tipo: 'dd542',
		section_tipo: 'dd542',
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['dd542'],
		limit: 3,
		offset: 0,
		order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
	},
	show: {
		ddo_map: [
			{ tipo: 'dd543', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
			{ tipo: 'dd545', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
			{ tipo: 'dd546', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
			{ tipo: 'dd544', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
		],
	},
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
		pagination: item.pagination ?? null,
	};
}

let phpData: Record<string, unknown>[] = [];
let tsData: Record<string, unknown>[] = [];

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	phpData = ((
		(await php.call(structuredClone(ACTIVITY_RQO) as Record<string, unknown>)).body as {
			result?: { data?: unknown[] };
		}
	).result?.data ?? []) as Record<string, unknown>[];

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(ACTIVITY_RQO) as never,
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

describe.if(hasPhpCredentials())(
	'activity listing differential (dd542 over matrix_activity)',
	() => {
		test('envelope entries match PHP exactly', () => {
			if (!hasPhpCredentials()) return;
			const phpEnvelope = phpData[0] as { entries?: unknown[] };
			const tsEnvelope = tsData[0] as { entries?: unknown[] };
			expect(phpEnvelope?.entries?.length ?? 0).toBeGreaterThan(0);
			expect(tsEnvelope?.entries).toEqual(phpEnvelope?.entries);
		});

		test('every activity item matches PHP on the normalized fields', () => {
			if (!hasPhpCredentials()) return;
			const keyOf = (item: Record<string, unknown>): string =>
				`${item.row_section_id}|${item.tipo}|${item.section_id}`;
			const phpByKey = new Map(phpData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			const tsByKey = new Map(tsData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			expect([...tsByKey.keys()].sort()).toEqual([...phpByKey.keys()].sort());
			for (const [key, phpItem] of phpByKey) {
				expect(tsByKey.get(key)).toEqual(phpItem);
			}
		});
	},
);
