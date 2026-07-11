/**
 * Phase 3/6 gate: MULTI-HOP ORDER paths vs live PHP — sort a section by a
 * RELATED section's component value (coin types ordered by their Ceca's
 * name). The paged id sequence must match exactly.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const ORDER_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'section',
		tipo: 'numisdata3',
		section_tipo: 'numisdata3',
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['numisdata3'],
		limit: 8,
		offset: 0,
		order: [
			{
				direction: 'ASC',
				lang: 'lg-spa',
				path: [
					{ section_tipo: 'numisdata3', component_tipo: 'numisdata30' },
					{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' },
				],
			},
		],
	},
	show: { ddo_map: [] },
};

let phpIds: number[] = [];
let tsIds: number[] = [];

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpBody = (await php.call(structuredClone(ORDER_RQO) as Record<string, unknown>)).body as {
		result?: { data?: { entries?: { section_id: unknown }[] }[] };
	};
	phpIds = (phpBody.result?.data?.[0]?.entries ?? []).map((entry) => Number(entry.section_id));

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(ORDER_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	const tsBody = tsResult.body as {
		result?: { data?: { entries?: { section_id: unknown }[] }[] };
	};
	tsIds = (tsBody.result?.data?.[0]?.entries ?? []).map((entry) => Number(entry.section_id));
}, 60000);

describe.if(hasPhpCredentials())(
	'multi-hop order differential (sort by a related section value)',
	() => {
		test('the ordered paged id sequence matches PHP', () => {
			if (!hasPhpCredentials()) return;
			expect(phpIds.length).toBeGreaterThan(0);
			expect(tsIds).toEqual(phpIds);
		});
	},
);
